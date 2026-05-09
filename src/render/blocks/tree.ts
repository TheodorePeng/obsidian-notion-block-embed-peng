import { EmbedBlockNode } from '../../core/models';
import { appendRichTextOrFallback } from '../rich-text';
import { createTreeShell } from '../tree/shell';
import { createChildTreeContext } from '../tree/state';
import { TreeGuideState } from '../tree/types';
import { attachRowActions } from './shared';
import { BlockRenderContext, RenderNodesFn } from './types';

function createToggleCaretIcon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('nbe-toggle-caret');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M6 3.5L11 8L6 12.5');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);

  return svg;
}

function renderTreeChildren(
  parent: HTMLElement,
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  state: TreeGuideState,
  renderNodes: RenderNodesFn,
): void {
  if (state.isVisibleLeaf) return;
  const children = document.createElement('div');
  children.className = 'nbe-tree-children';
  renderNodes(children, node.children, ctx, createChildTreeContext(state));
  parent.appendChild(children);
}

export function renderToggleBlock(
  parent: HTMLElement,
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  state: TreeGuideState,
  renderNodes: RenderNodesFn,
): void {
  const trigger = document.createElement('button');
  trigger.className = 'nbe-tree-icon-btn nbe-toggle-trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Toggle');
  trigger.appendChild(createToggleCaretIcon());
  const { wrapper, row, main } = createTreeShell({
    state,
    wrapperClassName: 'nbe-tree-item-toggle',
    rowClassName: 'nbe-toggle-row',
    mainClassName: 'nbe-toggle-main',
    iconEl: trigger,
  });

  const title = document.createElement('span');
  title.className = 'nbe-toggle-title';
  appendRichTextOrFallback(title, node.richText);
  main.appendChild(title);
  attachRowActions(row, node, ctx);

  if (state.isVisibleLeaf) {
    trigger.disabled = true;
    trigger.classList.add('is-disabled');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-disabled', 'true');
    if (node.children.length === 0) {
      trigger.style.visibility = 'hidden';
    }
    parent.appendChild(wrapper);
    return;
  }

  const children = document.createElement('div');
  children.className = 'nbe-tree-children nbe-toggle-children';
  renderNodes(children, node.children, ctx, createChildTreeContext(state));
  wrapper.appendChild(children);

  let expanded = ctx.toggleDefaultExpanded;
  const applyState = () => {
    wrapper.classList.toggle('is-expanded', expanded);
    trigger.setAttribute('aria-expanded', String(expanded));
    children.hidden = !expanded;
  };

  applyState();
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    expanded = !expanded;
    applyState();
  });

  parent.appendChild(wrapper);
}

export function renderListBlock(
  parent: HTMLElement,
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  ordered: boolean,
  orderedIndex: number,
  state: TreeGuideState,
  renderNodes: RenderNodesFn,
): void {
  const marker = document.createElement('span');
  marker.className = ordered ? 'nbe-tree-icon nbe-list-number' : 'nbe-tree-icon nbe-list-bullet';
  marker.textContent = ordered ? `${orderedIndex}.` : '';
  const { wrapper, row, main } = createTreeShell({
    state,
    wrapperClassName: ordered ? 'nbe-tree-item-list nbe-tree-item-numbered' : 'nbe-tree-item-list',
    rowClassName: 'nbe-list-row',
    mainClassName: 'nbe-list-main',
    iconEl: marker,
  });
  const text = document.createElement('span');
  text.className = 'nbe-list-text';
  appendRichTextOrFallback(text, node.richText);
  main.appendChild(text);
  attachRowActions(row, node, ctx);

  renderTreeChildren(wrapper, node, ctx, state, renderNodes);
  parent.appendChild(wrapper);
}

export function createPlainTreeShell(state: TreeGuideState) {
  return createTreeShell({
    state,
    wrapperClassName: 'nbe-tree-item-plain',
    rowClassName: 'nbe-tree-row-plain',
    mainClassName: 'nbe-tree-main-plain',
  });
}
