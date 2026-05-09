import { NotionApiBlockTree } from "../../../src/core/models";

export const todoTree: NotionApiBlockTree = {
  block: {
    object: "block",
    id: "todo-1",
    type: "to_do",
    to_do: {
      checked: true,
      rich_text: [{ type: "text", plain_text: "Simple task", text: { content: "Simple task" } }],
    },
  },
  children: [],
};
