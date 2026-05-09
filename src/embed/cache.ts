interface CacheValue<T> {
  value: T;
  expiresAt: number;
}

export class AsyncTtlCache<T> {
  private values = new Map<string, CacheValue<T>>();
  private inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = Number.POSITIVE_INFINITY,
  ) {}

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.values.get(key);
    if (cached) {
      if (cached.expiresAt > now) {
        this.touch(key, cached);
        return cached.value;
      }
      this.values.delete(key);
    }

    const running = this.inFlight.get(key);
    if (running) return running;

    const task = loader()
      .then((result) => {
        this.values.set(key, { value: result, expiresAt: Date.now() + this.ttlMs });
        this.pruneOverflow();
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, task);
    return task;
  }

  hasFresh(key: string): boolean {
    const cached = this.values.get(key);
    if (!cached) return false;
    if (cached.expiresAt > Date.now()) return true;
    this.values.delete(key);
    return false;
  }

  hasInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }

  clearAll(): void {
    this.values.clear();
    this.inFlight.clear();
  }

  delete(key: string): void {
    this.values.delete(key);
    this.inFlight.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    this.deleteWhere((key) => key.startsWith(prefix));
  }

  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of this.values.keys()) {
      if (predicate(key)) this.values.delete(key);
    }
    for (const key of this.inFlight.keys()) {
      if (predicate(key)) this.inFlight.delete(key);
    }
  }

  private touch(key: string, entry: CacheValue<T>): void {
    this.values.delete(key);
    this.values.set(key, entry);
  }

  private pruneOverflow(): void {
    if (!Number.isFinite(this.maxEntries) || this.maxEntries <= 0) return;
    while (this.values.size > this.maxEntries) {
      const oldestKey = this.values.keys().next().value;
      if (typeof oldestKey !== "string") return;
      this.values.delete(oldestKey);
    }
  }
}
