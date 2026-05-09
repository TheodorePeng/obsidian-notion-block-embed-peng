import * as obsidian from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmbedBlockNode, NotionApiBlockTree } from "../src/core/models";
import { toEmbedNodeTree } from "../src/notion/adapters";
import { inlineEquationParagraphTree, standaloneEquationTree } from "./fixtures/notion-api/equation";
import { duplicateSyncedBlock, syncedBlockTree } from "./fixtures/notion-api/synced-block";
import { createNode } from "./fixtures/notion-blocks";
import { renderTestEmbed } from "./helpers/render";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEmbed text and special blocks", () => {
  it("renders existing Notion links as clickable anchors", () => {
    const root = createNode("paragraph", "Visit");
    root.richText = [
      { plainText: "Visit ", href: null },
      { plainText: "OpenAI", href: "https://openai.com" },
    ];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const link = container.querySelector("a") as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("OpenAI");
    expect(link?.href).toBe("https://openai.com/");
  });

  it("renders mixed heading rich text in natural inline order", () => {
    const root = createNode("heading_1", "ignored");
    root.richText = [
      { plainText: "1. GitHub 介绍：全世界最强的" },
      {
        plainText: "资源网站、代码网站和学习网站",
        annotations: { bold: true, underline: true },
      },
    ];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const heading = container.querySelector("h1.nbe-item-line") as HTMLElement | null;
    expect(heading).toBeTruthy();
    expect(heading?.childElementCount).toBe(2);
    expect(heading?.children[0]?.textContent).toBe("1. GitHub 介绍：全世界最强的");
    expect(heading?.children[1]?.textContent).toBe("资源网站、代码网站和学习网站");
    expect(heading?.children[1]?.classList.contains("nbe-rich-bold")).toBe(true);
    expect(heading?.children[1]?.classList.contains("nbe-rich-underline")).toBe(true);
    expect(heading?.textContent).toBe("1. GitHub 介绍：全世界最强的资源网站、代码网站和学习网站");
  });

  it("keeps todo rows on their dedicated inline-controls layout", () => {
    const todo = createNode("to_do", "Checklist", { checked: false });

    const { container } = renderTestEmbed(todo, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const todoRow = container.querySelector(".nbe-todo.nbe-item-line-inline-controls") as HTMLElement | null;
    const textWrap = container.querySelector(".nbe-todo-text") as HTMLElement | null;

    expect(todoRow).toBeTruthy();
    expect(textWrap?.textContent).toBe("Checklist");
  });

  it("renders inline equation rich text with math renderer", () => {
    const root = toEmbedNodeTree(inlineEquationParagraphTree, "page-1");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const math = container.querySelector(".nbe-math-inline") as HTMLElement | null;
    expect(math).toBeTruthy();
    expect(math?.dataset.mathSource).toBe("E=mc^2");
    expect(container.textContent).toContain("Energy: ");
    expect(container.textContent).not.toContain("Unsupported block type: equation");
  });

  it("renders standalone equation blocks as display math", () => {
    const root = toEmbedNodeTree(standaloneEquationTree, "page-1");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const math = container.querySelector(".nbe-math-display") as HTMLElement | null;
    expect(math).toBeTruthy();
    expect(math?.dataset.mathSource).toBe("\\int_0^1 x^2 dx");
    expect(container.textContent).not.toContain("Unsupported block type: equation");
  });

  it("falls back to equation source text when math rendering fails", () => {
    vi.spyOn(obsidian, "renderMath").mockImplementation(() => {
      throw new Error("math render failed");
    });

    const root = createNode("paragraph", "ignored");
    root.richText = [
      { plainText: "x^2 + 1", sourceType: "equation", equationExpression: "x^2 + 1" },
      { plainText: " tail" },
    ];

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const fallback = container.querySelector(".nbe-math-inline.is-fallback") as HTMLElement | null;
    expect(fallback).toBeTruthy();
    expect(fallback?.textContent).toBe("x^2 + 1");
    expect(container.textContent).toContain("tail");
  });

  it("renders unsupported placeholder", () => {
    const root = createNode("bookmark", "Unsupported");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.textContent).toContain("Unsupported block type: bookmark");
  });

  it("renders synced blocks as a labeled container instead of unsupported", () => {
    const root = toEmbedNodeTree(syncedBlockTree, "page-1");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.textContent).toContain("Synced block");
    expect(container.textContent).toContain("Synced rendered child");
    expect(container.textContent).not.toContain("Unsupported block type: synced_block");
    expect(container.textContent?.match(/Synced rendered child/g)?.length).toBe(1);
    expect(container.querySelector(".nbe-synced-block")).toBeTruthy();
  });

  it("renders duplicate synced blocks with the same lightweight container", () => {
    const duplicateTree: NotionApiBlockTree = {
      block: duplicateSyncedBlock,
      children: [
        {
          block: {
            object: "block",
            id: "duplicate-child",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", plain_text: "Duplicate synced content", text: { content: "Duplicate synced content" } }],
            },
          },
          children: [],
        },
      ],
    };
    const root = toEmbedNodeTree(duplicateTree, "page-1");

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.textContent).toContain("Synced block");
    expect(container.textContent).toContain("Duplicate synced content");
    expect(container.textContent).not.toContain("Unsupported block type: synced_block");
  });

  it("keeps the synced block label when children are hidden globally", () => {
    const root = toEmbedNodeTree(syncedBlockTree, "page-1");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      showChildren: false,
    });

    expect(container.textContent).toContain("Synced block");
    expect(container.textContent).not.toContain("Synced rendered child");
    expect(container.textContent).not.toContain("Unsupported block type: synced_block");
  });
});
