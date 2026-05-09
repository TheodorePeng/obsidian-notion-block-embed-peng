import { NotionApiBlockTree } from "../../../src/core/models";

export const toggleListTree: NotionApiBlockTree = {
  block: {
    object: "block",
    id: "toggle-root",
    type: "toggle",
    has_children: true,
    toggle: {
      rich_text: [{ type: "text", plain_text: "Section", text: { content: "Section" } }],
    },
  },
  children: [
    {
      block: {
        object: "block",
        id: "toggle-bullet",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", plain_text: "Bullet item", text: { content: "Bullet item" } }],
        },
      },
      children: [],
    },
    {
      block: {
        object: "block",
        id: "toggle-child-toggle",
        type: "toggle",
        has_children: true,
        toggle: {
          rich_text: [{ type: "text", plain_text: "Nested toggle", text: { content: "Nested toggle" } }],
        },
      },
      children: [
        {
          block: {
            object: "block",
            id: "toggle-child-paragraph",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", plain_text: "Nested paragraph", text: { content: "Nested paragraph" } }],
            },
          },
          children: [],
        },
      ],
    },
  ],
};
