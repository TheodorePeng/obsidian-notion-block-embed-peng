import { EmbedRichText } from "../core/models";
import { createMathElement } from "./math";

export function createRichTextFragment(items: EmbedRichText[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    if (item.sourceType === "equation") {
      fragment.appendChild(createMathElement(item.equationExpression ?? item.plainText, false));
      return;
    }
    const tag = item.href ? "a" : "span";
    const el = document.createElement(tag);
    el.textContent = item.plainText;
    if (item.href && tag === "a") {
      (el as HTMLAnchorElement).href = item.href;
      (el as HTMLAnchorElement).target = "_blank";
      (el as HTMLAnchorElement).rel = "noopener noreferrer";
    }
    const ann = item.annotations;
    if (ann?.bold) el.classList.add("nbe-rich-bold");
    if (ann?.italic) el.classList.add("nbe-rich-italic");
    if (ann?.code) el.classList.add("nbe-rich-code");
    if (ann?.strikethrough) el.classList.add("nbe-rich-strike");
    if (ann?.underline) el.classList.add("nbe-rich-underline");
    fragment.appendChild(el);
  });
  return fragment;
}

export function appendRichTextOrFallback(parent: HTMLElement, items: EmbedRichText[]): void {
  if (!items.length) {
    const span = document.createElement("span");
    span.className = "nbe-rich-code";
    span.textContent = "(empty)";
    parent.appendChild(span);
    return;
  }
  parent.appendChild(createRichTextFragment(items));
}

export function plainTextFromRichText(items: EmbedRichText[]): string {
  return items.map((item) => item.plainText ?? "").join("");
}
