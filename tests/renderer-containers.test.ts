import { describe, expect, it } from "vitest";
import { toEmbedNodeTree } from "../src/notion/adapters";
import { renderTestEmbed } from "./helpers/render";
import { calloutContentTree } from "./fixtures/notion-api/callout";

describe("renderEmbed container blocks", () => {
  it("renders a complete callout tree with table, divider, nested callout, and precise unsupported placeholders", () => {
    const root = toEmbedNodeTree(calloutContentTree, "page-1");
    const { container } = renderTestEmbed(root);

    const callout = container.querySelector(".nbe-callout[data-nbe-callout-color='orange_background']");
    const table = container.querySelector("table.nbe-table");
    const nested = container.querySelector(".nbe-callout[data-nbe-callout-color='blue_background']");
    const unsupported = container.querySelector(".nbe-unsupported");

    expect(callout).toBeTruthy();
    expect(callout?.querySelector(".nbe-callout-icon")?.textContent).toBe("💡");
    expect(callout?.textContent).toContain("Root callout");
    expect(callout?.textContent).toContain("Callout title");
    expect(table?.querySelectorAll("th")).toHaveLength(2);
    expect(table?.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector("hr.nbe-divider")).toBeTruthy();
    expect(nested?.textContent).toContain("Nested content");
    expect(unsupported?.textContent).toContain("ai_block");
    expect(unsupported?.textContent).toContain("Notion API");
    expect(container.textContent).not.toContain("Unsupported block type: callout");
  });

  it("keeps the callout shell and own text when children are globally hidden", () => {
    const root = toEmbedNodeTree(calloutContentTree, "page-1");
    const { container } = renderTestEmbed(root, { showChildren: false });

    expect(container.querySelector(".nbe-callout")).toBeTruthy();
    expect(container.textContent).toContain("Root callout");
    expect(container.textContent).not.toContain("Callout title");
    expect(container.querySelector("table.nbe-table")).toBeFalsy();
  });
});
