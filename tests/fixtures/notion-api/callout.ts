import { NotionApiBlock, NotionApiBlockTree, NotionApiRichText } from "../../../src/core/models";

function text(value: string): NotionApiRichText {
  return {
    type: "text",
    plain_text: value,
    text: { content: value },
  };
}

function makeBlock(id: string, type: string, data: Record<string, unknown>, hasChildren = false): NotionApiBlock {
  return {
    object: "block",
    id,
    type,
    has_children: hasChildren,
    [type]: data,
  };
}

function tree(block: NotionApiBlock, children: NotionApiBlockTree[] = []): NotionApiBlockTree {
  return { block, children };
}

const row = (id: string, values: string[]) =>
  tree(
    makeBlock(id, "table_row", {
      cells: values.map((value) => [text(value)]),
    }),
  );

export const calloutContentTree: NotionApiBlockTree = tree(
  makeBlock(
    "callout-root",
    "callout",
    {
      rich_text: [text("Root callout")],
      icon: { type: "emoji", emoji: "💡" },
      color: "orange_background",
    },
    true,
  ),
  [
    tree(
      makeBlock("callout-title", "heading_3", {
        rich_text: [text("Callout title")],
      }),
    ),
    tree(
      makeBlock("image-1", "image", {
        type: "external",
        external: { url: "https://example.com/notion-image.png" },
        caption: [text("OCR Notes")],
      }),
    ),
    tree(
      makeBlock("toggle-1", "toggle", { rich_text: [text("Toggle section")] }, true),
      [tree(makeBlock("toggle-child", "paragraph", { rich_text: [text("Toggle child")] }))],
    ),
    tree(
      makeBlock("list-1", "bulleted_list_item", { rich_text: [text("List item")] }, true),
      [
        tree(
          makeBlock("list-2", "bulleted_list_item", { rich_text: [text("Deep list item")] }, true),
          [tree(makeBlock("list-3", "numbered_list_item", { rich_text: [text("Deep numbered item")] }))],
        ),
      ],
    ),
    tree(makeBlock("equation-1", "equation", { expression: "a^2 + b^2 = c^2" })),
    tree(
      makeBlock(
        "table-1",
        "table",
        {
          table_width: 2,
          has_column_header: true,
          has_row_header: false,
        },
        true,
      ),
      [row("row-1", ["Column A", "Column B"]), row("row-2", ["Value A", "Value B"])],
    ),
    tree(makeBlock("quote-1", "quote", { rich_text: [text("Quote from Notion")] })),
    tree(makeBlock("divider-1", "divider", {})),
    tree(
      makeBlock(
        "callout-nested",
        "callout",
        {
          rich_text: [],
          icon: { type: "emoji", emoji: "⭐" },
          color: "blue_background",
        },
        true,
      ),
      [tree(makeBlock("nested-body", "paragraph", { rich_text: [text("Nested content")] }))],
    ),
    tree(
      makeBlock(
        "unsupported-ai",
        "unsupported",
        { block_type: "ai_block" },
        true,
      ),
    ),
    tree(
      makeBlock(
        "unsupported-button",
        "unsupported",
        { block_type: "button" },
        true,
      ),
    ),
  ],
);
