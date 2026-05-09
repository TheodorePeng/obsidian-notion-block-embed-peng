import { MarkdownView } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { REGISTRY_LAZY_FULL_REBUILD_DELAY_MS } from "../src/core/constants";
import { Logger } from "../src/core/logger";
import { createPersistedPluginData } from "../src/core/persisted-data";
import { PersistedDataStore } from "../src/core/persisted-data-store";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { NbeReferenceRegistryService } from "../src/nbe/registry";

const MARKDOWN_SOURCE = [
  "# Title",
  "```notion-embed",
  "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9",
  "```",
].join("\n");

const SHORTLINK_MARKDOWN_SOURCE = [
  "# Title",
  "```notion-embed",
  `https://www.shortlink.studio/1/${encodeURIComponent(
    "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9",
  )}`,
  "```",
].join("\n");

function createStore(initialRegistry = {}) {
  return new PersistedDataStore(createPersistedPluginData(DEFAULT_SETTINGS, {}, initialRegistry), vi.fn(async () => undefined));
}

function createMarkdownView(path: string, content: string) {
  const view = new MarkdownView();
  view.file = { path };
  view.setViewData(content, false);
  const editor = {
    cursor: { line: 2, ch: 0 },
    setCursor: vi.fn((next) => {
      editor.cursor = next;
    }),
    focus: vi.fn(),
    getCursor: vi.fn(() => editor.cursor),
  };
  (view as MarkdownView & { editor: typeof editor }).editor = editor;
  return { view, editor };
}

describe("NbeReferenceRegistryService", () => {
  it("rebuilds registry entries from markdown files and canvas text nodes", async () => {
    const markdownFile = { path: "Note.md", extension: "md" };
    const canvasFile = { path: "Board.canvas", extension: "canvas" };
    const canvasNodeId = "node-1";
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => [markdownFile]),
        getFiles: vi.fn(() => [markdownFile, canvasFile]),
        read: vi.fn(async (file: { path: string }) => {
          if (file.path === "Note.md") return MARKDOWN_SOURCE;
          return JSON.stringify({
            nodes: [
              {
                id: canvasNodeId,
                type: "text",
                text: MARKDOWN_SOURCE,
              },
            ],
            edges: [],
          });
        }),
      },
      workspace: {},
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createStore());
    await service.rebuild();

    const entry = service.getEntry("p20260328153045-k7::b7k2m9");
    expect(entry).toBeTruthy();
    expect(entry?.locations).toEqual([
      {
        kind: "markdown",
        key: "md:Note.md:1:3",
        path: "Note.md",
        lineStart: 1,
        lineEnd: 3,
      },
      {
        kind: "canvas",
        key: `canvas:Board.canvas:${canvasNodeId}`,
        path: "Board.canvas",
        nodeId: canvasNodeId,
      },
    ]);
  });

  it("rebuilds registry entries from Shortlink Studio markdown files and canvas text nodes", async () => {
    const markdownFile = { path: "Note.md", extension: "md" };
    const canvasFile = { path: "Board.canvas", extension: "canvas" };
    const canvasNodeId = "node-1";
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => [markdownFile]),
        getFiles: vi.fn(() => [markdownFile, canvasFile]),
        read: vi.fn(async (file: { path: string }) => {
          if (file.path === "Note.md") return SHORTLINK_MARKDOWN_SOURCE;
          return JSON.stringify({
            nodes: [
              {
                id: canvasNodeId,
                type: "text",
                text: SHORTLINK_MARKDOWN_SOURCE,
              },
            ],
            edges: [],
          });
        }),
      },
      workspace: {},
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createStore());
    await service.rebuild();

    const entry = service.getEntry("p20260328153045-k7::b7k2m9");
    expect(entry).toBeTruthy();
    expect(entry?.locations).toEqual([
      {
        kind: "markdown",
        key: "md:Note.md:1:3",
        path: "Note.md",
        lineStart: 1,
        lineEnd: 3,
      },
      {
        kind: "canvas",
        key: `canvas:Board.canvas:${canvasNodeId}`,
        path: "Board.canvas",
        nodeId: canvasNodeId,
      },
    ]);
  });

  it("opens a single markdown primary reference in source mode", async () => {
    const file = { path: "Note.md", extension: "md" };
    const { view, editor } = createMarkdownView(file.path, MARKDOWN_SOURCE);
    const leaf = {
      view,
      openFile: vi.fn(async () => undefined),
      getViewState: vi.fn(() => ({ state: { mode: "preview" } })),
      setViewState: vi.fn(async () => undefined),
    };
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        getFileByPath: vi.fn(() => file),
        read: vi.fn(),
      },
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeaf: vi.fn(() => leaf),
        getActiveViewOfType: vi.fn(() => view),
        revealLeaf: vi.fn(async () => undefined),
        setActiveLeaf: vi.fn(),
        iterateAllLeaves: vi.fn((callback: (value: typeof leaf) => void) => callback(leaf)),
      },
    };
    const store = createStore({
      "p20260328153045-k7::b7k2m9": {
        ref: "p20260328153045-k7::b7k2m9",
        primaryLocationKey: "md:Note.md:1:3",
        lastSeenAt: 123,
        locations: [
          {
            kind: "markdown",
            key: "md:Note.md:1:3",
            path: "Note.md",
            lineStart: 1,
            lineEnd: 3,
          },
        ],
      },
    });

    const service = new NbeReferenceRegistryService(app as never, new Logger(), store);
    const outcome = await service.openRef("p20260328153045-k7::b7k2m9");

    expect(outcome).toBe("opened");
    expect(leaf.openFile).toHaveBeenCalledWith(file);
    expect(leaf.setViewState).toHaveBeenCalledWith({
      state: {
        mode: "source",
      },
    });
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 0 });
    expect(editor.focus).toHaveBeenCalled();
  });

  it("falls back to search when multiple references exist without a primary location", async () => {
    const openGlobalSearch = vi.fn();
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
      },
      workspace: {
        getLeavesOfType: vi.fn(() => []),
      },
      internalPlugins: {
        getPluginById: vi.fn(() => ({ instance: { openGlobalSearch } })),
      },
      commands: {
        executeCommandById: vi.fn(),
      },
    };
    const store = createStore({
      "p20260328153045-k7::b7k2m9": {
        ref: "p20260328153045-k7::b7k2m9",
        lastSeenAt: 123,
        locations: [
          {
            kind: "markdown",
            key: "md:One.md:1:3",
            path: "One.md",
            lineStart: 1,
            lineEnd: 3,
          },
          {
            kind: "canvas",
            key: "canvas:Board.canvas:node-1",
            path: "Board.canvas",
            nodeId: "node-1",
          },
        ],
      },
    });

    const service = new NbeReferenceRegistryService(app as never, new Logger(), store);
    const outcome = await service.openRef("p20260328153045-k7::b7k2m9");

    expect(outcome).toBe("searched");
    expect(openGlobalSearch).toHaveBeenCalledWith("nbe=p20260328153045-k7::b7k2m9");
  });

  it("sets the active markdown embed as the primary reference", async () => {
    const { view } = createMarkdownView("Note.md", MARKDOWN_SOURCE);
    const store = createStore({
      "p20260328153045-k7::b7k2m9": {
        ref: "p20260328153045-k7::b7k2m9",
        lastSeenAt: 123,
        locations: [
          {
            kind: "markdown",
            key: "md:Note.md:1:3",
            path: "Note.md",
            lineStart: 1,
            lineEnd: 3,
          },
        ],
      },
    });
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => view),
        getActiveFile: vi.fn(() => view.file),
        activeLeaf: null,
      },
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        read: vi.fn(),
      },
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), store);
    const updated = await service.setPrimaryFromActiveContext();

    expect(updated).toBe(true);
    expect(service.getEntry("p20260328153045-k7::b7k2m9")?.primaryLocationKey).toBe("md:Note.md:1:3");
  });

  it("rescans a single markdown file incrementally", async () => {
    const file = { path: "Note.md", extension: "md" };
    let content = MARKDOWN_SOURCE;
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        getFileByPath: vi.fn((path: string) => (path === file.path ? file : null)),
        read: vi.fn(async () => content),
      },
      workspace: {},
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createStore());
    await service.rescanPath(file.path);
    expect(service.getEntry("p20260328153045-k7::b7k2m9")?.locations).toHaveLength(1);

    content = MARKDOWN_SOURCE.replace("b7k2m9", "b8z9x0");
    await service.rescanPath(file.path);

    expect(service.getEntry("p20260328153045-k7::b7k2m9")).toBeUndefined();
    expect(service.getEntry("p20260328153045-k7::b8z9x0")?.locations).toEqual([
      {
        kind: "markdown",
        key: "md:Note.md:1:3",
        path: "Note.md",
        lineStart: 1,
        lineEnd: 3,
      },
    ]);
  });

  it("schedules a delayed full rebuild after openRef misses the registry", async () => {
    vi.useFakeTimers();
    try {
      const openGlobalSearch = vi.fn();
      const app = {
        vault: {
          getMarkdownFiles: vi.fn(() => []),
          getFiles: vi.fn(() => []),
        },
        workspace: {
          getLeavesOfType: vi.fn(() => []),
        },
        internalPlugins: {
          getPluginById: vi.fn(() => ({ instance: { openGlobalSearch } })),
        },
        commands: {
          executeCommandById: vi.fn(),
        },
      };

      const service = new NbeReferenceRegistryService(app as never, new Logger(), createStore());
      const rebuildSpy = vi.spyOn(service, "rebuild").mockResolvedValue();

      await service.openRef("p20260328153045-k7::missing");
      expect(openGlobalSearch).toHaveBeenCalledWith("nbe=p20260328153045-k7::missing");
      expect(rebuildSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(REGISTRY_LAZY_FULL_REBUILD_DELAY_MS);
      expect(rebuildSpy).toHaveBeenCalledTimes(1);
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
