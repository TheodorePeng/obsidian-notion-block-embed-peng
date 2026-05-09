import { CACHE_TTL_MS, MAX_TREE_DEPTH, NBE_RESOLUTION_CACHE_TTL_MS, REPOSITORY_TREE_CONCURRENCY } from "../core/constants";
import { PluginError } from "../core/errors";
import { Logger } from "../core/logger";
import {
  EmbedCacheScope,
  NbeResolvedPageIndex,
  ParsedNbeRef,
  ParsedNotionTarget,
  NbeResolvedTarget,
  NotionApiBlock,
  NotionApiBlockTree,
  NotionApiDatabase,
  NotionApiPage,
  NotionApiRichText,
} from "../core/models";
import { AsyncTtlCache } from "../embed/cache";
import { mapWithConcurrency } from "../embed/concurrency";
import { NBE_PROPERTY_NAME, parseNbeProtocolUrl } from "../nbe/ref";
import { NotionChildrenHydrator, NotionReadClient } from "./children-hydration";
import { extractHeadingSection, normalizeHeading } from "./heading-section";

interface TimedEntry<T> {
  expiresAt: number;
  value: T;
}

export interface NbeResolutionCacheStore {
  getPageIndex(tokenFingerprint: string, pageNbeId: string): NbeResolvedPageIndex | null;
  setPageIndex(tokenFingerprint: string, pageIndex: NbeResolvedPageIndex): Promise<void>;
  deletePageIndex(tokenFingerprint: string, pageNbeId: string): Promise<void>;
  getResolvedTarget(tokenFingerprint: string, ref: string): NbeResolvedTarget | null;
  setResolvedTarget(tokenFingerprint: string, target: NbeResolvedTarget): Promise<void>;
  deleteResolvedTarget(tokenFingerprint: string, ref: string): Promise<void>;
  clearNamespace?(tokenFingerprint?: string): Promise<void>;
}

export class NotionRepository {
  private readonly hydrator: NotionChildrenHydrator;
  private readonly nbePageCache = new Map<string, TimedEntry<NotionApiPage>>();
  private readonly nbeResolvedTargetCache = new Map<string, TimedEntry<NbeResolvedTarget>>();
  private readonly nbeResolvedPageIndexCache = new Map<string, TimedEntry<NbeResolvedPageIndex>>();
  private nbeDatabasesCache: TimedEntry<NotionApiDatabase[]> | null = null;

  constructor(
    private readonly client: NotionReadClient,
    private readonly cache: AsyncTtlCache<NotionApiBlockTree>,
    private readonly logger: Logger,
    private readonly keyPrefix: string,
    private readonly nbeResolutionCacheStore?: NbeResolutionCacheStore,
  ) {
    this.hydrator = new NotionChildrenHydrator(client, logger);
  }

  async getBlockTree(blockId: string, includeChildren: boolean): Promise<NotionApiBlockTree> {
    const key = this.buildBlockTreeKey(blockId, includeChildren);
    this.logger.debug(`repository getBlockTree ${key}`);
    return this.cache.getOrLoad(key, async () => freezeDeep(await this.loadTree(blockId, includeChildren)));
  }

  isLikelyWarmTarget(target: ParsedNotionTarget, includeChildren: boolean): boolean {
    if (target.mode === "empty_block_url") return true;
    if (target.mode === "block_url") {
      return this.hasWarmTreeKey(this.buildBlockTreeKey(target.blockId, includeChildren));
    }
    if (target.mode === "page_heading") {
      return this.hasWarmTreeKey(this.buildPageSectionKey(target.pageId, normalizeHeading(target.heading), includeChildren));
    }

    const ref = `${target.pageNbeId}::${target.blockNbeId}`;
    const resolvedTarget = this.readTimed(this.nbeResolvedTargetCache, ref) ?? this.readPersistedResolvedTarget(ref);
    if (!resolvedTarget) return false;
    return this.hasWarmTreeKey(this.buildBlockTreeKey(resolvedTarget.blockId, includeChildren));
  }

  async getBlockTreeByNbeRef(
    pageNbeId: string,
    blockNbeId: string,
    includeChildren: boolean,
  ): Promise<{ pageId: string; blockId: string; tree: NotionApiBlockTree }> {
    const ref = `${pageNbeId}::${blockNbeId}`;
    const memoryTarget = this.readTimed(this.nbeResolvedTargetCache, ref);
    if (memoryTarget) {
      this.logger.debug(`nbe-target memory hit ${ref}`);
      const resolved = await this.resolveFromResolvedTarget(memoryTarget, includeChildren);
      if (resolved) return resolved;
      this.logger.debug(`nbe-target stale -> fallback ${ref}`);
    }

    const persistedTarget = this.readPersistedResolvedTarget(ref);
    if (persistedTarget) {
      this.logger.debug(`nbe-target persisted hit ${ref}`);
      const resolved = await this.resolveFromResolvedTarget(persistedTarget, includeChildren);
      if (resolved) return resolved;
      this.logger.debug(`nbe-target stale -> fallback ${ref}`);
    }

    const memoryIndex = this.readTimed(this.nbeResolvedPageIndexCache, pageNbeId);
    if (memoryIndex) {
      this.logger.debug(`nbe-page-index memory hit ${pageNbeId}`);
      const resolved = await this.resolveFromPageIndex(memoryIndex, pageNbeId, blockNbeId, includeChildren);
      if (resolved) return resolved;
      this.logger.debug(`nbe-page-index stale -> rebuild ${pageNbeId}`);
    }

    const persistedIndex = this.readPersistedPageIndex(pageNbeId);
    if (persistedIndex) {
      this.logger.debug(`nbe-page-index persisted hit ${pageNbeId}`);
      const resolved = await this.resolveFromPageIndex(persistedIndex, pageNbeId, blockNbeId, includeChildren);
      if (resolved) {
        this.writeTimedWithTtl(this.nbeResolvedPageIndexCache, pageNbeId, persistedIndex, NBE_RESOLUTION_CACHE_TTL_MS);
        return resolved;
      }
      this.logger.debug(`nbe-page-index stale -> rebuild ${pageNbeId}`);
    }

    this.logger.debug(`nbe-page-index rebuild ${pageNbeId}`);
    const rebuiltIndex = await this.rebuildPageIndex(pageNbeId);
    const rebuilt = await this.resolveFromPageIndex(rebuiltIndex.pageIndex, pageNbeId, blockNbeId, includeChildren);
    if (rebuilt) return rebuilt;
    if (rebuiltIndex.duplicateBlockNbeIds.has(blockNbeId)) {
      throw new PluginError("INVALID_INPUT", `Duplicate Block ID on page for ref: ${ref}`);
    }
    throw new PluginError("INVALID_INPUT", `NBE block not found on page: ${ref}`);
  }

  async prewarmNbePageIndex(pageNbeId: string): Promise<void> {
    const memoryIndex = this.readTimed(this.nbeResolvedPageIndexCache, pageNbeId);
    if (memoryIndex) {
      this.logger.debug(`nbe-page-index prewarm hit ${pageNbeId}`);
      return;
    }

    const persistedIndex = this.readPersistedPageIndex(pageNbeId);
    if (persistedIndex) {
      this.logger.debug(`nbe-page-index prewarm hit ${pageNbeId}`);
      this.writeTimedWithTtl(this.nbeResolvedPageIndexCache, pageNbeId, persistedIndex, NBE_RESOLUTION_CACHE_TTL_MS);
      return;
    }

    this.logger.debug(`nbe-page-index prewarm rebuild ${pageNbeId}`);
    await this.rebuildPageIndex(pageNbeId);
  }

  async getPageSectionByHeading(
    pageId: string,
    heading: string,
    includeChildren: boolean,
  ): Promise<NotionApiBlockTree> {
    const normalizedHeading = normalizeHeading(heading);
    const key = this.buildPageSectionKey(pageId, normalizedHeading, includeChildren);
    this.logger.debug(`repository getPageSectionByHeading ${key}`);
    return this.cache.getOrLoad(key, async () => {
      const pageTree = await this.getPageTree(pageId, includeChildren);
      const sectionChildren = extractHeadingSection(pageTree.children, normalizedHeading);

      if (sectionChildren.length === 0) {
        throw new PluginError("INVALID_INPUT", `Heading not found: ${heading}`);
      }

      const synthetic: NotionApiBlock = {
        object: "block",
        id: pageId,
        type: "section_container",
        has_children: sectionChildren.length > 0,
        last_edited_time: pageTree.block.last_edited_time,
        section_container: {
          title: heading,
        },
      };

      return freezeDeep({
        block: synthetic,
        children: sectionChildren,
      });
    });
  }

  async getPageTree(pageId: string, includeChildren: boolean): Promise<NotionApiBlockTree> {
    const key = this.buildPageTreeKey(pageId, includeChildren);
    this.logger.debug(`repository getPageTree ${key}`);
    return this.cache.getOrLoad(key, async () => {
      const pageBlock = await this.client.getBlock(pageId);
      const topLevel = await this.loadTopLevel(pageId, includeChildren);
      return freezeDeep({
        block: pageBlock,
        children: topLevel,
      });
    });
  }

  cacheScopesForTarget(target: ParsedNotionTarget): EmbedCacheScope[] {
    if (target.mode === "empty_block_url" || target.mode === "nbe_uri") {
      return [];
    }
    if (target.mode === "block_url") {
      return [{ kind: "block_tree", blockId: target.blockId }];
    }
    return [
      { kind: "page_tree", pageId: target.pageId },
      { kind: "page_section", pageId: target.pageId },
    ];
  }

  invalidateScopes(scopes: EmbedCacheScope[]): void {
    for (const scope of scopes) {
      if (scope.kind === "block_tree") {
        const prefix = `${this.keyPrefix}:block:${scope.blockId}:`;
        this.cache.invalidatePrefix(prefix);
        continue;
      }
      if (scope.kind === "page_tree") {
        const treePrefix = `${this.keyPrefix}:page:${scope.pageId}:tree:`;
        const sectionPrefix = `${this.keyPrefix}:page:${scope.pageId}:section:`;
        this.cache.invalidatePrefix(treePrefix);
        this.cache.invalidatePrefix(sectionPrefix);
        continue;
      }
      const prefix = `${this.keyPrefix}:page:${scope.pageId}:section:`;
      this.cache.invalidatePrefix(prefix);
    }
  }

  clearContentCache(): void {
    this.cache.clearAll();
  }

  clearCache(): void {
    this.cache.clearAll();
    this.nbeDatabasesCache = null;
    this.nbePageCache.clear();
    this.nbeResolvedTargetCache.clear();
    this.nbeResolvedPageIndexCache.clear();
    void this.nbeResolutionCacheStore?.clearNamespace?.(this.keyPrefix);
  }

  private hasWarmTreeKey(key: string): boolean {
    return this.cache.hasFresh(key) || this.cache.hasInFlight(key);
  }

  private async getPageByNbeId(pageNbeId: string): Promise<NotionApiPage> {
    const cached = this.readTimed(this.nbePageCache, pageNbeId);
    if (cached) return cached;

    const databases = await this.getNbeDatabases();
    if (databases.length === 0) {
      throw new PluginError("INVALID_INPUT", `NBE page not found: ${pageNbeId}`);
    }

    const matches = (
      await mapWithConcurrency(databases, REPOSITORY_TREE_CONCURRENCY, async (database) =>
        this.client.queryDatabaseByNbeId(database.id, pageNbeId),
      )
    ).flat();

    if (matches.length === 0) {
      throw new PluginError("INVALID_INPUT", `NBE page not found: ${pageNbeId}`);
    }
    if (matches.length > 1) {
      throw new PluginError("INVALID_INPUT", `Duplicate NBE ID: ${pageNbeId}`);
    }

    const page = matches[0];
    this.writeTimed(this.nbePageCache, pageNbeId, page);
    return page;
  }

  private async getNbeDatabases(): Promise<NotionApiDatabase[]> {
    const now = Date.now();
    if (this.nbeDatabasesCache && this.nbeDatabasesCache.expiresAt > now) {
      return this.nbeDatabasesCache.value;
    }

    const databases = (await this.client.searchDatabases()).filter((database: NotionApiDatabase) => hasNbeProperty(database));
    this.nbeDatabasesCache = {
      expiresAt: now + CACHE_TTL_MS,
      value: databases,
    };
    return databases;
  }

  private readPersistedPageIndex(pageNbeId: string): NbeResolvedPageIndex | null {
    const persisted = this.nbeResolutionCacheStore?.getPageIndex(this.keyPrefix, pageNbeId);
    if (!persisted) return null;
    if (persisted.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS <= Date.now()) {
      void this.nbeResolutionCacheStore?.deletePageIndex(this.keyPrefix, pageNbeId);
      return null;
    }
    return persisted;
  }

  private readPersistedResolvedTarget(ref: string): NbeResolvedTarget | null {
    const persisted = this.nbeResolutionCacheStore?.getResolvedTarget(this.keyPrefix, ref);
    if (!persisted) return null;
    if (persisted.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS <= Date.now()) {
      void this.nbeResolutionCacheStore?.deleteResolvedTarget(this.keyPrefix, ref);
      return null;
    }
    return persisted;
  }

  private async rebuildPageIndex(
    pageNbeId: string,
  ): Promise<{ pageIndex: NbeResolvedPageIndex; duplicateBlockNbeIds: Set<string> }> {
    const page = await this.getPageByNbeId(pageNbeId);
    this.logger.debug(`nbe-page-index light-scan rebuild ${pageNbeId}`);
    const scanner = new LightweightNbePageScanner(this.client, this.logger);
    const { pageIndex, duplicateBlockNbeIds } = await scanner.scan(pageNbeId, page.id);
    this.writeTimedWithTtl(this.nbeResolvedPageIndexCache, pageNbeId, pageIndex, NBE_RESOLUTION_CACHE_TTL_MS);
    await this.nbeResolutionCacheStore?.setPageIndex(this.keyPrefix, pageIndex);
    return { pageIndex, duplicateBlockNbeIds };
  }

  private async resolveFromPageIndex(
    pageIndex: NbeResolvedPageIndex,
    pageNbeId: string,
    blockNbeId: string,
    includeChildren: boolean,
  ): Promise<{ pageId: string; blockId: string; tree: NotionApiBlockTree } | null> {
    const ref = `${pageNbeId}::${blockNbeId}`;
    const blockId = pageIndex.blocks[blockNbeId];
    if (!blockId) {
      return null;
    }

    try {
      const tree = await this.getBlockTree(blockId, includeChildren);
      await this.cacheResolvedTarget({
        ref,
        pageNbeId,
        blockNbeId,
        pageId: pageIndex.pageId,
        blockId,
        resolvedAt: Date.now(),
      });
      return {
        pageId: pageIndex.pageId,
        blockId,
        tree,
      };
    } catch (error) {
      if (!shouldInvalidateResolvedTarget(error)) throw error;
      await this.nbeResolutionCacheStore?.deletePageIndex(this.keyPrefix, pageNbeId);
      this.nbeResolvedPageIndexCache.delete(pageNbeId);
      await this.invalidateResolvedTarget(ref);
      return null;
    }
  }

  private async resolveFromResolvedTarget(
    target: NbeResolvedTarget,
    includeChildren: boolean,
  ): Promise<{ pageId: string; blockId: string; tree: NotionApiBlockTree } | null> {
    try {
      const tree = await this.getBlockTree(target.blockId, includeChildren);
      this.writeTimedWithTtl(this.nbeResolvedTargetCache, target.ref, target, NBE_RESOLUTION_CACHE_TTL_MS);
      return {
        pageId: target.pageId,
        blockId: target.blockId,
        tree,
      };
    } catch (error) {
      if (!shouldInvalidateResolvedTarget(error)) throw error;
      await this.invalidateResolvedTarget(target.ref);
      return null;
    }
  }

  private async cacheResolvedTarget(target: NbeResolvedTarget): Promise<void> {
    this.writeTimedWithTtl(this.nbeResolvedTargetCache, target.ref, target, NBE_RESOLUTION_CACHE_TTL_MS);
    await this.nbeResolutionCacheStore?.setResolvedTarget(this.keyPrefix, target);
    this.logger.debug(`nbe-target refreshed from nbe ${target.ref}`);
  }

  private async invalidateResolvedTarget(ref: string): Promise<void> {
    this.nbeResolvedTargetCache.delete(ref);
    await this.nbeResolutionCacheStore?.deleteResolvedTarget(this.keyPrefix, ref);
  }

  private buildBlockTreeKey(blockId: string, includeChildren: boolean): string {
    return `${this.keyPrefix}:block:${blockId}:${includeChildren ? "with-children" : "root-only"}`;
  }

  private buildPageTreeKey(pageId: string, includeChildren: boolean): string {
    return `${this.keyPrefix}:page:${pageId}:tree:${includeChildren ? "with-children" : "root-only"}`;
  }

  private buildPageSectionKey(pageId: string, heading: string, includeChildren: boolean): string {
    return `${this.keyPrefix}:page:${pageId}:section:${heading}:${includeChildren ? "with-children" : "root-only"}`;
  }

  private async loadTree(blockId: string, includeChildren: boolean): Promise<NotionApiBlockTree> {
    const root = await this.client.getBlock(blockId);
    if (!includeChildren || !root.has_children) {
      return { block: root, children: [] };
    }
    return {
      block: root,
      children: await this.hydrator.loadChildrenForBlock(root, 1),
    };
  }

  private async loadTopLevel(pageId: string, includeNestedChildren: boolean): Promise<NotionApiBlockTree[]> {
    const children = await this.client.listBlockChildren(pageId);
    if (!includeNestedChildren) {
      return children.map((block) => ({ block, children: [] }));
    }

    return mapWithConcurrency(children, REPOSITORY_TREE_CONCURRENCY, async (child) => {
      const grandChildren = child.has_children ? await this.hydrator.loadChildrenForBlock(child, 2) : [];
      return {
        block: child,
        children: grandChildren,
      };
    });
  }

  private readTimed<T>(map: Map<string, TimedEntry<T>>, key: string): T | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  private writeTimed<T>(map: Map<string, TimedEntry<T>>, key: string, value: T): void {
    this.writeTimedWithTtl(map, key, value, CACHE_TTL_MS);
  }

  private writeTimedWithTtl<T>(map: Map<string, TimedEntry<T>>, key: string, value: T, ttlMs: number): void {
    map.set(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    });
  }
}

function hasNbeProperty(database: NotionApiDatabase): boolean {
  const property = database.properties?.[NBE_PROPERTY_NAME];
  if (!property) return false;
  return property.type === "rich_text";
}

function getTypeData(block: NotionApiBlock): Record<string, unknown> {
  const data = block[block.type];
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function blockContainsNbeRef(block: NotionApiBlock, ref: string): boolean {
  return extractNbeRefsFromBlock(block).some((item) => item.ref === ref);
}

function findBlocksMatchingNbeRef(nodes: NotionApiBlockTree[], ref: string): NotionApiBlockTree[] {
  const matches: NotionApiBlockTree[] = [];
  for (const node of nodes) {
    if (blockContainsNbeRef(node.block, ref)) {
      matches.push(node);
    }
    if (node.children.length > 0) {
      matches.push(...findBlocksMatchingNbeRef(node.children, ref));
    }
  }
  return matches;
}

function buildNbePageIndex(
  pageNbeId: string,
  pageId: string,
  nodes: NotionApiBlockTree[],
): { pageIndex: NbeResolvedPageIndex; duplicateBlockNbeIds: Set<string> } {
  const blocks: Record<string, string> = {};
  const duplicateRefs = new Set<string>();

  const visit = (nodeList: NotionApiBlockTree[]) => {
    for (const node of nodeList) {
      const refs = extractNbeRefsFromBlock(node.block);
      for (const parsed of refs) {
        if (parsed.pageNbeId !== pageNbeId) continue;
        if (blocks[parsed.blockNbeId] && blocks[parsed.blockNbeId] !== node.block.id) {
          duplicateRefs.add(parsed.blockNbeId);
          delete blocks[parsed.blockNbeId];
          continue;
        }
        if (!duplicateRefs.has(parsed.blockNbeId)) {
          blocks[parsed.blockNbeId] = node.block.id;
        }
      }
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(nodes);
  return {
    pageIndex: {
      pageNbeId,
      pageId,
      blocks,
      resolvedAt: Date.now(),
    },
    duplicateBlockNbeIds: duplicateRefs,
  };
}

class LightweightNbePageScanner {
  constructor(
    private readonly client: NotionReadClient,
    private readonly logger: Logger,
  ) {}

  async scan(
    pageNbeId: string,
    pageId: string,
  ): Promise<{ pageIndex: NbeResolvedPageIndex; duplicateBlockNbeIds: Set<string> }> {
    const blocks: Record<string, string> = {};
    const duplicateRefs = new Set<string>();
    const topLevel = await this.client.listBlockChildren(pageId);
    await this.processBlocks(topLevel, 1, pageNbeId, blocks, duplicateRefs);
    return {
      pageIndex: {
        pageNbeId,
        pageId,
        blocks,
        resolvedAt: Date.now(),
      },
      duplicateBlockNbeIds: duplicateRefs,
    };
  }

  private async processBlocks(
    blocksAtDepth: NotionApiBlock[],
    depth: number,
    pageNbeId: string,
    resolvedBlocks: Record<string, string>,
    duplicateRefs: Set<string>,
  ): Promise<void> {
    if (depth > MAX_TREE_DEPTH) return;
    await mapWithConcurrency(blocksAtDepth, REPOSITORY_TREE_CONCURRENCY, async (block) => {
      this.indexBlockRefs(block, pageNbeId, resolvedBlocks, duplicateRefs);
      if (depth >= MAX_TREE_DEPTH) return;
      const children = await this.loadDescendantBlocks(block, depth + 1);
      if (children.length === 0) return;
      await this.processBlocks(children, depth + 1, pageNbeId, resolvedBlocks, duplicateRefs);
    });
  }

  private indexBlockRefs(
    block: NotionApiBlock,
    pageNbeId: string,
    resolvedBlocks: Record<string, string>,
    duplicateRefs: Set<string>,
  ): void {
    const refs = extractNbeRefsFromBlock(block);
    for (const parsed of refs) {
      if (parsed.pageNbeId !== pageNbeId) continue;
      if (resolvedBlocks[parsed.blockNbeId] && resolvedBlocks[parsed.blockNbeId] !== block.id) {
        duplicateRefs.add(parsed.blockNbeId);
        delete resolvedBlocks[parsed.blockNbeId];
        continue;
      }
      if (!duplicateRefs.has(parsed.blockNbeId)) {
        resolvedBlocks[parsed.blockNbeId] = block.id;
      }
    }
  }

  private async loadDescendantBlocks(block: NotionApiBlock, depth: number): Promise<NotionApiBlock[]> {
    if (depth > MAX_TREE_DEPTH) return [];
    if (block.type !== "synced_block") {
      if (!block.has_children) return [];
      return this.client.listBlockChildren(block.id);
    }

    const listedChildren = block.has_children ? await this.client.listBlockChildren(block.id) : [];
    if (listedChildren.length > 0) {
      return listedChildren;
    }

    const syncedData = this.getSyncedBlockData(block);
    const inlineChildren = this.getInlineSyncedChildren(syncedData);
    if (inlineChildren.length > 0) {
      return inlineChildren;
    }

    const sourceBlockId = this.getSyncedSourceBlockId(syncedData);
    if (!sourceBlockId || sourceBlockId === block.id) {
      return [];
    }

    try {
      return await this.client.listBlockChildren(sourceBlockId);
    } catch (error) {
      this.logger.debug(
        `repository light-scan synced_block fallback failed block=${block.id} source=${sourceBlockId} error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private getSyncedBlockData(block: NotionApiBlock): Record<string, unknown> {
    const value = block.synced_block;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  private getInlineSyncedChildren(data: Record<string, unknown>): NotionApiBlock[] {
    const value = data.children;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is NotionApiBlock => Boolean(item && typeof item === "object"));
  }

  private getSyncedSourceBlockId(data: Record<string, unknown>): string | null {
    const syncedFrom = data.synced_from;
    if (!syncedFrom || typeof syncedFrom !== "object") return null;
    return typeof (syncedFrom as { block_id?: unknown }).block_id === "string"
      ? (syncedFrom as { block_id: string }).block_id
      : null;
  }
}

const NBE_URI_TEXT_PATTERN = /obsidian:\/\/notion-block-embed\?[^\s<>"']+/gi;
const SHORTLINK_NBE_TEXT_PATTERN = /https?:\/\/www\.shortlink\.studio\/1\/[^\s<>"']+/gi;

function extractNbeRefsFromBlock(block: NotionApiBlock): ParsedNbeRef[] {
  const richText = getTypeData(block).rich_text;
  if (!Array.isArray(richText)) return [];
  const refs = new Map<string, ParsedNbeRef>();
  for (const item of richText) {
    if (!item || typeof item !== "object") continue;
    for (const ref of extractNbeRefsFromRichTextItem(item as NotionApiRichText)) {
      refs.set(ref.ref, ref);
    }
  }
  return Array.from(refs.values());
}

function extractNbeRefsFromRichTextItem(item: NotionApiRichText): ParsedNbeRef[] {
  const refs = new Map<string, ParsedNbeRef>();
  const directCandidates = new Set<string>();

  if (typeof item.href === "string") {
    directCandidates.add(item.href);
  }
  if (typeof item.text?.link?.url === "string") {
    directCandidates.add(item.text.link.url);
  }

  for (const candidate of directCandidates) {
    const parsed = parseStrictNbeRefCandidate(candidate);
    if (parsed) {
      refs.set(parsed.ref, parsed);
    }
  }

  if (typeof item.plain_text === "string" && item.plain_text) {
    for (const candidate of extractNbeUriCandidatesFromPlainText(item.plain_text)) {
      const parsed = parseStrictNbeRefCandidate(candidate);
      if (parsed) {
        refs.set(parsed.ref, parsed);
      }
    }
  }

  return Array.from(refs.values());
}

function extractNbeUriCandidatesFromPlainText(text: string): string[] {
  const matches = [
    ...(text.match(NBE_URI_TEXT_PATTERN) ?? []),
    ...(text.match(SHORTLINK_NBE_TEXT_PATTERN) ?? []),
  ];
  return matches
    .map((match) => match.replace(/[)\]}>，。！？、；：,.!?;:]+$/u, ""))
    .filter(Boolean);
}

function parseStrictNbeRefCandidate(rawUrl: string): ParsedNbeRef | null {
  try {
    const parsed = parseNbeProtocolUrl(rawUrl, { requireOpenRefAction: true });
    return {
      ref: parsed.ref,
      pageNbeId: parsed.pageNbeId,
      blockNbeId: parsed.blockNbeId,
    };
  } catch {
    return null;
  }
}

function shouldInvalidateResolvedTarget(error: unknown): boolean {
  return error instanceof PluginError && error.status === 404;
}

function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object") return value;
  const target = value as object;
  if (seen.has(target)) return value;
  seen.add(target);

  if (Array.isArray(value)) {
    for (const item of value) {
      freezeDeep(item, seen);
    }
    return Object.freeze(value);
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    freezeDeep(nested, seen);
  }
  return Object.freeze(value);
}
