import { describe, expect, it, vi } from "vitest";
import { Logger } from "../src/core/logger";
import { EmbedBlockNode, NotionApiBlock } from "../src/core/models";
import { WritebackService } from "../src/writeback/service";

function makeNode(type: EmbedBlockNode["type"]): EmbedBlockNode {
  return {
    id: "block-1",
    type,
    richText: [{ plainText: type === "to_do" ? "todo item" : "bullet item", sourceType: "text" }],
    children: [],
    props: { checked: type === "to_do" ? true : undefined },
    meta: {
      sourcePageId: "page-1",
      parentId: "parent-1",
      parentType: "block_id",
      notionTypeData: {
        color: "default",
        checked: true,
        rich_text: [
          {
            type: "text",
            plain_text: type === "to_do" ? "todo item" : "bullet item",
            text: { content: type === "to_do" ? "todo item" : "bullet item", link: null },
            annotations: { color: "default" },
          },
        ],
      },
    },
    capabilities: {
      writable: true,
      writableType: type as EmbedBlockNode["capabilities"]["writableType"],
      canInsertSiblingBelow: type === "bulleted_list_item" || type === "to_do",
      canDeleteSelf: type === "bulleted_list_item" || type === "to_do",
      canToggleTodo: type === "to_do",
    },
  };
}

function makeBlock(id: string): NotionApiBlock {
  return {
    object: "block",
    id,
    type: "paragraph",
    last_edited_time: "2026-03-21T00:00:00.000Z",
    paragraph: {
      rich_text: [],
    },
  };
}

describe("WritebackService list actions", () => {
  it("inserts a sibling below the current list item", async () => {
    const client = {
      getBlock: vi.fn(),
      updateBlock: vi.fn(async () => makeBlock("block-1")),
      appendBlockChildren: vi.fn(async () => [makeBlock("new-sibling")]),
      deleteBlock: vi.fn(async () => makeBlock("block-1")),
    };
    const invalidate = vi.fn();
    const service = new WritebackService(client, new Logger(), "none", invalidate);

    const inserted = await service.insertSiblingBelow(makeNode("bulleted_list_item"));
    expect(inserted).toHaveLength(1);
    expect(client.appendBlockChildren).toHaveBeenCalledWith(
      "parent-1",
      expect.arrayContaining([expect.objectContaining({ type: "bulleted_list_item" })]),
      "block-1",
    );
    expect(invalidate).toHaveBeenCalled();
  });

  it("deletes only a leaf list item", async () => {
    const client = {
      getBlock: vi.fn(),
      updateBlock: vi.fn(async () => makeBlock("block-1")),
      appendBlockChildren: vi.fn(async () => [makeBlock("new-sibling")]),
      deleteBlock: vi.fn(async () => makeBlock("block-1")),
    };
    const service = new WritebackService(client, new Logger(), "none", vi.fn());
    const node = makeNode("bulleted_list_item");
    node.children = [{ ...makeNode("bulleted_list_item"), id: "child-1" }];
    node.capabilities.canDeleteSelf = false;

    await expect(service.deleteBlockNode(node)).rejects.toThrow("leaf list items");
    expect(client.deleteBlock).not.toHaveBeenCalled();
  });

  it("updates a to-do checked state via block patch", async () => {
    const client = {
      getBlock: vi.fn(),
      updateBlock: vi.fn(async () => makeBlock("block-1")),
      appendBlockChildren: vi.fn(async () => [makeBlock("new-sibling")]),
      deleteBlock: vi.fn(async () => makeBlock("block-1")),
    };
    const service = new WritebackService(client, new Logger(), "none", vi.fn());

    await service.updateTodoChecked(makeNode("to_do"), false);
    expect(client.updateBlock).toHaveBeenCalledWith(
      "block-1",
      expect.objectContaining({
        to_do: expect.objectContaining({ checked: false }),
      }),
    );
  });
});
