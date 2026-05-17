import { App, MarkdownView, Notice, TFile } from "obsidian";
import type { CanvasData, CanvasTextData } from "obsidian/canvas";
import {
  REGISTRY_INCREMENTAL_DEBOUNCE_MS,
  REGISTRY_LAZY_FULL_REBUILD_DELAY_MS,
} from "../core/constants";
import {
  NbeCanvasReferenceLocation,
  NbeMarkdownReferenceLocation,
  NbeReferenceLocation,
  NbeReferenceRegistryEntry,
  NbeReferenceRegistryMap,
} from "../core/models";
import { Logger } from "../core/logger";
import { PersistedDataStore } from "../core/persisted-data-store";
import { extractNbeRefsFromDocument } from "./source";
import { normalizeNbeRef, searchTokenForNbeRef } from "./ref";

interface CurrentNbeContext {
  ref: string;
  locationKey: string;
  path: string;
}

interface ScannedReferenceLocation {
  ref: string;
  location: NbeReferenceLocation;
}

interface CanvasViewLike {
  getViewType?: () => string;
  file?: { path?: string };
  canvas?: CanvasApiLike;
}

interface CanvasApiLike {
  nodes?: { get?: (nodeId: string) => unknown };
  selection?: { clear?: () => void; add?: (node: unknown) => void } | Set<unknown>;
  updateSelection?: (notify?: boolean) => void;
  zoomToSelection?: () => void;
}

interface ResolvedCanvasNode {
  canvas: CanvasApiLike;
  node: unknown;
}

const CANVAS_NODE_READY_RETRY_DELAYS_MS = [0, 50, 100, 200, 400];
const CANVAS_ZOOM_RETRY_DELAY_MS = 50;

export class NbeReferenceRegistryService {
  private registry: NbeReferenceRegistryMap;
  private refsByPath: Map<string, Set<string>>;
  private rebuildPromise: Promise<void> | null = null;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private rescanTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly app: App,
    private readonly logger: Logger,
    private readonly store: PersistedDataStore,
  ) {
    this.registry = this.store.getData().nbeRegistry;
    this.refsByPath = buildPathIndex(this.registry);
  }

  getEntry(ref: string): NbeReferenceRegistryEntry | undefined {
    return this.registry[normalizeNbeRef(ref).ref];
  }

  getRegistry(): NbeReferenceRegistryMap {
    return structuredCloneRegistry(this.registry);
  }

  dispose(): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    this.clearAllScheduledRescans();
  }

  scheduleRebuild(delayMs = REGISTRY_LAZY_FULL_REBUILD_DELAY_MS): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      void this.rebuild();
    }, delayMs);
  }

  scheduleRescanPath(path: string, delayMs = REGISTRY_INCREMENTAL_DEBOUNCE_MS): void {
    if (!this.isIndexedFilePath(path)) return;
    const existing = this.rescanTimers.get(path);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.rescanTimers.delete(path);
      void this.rescanPath(path);
    }, delayMs);
    this.rescanTimers.set(path, timer);
  }

  async rescanPath(path: string): Promise<void> {
    if (!this.isIndexedFilePath(path)) return;
    this.clearScheduledRescan(path);
    if (this.rebuildPromise) {
      await this.rebuildPromise;
    }

    const scanned = await this.scanPath(path);
    const removed = this.removeLocationsForPath(path);
    let changed = removed;

    for (const item of scanned) {
      changed = this.addLocation(item.ref, item.location) || changed;
    }

    if (changed) {
      await this.persistRegistry();
      this.logger.debug(`rescanned NBE registry path=${path}`);
    }
  }

  async removePath(path: string): Promise<void> {
    if (!this.isIndexedFilePath(path)) return;
    this.clearScheduledRescan(path);
    if (this.rebuildPromise) {
      await this.rebuildPromise;
    }
    if (!this.removeLocationsForPath(path)) {
      return;
    }
    await this.persistRegistry();
    this.logger.debug(`removed NBE registry path=${path}`);
  }

  async handleRename(oldPath: string, newPath: string): Promise<void> {
    await this.removePath(oldPath);
    this.scheduleRescanPath(newPath);
  }

  async rebuild(): Promise<void> {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    this.clearAllScheduledRescans();
    if (this.rebuildPromise) return this.rebuildPromise;
    this.rebuildPromise = this.performRebuild().finally(() => {
      this.rebuildPromise = null;
    });
    return this.rebuildPromise;
  }

  async setPrimaryFromActiveContext(): Promise<boolean> {
    const current = await this.resolveCurrentContext();
    if (!current) {
      return false;
    }

    if (!this.registry[current.ref]) {
      await this.rescanPath(current.path);
    }

    const entry = this.registry[current.ref];
    if (!entry) return false;
    entry.primaryLocationKey = current.locationKey;
    entry.lastSeenAt = Date.now();
    await this.persistRegistry();
    return true;
  }

  async openRef(ref: string): Promise<"opened" | "searched"> {
    const normalizedRef = normalizeNbeRef(ref).ref;
    let entry = this.registry[normalizedRef];
    if (!entry || entry.locations.length === 0) {
      await this.rebuild();
      entry = this.registry[normalizedRef];
      if (!entry || entry.locations.length === 0) {
        await this.searchFallback(normalizedRef);
        this.scheduleRebuild();
        return "searched";
      }
    }

    const directLocation = resolveDirectLocation(entry);
    if (directLocation) {
      const opened = await this.tryOpenDirectLocation(directLocation, normalizedRef);
      if (opened) {
        return "opened";
      }
    }

    await this.searchFallback(normalizedRef);
    this.scheduleRebuild();
    return "searched";
  }

  private async tryOpenDirectLocation(location: NbeReferenceLocation, ref: string): Promise<boolean> {
    try {
      return location.kind === "markdown"
        ? await this.openMarkdownLocation(location)
        : await this.openCanvasLocation(location);
    } catch (error) {
      this.logger.debug(
        `open NBE direct location failed ref=${ref} error=${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async performRebuild(): Promise<void> {
    const nextRegistry: NbeReferenceRegistryMap = {};
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const canvasFiles = this.app.vault.getFiles().filter((file) => file.extension === "canvas");

    const scannedGroups = await Promise.all([
      ...markdownFiles.map((file) => this.scanFile(file)),
      ...canvasFiles.map((file) => this.scanFile(file)),
    ]);

    for (const scanned of scannedGroups) {
      for (const item of scanned) {
        addLocationToRegistry(nextRegistry, item.ref, item.location);
      }
    }

    preservePrimaryLocations(this.registry, nextRegistry);
    this.registry = nextRegistry;
    this.refsByPath = buildPathIndex(nextRegistry);
    await this.persistRegistry();
    this.logger.debug(`rebuilt NBE registry entries=${Object.keys(this.registry).length}`);
  }

  private async resolveCurrentContext(): Promise<CurrentNbeContext | null> {
    const markdown = this.resolveCurrentMarkdownContext();
    if (markdown) return markdown;
    return this.resolveCurrentCanvasContext();
  }

  private resolveCurrentMarkdownContext(): CurrentNbeContext | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!view || !file) return null;

    const content = view.getViewData();
    const refs = extractNbeRefsFromDocument(content);
    if (refs.length === 0) return null;

    const editor = (view as MarkdownView & { editor?: { getCursor?: () => { line: number } } }).editor;
    const currentLine = editor?.getCursor?.().line;
    const activeRef = typeof currentLine === "number"
      ? refs.find((item) => item.lineStart <= currentLine && currentLine <= item.lineEnd)
      : refs.length === 1
        ? refs[0]
        : null;
    if (!activeRef) return null;

    return {
      ref: activeRef.ref,
      locationKey: createMarkdownLocationKey(file.path, activeRef.lineStart, activeRef.lineEnd),
      path: file.path,
    };
  }

  private async resolveCurrentCanvasContext(): Promise<CurrentNbeContext | null> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "canvas") return null;

    const activeLeaf = (this.app.workspace as App["workspace"] & { activeLeaf?: { view?: unknown } }).activeLeaf;
    const canvasView = activeLeaf?.view as {
      getViewType?: () => string;
      canvas?: { selection?: Set<unknown> | unknown[] };
    } | undefined;
    if (canvasView?.getViewType?.() !== "canvas") return null;

    const selection = canvasView.canvas?.selection;
    const selected = Array.isArray(selection) ? selection : selection ? Array.from(selection as Set<unknown>) : [];
    const selectedNode = selected[0] as { id?: string; node?: { id?: string }; data?: { id?: string } } | undefined;
    const nodeId = selectedNode?.id ?? selectedNode?.node?.id ?? selectedNode?.data?.id;
    if (!nodeId) return null;

    const file = this.app.vault.getFileByPath(activeFile.path);
    if (!file) return null;
    const raw = await this.app.vault.read(file);
    let parsed: CanvasData;
    try {
      parsed = JSON.parse(raw) as CanvasData;
    } catch {
      return null;
    }
    const textNode = parsed.nodes.find((node) => node.type === "text" && node.id === nodeId) as CanvasTextData | undefined;
    if (!textNode) return null;
    const refs = extractNbeRefsFromDocument(textNode.text);
    if (refs.length === 0) return null;

    return {
      ref: refs[0].ref,
      locationKey: createCanvasLocationKey(activeFile.path, nodeId),
      path: activeFile.path,
    };
  }

  private async openMarkdownLocation(location: NbeMarkdownReferenceLocation): Promise<boolean> {
    const file = this.app.vault.getFileByPath(location.path);
    if (!file) return false;

    const leaf = this.findLeafForFile(location.path, "markdown") ?? this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    await this.safeRevealLeaf(leaf, `markdown path=${location.path}`);
    this.safeSetActiveLeaf(leaf, `markdown path=${location.path}`);

    await this.safeSetMarkdownSourceMode(leaf, location.path);

    const view = leaf.view instanceof MarkdownView ? leaf.view : this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view ? (view as MarkdownView & { editor?: { setCursor?: (cursor: { line: number; ch: number }) => void; focus?: () => void } }).editor : undefined;
    this.safeFocusMarkdownEditor(editor, location);
    return true;
  }

  private async openCanvasLocation(location: NbeCanvasReferenceLocation): Promise<boolean> {
    const file = this.app.vault.getFileByPath(location.path);
    if (!file) return false;

    const leaf = this.findLeafForFile(location.path, "canvas") ?? this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    await this.safeRevealLeaf(leaf, `canvas path=${location.path}`);
    this.safeSetActiveLeaf(leaf, `canvas path=${location.path}`);

    const resolved = await this.waitForCanvasNode(leaf, location);
    if (!resolved) return false;

    this.safeSelectCanvasNode(resolved.canvas, resolved.node, location);
    await this.safeZoomCanvasSelection(resolved.canvas, location);
    return true;
  }

  private async safeRevealLeaf(leaf: ReturnType<App['workspace']['getLeaf']>, context: string): Promise<void> {
    try {
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      this.logger.debug(`reveal NBE leaf failed ${context} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private safeSetActiveLeaf(leaf: ReturnType<App['workspace']['getLeaf']>, context: string): void {
    try {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    } catch (error) {
      this.logger.debug(`activate NBE leaf failed ${context} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async safeSetMarkdownSourceMode(leaf: ReturnType<App['workspace']['getLeaf']>, path: string): Promise<void> {
    try {
      const currentState = leaf.getViewState();
      await leaf.setViewState({
        ...currentState,
        state: {
          ...(currentState.state ?? {}),
          mode: 'source',
        },
      });
    } catch (error) {
      this.logger.debug(`set markdown NBE source mode failed path=${path} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private safeFocusMarkdownEditor(
    editor: { setCursor?: (cursor: { line: number; ch: number }) => void; focus?: () => void } | undefined,
    location: NbeMarkdownReferenceLocation,
  ): void {
    try {
      editor?.setCursor?.({ line: location.lineStart + 1, ch: 0 });
    } catch (error) {
      this.logger.debug(`set markdown NBE cursor failed path=${location.path} error=${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      editor?.focus?.();
    } catch (error) {
      this.logger.debug(`focus markdown NBE editor failed path=${location.path} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async waitForCanvasNode(
    leaf: ReturnType<App['workspace']['getLeaf']>,
    location: NbeCanvasReferenceLocation,
  ): Promise<ResolvedCanvasNode | null> {
    for (const delayMs of CANVAS_NODE_READY_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      const view = this.resolveCanvasView(leaf);
      const canvas = view?.canvas;
      const node = canvas?.nodes?.get?.(location.nodeId);
      if (canvas && node) {
        return { canvas, node };
      }
    }
    return null;
  }

  private resolveCanvasView(leaf: ReturnType<App['workspace']['getLeaf']>): CanvasViewLike | null {
    const view = leaf.view as CanvasViewLike | undefined;
    if (view?.getViewType?.() !== 'canvas') return null;
    return view;
  }

  private safeSelectCanvasNode(canvas: CanvasApiLike, node: unknown, location: NbeCanvasReferenceLocation): void {
    try {
      const selection = canvas.selection;
      if (selection instanceof Set) {
        selection.clear();
        selection.add(node);
      } else {
        selection?.clear?.();
        selection?.add?.(node);
      }
    } catch (error) {
      this.logger.debug(`select canvas NBE node failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      canvas.updateSelection?.(true);
    } catch (error) {
      this.logger.debug(`update canvas NBE selection failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async safeZoomCanvasSelection(canvas: CanvasApiLike, location: NbeCanvasReferenceLocation): Promise<void> {
    try {
      canvas.zoomToSelection?.();
      return;
    } catch (error) {
      this.logger.debug(`zoom canvas NBE selection failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }

    await sleep(CANVAS_ZOOM_RETRY_DELAY_MS);
    try {
      canvas.zoomToSelection?.();
    } catch (error) {
      this.logger.debug(`retry zoom canvas NBE selection failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async searchFallback(ref: string): Promise<void> {
    const query = searchTokenForNbeRef(ref);
    const appAny = this.app as App & {
      internalPlugins?: { getPluginById?: (id: string) => { instance?: { openGlobalSearch?: () => void } } | null };
      commands?: { executeCommandById?: (id: string) => boolean };
    };

    try {
      appAny.commands?.executeCommandById?.('global-search:open');
    } catch (error) {
      this.logger.debug(`open global search command failed error=${error instanceof Error ? error.message : String(error)}`);
    }
    if (await this.trySetGlobalSearchQuery(query)) {
      return;
    }

    const searchPlugin = appAny.internalPlugins?.getPluginById?.('global-search')?.instance;
    if (typeof searchPlugin?.openGlobalSearch === 'function') {
      try {
        searchPlugin.openGlobalSearch();
      } catch (error) {
        this.logger.debug(`open global search plugin failed error=${error instanceof Error ? error.message : String(error)}`);
      }
      if (await this.trySetGlobalSearchQuery(query)) {
        return;
      }
    }

    new Notice(`Search for ${query}`);
  }

  private async trySetGlobalSearchQuery(query: string): Promise<boolean> {
    const searchLeaf = this.app.workspace.getLeavesOfType('search')[0];
    const searchView = searchLeaf?.view as { setQuery?: (query: string) => void } | undefined;
    if (!searchLeaf || typeof searchView?.setQuery !== 'function') {
      return false;
    }
    try {
      await this.app.workspace.revealLeaf(searchLeaf);
      searchView.setQuery(query);
      return true;
    } catch (error) {
      this.logger.debug(`set global search query failed error=${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private findLeafForFile(path: string, viewType: 'markdown' | 'canvas') {
    let match = null as ReturnType<App['workspace']['getMostRecentLeaf']>;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (match) return;
      const view = leaf.view as { getViewType?: () => string; file?: { path?: string } };
      if (viewType === 'markdown' && leaf.view instanceof MarkdownView && leaf.view.file?.path === path) {
        match = leaf;
        return;
      }
      if (viewType === 'canvas' && view.getViewType?.() === 'canvas' && view.file?.path === path) {
        match = leaf;
      }
    });
    return match;
  }

  private clearScheduledRescan(path: string): void {
    const timer = this.rescanTimers.get(path);
    if (!timer) return;
    clearTimeout(timer);
    this.rescanTimers.delete(path);
  }

  private clearAllScheduledRescans(): void {
    for (const timer of this.rescanTimers.values()) {
      clearTimeout(timer);
    }
    this.rescanTimers.clear();
  }

  private isIndexedFilePath(path: string): boolean {
    return path.endsWith('.md') || path.endsWith('.canvas');
  }

  private async scanPath(path: string): Promise<ScannedReferenceLocation[]> {
    const file = this.app.vault.getFileByPath(path);
    if (!file || !this.isIndexedFilePath(file.path)) return [];
    return this.scanFile(file);
  }

  private async scanFile(file: TFile): Promise<ScannedReferenceLocation[]> {
    try {
      const raw = await this.app.vault.read(file);
      if (file.extension === "md") {
        return extractNbeRefsFromDocument(raw).map((ref) => ({
          ref: ref.ref,
          location: {
            kind: "markdown",
            key: createMarkdownLocationKey(file.path, ref.lineStart, ref.lineEnd),
            path: file.path,
            lineStart: ref.lineStart,
            lineEnd: ref.lineEnd,
          } satisfies NbeMarkdownReferenceLocation,
        }));
      }
      if (file.extension !== "canvas") return [];
      let parsed: CanvasData;
      try {
        parsed = JSON.parse(raw) as CanvasData;
      } catch {
        return [];
      }
      const scanned: ScannedReferenceLocation[] = [];
      for (const node of parsed.nodes ?? []) {
        if (node.type !== "text" || typeof (node as CanvasTextData).text !== "string") continue;
        const textNode = node as CanvasTextData;
        const refs = extractNbeRefsFromDocument(textNode.text);
        for (const ref of refs) {
          scanned.push({
            ref: ref.ref,
            location: {
              kind: "canvas",
              key: createCanvasLocationKey(file.path, textNode.id),
              path: file.path,
              nodeId: textNode.id,
            } satisfies NbeCanvasReferenceLocation,
          });
        }
      }
      return scanned;
    } catch (error) {
      this.logger.debug(`scan NBE refs failed path=${file.path} error=${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private addLocation(ref: string, location: NbeReferenceLocation): boolean {
    const existing = this.registry[ref];
    if (!existing) {
      this.registry[ref] = {
        ref,
        locations: [location],
        lastSeenAt: Date.now(),
      };
      addPathRef(this.refsByPath, location.path, ref);
      return true;
    }
    if (existing.locations.some((item) => item.key === location.key)) {
      existing.lastSeenAt = Date.now();
      addPathRef(this.refsByPath, location.path, ref);
      return false;
    }
    existing.locations.push(location);
    existing.lastSeenAt = Date.now();
    addPathRef(this.refsByPath, location.path, ref);
    return true;
  }

  private removeLocationsForPath(path: string): boolean {
    const refs = this.refsByPath.get(path);
    if (!refs || refs.size === 0) return false;

    let changed = false;
    for (const ref of refs) {
      const entry = this.registry[ref];
      if (!entry) continue;
      const nextLocations = entry.locations.filter((location) => location.path !== path);
      if (nextLocations.length === entry.locations.length) continue;
      changed = true;
      if (nextLocations.length === 0) {
        delete this.registry[ref];
        continue;
      }
      entry.locations = nextLocations;
      if (entry.primaryLocationKey && !nextLocations.some((location) => location.key === entry.primaryLocationKey)) {
        delete entry.primaryLocationKey;
      }
      entry.lastSeenAt = Date.now();
    }

    this.refsByPath.delete(path);
    return changed;
  }

  private async persistRegistry(): Promise<void> {
    await this.store.setNbeRegistry(this.registry);
  }
}

function addLocationToRegistry(registry: NbeReferenceRegistryMap, ref: string, location: NbeReferenceLocation): void {
  const existing = registry[ref];
  if (!existing) {
    registry[ref] = {
      ref,
      locations: [location],
      lastSeenAt: Date.now(),
    };
    return;
  }
  if (!existing.locations.some((item) => item.key === location.key)) {
    existing.locations.push(location);
  }
  existing.lastSeenAt = Date.now();
}

function preservePrimaryLocations(previous: NbeReferenceRegistryMap, next: NbeReferenceRegistryMap): void {
  for (const [ref, entry] of Object.entries(next)) {
    const previousEntry = previous[ref];
    if (!previousEntry?.primaryLocationKey) continue;
    if (entry.locations.some((location) => location.key === previousEntry.primaryLocationKey)) {
      entry.primaryLocationKey = previousEntry.primaryLocationKey;
    }
  }
}

function resolveDirectLocation(entry: NbeReferenceRegistryEntry): NbeReferenceLocation | null {
  if (entry.primaryLocationKey) {
    const primary = entry.locations.find((location) => location.key === entry.primaryLocationKey);
    if (primary) return primary;
  }
  if (entry.locations.length === 1) {
    return entry.locations[0];
  }
  return null;
}

function createMarkdownLocationKey(path: string, lineStart: number, lineEnd: number): string {
  return `md:${path}:${lineStart}:${lineEnd}`;
}

function createCanvasLocationKey(path: string, nodeId: string): string {
  return `canvas:${path}:${nodeId}`;
}

function structuredCloneRegistry(registry: NbeReferenceRegistryMap): NbeReferenceRegistryMap {
  return Object.fromEntries(
    Object.entries(registry).map(([ref, entry]) => [
      ref,
      {
        ref: entry.ref,
        primaryLocationKey: entry.primaryLocationKey,
        lastSeenAt: entry.lastSeenAt,
        locations: entry.locations.map((location) => ({ ...location })),
      },
    ]),
  );
}

function buildPathIndex(registry: NbeReferenceRegistryMap): Map<string, Set<string>> {
  const refsByPath = new Map<string, Set<string>>();
  for (const [ref, entry] of Object.entries(registry)) {
    for (const location of entry.locations) {
      addPathRef(refsByPath, location.path, ref);
    }
  }
  return refsByPath;
}

function addPathRef(index: Map<string, Set<string>>, path: string, ref: string): void {
  const refs = index.get(path) ?? new Set<string>();
  refs.add(ref);
  index.set(path, refs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
