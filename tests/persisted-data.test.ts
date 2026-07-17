import { describe, expect, it, vi } from "vitest";
import {
  NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN,
  NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN,
  NBE_RESOLUTION_CACHE_TTL_MS,
} from "../src/core/constants";
import { coercePersistedPluginData } from "../src/core/persisted-data";

describe("coercePersistedPluginData", () => {
  it("migrates legacy settings-only data", () => {
    const data = coercePersistedPluginData({
      notionToken: "secret_123",
      maxHeight: 640,
    });

    expect(data.settings.notionToken).toBe("secret_123");
    expect(data.settings.maxHeight).toBe(640);
    expect(data.imageSizeMemory).toEqual({});
  });

  it("preserves image size memory from persisted object", () => {
    const data = coercePersistedPluginData({
      settings: {
        notionToken: "secret_123",
      },
      imageSizeMemory: {
        "block-1": {
          widthRatio: 0.44,
          lastSeenAt: 123456,
        },
      },
    });

    expect(data.settings.notionToken).toBe("secret_123");
    expect(data.imageSizeMemory["block-1"]).toEqual({
      blockId: "block-1",
      widthRatio: 0.44,
      lastSeenAt: 123456,
    });
  });

  it("preserves NBE registry entries from persisted object", () => {
    const data = coercePersistedPluginData({
      settings: {},
      nbeRegistry: {
        "p20260328153045-k7_b7k2m9": {
          ref: "p20260328153045-k7_b7k2m9",
          primaryLocationKey: "md:Note.md:4:6",
          lastSeenAt: 123456,
          locations: [
            {
              kind: "markdown",
              key: "md:Note.md:4:6",
              path: "Note.md",
              lineStart: 4,
              lineEnd: 6,
            },
          ],
        },
      },
    });

    expect(data.nbeRegistry["p20260328153045-k7_b7k2m9"]).toEqual({
      ref: "p20260328153045-k7_b7k2m9",
      primaryLocationKey: "md:Note.md:4:6",
      lastSeenAt: 123456,
      locations: [
        {
          kind: "markdown",
          key: "md:Note.md:4:6",
          path: "Note.md",
          lineStart: 4,
          lineEnd: 6,
        },
      ],
    });
  });

  it("normalizes legacy double-colon NBE registry entries on load", () => {
    const data = coercePersistedPluginData({
      settings: {},
      nbeRegistry: {
        "p20260328153045-k7::b7k2m9": {
          ref: "p20260328153045-k7::b7k2m9",
          primaryLocationKey: "md:Note.md:4:6",
          lastSeenAt: 123456,
          locations: [
            {
              kind: "markdown",
              key: "md:Note.md:4:6",
              path: "Note.md",
              lineStart: 4,
              lineEnd: 6,
            },
          ],
        },
      },
    });

    expect(data.nbeRegistry["p20260328153045-k7_b7k2m9"]?.ref).toBe("p20260328153045-k7_b7k2m9");
    expect(data.nbeRegistry["p20260328153045-k7::b7k2m9"]).toBeUndefined();
  });

  it("preserves NBE resolution cache entries from persisted object", () => {
    const now = Date.now();
    const data = coercePersistedPluginData({
      settings: {},
      nbeResolutionCache: {
        tkn123: {
          "p20260328153045-k7": {
            schemaVersion: 2,
            pageNbeId: "p20260328153045-k7",
            pageId: "page-1",
            blocks: {
              b7k2m9: "block-1",
            },
            resolvedAt: now,
          },
        },
      },
    });

    expect(data.nbeResolutionCache.tkn123?.["p20260328153045-k7"]).toEqual({
      schemaVersion: 2,
      pageNbeId: "p20260328153045-k7",
      pageId: "page-1",
      blocks: {
        b7k2m9: "block-1",
      },
      resolvedAt: now,
    });
  });

  it("drops NBE resolution caches from an older schema", () => {
    const now = Date.now();
    const data = coercePersistedPluginData({
      settings: {},
      nbeResolutionCache: {
        tkn123: {
          "p20260328153045-k7": {
            pageNbeId: "p20260328153045-k7",
            pageId: "page-1",
            blocks: { b7k2m9: "heading-1" },
            resolvedAt: now,
          },
        },
      },
      nbeResolvedTargetCache: {
        tkn123: {
          "p20260328153045-k7_b7k2m9": {
            ref: "p20260328153045-k7_b7k2m9",
            pageNbeId: "p20260328153045-k7",
            blockNbeId: "b7k2m9",
            pageId: "page-1",
            blockId: "heading-1",
            resolvedAt: now,
          },
        },
      },
    });

    expect(data.nbeResolutionCache).toEqual({});
    expect(data.nbeResolvedTargetCache).toEqual({});
  });

  it("preserves NBE resolution caches from the current schema", () => {
    const now = Date.now();
    const data = coercePersistedPluginData({
      settings: {},
      nbeResolutionCache: {
        tkn123: {
          "p20260328153045-k7": {
            schemaVersion: 2,
            pageNbeId: "p20260328153045-k7",
            pageId: "page-1",
            blocks: { b7k2m9: "callout-1" },
            resolvedAt: now,
          },
        },
      },
      nbeResolvedTargetCache: {
        tkn123: {
          "p20260328153045-k7_b7k2m9": {
            schemaVersion: 2,
            ref: "p20260328153045-k7_b7k2m9",
            pageNbeId: "p20260328153045-k7",
            blockNbeId: "b7k2m9",
            pageId: "page-1",
            blockId: "callout-1",
            resolvedAt: now,
          },
        },
      },
    });

    expect(data.nbeResolutionCache.tkn123?.["p20260328153045-k7"]?.schemaVersion).toBe(2);
    expect(data.nbeResolvedTargetCache.tkn123?.["p20260328153045-k7_b7k2m9"]?.schemaVersion).toBe(2);
  });

  it("preserves NBE resolved target cache entries from persisted object", () => {
    const now = Date.now();
    const data = coercePersistedPluginData({
      settings: {},
      nbeResolvedTargetCache: {
        tkn123: {
          "p20260328153045-k7_b7k2m9": {
            schemaVersion: 2,
            ref: "p20260328153045-k7_b7k2m9",
            pageNbeId: "p20260328153045-k7",
            blockNbeId: "b7k2m9",
            pageId: "page-1",
            blockId: "block-1",
            resolvedAt: now,
          },
        },
      },
    });

    expect(data.nbeResolvedTargetCache.tkn123?.["p20260328153045-k7_b7k2m9"]).toEqual({
      schemaVersion: 2,
      ref: "p20260328153045-k7_b7k2m9",
      pageNbeId: "p20260328153045-k7",
      blockNbeId: "b7k2m9",
      pageId: "page-1",
      blockId: "block-1",
      resolvedAt: now,
    });
  });

  it("normalizes legacy double-colon NBE resolved target cache entries on load", () => {
    const now = Date.now();
    const data = coercePersistedPluginData({
      settings: {},
      nbeResolvedTargetCache: {
        tkn123: {
          "p20260328153045-k7::b7k2m9": {
            schemaVersion: 2,
            ref: "p20260328153045-k7::b7k2m9",
            pageNbeId: "p20260328153045-k7",
            blockNbeId: "b7k2m9",
            pageId: "page-1",
            blockId: "block-1",
            resolvedAt: now,
          },
        },
      },
    });

    expect(data.nbeResolvedTargetCache.tkn123?.["p20260328153045-k7_b7k2m9"]?.ref).toBe(
      "p20260328153045-k7_b7k2m9",
    );
    expect(data.nbeResolvedTargetCache.tkn123?.["p20260328153045-k7::b7k2m9"]).toBeUndefined();
  });

  it("prunes expired page indexes and caps each token namespace", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-29T00:00:00.000Z"));
      const now = Date.now();
      const namespace = Object.fromEntries(
        Array.from({ length: NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN + 2 }, (_, index) => [
          `page-${index}`,
          {
            schemaVersion: 2,
            pageNbeId: `page-${index}`,
            pageId: `notion-page-${index}`,
            blocks: {
              block: `block-${index}`,
            },
            resolvedAt: now - index,
          },
        ]),
      );

      const data = coercePersistedPluginData({
        settings: {},
        nbeResolutionCache: {
          tkn123: {
            ...namespace,
            expired: {
              schemaVersion: 2,
              pageNbeId: "expired",
              pageId: "expired-page",
              blocks: {},
              resolvedAt: now - NBE_RESOLUTION_CACHE_TTL_MS - 1,
            },
          },
        },
      });

      const keys = Object.keys(data.nbeResolutionCache.tkn123 ?? {});
      expect(keys).toHaveLength(NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN);
      expect(keys).toContain("page-0");
      expect(keys).not.toContain("page-256");
      expect(keys).not.toContain("expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prunes expired resolved targets and caps each token namespace", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-29T00:00:00.000Z"));
      const now = Date.now();
      const namespace = Object.fromEntries(
        Array.from({ length: NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN + 2 }, (_, index) => [
          `page_block-${index}`,
          {
            schemaVersion: 2,
            ref: `page_block-${index}`,
            pageNbeId: "page",
            blockNbeId: `block-${index}`,
            pageId: "notion-page",
            blockId: `notion-block-${index}`,
            resolvedAt: now - index,
          },
        ]),
      );

      const data = coercePersistedPluginData({
        settings: {},
        nbeResolvedTargetCache: {
          tkn123: {
            ...namespace,
            expired: {
              schemaVersion: 2,
              ref: "expired",
              pageNbeId: "page",
              blockNbeId: "expired",
              pageId: "expired-page",
              blockId: "expired-block",
              resolvedAt: now - NBE_RESOLUTION_CACHE_TTL_MS - 1,
            },
          },
        },
      });

      const keys = Object.keys(data.nbeResolvedTargetCache.tkn123 ?? {});
      expect(keys).toHaveLength(NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN);
      expect(keys).toContain("page_block-0");
      expect(keys).not.toContain(`page_block-${NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN}`);
      expect(keys).not.toContain("expired");
    } finally {
      vi.useRealTimers();
    }
  });
});
