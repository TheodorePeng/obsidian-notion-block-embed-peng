import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageSizeStore, clampImageWidthRatio } from "../src/image/size-store";

describe("ImageSizeStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("shares remembered width by block id and clamps values", async () => {
    const save = vi.fn(async () => undefined);
    const store = new ImageSizeStore({
      initialMemory: {},
      save,
      now: () => 1_000,
    });

    store.rememberWidthRatio("block-1", 1.8);
    await vi.advanceTimersByTimeAsync(400);

    expect(store.getWidthRatio("block-1")).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]["block-1"].widthRatio).toBe(1);
  });

  it("prunes expired entries", async () => {
    const save = vi.fn(async () => undefined);
    const now = 100 * 24 * 60 * 60 * 1000;
    const store = new ImageSizeStore({
      initialMemory: {
        stale: {
          blockId: "stale",
          widthRatio: 0.4,
          lastSeenAt: now - 61 * 24 * 60 * 60 * 1000,
        },
        fresh: {
          blockId: "fresh",
          widthRatio: 0.6,
          lastSeenAt: now - 5 * 24 * 60 * 60 * 1000,
        },
      },
      save,
      now: () => now,
    });

    expect(store.pruneExpired()).toBe(true);
    await vi.advanceTimersByTimeAsync(400);

    expect(store.getWidthRatio("stale")).toBeUndefined();
    expect(store.getWidthRatio("fresh")).toBe(0.6);
  });

  it("clears all remembered image sizes", async () => {
    const save = vi.fn(async () => undefined);
    const store = new ImageSizeStore({
      initialMemory: {
        keep: {
          blockId: "keep",
          widthRatio: 0.5,
          lastSeenAt: 123,
        },
      },
      save,
      now: () => 1_000,
    });

    store.clearAll();
    await vi.advanceTimersByTimeAsync(400);

    expect(store.exportData()).toEqual({});
  });

  it("flushes pending image size writes immediately", async () => {
    const save = vi.fn(async () => undefined);
    const store = new ImageSizeStore({
      initialMemory: {},
      save,
      now: () => 1_000,
    });

    store.rememberWidthRatio("block-2", 0.42);
    await store.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]["block-2"].widthRatio).toBe(0.42);
  });

  it("clamps width ratios into supported bounds", () => {
    expect(clampImageWidthRatio(0.05)).toBe(0.2);
    expect(clampImageWidthRatio(0.8)).toBe(0.8);
    expect(clampImageWidthRatio(2)).toBe(1);
  });
});
