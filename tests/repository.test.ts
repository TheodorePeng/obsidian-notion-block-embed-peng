import { describe, expect, it, vi } from "vitest";
import { REPOSITORY_TREE_CONCURRENCY } from "../src/core/constants";
import { PluginError } from "../src/core/errors";
import { Logger } from "../src/core/logger";
import { NbeResolvedPageIndex, NbeResolvedTarget, NotionApiBlock, NotionApiDatabase, NotionApiPage } from "../src/core/models";
import { AsyncTtlCache } from "../src/embed/cache";
import { NbeResolutionCacheStore, NotionRepository } from "../src/notion/repository";
import { duplicateSyncedBlock, originalSyncedBlock, syncedSourceChildren } from "./fixtures/notion-api/synced-block";

function makeNbeUri(ref: string, action = "open-ref"): string {
  return `obsidian://notion-block-embed?vault=My%20Vault&action=${action}&nbe=${ref}`;
}

function makeShortlinkNbeUrl(ref: string, action = "open-ref"): string {
  return `https://www.shortlink.studio/1/${encodeURIComponent(makeNbeUri(ref, action))}`;
}

function makeBlock(id: string, type: string, hasChildren = false): NotionApiBlock {
  return {
    object: "block",
    id,
    type,
    has_children: hasChildren,
    [type]: {
      rich_text: [],
    },
  };
}

function makeHeading(id: string, level: 1 | 2 | 3, text: string): NotionApiBlock {
  const type = `heading_${level}`;
  return {
    object: "block",
    id,
    type,
    has_children: false,
    [type]: {
      rich_text: [
        {
          plain_text: text,
        },
      ],
    },
  };
}

function makeDatabase(id: string, hasNbeProperty = true): NotionApiDatabase {
  return {
    object: "database",
    id,
    properties: hasNbeProperty
      ? {
          "NBE ID": {
            type: "rich_text",
          },
        }
      : {},
  };
}

function makePage(id: string, nbeId: string): NotionApiPage {
  return {
    object: "page",
    id,
    properties: {
      "NBE ID": {
        type: "rich_text",
        rich_text: [{ plain_text: nbeId }],
      },
    },
  };
}

function makeLinkedParagraph(id: string, href: string, label = "🔗OB"): NotionApiBlock {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: false,
    paragraph: {
      rich_text: [
        {
          plain_text: label,
          href,
          text: {
            content: label,
            link: {
              url: href,
            },
          },
        },
      ],
    },
  };
}

function makePlainTextParagraph(id: string, text: string): NotionApiBlock {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: false,
    paragraph: {
      rich_text: [
        {
          plain_text: text,
        },
      ],
    },
  };
}

function makeMixedNbeParagraph(id: string, href: string, markdownText: string): NotionApiBlock {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: false,
    paragraph: {
      rich_text: [
        {
          plain_text: "🔗OB",
          href,
          text: {
            content: "🔗OB",
            link: {
              url: href,
            },
          },
        },
        {
          plain_text: markdownText,
        },
      ],
    },
  };
}

function createResolutionStore(
  initialPages: Record<string, Record<string, NbeResolvedPageIndex>> = {},
  initialTargets: Record<string, Record<string, NbeResolvedTarget>> = {},
): NbeResolutionCacheStore {
  const pageNamespaces = structuredClone(initialPages);
  const targetNamespaces = structuredClone(initialTargets);
  return {
    getPageIndex: (tokenFingerprint: string, pageNbeId: string) => pageNamespaces[tokenFingerprint]?.[pageNbeId] ?? null,
    setPageIndex: vi.fn(async (tokenFingerprint: string, pageIndex: NbeResolvedPageIndex) => {
      pageNamespaces[tokenFingerprint] ??= {};
      pageNamespaces[tokenFingerprint][pageIndex.pageNbeId] = structuredClone(pageIndex);
    }),
    deletePageIndex: vi.fn(async (tokenFingerprint: string, pageNbeId: string) => {
      delete pageNamespaces[tokenFingerprint]?.[pageNbeId];
    }),
    getResolvedTarget: (tokenFingerprint: string, ref: string) => targetNamespaces[tokenFingerprint]?.[ref] ?? null,
    setResolvedTarget: vi.fn(async (tokenFingerprint: string, target: NbeResolvedTarget) => {
      targetNamespaces[tokenFingerprint] ??= {};
      targetNamespaces[tokenFingerprint][target.ref] = structuredClone(target);
    }),
    deleteResolvedTarget: vi.fn(async (tokenFingerprint: string, ref: string) => {
      delete targetNamespaces[tokenFingerprint]?.[ref];
    }),
    clearNamespace: vi.fn(async (tokenFingerprint?: string) => {
      if (tokenFingerprint) {
        delete pageNamespaces[tokenFingerprint];
        delete targetNamespaces[tokenFingerprint];
        return;
      }
      for (const key of Object.keys(pageNamespaces)) {
        delete pageNamespaces[key];
      }
      for (const key of Object.keys(targetNamespaces)) {
        delete targetNamespaces[key];
      }
    }),
  };
}

describe("NotionRepository", () => {
  it("reads root-only tree when includeChildren=false", async () => {
    const client = {
      getBlock: vi.fn(async () => makeBlock("a", "paragraph", true)),
      listBlockChildren: vi.fn(async () => [makeBlock("b", "paragraph")]),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const tree = await repo.getBlockTree("a", false);
    expect(tree.children).toHaveLength(0);
    expect(client.listBlockChildren).not.toHaveBeenCalled();
  });

  it("uses cache for same key", async () => {
    const client = {
      getBlock: vi.fn(async () => makeBlock("a", "paragraph", false)),
      listBlockChildren: vi.fn(async () => []),
    };
    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");

    await repo.getBlockTree("a", false);
    await repo.getBlockTree("a", false);
    expect(client.getBlock).toHaveBeenCalledTimes(1);
  });

  it("returns frozen cached trees so later consumers cannot pollute cache state", async () => {
    const client = {
      getBlock: vi.fn(async () => makeBlock("root", "paragraph", true)),
      listBlockChildren: vi.fn(async () => [makeBlock("child", "paragraph", false)]),
    };
    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");

    const first = await repo.getBlockTree("root", true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.block)).toBe(true);
    expect(Object.isFrozen(first.children)).toBe(true);
    expect(() => {
      first.children.push({ block: makeBlock("mutated", "paragraph", false), children: [] });
    }).toThrow(TypeError);

    const second = await repo.getBlockTree("root", true);
    expect(second.children).toHaveLength(1);
    expect(second.children[0]?.block.id).toBe("child");
  });

  it("extracts heading section until next same or higher level heading", async () => {
    const pageId = "page-id";
    const topLevel = [
      makeHeading("h1", 2, "Target Heading"),
      makeBlock("p1", "paragraph"),
      makeHeading("h2", 3, "Child Heading"),
      makeBlock("p2", "paragraph"),
      makeHeading("h3", 2, "Next Sibling Heading"),
      makeBlock("p3", "paragraph"),
    ];

    const client = {
      getBlock: vi.fn(async () => makeBlock(pageId, "page", true)),
      listBlockChildren: vi.fn(async (id: string) => (id === pageId ? topLevel : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const section = await repo.getPageSectionByHeading(pageId, "Target Heading", false);
    expect(section.block.type).toBe("section_container");
    expect(section.children.map((x) => x.block.id)).toEqual(["h1", "p1", "h2", "p2"]);
  });

  it("throws when heading not found", async () => {
    const pageId = "page-id";
    const client = {
      getBlock: vi.fn(async () => makeBlock(pageId, "page", true)),
      listBlockChildren: vi.fn(async () => [makeHeading("h1", 2, "Another Heading")]),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getPageSectionByHeading(pageId, "Missing Heading", false)).rejects.toThrow(
      "Heading not found",
    );
  });

  it("reuses page tree cache across multiple heading sections in the same page", async () => {
    const pageId = "page-id";
    const topLevel = [
      makeHeading("h1", 2, "Heading One"),
      makeBlock("p1", "paragraph"),
      makeHeading("h2", 2, "Heading Two"),
      makeBlock("p2", "paragraph"),
    ];

    const client = {
      getBlock: vi.fn(async () => makeBlock(pageId, "page", true)),
      listBlockChildren: vi.fn(async (id: string) => (id === pageId ? topLevel : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await repo.getPageSectionByHeading(pageId, "Heading One", false);
    await repo.getPageSectionByHeading(pageId, "Heading Two", false);

    expect(client.getBlock).toHaveBeenCalledTimes(1);
    expect(client.listBlockChildren).toHaveBeenCalledTimes(1);
  });

  it("invalidates only target scopes", async () => {
    const pageId = "page-id";
    const topLevel = [makeHeading("h1", 2, "Target Heading"), makeBlock("p1", "paragraph")];
    const client = {
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === pageId ? "page" : "paragraph", id === "a")),
      listBlockChildren: vi.fn(async (id: string) => (id === pageId ? topLevel : [])),
    };
    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");

    await repo.getBlockTree("a", false);
    await repo.getPageSectionByHeading(pageId, "Target Heading", false);

    repo.invalidateScopes([{ kind: "block_tree", blockId: "a" }]);

    await repo.getBlockTree("a", false);
    await repo.getPageSectionByHeading(pageId, "Target Heading", false);

    expect(client.getBlock).toHaveBeenCalledTimes(3);
    expect(client.listBlockChildren).toHaveBeenCalledTimes(1);
  });

  it("invalidates page tree and page section scopes independently", async () => {
    const pageId = "page-id";
    const topLevel = [makeHeading("h1", 2, "Target Heading"), makeBlock("p1", "paragraph")];
    const client = {
      getBlock: vi.fn(async () => makeBlock(pageId, "page", true)),
      listBlockChildren: vi.fn(async (id: string) => (id === pageId ? topLevel : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");

    await repo.getPageSectionByHeading(pageId, "Target Heading", false);
    repo.invalidateScopes([{ kind: "page_section", pageId }]);
    await repo.getPageSectionByHeading(pageId, "Target Heading", false);

    expect(client.getBlock).toHaveBeenCalledTimes(1);
    expect(client.listBlockChildren).toHaveBeenCalledTimes(1);

    repo.invalidateScopes([{ kind: "page_tree", pageId }]);
    await repo.getPageSectionByHeading(pageId, "Target Heading", false);

    expect(client.getBlock).toHaveBeenCalledTimes(2);
    expect(client.listBlockChildren).toHaveBeenCalledTimes(2);
  });

  it("limits tree loading concurrency", async () => {
    const children = Array.from({ length: 8 }, (_, i) => makeBlock(`child-${i}`, "paragraph", true));
    let running = 0;
    let maxRunning = 0;

    const client = {
      getBlock: vi.fn(async () => makeBlock("root", "paragraph", true)),
      listBlockChildren: vi.fn(async (id: string) => {
        if (id === "root") return children;
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 15));
        running -= 1;
        return [];
      }),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await repo.getBlockTree("root", true);
    expect(maxRunning).toBeLessThanOrEqual(REPOSITORY_TREE_CONCURRENCY);
  });

  it("hydrates original synced block children from inline payload when list children is empty", async () => {
    const client = {
      getBlock: vi.fn(async () => originalSyncedBlock),
      listBlockChildren: vi.fn(async () => []),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const tree = await repo.getBlockTree("synced-original", true);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.block.id).toBe("synced-inline-child");
  });

  it("hydrates duplicate synced block children from synced source when reference children are empty", async () => {
    const client = {
      getBlock: vi.fn(async () => duplicateSyncedBlock),
      listBlockChildren: vi.fn(async (id: string) => {
        if (id === "synced-duplicate") return [];
        if (id === "synced-source") return syncedSourceChildren;
        return [];
      }),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const tree = await repo.getBlockTree("synced-duplicate", true);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.block.id).toBe("synced-source-child");
  });

  it("returns empty children when synced source fallback fails", async () => {
    const root: NotionApiBlock = {
      ...duplicateSyncedBlock,
      synced_block: {
        synced_from: {
          block_id: "missing-source",
        },
      },
    };

    const client = {
      getBlock: vi.fn(async () => root),
      listBlockChildren: vi.fn(async (id: string) => {
        if (id === "synced-duplicate") return [];
        throw new PluginError("NOTION_NOT_FOUND", "Not found", 404, "missing-source");
      }),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const tree = await repo.getBlockTree("synced-duplicate", true);

    expect(tree.children).toHaveLength(0);
  });

  it("does not duplicate synced children when the reference already returns children", async () => {
    const listedChild = makeBlock("listed-child", "paragraph", false);
    const client = {
      getBlock: vi.fn(async () => duplicateSyncedBlock),
      listBlockChildren: vi.fn(async (id: string) => {
        if (id === "synced-duplicate") return [listedChild];
        if (id === "synced-source") return syncedSourceChildren;
        return [];
      }),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const tree = await repo.getBlockTree("synced-duplicate", true);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.block.id).toBe("listed-child");
  });

  it("resolves a block tree by NBE page ID and block ID across databases", async () => {
    const ref = "p20260328153045-k7_b7k2m9";
    const href = `obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=${ref}`;
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makeLinkedParagraph("block-1", href, "自定义标签")] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);

    expect(resolved.pageId).toBe("page-1");
    expect(resolved.blockId).toBe("block-1");
    expect(resolved.tree.block.id).toBe("block-1");
    expect(client.searchDatabases).toHaveBeenCalledTimes(1);
    expect(client.queryDatabaseByNbeId).toHaveBeenCalledWith("db-1", "p20260328153045-k7");
  });

  it("reuses a rebuilt page index for later refs on the same page", async () => {
    const refA = "p20260328153045-k7_b7k2m9";
    const refB = "p20260328153045-k7_b8x9z1";
    const hrefA = `obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=${refA}`;
    const hrefB = `obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=${refB}`;
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) =>
        id === "page-1"
          ? [makeLinkedParagraph("block-1", hrefA, "A"), makeLinkedParagraph("block-2", hrefB, "B")]
          : []
      ),
    };

    const resolutionStore = createResolutionStore();
    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn", resolutionStore);

    await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);
    await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b8x9z1", true);

    expect(client.searchDatabases).toHaveBeenCalledTimes(1);
    expect(client.queryDatabaseByNbeId).toHaveBeenCalledTimes(1);
    expect(client.listBlockChildren).toHaveBeenCalledTimes(1);
  });

  it("rebuilds NBE page indexes through lightweight child scans instead of hydrating the page tree root", async () => {
    const ref = "p20260328153045-k7_b7k2m9";
    const href = `obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=${ref}`;
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, "paragraph", false)),
      listBlockChildren: vi.fn(async (id: string) => {
        if (id === "page-1") return [makeBlock("container-1", "paragraph", true)];
        if (id === "container-1") return [makeLinkedParagraph("block-1", href, "Nested")];
        return [];
      }),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);

    expect(resolved.blockId).toBe("block-1");
    expect(client.getBlock).toHaveBeenCalledTimes(1);
    expect(client.getBlock).toHaveBeenCalledWith("block-1");
    expect(client.getBlock).not.toHaveBeenCalledWith("page-1");
    expect(client.listBlockChildren).toHaveBeenCalledWith("page-1");
    expect(client.listBlockChildren).toHaveBeenCalledWith("container-1");
  });

  it("prewarms page indexes once and reuses them for later NBE resolution", async () => {
    const ref = "p20260328153045-k7_b7k2m9";
    const href = `obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=${ref}`;
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, "paragraph", false)),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makeLinkedParagraph("block-1", href, "A")] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await repo.prewarmNbePageIndex("p20260328153045-k7");
    await repo.prewarmNbePageIndex("p20260328153045-k7");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", false);

    expect(resolved.blockId).toBe("block-1");
    expect(client.searchDatabases).toHaveBeenCalledTimes(1);
    expect(client.queryDatabaseByNbeId).toHaveBeenCalledTimes(1);
    expect(client.listBlockChildren).toHaveBeenCalledTimes(1);
  });

  it("resolves an NBE ref from plain_text when the page stores a naked URI instead of a Notion link", async () => {
    const href = "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9";
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makePlainTextParagraph("block-1", href)] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);

    expect(resolved.blockId).toBe("block-1");
  });

  it("resolves an NBE ref from markdown-style plain_text links", async () => {
    const href = "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9";
    const markdownText = `[🔗OB](${href})`;
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) =>
        id === "page-1" ? [makePlainTextParagraph("block-1", `前缀 ${markdownText} 后缀`)] : []
      ),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);

    expect(resolved.blockId).toBe("block-1");
  });

  it("resolves an NBE ref from Shortlink Studio rich-text links", async () => {
    const ref = "p20260328153045-k7_b7k2m9";
    const href = makeShortlinkNbeUrl(ref);
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makeLinkedParagraph("block-1", href)] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);

    expect(resolved.blockId).toBe("block-1");
  });

  it("resolves an NBE ref from markdown-style Shortlink Studio plain_text links", async () => {
    const ref = "p20260328153045-k7_b7k2m9";
    const href = makeShortlinkNbeUrl(ref);
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) =>
        id === "page-1" ? [makePlainTextParagraph("block-1", `前缀 [🔗OB](${href}) 后缀`)] : []
      ),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);

    expect(resolved.blockId).toBe("block-1");
  });

  it("deduplicates refs within a single block when both link metadata and plain_text point to the same NBE ref", async () => {
    const href = "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9";
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) =>
        id === "page-1"
          ? [makeMixedNbeParagraph("block-1", href, `[🔗OB](${href})`)]
          : []
      ),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true);

    expect(resolved.blockId).toBe("block-1");
  });

  it("reuses persisted page indexes across repository instances", async () => {
    const resolutionStore = createResolutionStore({
      tkn: {
        "p20260328153045-k7": {
          pageNbeId: "p20260328153045-k7",
          pageId: "page-1",
          blocks: {
            b7k2m9: "block-1",
          },
          resolvedAt: Date.now(),
        },
      },
    });
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "block-1" ? "paragraph" : "page", false)),
      listBlockChildren: vi.fn(async () => []),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn", resolutionStore);
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", false);

    expect(resolved.blockId).toBe("block-1");
    expect(client.searchDatabases).not.toHaveBeenCalled();
    expect(client.queryDatabaseByNbeId).not.toHaveBeenCalled();
  });

  it("reuses a persisted resolved target before consulting page indexes", async () => {
    const resolutionStore = createResolutionStore(
      {
        tkn: {
          "p20260328153045-k7": {
            pageNbeId: "p20260328153045-k7",
            pageId: "page-1",
            blocks: {
              b7k2m9: "block-from-page-index",
            },
            resolvedAt: Date.now(),
          },
        },
      },
      {
        tkn: {
          "p20260328153045-k7_b7k2m9": {
            ref: "p20260328153045-k7_b7k2m9",
            pageNbeId: "p20260328153045-k7",
            blockNbeId: "b7k2m9",
            pageId: "page-1",
            blockId: "block-from-target",
            resolvedAt: Date.now(),
          },
        },
      },
    );
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, "paragraph", false)),
      listBlockChildren: vi.fn(async () => []),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn", resolutionStore);
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", false);

    expect(resolved.blockId).toBe("block-from-target");
    expect(client.searchDatabases).not.toHaveBeenCalled();
    expect(client.queryDatabaseByNbeId).not.toHaveBeenCalled();
  });

  it("refreshes persisted resolved targets after resolving through page indexes", async () => {
    const resolutionStore = createResolutionStore({
      tkn: {
        "p20260328153045-k7": {
          pageNbeId: "p20260328153045-k7",
          pageId: "page-1",
          blocks: {
            b7k2m9: "block-1",
          },
          resolvedAt: Date.now(),
        },
      },
    });
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, "paragraph", false)),
      listBlockChildren: vi.fn(async () => []),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn", resolutionStore);
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", false);

    expect(resolved.blockId).toBe("block-1");
    expect(resolutionStore.setResolvedTarget).toHaveBeenCalledWith("tkn", {
      ref: "p20260328153045-k7_b7k2m9",
      pageNbeId: "p20260328153045-k7",
      blockNbeId: "b7k2m9",
      pageId: "page-1",
      blockId: "block-1",
      resolvedAt: expect.any(Number),
    });
  });

  it("invalidates a stale resolved target and falls back to NBE resolution once", async () => {
    const ref = "p20260328153045-k7_b7k2m9";
    const href = `obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=${ref}`;
    const resolutionStore = createResolutionStore(
      {
        tkn: {
          "p20260328153045-k7": {
            pageNbeId: "p20260328153045-k7",
            pageId: "page-1",
            blocks: {
              b7k2m9: "block-fresh",
            },
            resolvedAt: Date.now(),
          },
        },
      },
      {
        tkn: {
          [ref]: {
            ref,
            pageNbeId: "p20260328153045-k7",
            blockNbeId: "b7k2m9",
            pageId: "page-1",
            blockId: "stale-block",
            resolvedAt: Date.now(),
          },
        },
      },
    );
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => {
        if (id === "stale-block") {
          throw new PluginError("NOT_FOUND", "missing", 404);
        }
        return makeBlock(id, "paragraph", false);
      }),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makeLinkedParagraph("block-fresh", href)] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn", resolutionStore);
    const resolved = await repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", false);

    expect(resolved.blockId).toBe("block-fresh");
    expect(resolutionStore.deleteResolvedTarget).toHaveBeenCalledWith("tkn", ref);
    expect(resolutionStore.setResolvedTarget).toHaveBeenCalledWith("tkn", {
      ref,
      pageNbeId: "p20260328153045-k7",
      blockNbeId: "b7k2m9",
      pageId: "page-1",
      blockId: "block-fresh",
      resolvedAt: expect.any(Number),
    });
    expect(client.searchDatabases).not.toHaveBeenCalled();
    expect(client.queryDatabaseByNbeId).not.toHaveBeenCalled();
  });

  it("throws when no page matches the requested NBE ID", async () => {
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => []),
      getBlock: vi.fn(),
      listBlockChildren: vi.fn(),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("missing-page", "b7k2m9", true)).rejects.toThrow("NBE page not found");
  });

  it("throws when multiple pages share the same NBE ID", async () => {
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1"), makeDatabase("db-2")]),
      queryDatabaseByNbeId: vi.fn(async (databaseId: string) =>
        databaseId === "db-1" ? [makePage("page-1", "p20260328153045-k7")] : [makePage("page-2", "p20260328153045-k7")],
      ),
      getBlock: vi.fn(),
      listBlockChildren: vi.fn(),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true)).rejects.toThrow("Duplicate NBE ID");
  });

  it("throws when no block on the resolved page matches the NBE ref", async () => {
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makeBlock("block-1", "paragraph", false)] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("p20260328153045-k7", "missing-block", true)).rejects.toThrow(
      "NBE block not found on page",
    );
  });

  it("ignores plain_text obsidian links whose action is not open-ref", async () => {
    const href = "obsidian://notion-block-embed?vault=My%20Vault&action=open-page&nbe=p20260328153045-k7_b7k2m9";
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makePlainTextParagraph("block-1", href)] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true)).rejects.toThrow(
      "NBE block not found on page",
    );
  });

  it("ignores Shortlink Studio links whose decoded NBE action is not open-ref", async () => {
    const href = makeShortlinkNbeUrl("p20260328153045-k7_b7k2m9", "open-page");
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) => (id === "page-1" ? [makePlainTextParagraph("block-1", href)] : [])),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true)).rejects.toThrow(
      "NBE block not found on page",
    );
  });

  it("throws when multiple blocks on the same page match the same NBE ref", async () => {
    const ref = "p20260328153045-k7_b7k2m9";
    const href = `obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=${ref}`;
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) =>
        id === "page-1" ? [makeLinkedParagraph("block-1", href), makeLinkedParagraph("block-2", href)] : []
      ),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true)).rejects.toThrow(
      "Duplicate Block ID on page",
    );
  });

  it("still throws duplicate errors when multiple blocks declare the same ref via plain_text fallback", async () => {
    const href = "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9";
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) =>
        id === "page-1"
          ? [makePlainTextParagraph("block-1", `[🔗OB](${href})`), makePlainTextParagraph("block-2", href)]
          : []
      ),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true)).rejects.toThrow(
      "Duplicate Block ID on page",
    );
  });

  it("still throws duplicate errors when multiple blocks declare the same ref via Shortlink Studio links", async () => {
    const href = makeShortlinkNbeUrl("p20260328153045-k7_b7k2m9");
    const client = {
      searchDatabases: vi.fn(async () => [makeDatabase("db-1")]),
      queryDatabaseByNbeId: vi.fn(async () => [makePage("page-1", "p20260328153045-k7")]),
      getBlock: vi.fn(async (id: string) => makeBlock(id, id === "page-1" ? "page" : "paragraph", id === "page-1")),
      listBlockChildren: vi.fn(async (id: string) =>
        id === "page-1" ? [makeLinkedParagraph("block-1", href), makePlainTextParagraph("block-2", href)] : []
      ),
    };

    const repo = new NotionRepository(client, new AsyncTtlCache(5_000), new Logger(), "tkn");
    await expect(repo.getBlockTreeByNbeRef("p20260328153045-k7", "b7k2m9", true)).rejects.toThrow(
      "Duplicate Block ID on page",
    );
  });
});
