import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createRenderSession } = vi.hoisted(() => ({
  createRenderSession: vi.fn(),
}));

vi.mock("../src/embed/render-session", () => ({
  createRenderSession,
}));

import { Logger } from "../src/core/logger";
import { NotionEmbedProcessor } from "../src/embed/processor";

describe("NotionEmbedProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses an immediate render fast-path for the first visible embed and prewarms canvas NBE pages once", async () => {
    vi.useFakeTimers();
    const rerender = vi.fn(async () => undefined);
    createRenderSession.mockReturnValue({
      rerender,
      dispose: vi.fn(),
    });

    const repo = {
      prewarmNbePageIndex: vi.fn(async () => undefined),
    };
    const runtime = {
      getSettings: vi.fn(),
      getRepository: vi.fn(() => repo),
      getWritebackService: vi.fn(),
      invalidateScopes: vi.fn(),
      trackEmbed: vi.fn(),
    };

    const processor = new NotionEmbedProcessor({
      app: {
        workspace: {
          getActiveFile: vi.fn(() => null),
        },
        vault: {
          getFileByPath: vi.fn(() => null),
          read: vi.fn(),
        },
      } as never,
      logger: new Logger(),
      runtime: runtime as never,
      imageSizing: {} as never,
      editor: {} as never,
      notionWebHost: {} as never,
    });

    const source =
      "obsidian://notion-block-embed?vault=Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9";
    const ctx = {
      sourcePath: "demo.canvas",
      addChild: vi.fn(),
    } as never;

    const firstEl = document.createElement("div");
    Object.defineProperty(firstEl, "getBoundingClientRect", {
      value: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    });
    await processor.process(source, firstEl, ctx);
    expect(rerender).toHaveBeenCalledTimes(1);
    expect(repo.prewarmNbePageIndex).toHaveBeenCalledTimes(1);
    expect(repo.prewarmNbePageIndex).toHaveBeenCalledWith("p20260328153045-k7");

    const secondEl = document.createElement("div");
    Object.defineProperty(secondEl, "getBoundingClientRect", {
      value: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    });
    await processor.process(source, secondEl, ctx);
    expect(rerender).toHaveBeenCalledTimes(1);
    expect(repo.prewarmNbePageIndex).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    expect(rerender).toHaveBeenCalledTimes(2);
  });

  it("delays offscreen embeds until the offscreen queue window elapses", async () => {
    vi.useFakeTimers();
    const rerender = vi.fn(async () => undefined);
    createRenderSession.mockReturnValue({
      rerender,
      dispose: vi.fn(),
    });

    const runtime = {
      getSettings: vi.fn(),
      getRepository: vi.fn(() => ({ prewarmNbePageIndex: vi.fn(async () => undefined) })),
      getWritebackService: vi.fn(),
      invalidateScopes: vi.fn(),
      trackEmbed: vi.fn(),
    };

    const processor = new NotionEmbedProcessor({
      app: {
        workspace: {
          getActiveFile: vi.fn(() => null),
        },
        vault: {
          getFileByPath: vi.fn(() => null),
          read: vi.fn(),
        },
      } as never,
      logger: new Logger(),
      runtime: runtime as never,
      imageSizing: {} as never,
      editor: {} as never,
      notionWebHost: {} as never,
    });

    const visibleEl = document.createElement("div");
    Object.defineProperty(visibleEl, "getBoundingClientRect", {
      value: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    });
    await processor.process("https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", visibleEl, {
      sourcePath: "demo.canvas",
      addChild: vi.fn(),
    } as never);

    const offscreenEl = document.createElement("div");
    Object.defineProperty(offscreenEl, "getBoundingClientRect", {
      value: () => ({ top: 5000, left: 0, right: 100, bottom: 5100, width: 100, height: 100 }),
    });
    await processor.process("https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#cccccccccccccccccccccccccccccccc", offscreenEl, {
      sourcePath: "demo.canvas",
      addChild: vi.fn(),
    } as never);

    expect(rerender).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(119);
    expect(rerender).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(rerender).toHaveBeenCalledTimes(2);
  });

  it("does not prewarm NBE pages for non-canvas sources", async () => {
    const rerender = vi.fn(async () => undefined);
    createRenderSession.mockReturnValue({
      rerender,
      dispose: vi.fn(),
    });

    const repo = {
      prewarmNbePageIndex: vi.fn(async () => undefined),
    };
    const runtime = {
      getSettings: vi.fn(),
      getRepository: vi.fn(() => repo),
      getWritebackService: vi.fn(),
      invalidateScopes: vi.fn(),
      trackEmbed: vi.fn(),
    };

    const processor = new NotionEmbedProcessor({
      app: {
        workspace: {
          getActiveFile: vi.fn(() => null),
        },
        vault: {
          getFileByPath: vi.fn(() => null),
          read: vi.fn(),
        },
      } as never,
      logger: new Logger(),
      runtime: runtime as never,
      imageSizing: {} as never,
      editor: {} as never,
      notionWebHost: {} as never,
    });

    const source =
      "obsidian://notion-block-embed?vault=Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9";
    const ctx = {
      sourcePath: "note.md",
      addChild: vi.fn(),
    } as never;

    await processor.process(source, document.createElement("div"), ctx);
    expect(repo.prewarmNbePageIndex).not.toHaveBeenCalled();
  });
});
