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
});
