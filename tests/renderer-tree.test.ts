import { afterEach, describe, expect, it, vi } from "vitest";
import { toEmbedNodeTree } from "../src/notion/adapters";
import { toggleListTree } from "./fixtures/notion-api/toggle-list";
import { createNode } from "./fixtures/notion-blocks";
import { renderTestEmbed } from "./helpers/render";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEmbed tree", () => {
  it("renders toggle children as expanded by default", () => {
    const root = createNode("toggle", "Section");
    root.children = [createNode("paragraph", "Inner content")];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.textContent).not.toContain("Unsupported block type: toggle");
    const wrapper = container.querySelector(".nbe-tree-item-toggle");
    const row = container.querySelector(".nbe-toggle-row");
    const leading = container.querySelector(".nbe-tree-leading");
    const trigger = container.querySelector(".nbe-toggle-trigger");
    const caret = container.querySelector(".nbe-toggle-caret");
    const children = container.querySelector(".nbe-toggle-children") as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(row).toBeTruthy();
    expect(leading).toBeTruthy();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(caret).toBeTruthy();
    expect(trigger?.textContent?.includes("▸")).toBe(false);
    expect(children).toBeTruthy();
    expect(children?.hidden).toBe(false);
    expect(container.textContent).toContain("Inner content");
  });

  it("renders toggle as collapsed by default and supports click expand", () => {
    const root = createNode("toggle", "Section");
    root.children = [createNode("paragraph", "Inner content")];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      toggleDefaultExpanded: false,
    });

    const trigger = container.querySelector(".nbe-toggle-trigger") as HTMLButtonElement | null;
    const children = container.querySelector(".nbe-toggle-children") as HTMLElement | null;
    expect(trigger).toBeTruthy();
    expect(children).toBeTruthy();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(children?.hidden).toBe(true);

    trigger?.click();

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(children?.hidden).toBe(false);
  });

  it("keeps toggle children hidden when global child rendering is disabled", () => {
    const root = createNode("toggle", "Section");
    root.children = [createNode("paragraph", "Hidden child")];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      showChildren: false,
    });

    expect(container.querySelector(".nbe-toggle-children")).toBeFalsy();
    expect(container.textContent).not.toContain("Hidden child");
  });

  it("aligns nested toggle and list items on the same gutter with guide rails", () => {
    const root = toEmbedNodeTree(toggleListTree, "page-1");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const treeItems = Array.from(container.querySelectorAll(".nbe-tree-item"));
    expect(treeItems.length).toBeGreaterThanOrEqual(3);

    const bulletItem = treeItems.find((item) => item.textContent?.includes("Bullet item"));
    const nestedToggleItem = treeItems.find((item) => item.textContent?.includes("Nested toggle"));
    const firstLeading = bulletItem?.querySelector(".nbe-tree-leading");
    const secondLeading = nestedToggleItem?.querySelector(".nbe-tree-leading");
    expect(firstLeading).toBeTruthy();
    expect(secondLeading).toBeTruthy();

    const firstCurrentSlot = bulletItem?.querySelector(".nbe-tree-slot-current.has-icon");
    const secondCurrentSlot = nestedToggleItem?.querySelector(".nbe-tree-slot-current.has-icon");
    expect(firstCurrentSlot).toBeTruthy();
    expect(secondCurrentSlot).toBeTruthy();

    const firstGuides = bulletItem?.querySelectorAll(".nbe-tree-slot-ancestor.is-active .nbe-tree-guide-full");
    const secondGuides = nestedToggleItem?.querySelectorAll(".nbe-tree-slot-ancestor.is-active .nbe-tree-guide-full");
    expect((firstGuides?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect((secondGuides?.length ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("marks visible leaf items without visible-children state", () => {
    const root = createNode("section_container", "");
    const first = createNode("toggle", "Parent");
    first.children = [createNode("paragraph", "Child")];
    const second = createNode("bulleted_list_item", "Leaf bullet");
    root.children = [first, second];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const treeItems = Array.from(container.querySelectorAll(".nbe-tree-item"));
    expect(treeItems.length).toBeGreaterThanOrEqual(2);
    const rootToggle = treeItems[0];
    const leafBullet = treeItems.find((item) => item.textContent?.includes("Leaf bullet"));
    expect(rootToggle?.classList.contains("nbe-tree-has-current-bottom-rail")).toBe(true);
    expect(rootToggle?.classList.contains("nbe-tree-is-leaf-visible-node")).toBe(false);
    expect(leafBullet?.classList.contains("nbe-tree-has-current-bottom-rail")).toBe(false);
    expect(leafBullet?.classList.contains("nbe-tree-is-leaf-visible-node")).toBe(true);

    const leafCurrentSlot = leafBullet?.querySelector(".nbe-tree-slot-current");
    expect(leafCurrentSlot?.querySelector(".nbe-tree-guide-top")).toBeFalsy();
    expect(leafCurrentSlot?.querySelector(".nbe-tree-guide-bottom")).toBeFalsy();
  });

  it("renders nested plain children with guide rails and empty icon gutter", () => {
    const root = createNode("toggle", "Parent");
    root.children = [createNode("paragraph", "Nested paragraph")];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const plainRow = container.querySelector(".nbe-tree-row-plain");
    const emptySlot = container.querySelector(".nbe-tree-row-plain .nbe-tree-slot-current.is-empty");
    const activeGuides = container.querySelectorAll(
      ".nbe-tree-row-plain .nbe-tree-slot-ancestor.is-active .nbe-tree-guide-full",
    );
    expect(plainRow).toBeTruthy();
    expect(emptySlot).toBeTruthy();
    expect(activeGuides.length).toBe(1);
    expect(container.textContent).toContain("Nested paragraph");
  });
});
