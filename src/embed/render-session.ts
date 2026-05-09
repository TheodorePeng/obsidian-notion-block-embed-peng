import { MarkdownPostProcessorContext, Notice } from 'obsidian';
import { userMessageFromError } from '../core/errors';
import { flushMathRendering, preloadMathRendering, nodeTreeContainsMath } from '../render/math';
import { renderEmbed } from '../render/renderer';
import { renderEmpty, renderError, renderLoading } from '../render/ui';
import {
  applyNotionEmbedSourceUpdate,
  canApplyNotionEmbedSourceUpdate,
  getEditableFooterSourceValue,
  rewriteNotionEmbedSourceUrl,
} from './source-editor';
import { RenderVersionTracker } from './render-version';
import { createRenderOptions } from './action-bridge';
import { isEmbedSourceLikelyWarm, loadEmbedFromSourceDetailed } from './source-loader';
import { ProcessorDependencies, RenderInput, RenderSessionHandle } from './types';

interface CreateRenderSessionArgs extends ProcessorDependencies {
  source: string;
  mount: HTMLElement;
  hostEl: HTMLElement;
  ctx: MarkdownPostProcessorContext;
}

export function createRenderSession(args: CreateRenderSessionArgs): RenderSessionHandle {
  let currentSource = args.source;
  let disposeCurrentRender: (() => void) | null = null;
  let lastSuccessfulCacheScopes: RenderInput["invalidateScopes"] = [];
  const renderVersion = new RenderVersionTracker();

  const cleanupCurrentRender = () => {
    if (!disposeCurrentRender) return;
    const dispose = disposeCurrentRender;
    disposeCurrentRender = null;
    dispose();
  };

  const rerender = async (input?: RenderInput) => {
    const version = renderVersion.next();
    const settings = args.runtime.getSettings();
    const renderStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const repository = args.runtime.getRepository();
    try {
      if (input?.invalidateScopes && input.invalidateScopes.length > 0) {
        args.runtime.invalidateScopes(input.invalidateScopes);
      }
      if (typeof input?.nextSource === 'string') {
        currentSource = input.nextSource;
      }

      const warmPath = isEmbedSourceLikelyWarm(currentSource, settings, repository);
      if (!warmPath) {
        cleanupCurrentRender();
        renderLoading(args.mount);
      }

      const loadedResult = await loadEmbedFromSourceDetailed(currentSource, settings, repository, args.logger);
      if (!renderVersion.isCurrent(version)) {
        args.logger.debug('dropped stale embed render result');
        return;
      }
      const loaded = loadedResult.loaded;
      lastSuccessfulCacheScopes = loaded.cacheScopes;

      if (!loaded.root) {
        cleanupCurrentRender();
        renderEmpty(args.mount);
        return;
      }

      const hasMath = nodeTreeContainsMath(loaded.root);

      if (hasMath) {
        try {
          await preloadMathRendering();
        } catch (error) {
          args.logger.debug(`math preload failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!renderVersion.isCurrent(version)) {
          args.logger.debug('dropped stale embed render result after math preload');
          return;
        }
      }

      cleanupCurrentRender();
      const renderPhaseStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      disposeCurrentRender = renderEmbed(
        args.mount,
        loaded.root,
        createRenderOptions({
          app: args.app,
          mount: args.mount,
          hostEl: args.hostEl,
          ctx: args.ctx,
          currentSource,
          loaded,
          getSettings: () => args.runtime.getSettings(),
          getWritebackService: () => args.runtime.getWritebackService(),
          imageSizing: args.imageSizing,
          editor: args.editor,
          notionWebHost: args.notionWebHost,
          rerender,
        }),
      );

      if (hasMath) {
        await flushMathRendering();
        if (!renderVersion.isCurrent(version)) {
          args.logger.debug('dropped stale embed render result after math flush');
          return;
        }
      }

      if (settings.debugLogs) {
        const renderFinishedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
        const renderMs = renderFinishedAt - renderPhaseStartedAt;
        const totalMs = renderFinishedAt - renderStartedAt;
        args.logger.debug(
          `perf parse=${loadedResult.metrics.parseMs.toFixed(1)}ms repository=${loadedResult.metrics.repositoryMs.toFixed(1)}ms adapter=${loadedResult.metrics.adapterMs.toFixed(1)}ms render=${renderMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`,
        );
      }
    } catch (error) {
      if (!renderVersion.isCurrent(version)) {
        args.logger.debug('dropped stale embed render error');
        return;
      }
      args.logger.debug(`render error: ${error instanceof Error ? error.message : String(error)}`);
      cleanupCurrentRender();
      const editableSource = getEditableFooterSourceValue(currentSource);
      const sourceEditable = editableSource && canApplyNotionEmbedSourceUpdate(args.ctx, args.hostEl);
      renderError(
        args.mount,
        userMessageFromError(error),
        sourceEditable
          ? {
              currentUrl: editableSource,
              onApplyUrl: async (nextUrl) => {
                try {
                  const nextSource = rewriteNotionEmbedSourceUrl(currentSource, nextUrl);
                  await applyNotionEmbedSourceUpdate(args.app, args.ctx, args.hostEl, nextSource, currentSource);
                  await rerender({
                    invalidateScopes: lastSuccessfulCacheScopes,
                    nextSource,
                  });
                  new Notice('Notion embed source updated.');
                  return true;
                } catch (applyError) {
                  args.logger.debug(
                    `error footer apply failed: ${applyError instanceof Error ? applyError.message : String(applyError)}`,
                  );
                  new Notice(userMessageFromError(applyError));
                  return false;
                }
              },
              onRefresh: async () => {
                await rerender({
                  invalidateScopes: lastSuccessfulCacheScopes,
                });
              },
            }
          : undefined,
      );
    }
  };

  return {
    rerender,
    dispose: cleanupCurrentRender,
  };
}
