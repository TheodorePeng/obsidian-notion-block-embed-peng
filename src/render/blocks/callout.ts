import { EmbedBlockNode } from "../../core/models";
import { appendRichTextOrFallback } from "../rich-text";
import { BlockRenderContext, RenderNodesFn } from "./types";

const CALLOUT_COLORS = new Set([
  "default",
  "gray",
  "gray_background",
  "brown",
  "brown_background",
  "orange",
  "orange_background",
  "yellow",
  "yellow_background",
  "green",
  "green_background",
  "blue",
  "blue_background",
  "purple",
  "purple_background",
  "pink",
  "pink_background",
  "red",
  "red_background",
]);

function normalizeCalloutColor(value: string | undefined): string {
  return value && CALLOUT_COLORS.has(value) ? value : "default";
}

function appendCalloutIcon(parent: HTMLElement, node: EmbedBlockNode): void {
  const icon = node.props.calloutIcon;
  if (!icon) return;
  const iconHost = document.createElement("span");
  iconHost.className = "nbe-callout-icon";
  iconHost.setAttribute("aria-hidden", "true");
  if (icon.kind === "emoji") {
    iconHost.textContent = icon.value;
  } else {
    const image = document.createElement("img");
    image.src = icon.url;
    image.alt = icon.alt ?? "Callout icon";
    iconHost.appendChild(image);
  }
  parent.appendChild(iconHost);
}

export function renderCalloutBlockContent(
  host: HTMLElement,
  node: EmbedBlockNode,
  ctx: BlockRenderContext,
  renderNodes: RenderNodesFn,
): boolean {
  if (node.type !== "callout") return false;

  const callout = document.createElement("div");
  callout.className = "nbe-callout";
  callout.dataset.nbeCalloutColor = normalizeCalloutColor(node.props.calloutColor);

  appendCalloutIcon(callout, node);
  const content = document.createElement("div");
  content.className = "nbe-callout-content";

  if (node.richText.length > 0) {
    const title = document.createElement("div");
    title.className = "nbe-callout-title";
    appendRichTextOrFallback(title, node.richText);
    content.appendChild(title);
  }

  if (ctx.showChildren && node.children.length > 0) {
    const children = document.createElement("div");
    children.className = "nbe-callout-children";
    renderNodes(children, node.children, ctx);
    content.appendChild(children);
  }

  callout.appendChild(content);
  host.appendChild(callout);
  return true;
}
