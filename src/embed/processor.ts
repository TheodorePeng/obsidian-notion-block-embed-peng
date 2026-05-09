import type { CanvasData, CanvasTextData } from 'obsidian/canvas';
import { MarkdownPostProcessorContext } from 'obsidian';
import { INITIAL_RENDER_CONCURRENCY, INITIAL_RENDER_DELAY_MS } from '../core/constants';
import { parseNotionTargetFromSource } from '../notion/parser';
import { CanvasNbePrewarmQueue } from './canvas-nbe-prewarm-queue';
import { InitialRenderPriority, InitialRenderQueue } from './initial-render-queue';
import { createRenderSession } from './render-session';
import { ProcessorDependencies } from './types';

export class NotionEmbedProcessor {
  private readonly initialRenderQueue: InitialRenderQueue;
  private readonly canvasPrewarmQueue: CanvasNbePrewarmQueue;
  private readonly selectedCanvasNodeTextCache = new Map<string, Promise<string | null>>();
  private usedInitialFastPath = false;

  constructor(private readonly deps: ProcessorDependencies) {
    this.initialRenderQueue = new InitialRenderQueue(
      deps.logger,
      INITIAL_RENDER_DELAY_MS,
      INITIAL_RENDER_CONCURRENCY,
    );
    this.canvasPrewarmQueue = new CanvasNbePrewarmQueue(deps.logger);
  }

  dispose(): void {
    this.initialRenderQueue.clear();
    this.canvasPrewarmQueue.clear();
    this.selectedCanvasNodeTextCache.clear();
    this.usedInitialFastPath = false;
  }

  async process(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    this.prewarmCanvasNbePageIndex(source, ctx);
    const mount = document.createElement('div');
    el.innerHTML = '';
    el.appendChild(mount);

    let disposed = false;
    let cleanupSignals: () => void = () => undefined;

    const rawSession = createRenderSession({
      ...this.deps,
      source,
      mount,
      hostEl: el,
      ctx,
    });
    const session = {
      rerender: async (input?: Parameters<typeof rawSession.rerender>[0]) => {
        if (disposed) return;
        await rawSession.rerender(input);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        cleanupSignals();
        rawSession.dispose();
      },
    };

    this.deps.runtime.trackEmbed(mount, (child) => ctx.addChild(child), session);

    const initialPriority = this.getInitialPriority(el);
    if (!this.usedInitialFastPath && initialPriority !== 'offscreen') {
      this.usedInitialFastPath = true;
      this.deps.logger.debug('initial-render fast-path');
      void session.rerender();
      return;
    }

    const queueId = this.initialRenderQueue.enqueue(
      () => session.rerender(),
      () => disposed,
      { priority: initialPriority },
    );
    cleanupSignals = this.observeCanvasPrioritySignals(source, el, ctx, queueId, () => disposed);
  }

  private prewarmCanvasNbePageIndex(source: string, ctx: MarkdownPostProcessorContext): void {
    if (!ctx.sourcePath?.endsWith('.canvas')) return;

    let pageNbeId: string | null = null;
    try {
      const target = parseNotionTargetFromSource(source);
      if (target.mode !== 'nbe_uri') return;
      pageNbeId = target.pageNbeId;
    } catch {
      return;
    }

    this.canvasPrewarmQueue.enqueue(pageNbeId, async () => {
      await this.deps.runtime.getRepository().prewarmNbePageIndex(pageNbeId);
    });
  }

  private getInitialPriority(hostEl: HTMLElement): InitialRenderPriority {
    return this.isElementLikelyVisible(hostEl) ? 'visible' : 'offscreen';
  }

  private observeCanvasPrioritySignals(
    source: string,
    hostEl: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    queueId: string,
    isDisposed: () => boolean,
  ): () => void {
    const cleanups: Array<() => void> = [];

    if (ctx.sourcePath?.endsWith('.canvas')) {
      const globalObserver = globalThis as typeof globalThis & {
        IntersectionObserver?: new (
          callback: IntersectionObserverCallback,
          options?: IntersectionObserverInit,
        ) => IntersectionObserver;
      };
      const IntersectionObserverCtor = globalObserver.IntersectionObserver;
      if (typeof IntersectionObserverCtor === 'function') {
        const observer = new IntersectionObserverCtor((entries) => {
          if (isDisposed()) return;
          if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
            this.initialRenderQueue.reprioritize(queueId, 'visible');
          }
        });
        observer.observe(hostEl);
        cleanups.push(() => observer.disconnect());
      }

      void this.promoteSelectedCanvasEmbed(source, ctx.sourcePath, queueId, isDisposed);
    }

    return () => {
      for (const cleanup of cleanups.splice(0).reverse()) {
        cleanup();
      }
    };
  }

  private async promoteSelectedCanvasEmbed(
    source: string,
    sourcePath: string,
    queueId: string,
    isDisposed: () => boolean,
  ): Promise<void> {
    const selectedNodeId = this.resolveSelectedCanvasTextNodeId(sourcePath);
    if (!selectedNodeId) return;
    const selectedNodeText = await this.readSelectedCanvasTextNode(sourcePath, selectedNodeId);
    if (isDisposed()) return;
    if (selectedNodeText?.includes(source)) {
      this.initialRenderQueue.reprioritize(queueId, 'selected');
    }
  }

  private resolveSelectedCanvasTextNodeId(sourcePath: string): string | null {
    const activeFile = this.deps.app.workspace.getActiveFile();
    if (!activeFile || activeFile.path !== sourcePath || activeFile.extension !== 'canvas') {
      return null;
    }

    const activeLeaf = (this.deps.app.workspace as typeof this.deps.app.workspace & { activeLeaf?: { view?: unknown } }).activeLeaf;
    const activeView = activeLeaf?.view as {
      getViewType?: () => string;
      canvas?: { selection?: Set<unknown> | unknown[] };
    } | undefined;
    if (activeView?.getViewType?.() !== 'canvas') {
      return null;
    }

    const selection = activeView.canvas?.selection;
    const selectedItems = Array.isArray(selection)
      ? selection
      : selection
        ? Array.from(selection as Set<unknown>)
        : [];
    const selectedNode = selectedItems[0] as
      | { id?: string; node?: { id?: string }; data?: { id?: string } }
      | undefined;
    return selectedNode?.id ?? selectedNode?.node?.id ?? selectedNode?.data?.id ?? null;
  }

  private async readSelectedCanvasTextNode(sourcePath: string, nodeId: string): Promise<string | null> {
    const cacheKey = `${sourcePath}::${nodeId}`;
    let cached = this.selectedCanvasNodeTextCache.get(cacheKey);
    if (!cached) {
      cached = this.loadSelectedCanvasTextNode(sourcePath, nodeId);
      this.selectedCanvasNodeTextCache.set(cacheKey, cached);
    }
    return cached;
  }

  private async loadSelectedCanvasTextNode(sourcePath: string, nodeId: string): Promise<string | null> {
    const file = this.deps.app.vault.getFileByPath(sourcePath);
    if (!file) return null;
    const vault = this.deps.app.vault as typeof this.deps.app.vault & {
      cachedRead?: (target: typeof file) => Promise<string>;
    };
    const raw = await (vault.cachedRead ? vault.cachedRead(file) : vault.read(file));
    let parsed: CanvasData;
    try {
      parsed = JSON.parse(raw) as CanvasData;
    } catch {
      return null;
    }
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const textNode = nodes.find(
      (node): node is CanvasTextData =>
        node.type === 'text' && node.id === nodeId && typeof (node as CanvasTextData).text === 'string',
    );
    return textNode?.text ?? null;
  }

  private isElementLikelyVisible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.right === 0) {
      return true;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
  }
}
