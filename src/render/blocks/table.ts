import { EmbedBlockNode } from "../../core/models";
import { appendRichTextOrFallback } from "../rich-text";
import { BlockRenderContext } from "./types";

export function renderTableBlockContent(host: HTMLElement, node: EmbedBlockNode, ctx: BlockRenderContext): boolean {
  if (node.type !== "table") return false;

  const wrapper = document.createElement("div");
  wrapper.className = "nbe-table-scroll";
  const table = document.createElement("table");
  table.className = "nbe-table";

  if (ctx.showChildren && node.children.length > 0) {
    const width = Math.max(
      node.props.tableWidth ?? 0,
      ...node.children.map((row) => row.props.tableCells?.length ?? 0),
    );
    const hasColumnHeader = Boolean(node.props.tableHasColumnHeader);
    const hasRowHeader = Boolean(node.props.tableHasRowHeader);

    node.children.forEach((row, rowIndex) => {
      const tableRow = document.createElement("tr");
      const cells = row.props.tableCells ?? [];
      const cellCount = Math.max(width, cells.length);
      for (let columnIndex = 0; columnIndex < cellCount; columnIndex += 1) {
        const isHeader = (hasColumnHeader && rowIndex === 0) || (hasRowHeader && columnIndex === 0);
        const cell = document.createElement(isHeader ? "th" : "td");
        if (isHeader) {
          cell.scope = hasColumnHeader && rowIndex === 0 ? "col" : "row";
        }
        appendRichTextOrFallback(cell, cells[columnIndex] ?? []);
        tableRow.appendChild(cell);
      }
      table.appendChild(tableRow);
    });
  }

  wrapper.appendChild(table);
  host.appendChild(wrapper);
  return true;
}
