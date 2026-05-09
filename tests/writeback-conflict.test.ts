import { describe, expect, it, vi } from "vitest";
import { Logger } from "../src/core/logger";
import { EmbedBlockNode, NotionApiBlock } from "../src/core/models";
import { WritebackService } from "../src/writeback/service";

function makeNode(lastEditedTime: string): EmbedBlockNode {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    type: "paragraph",
    richText: [{ plainText: "old" }],
    children: [],
    props: {},
    meta: {
      sourcePageId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      lastEditedTime,
      notionTypeData: { color: "default" },
    },
    capabilities: {
      writable: true,
      writableType: "paragraph",
    },
  };
}

function makeBlock(lastEditedTime: string): NotionApiBlock {
  return {
    object: "block",
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    type: "paragraph",
    last_edited_time: lastEditedTime,
    paragraph: {
      rich_text: [],
    },
  };
}

describe("WritebackService conflict handling", () => {
  it("rejects save on conflict when policy=fail_on_conflict", async () => {
    const client = {
      getBlock: vi.fn(async () => makeBlock("2026-03-20T12:00:00.000Z")),
      updateBlock: vi.fn(async () => makeBlock("2026-03-20T12:00:00.000Z")),
    };
    const service = new WritebackService(client, new Logger(), "fail_on_conflict", vi.fn());

    await expect(service.updateBlockText(makeNode("2026-03-20T11:00:00.000Z"), "new")).rejects.toThrow(
      "Remote content changed",
    );
    expect(client.updateBlock).not.toHaveBeenCalled();
  });

  it("updates normally when no conflict", async () => {
    const client = {
      getBlock: vi.fn(async () => makeBlock("2026-03-20T11:00:00.000Z")),
      updateBlock: vi.fn(async () => makeBlock("2026-03-20T12:00:00.000Z")),
    };
    const invalidate = vi.fn();
    const service = new WritebackService(client, new Logger(), "fail_on_conflict", invalidate);

    await service.updateBlockText(makeNode("2026-03-20T11:00:00.000Z"), "new");
    expect(client.updateBlock).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
