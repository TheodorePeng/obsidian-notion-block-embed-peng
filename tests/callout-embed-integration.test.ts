import { describe, expect, it, vi } from "vitest";
import { Logger } from "../src/core/logger";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { AsyncTtlCache } from "../src/embed/cache";
import { loadEmbedFromSource } from "../src/embed/source-loader";
import { NotionApiBlock, NotionApiBlockTree, NotionApiDatabase, NotionApiPage } from "../src/core/models";
import { NotionReadClient } from "../src/notion/children-hydration";
import { NotionRepository } from "../src/notion/repository";
import { renderTestEmbed } from "./helpers/render";
import { calloutContentTree } from "./fixtures/notion-api/callout";

const PAGE_NBE_ID = "p20260707202153-8x";
const BLOCK_NBE_ID = "bt8z2wm";
const ROOT_PAGE_ID = "page-1";
const NBE_URI = `obsidian://notion-block-embed?vault=Test%20Vault&action=open-ref&nbe=${PAGE_NBE_ID}_${BLOCK_NBE_ID}`;
const SHORTLINK_SOURCE = `https://www.shortlink.studio/1/${encodeURIComponent(NBE_URI)}`;

function makePage(): NotionApiPage {
  return {
    object: "page",
    id: ROOT_PAGE_ID,
    properties: {
      "NBE ID": {
        type: "rich_text",
        rich_text: [{ type: "text", plain_text: PAGE_NBE_ID }],
      },
    },
  };
}

function makeDatabase(): NotionApiDatabase {
  return {
    object: "database",
    id: "database-1",
    properties: { "NBE ID": { type: "rich_text" } },
  };
}

function makeFixtureTree(): NotionApiBlockTree {
  const firstChild = calloutContentTree.children[0];
  const firstChildData = firstChild.block.heading_3 as Record<string, unknown>;
  const firstRichText = firstChildData.rich_text as Array<Record<string, unknown>>;
  const linkedTitle: NotionApiBlockTree = {
    ...firstChild,
    block: {
      ...firstChild.block,
      heading_3: {
        ...firstChildData,
        rich_text: firstRichText.map((item) => ({ ...item, href: NBE_URI })),
      },
    },
  };

  const root = {
    ...calloutContentTree,
    children: [linkedTitle, ...calloutContentTree.children.slice(1)],
  };
  const calloutData = root.block.callout as Record<string, unknown>;
  const nestedCallout = root.children.find((child) => child.block.id === "callout-nested");
  const nestedCalloutData = nestedCallout?.block.callout as Record<string, unknown> | undefined;
  const children = nestedCallout && nestedCalloutData
    ? root.children.map((child) =>
        child.block.id === nestedCallout.block.id
          ? {
              ...child,
              block: { ...child.block, callout: { ...nestedCalloutData, color: "orange_background" } },
            }
          : child,
      )
    : root.children;
  return {
    ...root,
    children,
    block: {
      ...root.block,
      callout: { ...calloutData, color: "blue_background" },
    },
  };
}

function createFixtureClient(root: NotionApiBlockTree): {
  client: NotionReadClient;
  listBlockChildren: ReturnType<typeof vi.fn>;
} {
  const blocks = new Map<string, NotionApiBlock>();
  const children = new Map<string, NotionApiBlock[]>();
  const visit = (node: NotionApiBlockTree): void => {
    blocks.set(node.block.id, node.block);
    children.set(node.block.id, node.children.map((child) => child.block));
    node.children.forEach(visit);
  };
  visit(root);

  const page = makePage();
  const getBlock = vi.fn(async (blockId: string) => {
    if (blockId === ROOT_PAGE_ID) return page as unknown as NotionApiBlock;
    const block = blocks.get(blockId);
    if (!block) throw new Error(`Unknown fixture block: ${blockId}`);
    return block;
  });
  const listBlockChildren = vi.fn(async (blockId: string) => {
    if (blockId === ROOT_PAGE_ID) return [root.block];
    if (blockId === "unsupported-ai" || blockId === "unsupported-button") {
      throw new Error(`unsupported children request: ${blockId}`);
    }
    return children.get(blockId) ?? [];
  });

  return {
    client: {
      getBlock,
      listBlockChildren,
      searchDatabases: vi.fn(async () => [makeDatabase()]),
      queryDatabaseByNbeId: vi.fn(async () => [page]),
    },
    listBlockChildren,
  };
}

describe("callout NBE end-to-end pipeline", () => {
  it("promotes the marker heading to its callout and renders the complete API-visible subtree", async () => {
    const root = makeFixtureTree();
    const { client, listBlockChildren } = createFixtureClient(root);
    const logger = new Logger();
    logger.setEnabled(true);
    const debug = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const repository = new NotionRepository(client, new AsyncTtlCache(5_000), logger, "integration-token");

    const loaded = await loadEmbedFromSource(SHORTLINK_SOURCE, DEFAULT_SETTINGS, repository);
    const { container } = renderTestEmbed(loaded.root);

    expect(loaded.parsedTarget.mode).toBe("nbe_uri");
    expect(loaded.root.id).toBe("callout-root");
    expect(loaded.root.type).toBe("callout");
    expect(container.querySelector(".nbe-callout[data-nbe-callout-color='blue_background']")).toBeTruthy();
    expect(container.querySelector("img.nbe-image-img")).toBeTruthy();
    expect(container.textContent).toContain("OCR Notes");
    expect(container.textContent).toContain("Deep list item");
    expect(container.querySelector(".nbe-equation-block .nbe-math")).toBeTruthy();
    expect(container.textContent).toContain("Quote from Notion");
    expect(container.querySelectorAll("table.nbe-table th, table.nbe-table td")).toHaveLength(4);
    expect(container.querySelector("hr.nbe-divider")).toBeTruthy();
    expect(container.querySelector(".nbe-callout[data-nbe-callout-color='orange_background']")).toBeTruthy();
    expect(container.textContent).toContain("Content unavailable via Notion API: ai_block");
    expect(container.textContent).toContain("Content unavailable via Notion API: button");
    expect(container.textContent).not.toContain("Network error");
    expect(listBlockChildren).not.toHaveBeenCalledWith("unsupported-ai");
    expect(listBlockChildren).not.toHaveBeenCalledWith("unsupported-button");
    expect(debug).toHaveBeenCalledWith(expect.stringContaining("nbe-target promoted"));
    expect(debug).toHaveBeenCalledWith(expect.stringContaining("hydration skipped unsupported"));
    debug.mockRestore();
  });
});
