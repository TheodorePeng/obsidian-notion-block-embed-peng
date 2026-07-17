import { describe, expect, it } from "vitest";
import { toEmbedNodeTree } from "../src/notion/adapters";
import { calloutContentTree } from "./fixtures/notion-api/callout";

describe("callout and table adapters", () => {
  it("maps callout appearance, table metadata, cells, and unsupported block type", () => {
    const mapped = toEmbedNodeTree(calloutContentTree, "page-1");
    const table = mapped.children.find((child) => child.type === "table");
    const firstRow = table?.children[0];
    const unsupported = mapped.children.find((child) => child.type === "unsupported");

    expect(mapped.type).toBe("callout");
    expect((mapped.props as Record<string, unknown>).calloutColor).toBe("orange_background");
    expect((mapped.props as Record<string, unknown>).calloutIcon).toEqual({ kind: "emoji", value: "💡" });
    expect((table?.props as Record<string, unknown>).tableWidth).toBe(2);
    expect((table?.props as Record<string, unknown>).tableHasColumnHeader).toBe(true);
    expect((firstRow?.props as Record<string, unknown>).tableCells).toEqual([
      [{ plainText: "Column A", href: null, sourceType: "text", equationExpression: undefined, annotations: undefined }],
      [{ plainText: "Column B", href: null, sourceType: "text", equationExpression: undefined, annotations: undefined }],
    ]);
    expect((unsupported?.props as Record<string, unknown>).unsupportedBlockType).toBe("ai_block");
  });

  it("maps URL-based callout icons and rich-text links in table cells", () => {
    const tree = {
      block: {
        object: "block" as const,
        id: "callout-url-icon",
        type: "callout",
        has_children: true,
        callout: {
          rich_text: [],
          icon: { type: "external", external: { url: "https://example.com/icon.png" } },
          color: "blue_background",
        },
      },
      children: [
        {
          block: {
            object: "block" as const,
            id: "table-url-cell",
            type: "table",
            has_children: true,
            table: { table_width: 1, has_column_header: false, has_row_header: false },
          },
          children: [
            {
              block: {
                object: "block" as const,
                id: "row-url-cell",
                type: "table_row",
                has_children: false,
                table_row: {
                  cells: [[{ type: "text", plain_text: "linked", href: "https://example.com" }]],
                },
              },
              children: [],
            },
          ],
        },
      ],
    };
    const mapped = toEmbedNodeTree(tree, "page-1");
    const tableRow = mapped.children[0].children[0];

    expect(mapped.props.calloutIcon).toEqual({
      kind: "image",
      url: "https://example.com/icon.png",
      alt: "Callout icon",
    });
    expect(tableRow.props.tableCells?.[0][0].href).toBe("https://example.com");
  });
});
