import { Command, Editor } from "obsidian";

export const QUICK_INSERT_NOTION_EMBED_COMMAND_ID = "quick-insert-notion-embed";
export const QUICK_INSERT_NOTION_EMBED_COMMAND_NAME = "Quick insert Notion embed";
export const EMPTY_NOTION_EMBED_CODE_BLOCK = ["```notion-embed", "", "```"].join("\n");

export function insertEmptyNotionEmbed(editor: Editor): void {
  const start = editor.getCursor("from");
  editor.replaceSelection(EMPTY_NOTION_EMBED_CODE_BLOCK);
  editor.setCursor({
    line: start.line + 1,
    ch: 0,
  });
}

export function createQuickInsertNotionEmbedCommand(): Command {
  return {
    id: QUICK_INSERT_NOTION_EMBED_COMMAND_ID,
    name: QUICK_INSERT_NOTION_EMBED_COMMAND_NAME,
    editorCheckCallback: (checking, editor) => {
      if (checking) return true;
      insertEmptyNotionEmbed(editor);
      return true;
    },
  };
}
