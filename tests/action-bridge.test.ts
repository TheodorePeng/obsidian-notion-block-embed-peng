import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { createRenderOptions } from "../src/embed/action-bridge";
import { createNode } from "./fixtures/notion-blocks";

describe("createRenderOptions", () => {
  function createArgs(mode: "block_url" | "page_heading" | "nbe_uri" | "empty_block_url") {
    const parsedTarget =
      mode === "block_url"
        ? {
            mode,
            originalUrl:
              "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad#d05907aae5b146d98eface29afae7844",
            pageId: "3294cb88-07f2-811a-b8ba-f0a10f76a5ad",
            blockId: "d05907aa-e5b1-46d9-8efa-ce29afae7844",
          }
        : mode === "page_heading"
          ? {
              mode,
              originalUrl: "https://www.notion.so/another-page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              pageId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
              heading: "Heading",
            }
          : mode === "nbe_uri"
            ? {
                mode,
                originalUrl:
                  "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9",
                action: "open-ref",
                vault: "My Vault",
                ref: "p20260328153045-k7_b7k2m9",
                pageNbeId: "p20260328153045-k7",
                blockNbeId: "b7k2m9",
              }
            : {
                mode,
                originalUrl: "",
              };

    return {
      app: {} as never,
      mount: document.createElement("div"),
      hostEl: document.createElement("div"),
      ctx: {
        getSectionInfo: vi.fn(() => ({ lineStart: 0, lineEnd: 2, text: "```notion-embed\n...\n```" })),
      } as never,
      currentSource: parsedTarget.originalUrl,
      loaded: {
        parsedTarget,
        sourceMode: mode,
        root: createNode("paragraph", "Body"),
        writebackAllowed: false,
        cacheScopes: [],
      },
      getSettings: () => DEFAULT_SETTINGS,
      getWritebackService: () => ({} as never),
      imageSizing: {} as never,
      editor: {} as never,
      notionWebHost: {} as never,
      rerender: vi.fn(async () => undefined),
    };
  }

  it("enables footer URL editing for nbe_uri embeds", () => {
    const options = createRenderOptions(createArgs("nbe_uri"));
    expect(options.onApplyUrl).toBeTypeOf("function");
  });

  it("enables footer URL editing for nbe_uri embeds inside Canvas context", () => {
    const args = createArgs("nbe_uri");
    args.ctx = {
      sourcePath: "Board.canvas",
      getSectionInfo: vi.fn(() => null),
    } as never;

    const options = createRenderOptions(args);
    expect(options.onApplyUrl).toBeTypeOf("function");
  });

  it("keeps empty embeds without footer URL editing", () => {
    const options = createRenderOptions(createArgs("empty_block_url"));
    expect(options.onApplyUrl).toBeUndefined();
  });
});
