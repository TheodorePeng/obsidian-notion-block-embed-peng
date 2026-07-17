import { EmbedBlockNode } from "../../core/models";
import { BlockRenderContext } from "./types";

function createActionIcon(pathData: string, viewBox = "0 0 16 16"): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("nbe-row-action-icon");

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathData);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function createTextEditIcon(): SVGElement {
  return createActionIcon("M3 11.5L11.8 2.7L13.3 4.2L4.5 13H3V11.5ZM10.7 3.8L12.2 5.3");
}

function createInsertIcon(): SVGElement {
  return createActionIcon("M8 3V13M3 8H13");
}

function createOpenInNotionIcon(): SVGElement {
  return createActionIcon("M6 4.5H3.75C3.336 4.5 3 4.836 3 5.25V12.25C3 12.664 3.336 13 3.75 13H10.75C11.164 13 11.5 12.664 11.5 12.25V10M8 3H13V8M12.5 3.5L7.5 8.5");
}

function createDeleteIcon(): SVGElement {
  return createActionIcon("M3.5 4.5H12.5M5 4.5V13H11V4.5M6.5 4.5V3H9.5V4.5M7 7V10.5M9 7V10.5");
}

interface RowActionSpec {
  className: string;
  title: string;
  icon: SVGElement;
  onTrigger: (button: HTMLButtonElement) => void;
}

function createRowActionButton(spec: RowActionSpec): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `nbe-row-action-btn ${spec.className}`;
  button.type = "button";
  button.setAttribute("aria-label", spec.title);
  button.title = spec.title;
  button.appendChild(spec.icon);
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    spec.onTrigger(button);
  });
  return button;
}

export function attachRowActions(host: HTMLElement, node: EmbedBlockNode, ctx: BlockRenderContext): void {
  const actions: RowActionSpec[] = [];

  if (ctx.onEdit && node.capabilities.canEditText) {
    actions.push({
      className: "is-edit-text",
      title: "Edit text",
      icon: createTextEditIcon(),
      onTrigger: (button) => ctx.onEdit?.(button, node),
    });
  }

  if (ctx.onOpenInNotion && node.capabilities.canOpenInNotion) {
    actions.push({
      className: "is-open-in-notion",
      title: "Open in Notion",
      icon: createOpenInNotionIcon(),
      onTrigger: (button) => ctx.onOpenInNotion?.(button, node),
    });
  }

  if (ctx.onInsertSiblingBelow && node.capabilities.canInsertSiblingBelow) {
    actions.push({
      className: "is-insert-below",
      title: "Insert item below",
      icon: createInsertIcon(),
      onTrigger: (button) => ctx.onInsertSiblingBelow?.(button, node),
    });
  }

  if (ctx.onDeleteBlock && node.capabilities.canDeleteSelf) {
    actions.push({
      className: "is-delete-block",
      title: "Delete item",
      icon: createDeleteIcon(),
      onTrigger: (button) => ctx.onDeleteBlock?.(button, node),
    });
  }

  if (actions.length === 0) return;

  host.classList.add("nbe-row-actions-host");
  host.classList.add("nbe-row-interaction-surface");
  const overlay = document.createElement("div");
  overlay.className = "nbe-row-actions";
  for (const action of actions) {
    overlay.appendChild(createRowActionButton(action));
  }
  host.appendChild(overlay);
}

export function renderUnsupported(parent: HTMLElement, node: EmbedBlockNode): void {
  const box = document.createElement("div");
  box.className = "nbe-unsupported";
  box.textContent = node.props.unsupportedBlockType
    ? `Content unavailable via Notion API: ${node.props.unsupportedBlockType}`
    : `Unsupported block type: ${node.type}`;
  parent.appendChild(box);
}
