import { afterEach, describe, expect, it, vi } from "vitest";
import { createNode } from "./fixtures/notion-blocks";
import { renderTestEmbed } from "./helpers/render";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEmbed smoke", () => {
  it("renders heading content and footer chrome", () => {
    const root = createNode("heading_2", "Hello");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    expect(container.querySelector("h2")?.textContent).toContain("Hello");
    expect(container.querySelector(".nbe-header")).toBeFalsy();
    expect(container.querySelector(".nbe-footer")).toBeTruthy();
    const urlInput = container.querySelector(".nbe-url-input") as HTMLInputElement | null;
    expect(urlInput?.value).toBe("https://www.notion.so/page#block");
  });

  it("renders content before footer actions", () => {
    const root = createNode("paragraph", "Body");
    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      onApplyUrl: vi.fn(),
    });

    const embed = container.querySelector(".nbe-embed");
    expect(embed).toBeTruthy();
    const children = Array.from(embed?.children ?? []);
    expect(children[0]?.className).toContain("nbe-content");
    expect(children[1]?.className).toContain("nbe-footer");
  });
});
