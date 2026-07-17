import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN,
  NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN,
  NBE_RESOLUTION_CACHE_TTL_MS,
} from '../src/core/constants';
import { PersistedDataStore } from '../src/core/persisted-data-store';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { createPersistedPluginData } from '../src/core/persisted-data';

describe('PersistedDataStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serializes settings and image memory writes without losing data', async () => {
    const save = vi.fn(async () => Promise.resolve());
    const store = new PersistedDataStore(createPersistedPluginData(DEFAULT_SETTINGS, {}, {}), save);

    await Promise.all([
      store.setSettings({ ...DEFAULT_SETTINGS, notionToken: 'secret_123' }),
      store.setImageSizeMemory({
        'img-1': { blockId: 'img-1', widthRatio: 0.4, lastSeenAt: 123 },
      }),
    ]);

    expect(save).toHaveBeenCalled();
    expect(store.getData().settings.notionToken).toBe('secret_123');
    expect(store.getData().imageSizeMemory['img-1']?.widthRatio).toBe(0.4);
  });

  it('debounces settings writes and flushes the latest value', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => Promise.resolve());
    const store = new PersistedDataStore(createPersistedPluginData(DEFAULT_SETTINGS, {}, {}), save);

    void store.setSettings({ ...DEFAULT_SETTINGS, notionToken: 'first' }, { debounceMs: 250 });
    void store.setSettings({ ...DEFAULT_SETTINGS, notionToken: 'second' }, { debounceMs: 250 });

    await vi.advanceTimersByTimeAsync(249);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getData().settings.notionToken).toBe('second');
  });

  it('flush persists pending debounced state immediately', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => Promise.resolve());
    const store = new PersistedDataStore(createPersistedPluginData(DEFAULT_SETTINGS, {}, {}), save);

    void store.setSettings({ ...DEFAULT_SETTINGS, maxHeight: 720 }, { debounceMs: 250 });
    await store.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getData().settings.maxHeight).toBe(720);
  });

  it('stores and removes NBE resolution page indexes by token fingerprint', async () => {
    const save = vi.fn(async () => Promise.resolve());
    const store = new PersistedDataStore(createPersistedPluginData(DEFAULT_SETTINGS, {}, {}), save);
    const now = Date.now();

    await store.setNbeResolutionPageIndex('tkn123', {
      schemaVersion: 2,
      pageNbeId: 'p20260328153045-k7',
      pageId: 'page-1',
      blocks: {
        b7k2m9: 'block-1',
      },
      resolvedAt: now,
    });

    expect(store.getNbeResolutionPageIndex('tkn123', 'p20260328153045-k7')).toEqual({
      schemaVersion: 2,
      pageNbeId: 'p20260328153045-k7',
      pageId: 'page-1',
      blocks: {
        b7k2m9: 'block-1',
      },
      resolvedAt: now,
    });

    await store.deleteNbeResolutionPageIndex('tkn123', 'p20260328153045-k7');
    expect(store.getNbeResolutionPageIndex('tkn123', 'p20260328153045-k7')).toBeNull();
  });

  it('stores and removes resolved targets by token fingerprint', async () => {
    const save = vi.fn(async () => Promise.resolve());
    const store = new PersistedDataStore(createPersistedPluginData(DEFAULT_SETTINGS, {}, {}), save);
    const now = Date.now();

    await store.setNbeResolvedTarget('tkn123', {
      schemaVersion: 2,
      ref: 'p20260328153045-k7_b7k2m9',
      pageNbeId: 'p20260328153045-k7',
      blockNbeId: 'b7k2m9',
      pageId: 'page-1',
      blockId: 'block-1',
      resolvedAt: now,
    });

    expect(store.getNbeResolvedTarget('tkn123', 'p20260328153045-k7_b7k2m9')).toEqual({
      schemaVersion: 2,
      ref: 'p20260328153045-k7_b7k2m9',
      pageNbeId: 'p20260328153045-k7',
      blockNbeId: 'b7k2m9',
      pageId: 'page-1',
      blockId: 'block-1',
      resolvedAt: now,
    });
    expect(store.getNbeResolvedTarget('tkn123', 'p20260328153045-k7::b7k2m9')).toEqual({
      schemaVersion: 2,
      ref: 'p20260328153045-k7_b7k2m9',
      pageNbeId: 'p20260328153045-k7',
      blockNbeId: 'b7k2m9',
      pageId: 'page-1',
      blockId: 'block-1',
      resolvedAt: now,
    });

    await store.deleteNbeResolvedTarget('tkn123', 'p20260328153045-k7::b7k2m9');
    expect(store.getNbeResolvedTarget('tkn123', 'p20260328153045-k7_b7k2m9')).toBeNull();
  });

  it('prunes stale page indexes and caps namespace size on write', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-29T00:00:00.000Z'));
      const save = vi.fn(async () => Promise.resolve());
      const store = new PersistedDataStore(createPersistedPluginData(DEFAULT_SETTINGS, {}, {}), save);
      const now = Date.now();

      await store.setNbeResolutionPageIndex('tkn123', {
        schemaVersion: 2,
        pageNbeId: 'expired',
        pageId: 'page-expired',
        blocks: {},
        resolvedAt: now - NBE_RESOLUTION_CACHE_TTL_MS - 1,
      });

      for (let index = 0; index < NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN + 2; index += 1) {
        await store.setNbeResolutionPageIndex('tkn123', {
          schemaVersion: 2,
          pageNbeId: `page-${index}`,
          pageId: `notion-page-${index}`,
          blocks: {
            block: `block-${index}`,
          },
          resolvedAt: now - index,
        });
      }

      const namespace = store.getData().nbeResolutionCache.tkn123 ?? {};
      expect(Object.keys(namespace)).toHaveLength(NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN);
      expect(namespace['page-0']).toBeTruthy();
      expect(namespace['page-256']).toBeUndefined();
      expect(namespace.expired).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('prunes stale resolved targets and caps namespace size on write', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-29T00:00:00.000Z'));
      const save = vi.fn(async () => Promise.resolve());
      const now = Date.now();
      const seededTargets = Object.fromEntries(
        Array.from({ length: NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN + 2 }, (_, index) => [
          `page_block-${index}`,
          {
            schemaVersion: 2,
            ref: `page_block-${index}`,
            pageNbeId: 'page',
            blockNbeId: `block-${index}`,
            pageId: `notion-page-${index}`,
            blockId: `notion-block-${index}`,
            resolvedAt: now - index,
          },
        ]),
      );
      const store = new PersistedDataStore(
        createPersistedPluginData(DEFAULT_SETTINGS, {}, {}, {}, {
          tkn123: {
            ...seededTargets,
            expired: {
              schemaVersion: 2,
              ref: 'expired',
              pageNbeId: 'page',
              blockNbeId: 'expired',
              pageId: 'page-expired',
              blockId: 'block-expired',
              resolvedAt: now - NBE_RESOLUTION_CACHE_TTL_MS - 1,
            },
          },
        }),
        save,
      );

      await store.setNbeResolvedTarget('tkn123', {
        schemaVersion: 2,
        ref: 'page_block-new',
        pageNbeId: 'page',
        blockNbeId: 'block-new',
        pageId: 'notion-page-new',
        blockId: 'notion-block-new',
        resolvedAt: now + 1,
      });

      const namespace = store.getData().nbeResolvedTargetCache.tkn123 ?? {};
      expect(Object.keys(namespace)).toHaveLength(NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN);
      expect(namespace['page_block-new']).toBeTruthy();
      expect(namespace['page_block-0']).toBeTruthy();
      expect(namespace[`page_block-${NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN + 1}`]).toBeUndefined();
      expect(namespace.expired).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
