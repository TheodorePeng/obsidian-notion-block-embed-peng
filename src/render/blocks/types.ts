import { EmbedBlockNode } from '../../core/models';
import { ImageSizeAccess } from '../../image/contracts';
import { TreeContext } from '../tree/types';

export interface BlockRenderContext {
  showChildren: boolean;
  toggleDefaultExpanded: boolean;
  onEdit?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onOpenInNotion?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onInsertSiblingBelow?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onDeleteBlock?: (anchorEl: HTMLElement, block: EmbedBlockNode) => void;
  onToggleTodo?: (block: EmbedBlockNode, checked: boolean) => Promise<void>;
  imageSizing?: ImageSizeAccess;
  registerCleanup?: (cleanup: () => void) => void;
}

export type RenderNodesFn = (
  parent: HTMLElement,
  nodes: EmbedBlockNode[],
  ctx: BlockRenderContext,
  treeContext?: TreeContext,
) => void;
