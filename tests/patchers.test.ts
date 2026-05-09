import { describe, expect, it } from "vitest";
import { EmbedBlockNode } from "../src/core/models";
import {
  buildInsertSiblingBelowChildren,
  buildTodoCheckedPayload,
  buildUpdatePayload,
} from "../src/writeback/patchers";

function createNode(type: EmbedBlockNode["type"], writableType?: string): EmbedBlockNode {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    type,
    richText: [{ plainText: "old text" }],
    children: [],
    props: {},
    meta: {
      sourcePageId: "22222222-2222-2222-2222-222222222222",
      notionTypeData: {
        color: "default",
        language: "typescript",
        checked: true,
        rich_text: [
          {
            type: "text",
            plain_text: "old text",
            text: { content: "old text", link: null },
            annotations: { color: "default" },
          },
        ],
      },
    },
    capabilities: writableType
      ? {
          writable: true,
          writableType: writableType as EmbedBlockNode["capabilities"]["writableType"],
          canEditText: true,
          canInsertSiblingBelow: type === "bulleted_list_item" || type === "to_do",
          canDeleteSelf: type === "bulleted_list_item" || type === "to_do",
          canToggleTodo: type === "to_do",
        }
      : { writable: false },
  };
}

describe("buildUpdatePayload", () => {
  it("builds paragraph payload", () => {
    const payload = buildUpdatePayload(createNode("paragraph", "paragraph"), "hello");
    expect(payload.paragraph).toBeTruthy();
  });

  it("builds code payload with language", () => {
    const payload = buildUpdatePayload(createNode("code", "code"), "const a = 1");
    expect(payload.code).toBeTruthy();
    expect((payload.code as Record<string, unknown>).language).toBe("typescript");
  });

  it("rejects readonly node", () => {
    expect(() => buildUpdatePayload(createNode("bookmark"), "x")).toThrow("read-only");
  });

  it("builds a to-do checked payload without rewriting text", () => {
    const node = createNode("to_do", "to_do");
    const payload = buildTodoCheckedPayload(node, false);
    expect((payload.to_do as Record<string, unknown>).checked).toBe(false);
    expect(((payload.to_do as { rich_text: unknown[] }).rich_text ?? [])).toHaveLength(1);
  });

  it("builds sibling insert children for bullet and to-do items", () => {
    const bullet = buildInsertSiblingBelowChildren(createNode("bulleted_list_item", "bulleted_list_item"));
    const todo = buildInsertSiblingBelowChildren(createNode("to_do", "to_do"));

    expect(bullet[0].type).toBe("bulleted_list_item");
    expect(todo[0].type).toBe("to_do");
    expect((todo[0].to_do as Record<string, unknown>).checked).toBe(false);
  });
});
