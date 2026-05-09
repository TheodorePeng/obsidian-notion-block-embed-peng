import { IMAGE_WIDTH_RATIO_MAX, clampImageWidthRatio } from "./size-store";

export function applyImageWidthRatio(target: HTMLElement, widthRatio?: number): void {
  if (typeof widthRatio !== "number") {
    target.style.width = `${IMAGE_WIDTH_RATIO_MAX * 100}%`;
    return;
  }

  target.style.width = `${clampImageWidthRatio(widthRatio) * 100}%`;
}
