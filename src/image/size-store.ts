import { ImageSizeMemoryEntry, ImageSizeMemoryMap } from "../core/persisted-data";

export const IMAGE_WIDTH_RATIO_MIN = 0.2;
export const IMAGE_WIDTH_RATIO_MAX = 1;
export const IMAGE_SIZE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const TOUCH_PERSIST_GRANULARITY_MS = 12 * 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 300;

interface ImageSizeStoreDeps {
  initialMemory: ImageSizeMemoryMap;
  save: (memory: ImageSizeMemoryMap) => Promise<void>;
  now?: () => number;
}

function cloneMemory(memory: ImageSizeMemoryMap): ImageSizeMemoryMap {
  return Object.fromEntries(Object.entries(memory).map(([blockId, entry]) => [blockId, { ...entry }]));
}

export function clampImageWidthRatio(widthRatio: number): number {
  if (!Number.isFinite(widthRatio)) return IMAGE_WIDTH_RATIO_MAX;
  return Math.min(IMAGE_WIDTH_RATIO_MAX, Math.max(IMAGE_WIDTH_RATIO_MIN, widthRatio));
}

export class ImageSizeStore {
  private memory: ImageSizeMemoryMap;
  private readonly now: () => number;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ImageSizeStoreDeps) {
    this.memory = cloneMemory(deps.initialMemory);
    this.now = deps.now ?? (() => Date.now());
  }

  getWidthRatio(blockId: string): number | undefined {
    return this.memory[blockId]?.widthRatio;
  }

  rememberWidthRatio(blockId: string, widthRatio: number): void {
    this.memory[blockId] = this.createEntry(blockId, clampImageWidthRatio(widthRatio), this.now());
    this.pruneExpiredInternal();
    this.schedulePersist();
  }

  resetWidthRatio(blockId: string): void {
    if (!this.memory[blockId]) return;
    delete this.memory[blockId];
    this.schedulePersist();
  }

  touch(blockId: string): void {
    const entry = this.memory[blockId];
    if (!entry) return;

    const now = this.now();
    if (now - entry.lastSeenAt < TOUCH_PERSIST_GRANULARITY_MS) return;
    entry.lastSeenAt = now;
    this.schedulePersist();
  }

  clearAll(): void {
    this.memory = {};
    this.schedulePersist();
  }

  pruneExpired(): boolean {
    const changed = this.pruneExpiredInternal();
    if (changed) this.schedulePersist();
    return changed;
  }

  exportData(): ImageSizeMemoryMap {
    return cloneMemory(this.memory);
  }

  flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      return this.enqueuePersist();
    }

    return this.persistChain;
  }

  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      void this.enqueuePersist();
    }
  }

  private createEntry(blockId: string, widthRatio: number, lastSeenAt: number): ImageSizeMemoryEntry {
    return {
      blockId,
      widthRatio,
      lastSeenAt,
    };
  }

  private pruneExpiredInternal(): boolean {
    const cutoff = this.now() - IMAGE_SIZE_RETENTION_MS;
    let changed = false;

    for (const [blockId, entry] of Object.entries(this.memory)) {
      if (entry.lastSeenAt >= cutoff) continue;
      delete this.memory[blockId];
      changed = true;
    }

    return changed;
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.enqueuePersist();
    }, PERSIST_DEBOUNCE_MS);
  }

  private enqueuePersist(): Promise<void> {
    const snapshot = this.exportData();
    this.persistChain = this.persistChain.catch(() => undefined).then(() => this.deps.save(snapshot));
    return this.persistChain;
  }
}
