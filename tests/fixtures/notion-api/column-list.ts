import { NotionApiBlockTree } from "../../../src/core/models";

export const notionColumnListTree: NotionApiBlockTree = {
  block: {
    object: "block",
    id: "column-list-root",
    type: "column_list",
    has_children: true,
    column_list: {},
  },
  children: [
    {
      block: {
        object: "block",
        id: "column-left",
        type: "column",
        has_children: true,
        column: {
          width_ratio: 0.6,
        },
      },
      children: [
        {
          block: {
            object: "block",
            id: "column-left-text",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", plain_text: "Left column", text: { content: "Left column" } }],
            },
          },
          children: [],
        },
      ],
    },
    {
      block: {
        object: "block",
        id: "column-right",
        type: "column",
        has_children: true,
        column: {
          width_ratio: 0.4,
        },
      },
      children: [
        {
          block: {
            object: "block",
            id: "column-right-text",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", plain_text: "Right column", text: { content: "Right column" } }],
            },
          },
          children: [],
        },
      ],
    },
  ],
};
