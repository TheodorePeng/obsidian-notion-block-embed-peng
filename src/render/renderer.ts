import { EmbedBlockNode } from '../core/models';
import { ImageSizeAccess } from '../image/contracts';
import { renderNodes } from './block-renderers';
import { createEmbedFooter } from './footer/embed-footer';
import { plainTextFromRichText } from './rich-text';

export interface RenderOptions {
  maxHeight: number;
  showChildren: boolean;
  toggleDefaultExpanded: boolean;
  currentUrl: string;
  showFooter?: boolean;
  emptyStateMessage?: string;
  onRefresh: () => void | Promise<void>;
  onApplyUrl?: (nextUrl: string) => boolean | Promise<boolean>;
  onEdit?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onOpenInNotion?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onInsertSiblingBelow?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onDeleteBlock?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onToggleTodo?: (block: EmbedBlockNode, checked: boolean) => Promise<void>;
  imageSizing?: ImageSizeAccess;
}

export function renderEmbed(container: HTMLElement, root: EmbedBlockNode, options: RenderOptions): () => void {
  container.innerHTML = '';
  const cleanups: Array<() => void> = [];

  const wrapper = document.createElement('div');
  wrapper.className = 'nbe-embed';

  const content = document.createElement('div');
  content.className = 'nbe-content';
  content.style.maxHeight = `${Math.max(240, options.maxHeight)}px`;

  const viewRoot: EmbedBlockNode = {
    ...root,
    children: options.showChildren ? root.children : [],
  };
  const nodesToRender = viewRoot.type === 'section_container' ? viewRoot.children : [viewRoot];

  if (options.emptyStateMessage && nodesToRender.length === 0) {
    renderEmptyStateMessage(content, options.emptyStateMessage);
  } else {
    renderNodes(content, nodesToRender, {
      showChildren: options.showChildren,
      toggleDefaultExpanded: options.toggleDefaultExpanded,
      onEdit: options.onEdit,
      onOpenInNotion: options.onOpenInNotion,
      onInsertSiblingBelow: options.onInsertSiblingBelow,
      onDeleteBlock: options.onDeleteBlock,
      onToggleTodo: options.onToggleTodo,
      imageSizing: options.imageSizing,
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup);
      },
    });
  }

  wrapper.appendChild(content);
  if (options.showFooter !== false) {
    const footer = createEmbedFooter({
      currentUrl: options.currentUrl,
      onApplyUrl: options.onApplyUrl,
      onRefresh: options.onRefresh,
    });
    wrapper.appendChild(footer);
  }
  container.appendChild(wrapper);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) {
      cleanup();
    }
  };
}

function renderEmptyStateMessage(container: HTMLElement, message: string): void {
  const note = document.createElement('div');
  note.className = 'nbe-empty-note';
  note.textContent = message;
  container.appendChild(note);
}

export function plainTextFromNode(node: EmbedBlockNode): string {
  return plainTextFromRichText(node.richText);
}
