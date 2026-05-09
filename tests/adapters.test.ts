import { describe, expect, it } from "vitest";
import { NotionApiBlockTree } from "../src/core/models";
import { toEmbedNodeTree } from "../src/notion/adapters";
import { inlineEquationParagraphTree, standaloneEquationTree } from "./fixtures/notion-api/equation";
import { duplicateSyncedBlock, originalSyncedBlock, syncedBlockTree } from "./fixtures/notion-api/synced-block";

describe("toEmbedNodeTree", () => {
  it("maps notion image block url and caption", () => {
    const tree: NotionApiBlockTree = {
      block: {
        object: "block",
        id: "11111111-1111-1111-1111-111111111111",
        type: "image",
        image: {
          type: "external",
          external: {
            url: "https://example.com/a.png",
          },
          caption: [
            {
              type: "text",
              plain_text: "hello image",
              text: { content: "hello image" },
            },
          ],
        },
      },
      children: [],
    };

    const mapped = toEmbedNodeTree(tree, "22222222-2222-2222-2222-222222222222");
    expect(mapped.props.imageUrl).toBe("https://example.com/a.png");
    expect(mapped.richText[0]?.plainText).toBe("hello image");
  });

  it("maps notion column width ratio", () => {
    const tree: NotionApiBlockTree = {
      block: {
        object: "block",
        id: "col-1",
        type: "column",
        column: {
          width_ratio: 0.6,
        },
      },
      children: [],
    };

    const mapped = toEmbedNodeTree(tree, "22222222-2222-2222-2222-222222222222");
    expect(mapped.type).toBe("column");
    expect(mapped.props.columnWidthRatio).toBe(0.6);
  });

  it("maps equation rich text expression", () => {
    const tree: NotionApiBlockTree = inlineEquationParagraphTree;

    const mapped = toEmbedNodeTree(tree, "page-1");
    expect(mapped.richText[1]?.sourceType).toBe("equation");
    expect(mapped.richText[1]?.equationExpression).toBe("E=mc^2");
  });

  it("maps standalone equation block expression", () => {
    const tree: NotionApiBlockTree = standaloneEquationTree;

    const mapped = toEmbedNodeTree(tree, "page-1");
    expect(mapped.type).toBe("equation");
    expect(mapped.props.equationExpression).toBe("\\int_0^1 x^2 dx");
  });

  it("maps synced block metadata for original and duplicate blocks", () => {
    const originalTree: NotionApiBlockTree = { block: originalSyncedBlock, children: [] };
    const duplicateTree: NotionApiBlockTree = { block: duplicateSyncedBlock, children: [] };

    const original = toEmbedNodeTree(originalTree, "page-1");
    const duplicate = toEmbedNodeTree(duplicateTree, "page-1");

    expect(original.type).toBe("synced_block");
    expect(original.props.syncedFromBlockId).toBeNull();
    expect(duplicate.type).toBe("synced_block");
    expect(duplicate.props.syncedFromBlockId).toBe("synced-source");
  });

  it("derives parent meta and action capabilities for writable text/list blocks", () => {
    const tree: NotionApiBlockTree = {
      block: {
        object: "block",
        id: "todo-1",
        type: "to_do",
        parent: {
          type: "block_id",
          block_id: "parent-block",
        },
        to_do: {
          checked: true,
          rich_text: [
            {
              type: "text",
              plain_text: "simple task",
              text: { content: "simple task" },
              annotations: { color: "default" },
            },
          ],
        },
      },
      children: [],
    };

    const mapped = toEmbedNodeTree(tree, "page-1");
    expect(mapped.meta.parentId).toBe("parent-block");
    expect(mapped.meta.parentType).toBe("block_id");
    expect(mapped.capabilities.canEditText).toBe(true);
    expect(mapped.capabilities.canInsertSiblingBelow).toBe(true);
    expect(mapped.capabilities.canDeleteSelf).toBe(true);
    expect(mapped.capabilities.canToggleTodo).toBe(true);
    expect(mapped.capabilities.canOpenInNotion).toBe(true);
  });

  it("disables plain text edit when inline rich text is complex", () => {
    const tree: NotionApiBlockTree = {
      block: {
        object: "block",
        id: "p1",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              plain_text: "styled",
              text: { content: "styled" },
              annotations: { bold: true, color: "default" },
            },
          ],
        },
      },
      children: [],
    };

    const mapped = toEmbedNodeTree(tree, "page-1");
    expect(mapped.capabilities.canEditText).toBe(false);
    expect(mapped.capabilities.canOpenInNotion).toBe(true);
  });

  it("allows open in Notion for non-writable toggle blocks", () => {
    const tree: NotionApiBlockTree = {
      block: {
        object: "block",
        id: "toggle-1",
        type: "toggle",
        toggle: {
          rich_text: [
            {
              type: "text",
              plain_text: "Toggle row",
              text: { content: "Toggle row" },
            },
          ],
        },
      },
      children: [],
    };

    const mapped = toEmbedNodeTree(tree, "page-1");
    expect(mapped.capabilities.writable).toBe(false);
    expect(mapped.capabilities.canOpenInNotion).toBe(true);
  });

  it("does not mutate the source notion tree while adapting", () => {
    const tree = JSON.parse(JSON.stringify(syncedBlockTree)) as NotionApiBlockTree;
    const snapshot = JSON.parse(JSON.stringify(tree));

    toEmbedNodeTree(tree, "page-1");

    expect(tree).toEqual(snapshot);
  });
});
