import { afterEach, describe, expect, it, vi } from "vitest";
import { toEmbedNodeTree } from "../src/notion/adapters";
import { todoTree } from "./fixtures/notion-api/todo";
import { createNode } from "./fixtures/notion-blocks";
import { renderTestEmbed } from "./helpers/render";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEmbed row actions", () => {
  it("renders floating row actions only for writable capabilities", () => {
    const root = createNode("paragraph", "Editable paragraph");
    root.capabilities = {
      writable: true,
      writableType: "paragraph",
      canEditText: true,
    };

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const host = container.querySelector(".nbe-row-actions-host");
    const actions = container.querySelector(".nbe-row-actions");
    const buttons = Array.from(container.querySelectorAll(".nbe-row-action-btn")) as HTMLButtonElement[];
    expect(host).toBeTruthy();
    expect(host?.classList.contains("nbe-row-interaction-surface")).toBe(true);
    expect(actions).toBeTruthy();
    expect(buttons.length).toBe(1);
    expect(buttons.every((button) => button.textContent === "")).toBe(true);
  });

  it("uses the tree row as the interaction surface for list row actions", () => {
    const root = createNode("bulleted_list_item", "List row");
    root.capabilities = {
      writable: true,
      writableType: "bulleted_list_item",
      canInsertSiblingBelow: true,
      canOpenInNotion: true,
    };

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      onOpenInNotion: vi.fn(),
      onInsertSiblingBelow: vi.fn(),
    });

    const row = container.querySelector(".nbe-list-row");
    expect(row?.classList.contains("nbe-row-actions-host")).toBe(true);
    expect(row?.classList.contains("nbe-row-interaction-surface")).toBe(true);
  });

  it("renders an Open in Notion row action for openable blocks", () => {
    const root = createNode("paragraph", "Openable paragraph");
    root.capabilities = {
      writable: false,
      canOpenInNotion: true,
    };
    const onOpenInNotion = vi.fn();

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page-slug-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?source=copy_link#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      onOpenInNotion,
    });

    const button = container.querySelector(".nbe-row-action-btn.is-open-in-notion") as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.title).toBe("Open in Notion");
  });

  it("does not render row actions for read-only blocks", () => {
    const root = createNode("paragraph", "Read only");

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.querySelector(".nbe-row-actions")).toBeFalsy();
  });

  it("allows writable to-do checkboxes to trigger updates", async () => {
    const root = toEmbedNodeTree(todoTree, "page-1");
    root.props.checked = false;
    root.meta.notionTypeData = {
      checked: false,
      color: "default",
      rich_text: [
        {
          type: "text",
          plain_text: "Task",
          text: { content: "Task", link: null },
          annotations: { color: "default" },
        },
      ],
    };
    const onToggleTodo = vi.fn(async () => undefined);

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      onToggleTodo,
    });

    const checkbox = container.querySelector(".nbe-todo input") as HTMLInputElement | null;
    expect(checkbox?.disabled).toBe(false);
    if (checkbox) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await Promise.resolve();

    expect(onToggleTodo).toHaveBeenCalledWith(root, true);
  });
});
