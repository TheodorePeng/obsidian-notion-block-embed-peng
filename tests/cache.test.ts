import { describe, expect, it, vi } from "vitest";
import { AsyncTtlCache } from "../src/embed/cache";

describe("AsyncTtlCache", () => {
  it("deduplicates in-flight loads", async () => {
    const cache = new AsyncTtlCache<number>(5_000);
    const loader = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 42;
    });

    const [a, b, c] = await Promise.all([
      cache.getOrLoad("k", loader),
      cache.getOrLoad("k", loader),
      cache.getOrLoad("k", loader),
    ]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("deletes keys by predicate", async () => {
    const cache = new AsyncTtlCache<number>(5_000);
    await cache.getOrLoad("keep", async () => 1);
    await cache.getOrLoad("block:a:with-children", async () => 2);
    await cache.getOrLoad("block:a:root-only", async () => 3);

    cache.deleteWhere((key) => key.startsWith("block:a:"));

    const loader = vi.fn(async () => 99);
    const value = await cache.getOrLoad("block:a:with-children", loader);
    expect(value).toBe(99);
    expect(loader).toHaveBeenCalledTimes(1);

    const keepLoader = vi.fn(async () => 5);
    const keep = await cache.getOrLoad("keep", keepLoader);
    expect(keep).toBe(1);
    expect(keepLoader).not.toHaveBeenCalled();
  });

  it("invalidates keys by prefix", async () => {
    const cache = new AsyncTtlCache<number>(5_000);
    await cache.getOrLoad("page:one:tree:root-only", async () => 1);
    await cache.getOrLoad("page:one:section:heading-a", async () => 2);
    await cache.getOrLoad("page:two:tree:root-only", async () => 3);

    cache.invalidatePrefix("page:one:");

    const loader = vi.fn(async () => 9);
    const value = await cache.getOrLoad("page:one:tree:root-only", loader);
    expect(value).toBe(9);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("drops expired values before reloading", async () => {
    vi.useFakeTimers();
    try {
      const cache = new AsyncTtlCache<number>(100);
      await cache.getOrLoad("stale", async () => 1);
      await vi.advanceTimersByTimeAsync(150);

      const loader = vi.fn(async () => 2);
      const value = await cache.getOrLoad("stale", loader);
      expect(value).toBe(2);
      expect(loader).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts the least recently used entry when max entries is exceeded", async () => {
    const cache = new AsyncTtlCache<number>(5_000, 2);
    await cache.getOrLoad("a", async () => 1);
    await cache.getOrLoad("b", async () => 2);
    await cache.getOrLoad("a", async () => 100);
    await cache.getOrLoad("c", async () => 3);

    const evictedLoader = vi.fn(async () => 99);
    const keptLoader = vi.fn(async () => 88);

    expect(await cache.getOrLoad("a", keptLoader)).toBe(1);
    expect(await cache.getOrLoad("b", evictedLoader)).toBe(99);
    expect(evictedLoader).toHaveBeenCalledTimes(1);
    expect(keptLoader).not.toHaveBeenCalled();
  });
});
