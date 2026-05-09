import { NotionBlockEmbedSettings } from './settings';
import {
  ImageSizeMemoryMap,
  PersistedPluginData,
  createPersistedPluginData,
  pruneNbeResolvedTargetCache,
  pruneNbeResolutionCache,
} from './persisted-data';
import {
  NbeReferenceRegistryMap,
  NbeResolvedTarget,
  NbeResolvedTargetCacheMap,
  NbeResolutionCacheMap,
  NbeResolvedPageIndex,
} from './models';

interface DebouncedWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class PersistedDataStore {
  private data: PersistedPluginData;
  private writeChain: Promise<void> = Promise.resolve();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debouncedWaiters: DebouncedWaiter[] = [];

  constructor(
    initialData: PersistedPluginData,
    private readonly save: (data: PersistedPluginData) => Promise<void>,
  ) {
    this.data = {
      settings: { ...initialData.settings },
      imageSizeMemory: { ...initialData.imageSizeMemory },
      nbeRegistry: cloneRegistry(initialData.nbeRegistry),
      nbeResolutionCache: pruneNbeResolutionCache(cloneResolutionCache(initialData.nbeResolutionCache)),
      nbeResolvedTargetCache: pruneNbeResolvedTargetCache(cloneResolvedTargetCache(initialData.nbeResolvedTargetCache)),
    };
  }

  getData(): PersistedPluginData {
    return {
      settings: { ...this.data.settings },
      imageSizeMemory: { ...this.data.imageSizeMemory },
      nbeRegistry: cloneRegistry(this.data.nbeRegistry),
      nbeResolutionCache: pruneNbeResolutionCache(cloneResolutionCache(this.data.nbeResolutionCache)),
      nbeResolvedTargetCache: pruneNbeResolvedTargetCache(cloneResolvedTargetCache(this.data.nbeResolvedTargetCache)),
    };
  }

  setSettings(settings: NotionBlockEmbedSettings, options?: { debounceMs?: number }): Promise<void> {
    this.data = createPersistedPluginData(
      settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      this.data.nbeResolvedTargetCache,
    );
    const debounceMs = options?.debounceMs ?? 0;
    return debounceMs > 0 ? this.schedulePersist(debounceMs) : this.persistNow();
  }

  setImageSizeMemory(imageSizeMemory: ImageSizeMemoryMap): Promise<void> {
    this.data = createPersistedPluginData(
      this.data.settings,
      imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      this.data.nbeResolvedTargetCache,
    );
    return this.persistNow();
  }

  setNbeRegistry(nbeRegistry: NbeReferenceRegistryMap): Promise<void> {
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      cloneRegistry(nbeRegistry),
      this.data.nbeResolutionCache,
      this.data.nbeResolvedTargetCache,
    );
    return this.persistNow();
  }

  getNbeResolutionPageIndex(tokenFingerprint: string, pageNbeId: string): NbeResolvedPageIndex | null {
    return this.data.nbeResolutionCache[tokenFingerprint]?.[pageNbeId]
      ? cloneResolvedPageIndex(this.data.nbeResolutionCache[tokenFingerprint][pageNbeId])
      : null;
  }

  getNbeResolvedTarget(tokenFingerprint: string, ref: string): NbeResolvedTarget | null {
    return this.data.nbeResolvedTargetCache[tokenFingerprint]?.[ref]
      ? cloneResolvedTarget(this.data.nbeResolvedTargetCache[tokenFingerprint][ref])
      : null;
  }

  setNbeResolutionPageIndex(tokenFingerprint: string, pageIndex: NbeResolvedPageIndex): Promise<void> {
    const nextCache = cloneResolutionCache(this.data.nbeResolutionCache);
    const namespace = {
      ...(nextCache[tokenFingerprint] ?? {}),
    };
    namespace[pageIndex.pageNbeId] = cloneResolvedPageIndex(pageIndex);
    nextCache[tokenFingerprint] = namespace;
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      nextCache,
      this.data.nbeResolvedTargetCache,
    );
    this.pruneResolutionCacheInPlace();
    return this.persistNow();
  }

  setNbeResolvedTarget(tokenFingerprint: string, target: NbeResolvedTarget): Promise<void> {
    const nextCache = cloneResolvedTargetCache(this.data.nbeResolvedTargetCache);
    const namespace = {
      ...(nextCache[tokenFingerprint] ?? {}),
    };
    namespace[target.ref] = cloneResolvedTarget(target);
    nextCache[tokenFingerprint] = namespace;
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      nextCache,
    );
    this.pruneResolvedTargetCacheInPlace();
    return this.persistNow();
  }

  deleteNbeResolutionPageIndex(tokenFingerprint: string, pageNbeId: string): Promise<void> {
    if (!this.data.nbeResolutionCache[tokenFingerprint]?.[pageNbeId]) {
      return Promise.resolve();
    }

    const nextCache = cloneResolutionCache(this.data.nbeResolutionCache);
    const namespace = {
      ...(nextCache[tokenFingerprint] ?? {}),
    };
    delete namespace[pageNbeId];
    if (Object.keys(namespace).length === 0) {
      delete nextCache[tokenFingerprint];
    } else {
      nextCache[tokenFingerprint] = namespace;
    }
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      nextCache,
      this.data.nbeResolvedTargetCache,
    );
    this.pruneResolutionCacheInPlace();
    return this.persistNow();
  }

  deleteNbeResolvedTarget(tokenFingerprint: string, ref: string): Promise<void> {
    if (!this.data.nbeResolvedTargetCache[tokenFingerprint]?.[ref]) {
      return Promise.resolve();
    }

    const nextCache = cloneResolvedTargetCache(this.data.nbeResolvedTargetCache);
    const namespace = {
      ...(nextCache[tokenFingerprint] ?? {}),
    };
    delete namespace[ref];
    if (Object.keys(namespace).length === 0) {
      delete nextCache[tokenFingerprint];
    } else {
      nextCache[tokenFingerprint] = namespace;
    }
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      nextCache,
    );
    this.pruneResolvedTargetCacheInPlace();
    return this.persistNow();
  }

  clearNbeResolutionCache(tokenFingerprint?: string): Promise<void> {
    const nextCache = cloneResolutionCache(this.data.nbeResolutionCache);
    if (tokenFingerprint) {
      if (!nextCache[tokenFingerprint]) {
        return Promise.resolve();
      }
      delete nextCache[tokenFingerprint];
    } else if (Object.keys(nextCache).length === 0) {
      return Promise.resolve();
    } else {
      for (const key of Object.keys(nextCache)) {
        delete nextCache[key];
      }
    }

    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      nextCache,
      this.data.nbeResolvedTargetCache,
    );
    this.pruneResolutionCacheInPlace();
    return this.persistNow();
  }

  clearNbeResolvedTargetCache(tokenFingerprint?: string): Promise<void> {
    const nextCache = cloneResolvedTargetCache(this.data.nbeResolvedTargetCache);
    if (tokenFingerprint) {
      if (!nextCache[tokenFingerprint]) {
        return Promise.resolve();
      }
      delete nextCache[tokenFingerprint];
    } else if (Object.keys(nextCache).length === 0) {
      return Promise.resolve();
    } else {
      for (const key of Object.keys(nextCache)) {
        delete nextCache[key];
      }
    }

    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      nextCache,
    );
    this.pruneResolvedTargetCacheInPlace();
    return this.persistNow();
  }

  flush(): Promise<void> {
    if (!this.debounceTimer) return this.writeChain;

    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    const waiters = this.drainDebouncedWaiters();
    const task = this.enqueuePersist();
    task.then(
      () => {
        for (const waiter of waiters) waiter.resolve();
      },
      (error) => {
        for (const waiter of waiters) waiter.reject(error);
      },
    );
    return task;
  }

  private schedulePersist(debounceMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.debouncedWaiters.push({ resolve, reject });
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        const waiters = this.drainDebouncedWaiters();
        const task = this.enqueuePersist();
        task.then(
          () => {
            for (const waiter of waiters) waiter.resolve();
          },
          (error) => {
            for (const waiter of waiters) waiter.reject(error);
          },
        );
      }, debounceMs);
    });
  }

  private persistNow(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const waiters = this.drainDebouncedWaiters();
    const task = this.enqueuePersist();
    task.then(
      () => {
        for (const waiter of waiters) waiter.resolve();
      },
      (error) => {
        for (const waiter of waiters) waiter.reject(error);
      },
    );
    return task;
  }

  private enqueuePersist(): Promise<void> {
    this.pruneResolutionCacheInPlace();
    const snapshot = this.getData();
    this.writeChain = this.writeChain.catch(() => undefined).then(() => this.save(snapshot));
    return this.writeChain;
  }

  private drainDebouncedWaiters(): DebouncedWaiter[] {
    const waiters = this.debouncedWaiters;
    this.debouncedWaiters = [];
    return waiters;
  }

  private pruneResolutionCacheInPlace(): void {
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      pruneNbeResolutionCache(this.data.nbeResolutionCache),
      this.data.nbeResolvedTargetCache,
    );
  }

  private pruneResolvedTargetCacheInPlace(): void {
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      pruneNbeResolvedTargetCache(this.data.nbeResolvedTargetCache),
    );
  }
}

function cloneRegistry(registry: NbeReferenceRegistryMap | null | undefined): NbeReferenceRegistryMap {
  if (!registry) return {};
  return Object.fromEntries(
    Object.entries(registry).map(([ref, entry]) => [
      ref,
      {
        ref: entry.ref,
        primaryLocationKey: entry.primaryLocationKey,
        lastSeenAt: entry.lastSeenAt,
        locations: entry.locations.map((location) => ({ ...location })),
      },
    ]),
  );
}

function cloneResolutionCache(cache: NbeResolutionCacheMap | null | undefined): NbeResolutionCacheMap {
  if (!cache) return {};
  return Object.fromEntries(
    Object.entries(cache).map(([tokenFingerprint, namespace]) => [
      tokenFingerprint,
      Object.fromEntries(
        Object.entries(namespace).map(([pageNbeId, pageIndex]) => [pageNbeId, cloneResolvedPageIndex(pageIndex)]),
      ),
    ]),
  );
}

function cloneResolvedTargetCache(cache: NbeResolvedTargetCacheMap | null | undefined): NbeResolvedTargetCacheMap {
  if (!cache) return {};
  return Object.fromEntries(
    Object.entries(cache).map(([tokenFingerprint, namespace]) => [
      tokenFingerprint,
      Object.fromEntries(Object.entries(namespace).map(([ref, target]) => [ref, cloneResolvedTarget(target)])),
    ]),
  );
}

function cloneResolvedPageIndex(pageIndex: NbeResolvedPageIndex): NbeResolvedPageIndex {
  return {
    pageNbeId: pageIndex.pageNbeId,
    pageId: pageIndex.pageId,
    blocks: { ...pageIndex.blocks },
    resolvedAt: pageIndex.resolvedAt,
  };
}

function cloneResolvedTarget(target: NbeResolvedTarget): NbeResolvedTarget {
  return {
    ref: target.ref,
    pageNbeId: target.pageNbeId,
    blockNbeId: target.blockNbeId,
    pageId: target.pageId,
    blockId: target.blockId,
    resolvedAt: target.resolvedAt,
  };
}
