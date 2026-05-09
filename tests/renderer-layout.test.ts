import { afterEach, describe, expect, it, vi } from "vitest";
import { toEmbedNodeTree } from "../src/notion/adapters";
import { notionColumnListTree } from "./fixtures/notion-api/column-list";
import { createNode } from "./fixtures/notion-blocks";
import { renderTestEmbed } from "./helpers/render";
import { EMPTY_NOTION_EMBED_MESSAGE } from '../src/embed/empty-state';

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEmbed layout and footer", () => {
  it("renders a column list without unsupported placeholders", () => {
    const root = toEmbedNodeTree(notionColumnListTree, "page-1");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.textContent).not.toContain("Unsupported block type: column_list");
    expect(container.textContent).not.toContain("Unsupported block type: column");
    expect(container.textContent).toContain("Left column");
    expect(container.textContent).toContain("Right column");
    expect(container.textContent?.match(/Left column/g)?.length).toBe(1);
    expect(container.textContent?.match(/Right column/g)?.length).toBe(1);

    const grid = container.querySelector(".nbe-column-list-grid") as HTMLElement | null;
    expect(grid).toBeTruthy();
    expect(grid?.style.getPropertyValue("--nbe-column-grid-template")).toBe(
      "minmax(0, 0.6fr) minmax(0, 0.4fr)",
    );
  });

  it("falls back to equal-width columns when ratios are missing", () => {
    const root = createNode("column_list", "");
    const left = createNode("column", "");
    const right = createNode("column", "");
    left.children = [createNode("paragraph", "Left")];
    right.children = [createNode("paragraph", "Right")];
    root.children = [left, right];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const grid = container.querySelector(".nbe-column-list-grid") as HTMLElement | null;
    expect(grid?.style.getPropertyValue("--nbe-column-grid-template")).toBe("repeat(2, minmax(0, 1fr))");
  });

  it("renders a standalone column block as a single column container", () => {
    const root = createNode("column", "");
    root.props.columnWidthRatio = 0.5;
    root.children = [createNode("paragraph", "Standalone column body")];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.textContent).not.toContain("Unsupported block type: column");
    expect(container.textContent).toContain("Standalone column body");
    expect(container.textContent?.match(/Standalone column body/g)?.length).toBe(1);
    expect(container.querySelector(".nbe-column-standalone")).toBeTruthy();
  });

  it("renders non-column children under a column list as loose full-width blocks", () => {
    const root = createNode("column_list", "");
    const column = createNode("column", "");
    column.children = [createNode("paragraph", "Column body")];
    const loose = createNode("paragraph", "Loose body");
    root.children = [column, loose];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.querySelector(".nbe-column-list-loose")).toBeTruthy();
    expect(container.textContent).toContain("Loose body");
    expect(container.textContent?.match(/Column body/g)?.length).toBe(1);
    expect(container.textContent?.match(/Loose body/g)?.length).toBe(1);
  });

  it("hides column children when global child rendering is disabled", () => {
    const root = createNode("column_list", "");
    const column = createNode("column", "");
    column.children = [createNode("paragraph", "Hidden column body")];
    root.children = [column];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      showChildren: false,
    });

    expect(container.textContent).not.toContain("Hidden column body");
    expect(container.querySelector(".nbe-column-list-grid")).toBeFalsy();
  });

  it("renders only refresh action in footer", () => {
    const root = createNode("paragraph", "Body");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const buttons = Array.from(container.querySelectorAll(".nbe-button")).map((button) => button.textContent);
    expect(buttons).toEqual(["Refresh"]);
    expect(container.querySelector(".nbe-url-actions")).toBeFalsy();
  });

  it("starts in view mode and enters editing mode with auto-select", () => {
    const root = createNode("paragraph", "Body");
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });

    try {
      const { container } = renderTestEmbed(root, {
        currentUrl: "https://www.notion.so/page#block",
        onApplyUrl: vi.fn(async () => true),
      });

      const urlBar = container.querySelector(".nbe-urlbar");
      const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;

      expect(urlBar?.classList.contains("is-view")).toBe(true);
      expect(urlInput?.readOnly).toBe(true);

      urlInput?.dispatchEvent(new FocusEvent("focus"));

      expect(urlBar?.classList.contains("is-editing")).toBe(true);
      expect(urlInput?.readOnly).toBe(false);
      expect(urlInput?.selectionStart).toBe(0);
      expect(urlInput?.selectionEnd).toBe(urlInput?.value.length ?? 0);
    } finally {
      raf.mockRestore();
    }
  });

  it("keeps full selection on pointerleave while editing", () => {
    const root = createNode("paragraph", "Body");
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });

    try {
      const { container } = renderTestEmbed(root, {
        currentUrl: "https://www.notion.so/page#block",
        onApplyUrl: vi.fn(async () => true),
      });

      const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;
      urlInput?.dispatchEvent(new FocusEvent("focus"));
      expect(urlInput?.selectionStart).toBe(0);
      expect(urlInput?.selectionEnd).toBe(urlInput?.value.length ?? 0);

      urlInput?.dispatchEvent(new MouseEvent("pointerleave", { bubbles: true }));
      expect(urlInput?.selectionStart).toBe(0);
      expect(urlInput?.selectionEnd).toBe(urlInput?.value.length ?? 0);
    } finally {
      raf.mockRestore();
    }
  });

  it("submits on Enter and returns to view mode after success", async () => {
    const root = createNode("paragraph", "Body");
    const onApplyUrl = vi.fn(async () => true);

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      onApplyUrl,
    });

    const urlBar = container.querySelector(".nbe-urlbar");
    const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;
    urlInput?.dispatchEvent(new FocusEvent("focus"));
    if (urlInput) urlInput.value = "https://www.notion.so/new-page#new-block";
    urlInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();

    expect(onApplyUrl).toHaveBeenCalledWith("https://www.notion.so/new-page#new-block");
    expect(urlBar?.classList.contains("is-view")).toBe(true);
    expect(urlInput?.readOnly).toBe(true);
    const end = urlInput?.value.length ?? 0;
    expect(urlInput?.selectionStart).toBe(end);
    expect(urlInput?.selectionEnd).toBe(end);
  });

  it("auto-applies on blur only when url changed", async () => {
    const root = createNode("paragraph", "Body");
    const onApplyUrl = vi.fn(async () => true);

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      onApplyUrl,
    });

    const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;
    urlInput?.dispatchEvent(new FocusEvent("focus"));
    urlInput?.dispatchEvent(new FocusEvent("blur"));
    await Promise.resolve();
    expect(onApplyUrl).not.toHaveBeenCalled();
    const endOnFirstBlur = urlInput?.value.length ?? 0;
    expect(urlInput?.selectionStart).toBe(endOnFirstBlur);
    expect(urlInput?.selectionEnd).toBe(endOnFirstBlur);

    urlInput?.dispatchEvent(new FocusEvent("focus"));
    if (urlInput) urlInput.value = "https://www.notion.so/changed#block";
    urlInput?.dispatchEvent(new FocusEvent("blur"));
    await Promise.resolve();
    expect(onApplyUrl).toHaveBeenCalledTimes(1);
    expect(onApplyUrl).toHaveBeenCalledWith("https://www.notion.so/changed#block");
    const endOnSecondBlur = urlInput?.value.length ?? 0;
    expect(urlInput?.selectionStart).toBe(endOnSecondBlur);
    expect(urlInput?.selectionEnd).toBe(endOnSecondBlur);
  });

  it("esc reverts to committed url and cancels apply", () => {
    const root = createNode("paragraph", "Body");
    const onApplyUrl = vi.fn(async () => true);

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      onApplyUrl,
    });

    const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;
    urlInput?.dispatchEvent(new FocusEvent("focus"));
    if (urlInput) urlInput.value = "https://www.notion.so/changed#block";
    urlInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onApplyUrl).not.toHaveBeenCalled();
    expect(urlInput?.value).toBe("https://www.notion.so/page#block");
    expect(urlInput?.readOnly).toBe(true);
    const end = urlInput?.value.length ?? 0;
    expect(urlInput?.selectionStart).toBe(end);
    expect(urlInput?.selectionEnd).toBe(end);
  });

  it("refresh commits dirty url first, then refreshes", async () => {
    const root = createNode("paragraph", "Body");
    const order: string[] = [];
    const onApplyUrl = vi.fn(async () => {
      order.push("apply");
      return true;
    });
    const onRefresh = vi.fn(async () => {
      order.push("refresh");
    });

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      onRefresh,
      onApplyUrl,
    });

    const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;
    const refresh = container.querySelector(".nbe-actions .nbe-button") as HTMLButtonElement | null;

    urlInput?.dispatchEvent(new FocusEvent("focus"));
    if (urlInput) urlInput.value = "https://www.notion.so/changed#block";
    refresh?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    refresh?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(order).toEqual(["apply", "refresh"]);
  });

  it("keeps editing mode when apply fails", async () => {
    const root = createNode("paragraph", "Body");
    const onApplyUrl = vi.fn(async () => false);
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });

    try {
      const { container } = renderTestEmbed(root, {
        currentUrl: "https://www.notion.so/page#block",
        onApplyUrl,
      });

      const urlBar = container.querySelector(".nbe-urlbar");
      const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;

      urlInput?.dispatchEvent(new FocusEvent("focus"));
      if (urlInput) urlInput.value = "https://www.notion.so/invalid";
      urlInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();

      expect(onApplyUrl).toHaveBeenCalledTimes(1);
      expect(urlBar?.classList.contains("is-editing")).toBe(true);
      expect(urlInput?.readOnly).toBe(false);
      expect(urlInput?.selectionStart).toBe(0);
      expect(urlInput?.selectionEnd).toBe(urlInput?.value.length ?? 0);
    } finally {
      raf.mockRestore();
    }
  });

  it("renders empty embeds as compact helper text without footer chrome", () => {
    const root = createNode("section_container", "");

    const { container } = renderTestEmbed(root, {
      currentUrl: "",
      showFooter: false,
      emptyStateMessage: EMPTY_NOTION_EMBED_MESSAGE,
    });

    expect(container.querySelector(".nbe-footer")).toBeFalsy();
    expect(container.querySelector(".nbe-empty-note")?.textContent).toBe(
      EMPTY_NOTION_EMBED_MESSAGE,
    );
  });
});
