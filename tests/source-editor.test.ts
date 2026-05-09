import { MarkdownView } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { applyNotionEmbedSourceUpdate, rewriteNotionEmbedSourceUrl } from "../src/embed/source-editor";

describe("rewriteNotionEmbedSourceUrl", () => {
  it("rewrites block mode source to new block url", () => {
    const source =
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#d05907aae5b146d98eface29afae7844";
    const next =
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(rewriteNotionEmbedSourceUrl(source, next)).toBe(next);
  });

  it("rewrites only url line in page-heading mode", () => {
    const source = [
      "url: https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad",
      "heading: 一、GitHub网站基础介绍 00 00",
    ].join("\n");
    const nextUrl = "https://www.notion.so/another-page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const out = rewriteNotionEmbedSourceUrl(source, nextUrl);
    expect(out).toContain(`url: ${nextUrl}`);
    expect(out).toContain("heading: 一、GitHub网站基础介绍 00 00");
  });

  it("rewrites single-line sources without validating the next url", () => {
    const source =
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#d05907aae5b146d98eface29afae7844";
    expect(rewriteNotionEmbedSourceUrl(source, "https://example.com/notion")).toBe("https://example.com/notion");
  });

  it("rejects empty source as a rewrite target", () => {
    const next =
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(() => rewriteNotionEmbedSourceUrl("", next)).toThrow("Empty notion-embed must be edited in source.");
  });

  it("rewrites NBE URI embeds to a new NBE URI", () => {
    const source =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    const next =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b9z1x2";
    expect(rewriteNotionEmbedSourceUrl(source, next)).toBe(next);
  });

  it("rewrites NBE URI embeds to block URLs", () => {
    const source =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    const next =
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(rewriteNotionEmbedSourceUrl(source, next)).toBe(next);
  });

  it("rewrites block URL embeds to NBE URIs", () => {
    const source =
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#d05907aae5b146d98eface29afae7844";
    const next =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    expect(rewriteNotionEmbedSourceUrl(source, next)).toBe(next);
  });

  it("allows plain Notion page URLs when rewriting NBE URIs from the footer field", () => {
    const source =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    const next = "https://www.notion.so/another-page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(rewriteNotionEmbedSourceUrl(source, next)).toBe(next);
  });

  it("trims whitespace when rewriting single-line sources", () => {
    const source =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    expect(rewriteNotionEmbedSourceUrl(source, "   custom-free-text   ")).toBe("custom-free-text");
  });
});

describe("applyNotionEmbedSourceUpdate", () => {
  const initialContent = ["before", "```notion-embed", "", "```", "after"].join("\n");
  const section = {
    text: ["```notion-embed", "", "```"].join("\n"),
    lineStart: 1,
    lineEnd: 3,
  };
  const nextSource =
    "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  function createMarkdownView(path: string, content: string): MarkdownView {
    const view = new MarkdownView();
    view.file = { path };
    view.setViewData(content, false);
    return view;
  }

  it("updates a matching markdown view even when that note is not the active leaf", async () => {
    const matchedView = createMarkdownView("Note.md", initialContent);
    const otherActiveView = createMarkdownView("Other.md", "other");
    const setViewData = vi.spyOn(matchedView, "setViewData");
    const requestSave = vi.spyOn(matchedView, "requestSave");
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => otherActiveView),
        getActiveFile: vi.fn(() => otherActiveView.file),
        iterateAllLeaves: vi.fn((callback: (leaf: { view: MarkdownView }) => void) => {
          callback({ view: matchedView });
          callback({ view: otherActiveView });
        }),
      },
      vault: {
        getFileByPath: vi.fn(() => null),
        read: vi.fn(),
        modify: vi.fn(),
      },
    };
    const ctx = {
      sourcePath: "Note.md",
      getSectionInfo: vi.fn(() => section),
    };

    await applyNotionEmbedSourceUpdate(app as never, ctx as never, document.createElement("div"), nextSource);

    expect(setViewData).toHaveBeenCalledWith(
      ["before", "```notion-embed", nextSource, "```", "after"].join("\n"),
      false,
    );
    expect(requestSave).toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(app.vault.modify).not.toHaveBeenCalled();
  });

  it("uses the active markdown view when sourcePath is empty", async () => {
    const activeView = createMarkdownView("Note.md", initialContent);
    const setViewData = vi.spyOn(activeView, "setViewData");
    const requestSave = vi.spyOn(activeView, "requestSave");
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
        getActiveFile: vi.fn(() => activeView.file),
        iterateAllLeaves: vi.fn(),
      },
      vault: {
        getFileByPath: vi.fn(() => null),
        read: vi.fn(),
        modify: vi.fn(),
      },
    };
    const ctx = {
      sourcePath: "",
      getSectionInfo: vi.fn(() => section),
    };

    await applyNotionEmbedSourceUpdate(app as never, ctx as never, document.createElement("div"), nextSource);

    expect(setViewData).toHaveBeenCalledWith(
      ["before", "```notion-embed", nextSource, "```", "after"].join("\n"),
      false,
    );
    expect(requestSave).toHaveBeenCalled();
  });

  it("replaces by section line range even when section text does not exactly match the source", async () => {
    const activeView = createMarkdownView("Note.md", initialContent);
    const setViewData = vi.spyOn(activeView, "setViewData");
    const requestSave = vi.spyOn(activeView, "requestSave");
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
        getActiveFile: vi.fn(() => activeView.file),
        iterateAllLeaves: vi.fn(),
      },
      vault: {
        getFileByPath: vi.fn(() => null),
        read: vi.fn(),
        modify: vi.fn(),
      },
    };
    const ctx = {
      sourcePath: "",
      getSectionInfo: vi.fn(() => ({
        text: ["```notion-embed", " ", "```"].join("\n"),
        lineStart: 1,
        lineEnd: 3,
      })),
    };

    await applyNotionEmbedSourceUpdate(app as never, ctx as never, document.createElement("div"), nextSource);

    expect(setViewData).toHaveBeenCalledWith(
      ["before", "```notion-embed", nextSource, "```", "after"].join("\n"),
      false,
    );
    expect(requestSave).toHaveBeenCalled();
  });

  it("falls back to file-based update when no markdown view is available", async () => {
    const file = { path: "Note.md" };
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => null),
        iterateAllLeaves: vi.fn(),
      },
      vault: {
        getFileByPath: vi.fn(() => file),
        read: vi.fn(async () => initialContent),
        modify: vi.fn(async () => undefined),
      },
    };
    const ctx = {
      sourcePath: "Note.md",
      getSectionInfo: vi.fn(() => section),
    };

    await applyNotionEmbedSourceUpdate(app as never, ctx as never, document.createElement("div"), nextSource);

    expect(app.vault.getFileByPath).toHaveBeenCalledWith("Note.md");
    expect(app.vault.modify).toHaveBeenCalledWith(
      file,
      ["before", "```notion-embed", nextSource, "```", "after"].join("\n"),
    );
  });

  it("updates the selected Canvas text node when editing from a canvas footer", async () => {
    const currentSource =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    const canvasFile = { path: "Board.canvas", extension: "canvas" };
    const canvasData = {
      nodes: [
        {
          id: "node-1",
          type: "text",
          text: ["```notion-embed", currentSource, "```"].join("\n"),
        },
      ],
      edges: [],
    };
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => canvasFile),
        iterateAllLeaves: vi.fn(),
        activeLeaf: {
          view: {
            getViewType: vi.fn(() => "canvas"),
            canvas: {
              selection: [{ id: "node-1" }],
            },
          },
        },
      },
      vault: {
        getFileByPath: vi.fn(() => canvasFile),
        read: vi.fn(async () => JSON.stringify(canvasData, null, 2)),
        modify: vi.fn(async () => undefined),
      },
    };
    const ctx = {
      sourcePath: "Board.canvas",
      getSectionInfo: vi.fn(() => null),
    };

    await applyNotionEmbedSourceUpdate(
      app as never,
      ctx as never,
      document.createElement("div"),
      nextSource,
      currentSource,
    );

    expect(app.vault.modify).toHaveBeenCalledTimes(1);
    const updatedCanvas = JSON.parse(app.vault.modify.mock.calls[0][1]);
    expect(updatedCanvas.nodes[0].text).toContain(nextSource);
  });

  it("falls back to a unique global canvas source match when there is no selected text node", async () => {
    const currentSource =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    const canvasFile = { path: "Board.canvas", extension: "canvas" };
    const canvasData = {
      nodes: [
        {
          id: "node-a",
          type: "text",
          text: ["```notion-embed", "https://example.com/other", "```"].join("\n"),
        },
        {
          id: "node-b",
          type: "text",
          text: ["```notion-embed", currentSource, "```"].join("\n"),
        },
      ],
      edges: [],
    };
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => canvasFile),
        iterateAllLeaves: vi.fn(),
        activeLeaf: {
          view: {
            getViewType: vi.fn(() => "canvas"),
            canvas: {
              selection: [],
            },
          },
        },
      },
      vault: {
        getFileByPath: vi.fn(() => canvasFile),
        read: vi.fn(async () => JSON.stringify(canvasData, null, 2)),
        modify: vi.fn(async () => undefined),
      },
    };
    const ctx = {
      sourcePath: "Board.canvas",
      getSectionInfo: vi.fn(() => null),
    };

    await applyNotionEmbedSourceUpdate(
      app as never,
      ctx as never,
      document.createElement("div"),
      "custom-free-text",
      currentSource,
    );

    const updatedCanvas = JSON.parse(app.vault.modify.mock.calls[0][1]);
    expect(updatedCanvas.nodes[1].text).toContain("custom-free-text");
    expect(updatedCanvas.nodes[0].text).toContain("https://example.com/other");
  });

  it("rejects ambiguous canvas matches instead of updating the wrong text node", async () => {
    const currentSource =
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9";
    const canvasFile = { path: "Board.canvas", extension: "canvas" };
    const canvasData = {
      nodes: [
        {
          id: "node-a",
          type: "text",
          text: ["```notion-embed", currentSource, "```"].join("\n"),
        },
        {
          id: "node-b",
          type: "text",
          text: ["```notion-embed", currentSource, "```"].join("\n"),
        },
      ],
      edges: [],
    };
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => canvasFile),
        iterateAllLeaves: vi.fn(),
        activeLeaf: {
          view: {
            getViewType: vi.fn(() => "canvas"),
            canvas: {
              selection: [],
            },
          },
        },
      },
      vault: {
        getFileByPath: vi.fn(() => canvasFile),
        read: vi.fn(async () => JSON.stringify(canvasData, null, 2)),
        modify: vi.fn(async () => undefined),
      },
    };
    const ctx = {
      sourcePath: "Board.canvas",
      getSectionInfo: vi.fn(() => null),
    };

    await expect(
      applyNotionEmbedSourceUpdate(
        app as never,
        ctx as never,
        document.createElement("div"),
        nextSource,
        currentSource,
      ),
    ).rejects.toThrow("Unable to determine the Canvas text node for this embed source.");
    expect(app.vault.modify).not.toHaveBeenCalled();
  });

  it("raises a precise error when the current section does not contain a notion-embed code block", async () => {
    const activeView = createMarkdownView("Note.md", ["before", "plain text", "after"].join("\n"));
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => activeView),
        getActiveFile: vi.fn(() => activeView.file),
        iterateAllLeaves: vi.fn(),
      },
      vault: {
        getFileByPath: vi.fn(() => null),
        read: vi.fn(),
        modify: vi.fn(),
      },
    };
    const ctx = {
      sourcePath: "",
      getSectionInfo: vi.fn(() => ({
        text: "plain text",
        lineStart: 1,
        lineEnd: 1,
      })),
    };

    await expect(
      applyNotionEmbedSourceUpdate(app as never, ctx as never, document.createElement("div"), nextSource),
    ).rejects.toThrow("Unable to locate the notion-embed code block in the current note section.");
  });

  it("raises a clearer context error when neither markdown view nor file target can be resolved", async () => {
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => null),
        iterateAllLeaves: vi.fn(),
      },
      vault: {
        getFileByPath: vi.fn(() => null),
      },
    };
    const ctx = {
      sourcePath: "",
      getSectionInfo: vi.fn(() => section),
    };

    await expect(
      applyNotionEmbedSourceUpdate(app as never, ctx as never, document.createElement("div"), nextSource),
    ).rejects.toThrow("Unable to update this embed source from the current note context.");
  });
});
