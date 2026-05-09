import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_NOTION_EMBED_CODE_BLOCK,
  QUICK_INSERT_NOTION_EMBED_COMMAND_ID,
  QUICK_INSERT_NOTION_EMBED_COMMAND_NAME,
  createQuickInsertNotionEmbedCommand,
  insertEmptyNotionEmbed,
} from "../src/embed/quick-insert-command";

describe("quick insert notion embed command", () => {
  it("inserts an empty notion-embed code block and moves the cursor inside it", () => {
    const editor = {
      getCursor: vi.fn(() => ({ line: 4, ch: 7 })),
      replaceSelection: vi.fn(),
      setCursor: vi.fn(),
    };

    insertEmptyNotionEmbed(editor as never);

    expect(editor.replaceSelection).toHaveBeenCalledWith(EMPTY_NOTION_EMBED_CODE_BLOCK);
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 5, ch: 0 });
  });

  it("builds the expected command palette entry", () => {
    const command = createQuickInsertNotionEmbedCommand();
    const editor = {
      getCursor: vi.fn(() => ({ line: 1, ch: 0 })),
      replaceSelection: vi.fn(),
      setCursor: vi.fn(),
    };

    expect(command.id).toBe(QUICK_INSERT_NOTION_EMBED_COMMAND_ID);
    expect(command.name).toBe(QUICK_INSERT_NOTION_EMBED_COMMAND_NAME);
    expect(command.editorCheckCallback?.(true, editor as never, {} as never)).toBe(true);
    expect(editor.replaceSelection).not.toHaveBeenCalled();

    expect(command.editorCheckCallback?.(false, editor as never, {} as never)).toBe(true);
    expect(editor.replaceSelection).toHaveBeenCalledWith(EMPTY_NOTION_EMBED_CODE_BLOCK);
  });
});
