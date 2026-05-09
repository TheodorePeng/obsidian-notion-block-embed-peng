import { EmbedBlockNode } from '../core/models';
import { renderLayoutBlockContent } from './blocks/layout';
import { renderMediaBlockContent } from './blocks/media';
import { renderUnsupported } from './blocks/shared';
import { renderTextBlockContent } from './blocks/text';
import { BlockRenderContext } from './blocks/types';
import { createPlainTreeShell, renderListBlock, renderToggleBlock } from './blocks/tree';
import { createChildTreeContext, createRootTreeContext, buildTreeGuideState, getTreeIconKind } from './tree/state';
import { TreeContext, TreeGuideState } from './tree/types';

function layoutBlockOwnsChildRendering(type: string): boolean {
  return type === 'column' || type === 'column_list' || type === 'synced_block';
}

function renderBlockContent(host: HTMLElement, node: EmbedBlockNode, ctx: BlockRenderContext): void {
  if (renderLayoutBlockContent(host, node, ctx, renderNodes)) return;
  if (renderTextBlockContent(host, node, ctx, renderNodes)) return;
  if (renderMediaBlockContent(host, node, ctx)) return;
  renderUnsupported(host, node);
}

function renderSingleBlock(
  parent: HTMLElement,
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  treeState?: TreeGuideState,
): void {
  let wrapper = document.createElement('div');
  wrapper.className = 'nbe-block';

  let host: HTMLElement = wrapper;
  if (treeState) {
    const shell = createPlainTreeShell(treeState);
    wrapper = shell.wrapper;
    host = shell.main;
  }

  renderBlockContent(host, node, ctx);
  parent.appendChild(wrapper);

  if (layoutBlockOwnsChildRendering(node.type)) return;
  if (!ctx.showChildren || node.children.length === 0) return;

  if (treeState) {
    const children = document.createElement('div');
    children.className = 'nbe-tree-children';
    renderNodes(children, node.children, ctx, createChildTreeContext(treeState));
    wrapper.appendChild(children);
    return;
  }

  renderNodes(parent, node.children, ctx);
}

export function renderNodes(
  parent: HTMLElement,
  nodes: EmbedBlockNode[],
  ctx: BlockRenderContext,
  treeContext?: TreeContext,
): void {
  let numberedIndex = 0;
  const baseTreeContext = treeContext ?? createRootTreeContext();

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const iconKind = getTreeIconKind(node);
    const shouldRenderAsTree = Boolean(treeContext) || iconKind !== 'none';
    const state = shouldRenderAsTree
      ? buildTreeGuideState({
          node,
          siblings: nodes,
          index: i,
          context: baseTreeContext,
          showChildren: ctx.showChildren,
          iconKind,
        })
      : undefined;

    if (node.type === 'numbered_list_item') {
      numberedIndex = i > 0 && nodes[i - 1].type === 'numbered_list_item' ? numberedIndex + 1 : 1;
      renderListBlock(parent, node, ctx, true, numberedIndex, state!, renderNodes);
      continue;
    }

    numberedIndex = 0;

    if (node.type === 'bulleted_list_item') {
      renderListBlock(parent, node, ctx, false, 0, state!, renderNodes);
      continue;
    }

    if (node.type === 'toggle') {
      renderToggleBlock(parent, node, ctx, state!, renderNodes);
      continue;
    }

    renderSingleBlock(parent, node, ctx, state);
  }
}

export type { BlockRenderContext } from './blocks/types';
