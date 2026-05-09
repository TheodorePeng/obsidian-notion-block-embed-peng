import { App, MarkdownPostProcessorContext, Notice } from 'obsidian';
import { userMessageFromError } from '../core/errors';
import { EmbedBlockNode, EmbedLoadResult } from '../core/models';
import { NotionBlockEmbedSettings } from '../core/settings';
import { ImageSizeAccess } from '../image/contracts';
import { plainTextFromNode, RenderOptions } from '../render/renderer';
import { FloatingEditorController } from '../writeback/editor-controller';
import { NotionWebHostService } from '../notion-web/host';
import { resolveNotionOpenUrl } from '../notion-web/url';
import { EMPTY_NOTION_EMBED_MESSAGE } from './empty-state';
import { WritebackService } from '../writeback/service';
import { applyNotionEmbedSourceUpdate, canApplyNotionEmbedSourceUpdate, rewriteNotionEmbedSourceUrl } from './source-editor';
import { RenderInput } from './types';

interface CreateRenderOptionsArgs {
  app: App;
  mount: HTMLElement;
  hostEl: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  currentSource: string;
  loaded: EmbedLoadResult;
  getSettings: () => NotionBlockEmbedSettings;
  getWritebackService: () => WritebackService;
  imageSizing: ImageSizeAccess;
  editor: FloatingEditorController;
  notionWebHost: NotionWebHostService;
  rerender: (input?: RenderInput) => Promise<void>;
}

function ensureWritebackEnabled(
  settings: NotionBlockEmbedSettings,
  loaded: EmbedLoadResult,
): true | string {
  if (!loaded.writebackAllowed) {
    return 'This embed is read-only in the current mode.';
  }
  if (!settings.allowWriteback) {
    return 'Writeback is disabled in settings.';
  }
  return true;
}

function createEditHandler(args: CreateRenderOptionsArgs): RenderOptions['onEdit'] | undefined {
  return async (anchorEl: HTMLElement, node: EmbedBlockNode) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      new Notice(allowed);
      return;
    }
    if (!node.capabilities.canEditText) {
      new Notice('This block is not safe for plain-text editing here. Edit it in Notion instead.');
      return;
    }

    args.editor.open({
      anchorEl,
      block: node,
      initialText: plainTextFromNode(node),
      onSave: async (nextText) => {
        const writeback = args.getWritebackService();
        await writeback.updateBlockText(node, nextText);
        await args.rerender({
          invalidateScopes: args.loaded.cacheScopes,
        });
      },
    });
  };
}

function createInsertBelowHandler(args: CreateRenderOptionsArgs): RenderOptions['onInsertSiblingBelow'] | undefined {
  return async (_anchorEl: HTMLElement, node: EmbedBlockNode) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      new Notice(allowed);
      return;
    }
    if (!node.capabilities.canInsertSiblingBelow) {
      new Notice('This block does not support safe sibling insertion here.');
      return;
    }

    try {
      await args.getWritebackService().insertSiblingBelow(node);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes,
      });
      new Notice('List item inserted.');
    } catch (error) {
      new Notice(userMessageFromError(error));
    }
  };
}

function createDeleteHandler(args: CreateRenderOptionsArgs): RenderOptions['onDeleteBlock'] | undefined {
  return async (_anchorEl: HTMLElement, node: EmbedBlockNode) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      new Notice(allowed);
      return;
    }
    if (!node.capabilities.canDeleteSelf) {
      new Notice('Only simple leaf list items can be deleted here.');
      return;
    }
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm('Delete this list item from Notion?');
      if (!confirmed) return;
    }

    try {
      await args.getWritebackService().deleteBlockNode(node);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes,
      });
      new Notice('List item deleted.');
    } catch (error) {
      new Notice(userMessageFromError(error));
    }
  };
}

function createTodoToggleHandler(args: CreateRenderOptionsArgs): RenderOptions['onToggleTodo'] | undefined {
  return async (node: EmbedBlockNode, checked: boolean) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      throw new Error(allowed);
    }
    try {
      await args.getWritebackService().updateTodoChecked(node, checked);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes,
      });
    } catch (error) {
      new Notice(userMessageFromError(error));
      throw error;
    }
  };
}

function createApplyUrlHandler(args: CreateRenderOptionsArgs): RenderOptions['onApplyUrl'] | undefined {
  const sourceEditable = canApplyNotionEmbedSourceUpdate(args.ctx, args.hostEl);
  if (!sourceEditable) return undefined;

  return async (nextUrl) => {
    try {
      const nextSource = rewriteNotionEmbedSourceUrl(args.currentSource, nextUrl);
      await applyNotionEmbedSourceUpdate(args.app, args.ctx, args.hostEl, nextSource, args.currentSource);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes,
        nextSource,
      });
      new Notice('Notion embed source updated.');
      return true;
    } catch (error) {
      new Notice(userMessageFromError(error));
      return false;
    }
  };
}

function createOpenInNotionHandler(args: CreateRenderOptionsArgs): RenderOptions["onOpenInNotion"] | undefined {
  if (args.loaded.parsedTarget.mode === "nbe_uri") return undefined;
  return async (anchorEl: HTMLElement, node: EmbedBlockNode) => {
    if (!node.capabilities.canOpenInNotion) return;
    try {
      const url = resolveNotionOpenUrl(args.loaded.parsedTarget.originalUrl, node);
      await args.notionWebHost.openUrl(url, args.getSettings().notionOpenMode, anchorEl);
    } catch (error) {
      new Notice(userMessageFromError(error));
    }
  };
}

export function createRenderOptions(args: CreateRenderOptionsArgs): RenderOptions {
  const settings = args.getSettings();
  return {
    maxHeight: settings.maxHeight,
    showChildren: settings.showChildren,
    toggleDefaultExpanded: settings.toggleDefaultExpanded,
    currentUrl: args.loaded.parsedTarget.originalUrl,
    showFooter: args.loaded.parsedTarget.mode !== 'empty_block_url',
    emptyStateMessage: args.loaded.parsedTarget.mode === 'empty_block_url'
      ? EMPTY_NOTION_EMBED_MESSAGE
      : undefined,
    onRefresh: async () => {
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes,
      });
    },
    onApplyUrl:
      args.loaded.parsedTarget.mode === 'block_url'
        || args.loaded.parsedTarget.mode === 'page_heading'
        || args.loaded.parsedTarget.mode === 'nbe_uri'
        ? createApplyUrlHandler(args)
        : undefined,
    onEdit: createEditHandler(args),
    onOpenInNotion: createOpenInNotionHandler(args),
    onInsertSiblingBelow: createInsertBelowHandler(args),
    onDeleteBlock: createDeleteHandler(args),
    onToggleTodo: createTodoToggleHandler(args),
    imageSizing: args.imageSizing,
  };
}
