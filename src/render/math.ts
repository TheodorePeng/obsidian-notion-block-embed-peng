import { finishRenderMath, loadMathJax, renderMath } from "obsidian";
import { EmbedBlockNode } from "../core/models";

let mathLoadPromise: Promise<void> | null = null;

function createMathFallback(expression: string, display: boolean): HTMLElement {
  const el = document.createElement(display ? "div" : "span");
  el.className = `nbe-math ${display ? "nbe-math-display" : "nbe-math-inline"} is-fallback`;
  el.textContent = expression;
  return el;
}

export async function preloadMathRendering(): Promise<void> {
  if (!mathLoadPromise) {
    mathLoadPromise = loadMathJax().catch((error) => {
      mathLoadPromise = null;
      throw error;
    });
  }
  await mathLoadPromise;
}

export async function flushMathRendering(): Promise<void> {
  try {
    await finishRenderMath();
  } catch {
    // Keep formula rendering best-effort. Individual formula fallbacks are handled separately.
  }
}

export function createMathElement(expression: string, display: boolean): HTMLElement {
  const normalized = expression?.trim() ?? "";
  try {
    const rendered = renderMath(normalized, display);
    rendered.classList.add("nbe-math", display ? "nbe-math-display" : "nbe-math-inline");
    return rendered;
  } catch {
    return createMathFallback(normalized, display);
  }
}

export function nodeTreeContainsMath(node: EmbedBlockNode): boolean {
  if (typeof node.props.equationExpression === "string" && node.props.equationExpression.trim().length > 0) {
    return true;
  }
  if (node.richText.some((item) => typeof item.equationExpression === "string" && item.equationExpression.trim().length > 0)) {
    return true;
  }
  return node.children.some((child) => nodeTreeContainsMath(child));
}
