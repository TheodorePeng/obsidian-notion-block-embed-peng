import { EmbedBlockNode } from '../../core/models';
import { createMathElement } from '../math';
import { appendRichTextOrFallback } from '../rich-text';
import { attachRowActions } from './shared';
import { BlockRenderContext, RenderNodesFn } from './types';

function renderSyncedBlockContent(host: HTMLElement, node: EmbedBlockNode, ctx: BlockRenderContext, renderNodes?: RenderNodesFn): boolean {
  if (node.type !== 'synced_block') return false;

  const wrapper = document.createElement('div');
  wrapper.className = 'nbe-synced-block';

  const label = document.createElement('div');
  label.className = 'nbe-synced-block-label';
  label.textContent = 'Synced block';
  wrapper.appendChild(label);

  if (ctx.showChildren && node.children.length > 0 && renderNodes) {
    const body = document.createElement('div');
    body.className = 'nbe-synced-block-body';
    renderNodes(body, node.children, ctx);
    wrapper.appendChild(body);
  }

  host.appendChild(wrapper);
  return true;
}

export function renderTextBlockContent(
  host: HTMLElement,
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  renderNodes?: RenderNodesFn,
): boolean {
  if (renderSyncedBlockContent(host, node, ctx, renderNodes)) {
    return true;
  }

  if (node.type === 'paragraph') {
    const row = document.createElement('p');
    row.className = 'nbe-item-line';
    appendRichTextOrFallback(row, node.richText);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }

  if (node.type === 'heading_1' || node.type === 'heading_2' || node.type === 'heading_3') {
    const tag = node.type === 'heading_1' ? 'h1' : node.type === 'heading_2' ? 'h2' : 'h3';
    const row = document.createElement(tag);
    row.className = 'nbe-item-line';
    appendRichTextOrFallback(row, node.richText);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }

  if (node.type === 'quote') {
    const row = document.createElement('blockquote');
    row.className = 'nbe-item-line nbe-quote';
    appendRichTextOrFallback(row, node.richText);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }

  if (node.type === 'code') {
    const row = document.createElement('div');
    row.className = 'nbe-item-line';
    const pre = document.createElement('pre');
    pre.className = 'nbe-code';
    const code = document.createElement('code');
    code.textContent = node.richText.map((item) => item.plainText).join('');
    pre.appendChild(code);
    row.appendChild(pre);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }

  if (node.type === 'equation') {
    const row = document.createElement('div');
    row.className = 'nbe-equation-block';
    row.appendChild(createMathElement(node.props.equationExpression ?? '', true));
    host.appendChild(row);
    return true;
  }

  if (node.type === 'divider') {
    const divider = document.createElement('hr');
    divider.className = 'nbe-divider';
    host.appendChild(divider);
    return true;
  }

  if (node.type === 'to_do') {
    const row = document.createElement('div');
    row.className = 'nbe-todo nbe-item-line nbe-item-line-inline-controls';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(node.props.checked);
    checkbox.disabled = !ctx.onToggleTodo || !node.capabilities.canToggleTodo;
    if (!checkbox.disabled) {
      checkbox.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          await ctx.onToggleTodo?.(node, checkbox.checked);
        } catch {
          checkbox.checked = !checkbox.checked;
        } finally {
          checkbox.disabled = false;
        }
      });
    }
    const textWrap = document.createElement('span');
    textWrap.className = 'nbe-todo-text';
    appendRichTextOrFallback(textWrap, node.richText);
    row.appendChild(checkbox);
    row.appendChild(textWrap);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }

  return false;
}
