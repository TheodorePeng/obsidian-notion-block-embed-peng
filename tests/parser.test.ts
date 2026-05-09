import { describe, expect, it } from "vitest";
import { buildCanonicalNotionBlockUrl, parseNotionBlockUrl, parseNotionTargetFromSource } from "../src/notion/parser";

describe("parseNotionBlockUrl", () => {
  it("parses notion block url", () => {
    const parsed = parseNotionBlockUrl(
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad?source=copy_link#d05907aae5b146d98eface29afae7844",
    );
    expect(parsed.pageId).toBe("3294cb88-07f2-811a-b8ba-f0a10f76a5ad");
    expect(parsed.blockId).toBe("d05907aa-e5b1-46d9-8efa-ce29afae7844");
  });

  it("throws for non notion url", () => {
    expect(() => parseNotionBlockUrl("https://example.com/foo")).toThrow("Notion URL");
  });

  it("throws when block id missing", () => {
    expect(() =>
      parseNotionBlockUrl("https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad"),
    ).toThrow("Block ID");
  });

  it("builds a canonical notion block url that round-trips through the parser", () => {
    const url = buildCanonicalNotionBlockUrl(
      "3294cb88-07f2-811a-b8ba-f0a10f76a5ad",
      "d05907aa-e5b1-46d9-8efa-ce29afae7844",
    );

    expect(url).toBe("https://www.notion.so/3294cb8807f2811ab8baf0a10f76a5ad#d05907aae5b146d98eface29afae7844");
    expect(parseNotionBlockUrl(url)).toEqual({
      mode: "block_url",
      originalUrl: url,
      pageId: "3294cb88-07f2-811a-b8ba-f0a10f76a5ad",
      blockId: "d05907aa-e5b1-46d9-8efa-ce29afae7844",
    });
  });
});

describe("parseNotionTargetFromSource", () => {
  it("parses empty source as an empty block-url target", () => {
    const target = parseNotionTargetFromSource("\n  \n");
    expect(target).toEqual({
      mode: "empty_block_url",
      originalUrl: "",
    });
  });

  it("parses single-line block url mode", () => {
    const target = parseNotionTargetFromSource(
      "https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad?source=copy_link#d05907aae5b146d98eface29afae7844",
    );
    expect(target.mode).toBe("block_url");
    if (target.mode === "block_url") {
      expect(target.blockId).toBe("d05907aa-e5b1-46d9-8efa-ce29afae7844");
    }
  });

  it("parses single-line NBE URI mode", () => {
    const target = parseNotionTargetFromSource(
      "obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7::b7k2m9",
    );
    expect(target.mode).toBe("nbe_uri");
    if (target.mode === "nbe_uri") {
      expect(target.vault).toBe("My Vault");
      expect(target.pageNbeId).toBe("p20260328153045-k7");
      expect(target.blockNbeId).toBe("b7k2m9");
      expect(target.ref).toBe("p20260328153045-k7::b7k2m9");
    }
  });

  it("parses page+heading mode", () => {
    const target = parseNotionTargetFromSource(`
url: https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad?source=copy_link
heading: 一、GitHub网站基础介绍
`);
    expect(target.mode).toBe("page_heading");
    if (target.mode === "page_heading") {
      expect(target.pageId).toBe("3294cb88-07f2-811a-b8ba-f0a10f76a5ad");
      expect(target.heading).toBe("一、GitHub网站基础介绍");
    }
  });

  it("rejects page mode when heading is missing", () => {
    expect(() =>
      parseNotionTargetFromSource(
        "url: https://www.notion.so/03_Github-mp4-3294cb8807f2811ab8baf0a10f76a5ad?source=copy_link",
      ),
    ).toThrow("heading");
  });

  it('rejects NBE URI when "nbe" is missing', () => {
    expect(() =>
      parseNotionTargetFromSource("obsidian://notion-block-embed?vault=My%20Vault&action=open-ref"),
    ).toThrow('Missing "nbe"');
  });

  it("rejects NBE URI when action is not open-ref", () => {
    expect(() =>
      parseNotionTargetFromSource(
        "obsidian://notion-block-embed?vault=My%20Vault&action=search&nbe=p20260328153045-k7::b7k2m9",
      ),
    ).toThrow("Unsupported NBE action");
  });
});
