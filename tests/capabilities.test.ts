import { describe, expect, it } from "vitest";
import { NotionApiBlock } from "../src/core/models";
import { getBlockCapabilities, resolveWritableType } from "../src/writeback/capabilities";

function makeBlock(type: string, richText: unknown[] = []): NotionApiBlock {
  return {
    object: "block",
    id: `${type}-1`,
    type,
    [type]: {
      rich_text: richText,
    },
  };
}

describe("writeback capabilities", () => {
  it("resolves writable types from a single strategy table", () => {
    expect(resolveWritableType("paragraph")).toBe("paragraph");
    expect(resolveWritableType("to_do")).toBe("to_do");
    expect(resolveWritableType("toggle")).toBeNull();
    expect(resolveWritableType("image")).toBeNull();
  });

  it("allows plain text editing only for simple plain text blocks", () => {
    const simple = makeBlock("paragraph", [
      {
        type: "text",
        plain_text: "Simple",
        text: { content: "Simple" },
        annotations: { color: "default" },
      },
    ]);
    const complex = makeBlock("paragraph", [
      {
        type: "text",
        plain_text: "Styled",
        text: { content: "Styled" },
        annotations: { bold: true, color: "default" },
      },
    ]);

    expect(getBlockCapabilities(simple, 0).canEditText).toBe(true);
    expect(getBlockCapabilities(complex, 0).canEditText).toBe(false);
  });

  it("derives list mutation capabilities from the same policy entry", () => {
    const bullet = makeBlock("bulleted_list_item", [
      {
        type: "text",
        plain_text: "Item",
        text: { content: "Item" },
      },
    ]);

    expect(getBlockCapabilities(bullet, 0)).toMatchObject({
      writable: true,
      writableType: "bulleted_list_item",
      canInsertSiblingBelow: true,
      canDeleteSelf: true,
      canOpenInNotion: true,
    });
    expect(getBlockCapabilities(bullet, 1).canDeleteSelf).toBe(false);
  });

  it("keeps toggle non-writable while still openable in Notion", () => {
    const toggle = makeBlock("toggle", [
      {
        type: "text",
        plain_text: "Toggle",
        text: { content: "Toggle" },
      },
    ]);

    expect(getBlockCapabilities(toggle, 0)).toEqual({
      writable: false,
      canOpenInNotion: true,
    });
  });

  it("enables todo-specific toggling without over-granting other actions", () => {
    const todo = {
      object: "block",
      id: "todo-1",
      type: "to_do",
      to_do: {
        checked: false,
        rich_text: [
          {
            type: "text",
            plain_text: "Task",
            text: { content: "Task" },
            annotations: { color: "default" },
          },
        ],
      },
    } as NotionApiBlock;

    expect(getBlockCapabilities(todo, 0)).toMatchObject({
      writable: true,
      writableType: "to_do",
      canEditText: true,
      canInsertSiblingBelow: true,
      canDeleteSelf: true,
      canToggleTodo: true,
      canOpenInNotion: true,
    });
  });
});
