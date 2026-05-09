import { NotionApiBlockTree } from "../../../src/core/models";

export const inlineEquationParagraphTree: NotionApiBlockTree = {
  block: {
    object: "block",
    id: "paragraph-equation",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          plain_text: "Energy: ",
          text: { content: "Energy: " },
        },
        {
          type: "equation",
          plain_text: "E=mc^2",
          equation: {
            expression: "E=mc^2",
          },
        },
      ],
    },
  },
  children: [],
};

export const standaloneEquationTree: NotionApiBlockTree = {
  block: {
    object: "block",
    id: "equation-block",
    type: "equation",
    equation: {
      expression: "\\int_0^1 x^2 dx",
    },
  },
  children: [],
};
