import { vi } from "vitest";

export class Notice {
  constructor(public readonly message?: string) {}
}

export async function loadMathJax(): Promise<void> {}

export async function finishRenderMath(): Promise<void> {}

export function renderMath(source: string, display: boolean): HTMLElement {
  const el = document.createElement(display ? "div" : "span");
  el.className = "mock-render-math";
  el.dataset.mathSource = source;
  el.dataset.mathDisplay = String(display);
  el.textContent = display ? "[display-math]" : "[inline-math]";
  return el;
}

export class MarkdownRenderChild {
  constructor(public readonly containerEl: HTMLElement) {}
  onload(): void {}
  onunload(): void {}
}

export class MarkdownView {
  file: { path: string } | null = null;
  editor: unknown = null;
  leaf: unknown = null;
  containerEl: HTMLElement = document.createElement("div");
  private viewData = "";
  getViewData(): string {
    return this.viewData;
  }
  setViewData(data: string, _clear: boolean): void {
    this.viewData = data;
  }
  requestSave(): void {}
  getMode(): "source" | "preview" {
    return "preview";
  }
}

export class Plugin {
  app: unknown;
  addCommand(): void {}
  addSettingTab(): void {}
  registerMarkdownCodeBlockProcessor(): void {}
  saveData(): Promise<void> { return Promise.resolve(); }
  loadData(): Promise<unknown> { return Promise.resolve(undefined); }
}

export class PluginSettingTab {
  containerEl: HTMLElement;
  constructor(public readonly app: unknown, public readonly plugin: unknown) {
    this.containerEl = document.createElement('div');
  }
  display(): void {}
}

export class Setting {
  constructor(public readonly containerEl: HTMLElement) {}
  setName(): this { return this; }
  setDesc(): this { return this; }
  addText(cb: (component: any) => unknown): this {
    cb({
      setPlaceholder() { return this; },
      setValue() { return this; },
      onChange() { return this; },
    });
    return this;
  }
  addToggle(cb: (component: any) => unknown): this {
    cb({ setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addSlider(cb: (component: any) => unknown): this {
    cb({
      setLimits() { return this; },
      setValue() { return this; },
      setDynamicTooltip() { return this; },
      onChange() { return this; },
    });
    return this;
  }
  addDropdown(cb: (component: any) => unknown): this {
    cb({
      addOption() { return this; },
      setValue() { return this; },
      onChange() { return this; },
    });
    return this;
  }
  addButton(cb: (component: any) => unknown): this {
    cb({ setButtonText() { return this; }, onClick() { return this; } });
    return this;
  }
}

export const requestUrl = vi.fn(async (): Promise<never> => {
  throw new Error("requestUrl mock not implemented in this test");
});
