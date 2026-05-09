import { EmbedBlockNode } from '../../core/models';
import { BlockRenderContext, RenderNodesFn } from './types';

function buildColumnGridTemplate(columns: EmbedBlockNode[]): string {
  if (columns.length === 0) return 'minmax(0, 1fr)';

  const ratios: Array<number | null> = columns.map((column) => {
    const ratio = column.props.columnWidthRatio;
    return typeof ratio === 'number' ? ratio : null;
  });
  const hasValidRatios = ratios.every((ratio) => ratio !== null && Number.isFinite(ratio) && ratio > 0);
  const validRatios = hasValidRatios ? (ratios as number[]) : null;
  const totalRatio = validRatios ? validRatios.reduce<number>((sum, ratio) => sum + ratio, 0) : 0;

  if (validRatios && totalRatio > 0) {
    return validRatios.map((ratio) => `minmax(0, ${ratio}fr)`).join(' ');
  }

  return `repeat(${columns.length}, minmax(0, 1fr))`;
}

function buildColumnElement(
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  renderNodes: RenderNodesFn,
  standalone = false,
): HTMLElement {
  const column = document.createElement('div');
  column.className = standalone ? 'nbe-column nbe-column-standalone' : 'nbe-column';
  if (typeof node.props.columnWidthRatio === 'number' && Number.isFinite(node.props.columnWidthRatio)) {
    column.dataset.widthRatio = String(node.props.columnWidthRatio);
  }

  const content = document.createElement('div');
  content.className = 'nbe-column-content';
  column.appendChild(content);

  if (ctx.showChildren && node.children.length > 0) {
    renderNodes(content, node.children, ctx);
  }

  return column;
}

export function renderLayoutBlockContent(
  host: HTMLElement,
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  renderNodes: RenderNodesFn,
): boolean {
  if (node.type === 'column') {
    host.appendChild(buildColumnElement(node, ctx, renderNodes, true));
    return true;
  }

  if (node.type !== 'column_list') return false;

  const wrapper = document.createElement('div');
  wrapper.className = 'nbe-column-list';

  if (!ctx.showChildren || node.children.length === 0) {
    host.appendChild(wrapper);
    return true;
  }

  const columns = node.children.filter((child) => child.type === 'column');
  const looseChildren = node.children.filter((child) => child.type !== 'column');

  if (columns.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'nbe-column-list-grid';
    grid.style.setProperty('--nbe-column-grid-template', buildColumnGridTemplate(columns));
    for (const column of columns) {
      grid.appendChild(buildColumnElement(column, ctx, renderNodes));
    }
    wrapper.appendChild(grid);
  }

  if (looseChildren.length > 0) {
    const loose = document.createElement('div');
    loose.className = 'nbe-column-list-loose';
    renderNodes(loose, looseChildren, ctx);
    wrapper.appendChild(loose);
  }

  host.appendChild(wrapper);
  return true;
}
