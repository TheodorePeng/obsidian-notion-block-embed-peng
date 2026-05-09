export async function runWithConcurrency<T>(
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  if (total <= 0) return [];

  const limit = Math.max(1, Math.min(concurrency, total));
  const result = new Array<T>(total);
  let nextIndex = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= total) break;
      result[index] = await worker(index);
    }
  });

  await Promise.all(workers);
  return result;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return runWithConcurrency(items.length, concurrency, async (index) => mapper(items[index], index));
}
