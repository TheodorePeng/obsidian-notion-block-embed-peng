import { describe, expect, it, vi } from "vitest";
import { Logger } from "../src/core/logger";
import { NotionApiBlock } from "../src/core/models";
import { NotionChildrenHydrator } from "../src/notion/children-hydration";

function makeParagraph(id: string, hasChildren = false): NotionApiBlock {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: hasChildren,
    paragraph: {
      rich_text: [{ type: "text", plain_text: id, text: { content: id } }],
    },
  };
}

function makeUnsupported(id: string, blockType: string): NotionApiBlock {
  return {
    object: "block",
    id,
    type: "unsupported",
    has_children: true,
    unsupported: {
      block_type: blockType,
    },
  };
}

function makeCallout(id: string): NotionApiBlock {
  return {
    object: "block",
    id,
    type: "callout",
    has_children: true,
    callout: {
      rich_text: [],
      icon: null,
      color: "blue_background",
    },
  };
}

describe("NotionChildrenHydrator", () => {
  it("keeps unsupported blocks while skipping their inaccessible descendants", async () => {
    const callout = makeCallout("callout-1");
    const unsupported = makeUnsupported("ai-block-1", "ai_block");
    const sibling = makeParagraph("sibling-1");
    const client = {
      listBlockChildren: vi.fn(async (id: string) => {
        if (id === callout.id) return [unsupported, sibling];
        if (id === unsupported.id) throw new Error("unexpected unsupported children request");
        return [];
      }),
    };
    const hydrator = new NotionChildrenHydrator(client, new Logger());

    const children = await hydrator.loadChildrenForBlock(callout, 1);

    expect(children.map((child) => child.block.id)).toEqual([unsupported.id, sibling.id]);
    expect(children[0]?.children).toEqual([]);
    expect(client.listBlockChildren).toHaveBeenCalledTimes(1);
    expect(client.listBlockChildren).not.toHaveBeenCalledWith(unsupported.id);
  });

  it("propagates children errors for supported blocks", async () => {
    const callout = makeCallout("callout-2");
    const supportedChild = makeParagraph("paragraph-2", true);
    const client = {
      listBlockChildren: vi.fn(async (id: string) => {
        if (id === callout.id) return [supportedChild];
        throw new Error("Notion permission failure");
      }),
    };
    const hydrator = new NotionChildrenHydrator(client, new Logger());

    await expect(hydrator.loadChildrenForBlock(callout, 1)).rejects.toThrow("Notion permission failure");
  });
});
