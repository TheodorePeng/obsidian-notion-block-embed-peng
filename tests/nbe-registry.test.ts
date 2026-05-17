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
  "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9",
  "```",
].join("\n");

const SHORTLINK_MARKDOWN_SOURCE = [
  "# Title",
  "```notion-embed",
  `https://www.shortlink.studio/1/${encodeURIComponent(
    "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9",
  )}`,
  "```",
].join("\n");

const LEGACY_SHORTLINK_MARKDOWN_SOURCE = [
  "# Title",
  "```notion-embed",
  `https://www.shortlink.studio/1/${encodeURIComponent(
    "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9",
  )}`,
  "```",
].join("\n");

const SEARCH_QUERY_B7K2M9 = "p20260328153045-k7_b7k2m9";
const SEARCH_QUERY_MISSING = "p20260328153045-k7_missing";

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

function createSingleLocationStore(location: {
  kind: "markdown";
  key: string;
  path: string;
  lineStart: number;
  lineEnd: number;
} | {
  kind: "canvas";
  key: string;
  path: string;
  nodeId: string;
}) {
  return createStore({
    "p20260328153045-k7_b7k2m9": {
      ref: "p20260328153045-k7_b7k2m9",
      lastSeenAt: 123,
      locations: [location],
    },
  });
}

function createSearchHarness() {
  const searchView = { setQuery: vi.fn() };
  const searchLeaf = { view: searchView };
  return {
    searchView,
    searchLeaf,
    workspaceSearchApi: {
      getLeavesOfType: vi.fn(() => [searchLeaf]),
      revealLeaf: vi.fn(async () => undefined),
    },
    commands: {
      executeCommandById: vi.fn(),
    },
  };
}

function createCanvasView(options?: {
  node?: unknown;
  updateSelection?: () => void;
  zoomToSelection?: () => void;
}) {
  const node = options?.node ?? { id: "node-1" };
  const selection = {
    clear: vi.fn(),
    add: vi.fn(),
  };
  const canvas = {
    nodes: {
      get: vi.fn(() => node),
    },
    selection,
    updateSelection: vi.fn(options?.updateSelection ?? (() => undefined)),
    zoomToSelection: vi.fn(options?.zoomToSelection ?? (() => undefined)),
  };
  const view = {
    file: { path: "Board.canvas" },
    getViewType: vi.fn(() => "canvas"),
    canvas,
  };
  return { view, canvas, selection, node };
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

    const entry = service.getEntry("p20260328153045-k7_b7k2m9");
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

    const entry = service.getEntry("p20260328153045-k7_b7k2m9");
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

  it("indexes legacy Shortlink Studio refs under the canonical underscore key", async () => {
    const markdownFile = { path: "Note.md", extension: "md" };
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => [markdownFile]),
        getFiles: vi.fn(() => [markdownFile]),
        read: vi.fn(async () => LEGACY_SHORTLINK_MARKDOWN_SOURCE),
      },
      workspace: {},
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createStore());
    await service.rebuild();

    expect(service.getEntry("p20260328153045-k7_b7k2m9")?.locations).toEqual([
      {
        kind: "markdown",
        key: "md:Note.md:1:3",
        path: "Note.md",
        lineStart: 1,
        lineEnd: 3,
      },
    ]);
    expect(service.getRegistry()["p20260328153045-k7::b7k2m9"]).toBeUndefined();
  });

  it("opens a single markdown reference when the incoming ref is legacy double-colon", async () => {
    const file = { path: "Note.md", extension: "md" };
    const { view } = createMarkdownView(file.path, MARKDOWN_SOURCE);
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
      "p20260328153045-k7_b7k2m9": {
        ref: "p20260328153045-k7_b7k2m9",
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
      "p20260328153045-k7_b7k2m9": {
        ref: "p20260328153045-k7_b7k2m9",
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
    const outcome = await service.openRef("p20260328153045-k7_b7k2m9");

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
    const searchView = { setQuery: vi.fn() };
    const searchLeaf = { view: searchView };
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
      },
      workspace: {
        getLeavesOfType: vi.fn(() => [searchLeaf]),
        revealLeaf: vi.fn(async () => undefined),
      },
      internalPlugins: {
        getPluginById: vi.fn(() => ({ instance: { openGlobalSearch } })),
      },
      commands: {
        executeCommandById: vi.fn(),
      },
    };
    const store = createStore({
      "p20260328153045-k7_b7k2m9": {
        ref: "p20260328153045-k7_b7k2m9",
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
    const outcome = await service.openRef("p20260328153045-k7_b7k2m9");

    expect(outcome).toBe("searched");
    expect(app.commands.executeCommandById).toHaveBeenCalledWith("global-search:open");
    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(searchLeaf);
    expect(searchView.setQuery).toHaveBeenCalledWith(SEARCH_QUERY_B7K2M9);
    expect(openGlobalSearch).not.toHaveBeenCalled();
    service.dispose();
  });

  it("falls back to search when a direct markdown open throws at runtime", async () => {
    const file = { path: "Note.md", extension: "md" };
    const leaf = {
      view: {},
      openFile: vi.fn(async () => {
        throw new TypeError("e is not a function");
      }),
    };
    const searchView = { setQuery: vi.fn() };
    const searchLeaf = { view: searchView };
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        getFileByPath: vi.fn(() => file),
      },
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeaf: vi.fn(() => leaf),
        getLeavesOfType: vi.fn(() => [searchLeaf]),
        revealLeaf: vi.fn(async () => undefined),
        iterateAllLeaves: vi.fn(),
      },
      commands: {
        executeCommandById: vi.fn(),
      },
    };
    const store = createStore({
      "p20260328153045-k7_b7k2m9": {
        ref: "p20260328153045-k7_b7k2m9",
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
    const outcome = await service.openRef("p20260328153045-k7_b7k2m9");

    expect(outcome).toBe("searched");
    expect(leaf.openFile).toHaveBeenCalledWith(file);
    expect(searchView.setQuery).toHaveBeenCalledWith(SEARCH_QUERY_B7K2M9);
    service.dispose();
  });

  it("does not fall back to search when markdown post-open focusing throws", async () => {
    const file = { path: "Note.md", extension: "md" };
    const { view } = createMarkdownView(file.path, MARKDOWN_SOURCE);
    const editor = {
      setCursor: vi.fn(() => {
        throw new TypeError("e is not a function");
      }),
      focus: vi.fn(() => {
        throw new TypeError("e is not a function");
      }),
    };
    (view as MarkdownView & { editor: typeof editor }).editor = editor;
    const leaf = {
      view,
      openFile: vi.fn(async () => undefined),
      getViewState: vi.fn(() => {
        throw new TypeError("e is not a function");
      }),
      setViewState: vi.fn(async () => undefined),
    };
    const search = createSearchHarness();
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        getFileByPath: vi.fn(() => file),
      },
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeaf: vi.fn(() => leaf),
        getActiveViewOfType: vi.fn(() => view),
        setActiveLeaf: vi.fn(() => {
          throw new TypeError("e is not a function");
        }),
        iterateAllLeaves: vi.fn(),
        ...search.workspaceSearchApi,
      },
      commands: search.commands,
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createSingleLocationStore({
      kind: "markdown",
      key: "md:Note.md:1:3",
      path: "Note.md",
      lineStart: 1,
      lineEnd: 3,
    }));
    const outcome = await service.openRef("p20260328153045-k7_b7k2m9");

    expect(outcome).toBe("opened");
    expect(leaf.openFile).toHaveBeenCalledWith(file);
    expect(search.commands.executeCommandById).not.toHaveBeenCalled();
    expect(search.searchView.setQuery).not.toHaveBeenCalled();
    service.dispose();
  });

  it("opens a single canvas reference, selects the node, and zooms without search", async () => {
    const file = { path: "Board.canvas", extension: "canvas" };
    const { view, canvas, selection, node } = createCanvasView();
    const leaf = {
      view,
      openFile: vi.fn(async () => undefined),
    };
    const search = createSearchHarness();
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        getFileByPath: vi.fn(() => file),
      },
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf: vi.fn(),
        iterateAllLeaves: vi.fn(),
        ...search.workspaceSearchApi,
      },
      commands: search.commands,
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createSingleLocationStore({
      kind: "canvas",
      key: "canvas:Board.canvas:node-1",
      path: "Board.canvas",
      nodeId: "node-1",
    }));
    const outcome = await service.openRef("p20260328153045-k7_b7k2m9");

    expect(outcome).toBe("opened");
    expect(leaf.openFile).toHaveBeenCalledWith(file);
    expect(selection.clear).toHaveBeenCalled();
    expect(selection.add).toHaveBeenCalledWith(node);
    expect(canvas.updateSelection).toHaveBeenCalledWith(true);
    expect(canvas.zoomToSelection).toHaveBeenCalled();
    expect(search.commands.executeCommandById).not.toHaveBeenCalled();
    expect(search.searchView.setQuery).not.toHaveBeenCalled();
    service.dispose();
  });

  it("waits for a canvas node to become available before zooming", async () => {
    vi.useFakeTimers();
    try {
      const file = { path: "Board.canvas", extension: "canvas" };
      const node = { id: "node-1" };
      const { view, canvas } = createCanvasView({ node });
      canvas.nodes.get.mockReturnValueOnce(undefined).mockReturnValueOnce(node);
      const leaf = {
        view,
        openFile: vi.fn(async () => undefined),
      };
      const search = createSearchHarness();
      const app = {
        vault: {
          getMarkdownFiles: vi.fn(() => []),
          getFiles: vi.fn(() => []),
          getFileByPath: vi.fn(() => file),
        },
        workspace: {
          getMostRecentLeaf: vi.fn(() => leaf),
          getLeaf: vi.fn(() => leaf),
          setActiveLeaf: vi.fn(),
          iterateAllLeaves: vi.fn(),
          ...search.workspaceSearchApi,
        },
        commands: search.commands,
      };

      const service = new NbeReferenceRegistryService(app as never, new Logger(), createSingleLocationStore({
        kind: "canvas",
        key: "canvas:Board.canvas:node-1",
        path: "Board.canvas",
        nodeId: "node-1",
      }));
      const openPromise = service.openRef("p20260328153045-k7_b7k2m9");
      await vi.advanceTimersByTimeAsync(50);

      await expect(openPromise).resolves.toBe("opened");
      expect(canvas.nodes.get).toHaveBeenCalledTimes(2);
      expect(canvas.zoomToSelection).toHaveBeenCalled();
      expect(search.commands.executeCommandById).not.toHaveBeenCalled();
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fall back to search when canvas zoom throws", async () => {
    const file = { path: "Board.canvas", extension: "canvas" };
    const { view, canvas } = createCanvasView({
      zoomToSelection: () => {
        throw new TypeError("e is not a function");
      },
    });
    const leaf = {
      view,
      openFile: vi.fn(async () => undefined),
    };
    const search = createSearchHarness();
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        getFileByPath: vi.fn(() => file),
      },
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf: vi.fn(),
        iterateAllLeaves: vi.fn(),
        ...search.workspaceSearchApi,
      },
      commands: search.commands,
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createSingleLocationStore({
      kind: "canvas",
      key: "canvas:Board.canvas:node-1",
      path: "Board.canvas",
      nodeId: "node-1",
    }));
    const outcome = await service.openRef("p20260328153045-k7_b7k2m9");

    expect(outcome).toBe("opened");
    expect(canvas.zoomToSelection).toHaveBeenCalledTimes(2);
    expect(search.commands.executeCommandById).not.toHaveBeenCalled();
    expect(search.searchView.setQuery).not.toHaveBeenCalled();
    service.dispose();
  });

  it("does not fall back to search when canvas selection update throws", async () => {
    const file = { path: "Board.canvas", extension: "canvas" };
    const { view, canvas } = createCanvasView({
      updateSelection: () => {
        throw new TypeError("e is not a function");
      },
    });
    const leaf = {
      view,
      openFile: vi.fn(async () => undefined),
    };
    const search = createSearchHarness();
    const app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
        getFiles: vi.fn(() => []),
        getFileByPath: vi.fn(() => file),
      },
      workspace: {
        getMostRecentLeaf: vi.fn(() => leaf),
        getLeaf: vi.fn(() => leaf),
        setActiveLeaf: vi.fn(),
        iterateAllLeaves: vi.fn(),
        ...search.workspaceSearchApi,
      },
      commands: search.commands,
    };

    const service = new NbeReferenceRegistryService(app as never, new Logger(), createSingleLocationStore({
      kind: "canvas",
      key: "canvas:Board.canvas:node-1",
      path: "Board.canvas",
      nodeId: "node-1",
    }));
    const outcome = await service.openRef("p20260328153045-k7_b7k2m9");

    expect(outcome).toBe("opened");
    expect(canvas.updateSelection).toHaveBeenCalledWith(true);
    expect(canvas.zoomToSelection).toHaveBeenCalled();
    expect(search.commands.executeCommandById).not.toHaveBeenCalled();
    expect(search.searchView.setQuery).not.toHaveBeenCalled();
    service.dispose();
  });

  it("falls back to search when the canvas node is not available after retries", async () => {
    vi.useFakeTimers();
    try {
      const file = { path: "Board.canvas", extension: "canvas" };
      const { view, canvas } = createCanvasView();
      canvas.nodes.get.mockReturnValue(undefined);
      const leaf = {
        view,
        openFile: vi.fn(async () => undefined),
      };
      const search = createSearchHarness();
      const app = {
        vault: {
          getMarkdownFiles: vi.fn(() => []),
          getFiles: vi.fn(() => []),
          getFileByPath: vi.fn(() => file),
        },
        workspace: {
          getMostRecentLeaf: vi.fn(() => leaf),
          getLeaf: vi.fn(() => leaf),
          setActiveLeaf: vi.fn(),
          iterateAllLeaves: vi.fn(),
          ...search.workspaceSearchApi,
        },
        commands: search.commands,
      };

      const service = new NbeReferenceRegistryService(app as never, new Logger(), createSingleLocationStore({
        kind: "canvas",
        key: "canvas:Board.canvas:node-1",
        path: "Board.canvas",
        nodeId: "node-1",
      }));
      const openPromise = service.openRef("p20260328153045-k7_b7k2m9");
      await vi.advanceTimersByTimeAsync(750);

      await expect(openPromise).resolves.toBe("searched");
      expect(canvas.zoomToSelection).not.toHaveBeenCalled();
      expect(search.commands.executeCommandById).toHaveBeenCalledWith("global-search:open");
      expect(search.searchView.setQuery).toHaveBeenCalledWith(SEARCH_QUERY_B7K2M9);
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not surface global-search internal API TypeErrors", async () => {
    const openGlobalSearch = vi.fn(() => {
      throw new TypeError("e is not a function");
    });
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
      "p20260328153045-k7_b7k2m9": {
        ref: "p20260328153045-k7_b7k2m9",
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
    await expect(service.openRef("p20260328153045-k7_b7k2m9")).resolves.toBe("searched");
    expect(openGlobalSearch).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it("sets the active markdown embed as the primary reference", async () => {
    const { view } = createMarkdownView("Note.md", MARKDOWN_SOURCE);
    const store = createStore({
      "p20260328153045-k7_b7k2m9": {
        ref: "p20260328153045-k7_b7k2m9",
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
    expect(service.getEntry("p20260328153045-k7_b7k2m9")?.primaryLocationKey).toBe("md:Note.md:1:3");
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
    expect(service.getEntry("p20260328153045-k7_b7k2m9")?.locations).toHaveLength(1);

    content = MARKDOWN_SOURCE.replace("b7k2m9", "b8z9x0");
    await service.rescanPath(file.path);

    expect(service.getEntry("p20260328153045-k7_b7k2m9")).toBeUndefined();
    expect(service.getEntry("p20260328153045-k7_b8z9x0")?.locations).toEqual([
      {
        kind: "markdown",
        key: "md:Note.md:1:3",
        path: "Note.md",
        lineStart: 1,
        lineEnd: 3,
      },
    ]);
  });

  it("rebuilds once before falling back to search after openRef misses the registry", async () => {
    vi.useFakeTimers();
    try {
      const openGlobalSearch = vi.fn();
      const app = {
        vault: {
          getMarkdownFiles: vi.fn(() => []),
          getFiles: vi.fn(() => []),
        },
        workspace: {
          getLeavesOfType: vi.fn(() => [{ view: { setQuery: vi.fn() } }]),
          revealLeaf: vi.fn(async () => undefined),
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

      await service.openRef("p20260328153045-k7_missing");
      expect(rebuildSpy).toHaveBeenCalledTimes(1);
      expect(openGlobalSearch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(REGISTRY_LAZY_FULL_REBUILD_DELAY_MS);
      expect(rebuildSpy).toHaveBeenCalledTimes(2);
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
