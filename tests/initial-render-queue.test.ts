import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../src/core/logger';
import { InitialRenderQueue } from '../src/embed/initial-render-queue';

describe('InitialRenderQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prioritizes visible work ahead of delayed offscreen work', async () => {
    vi.useFakeTimers();
    const queue = new InitialRenderQueue(new Logger(), 120, 1);
    const started: string[] = [];

    const makeTask = (name: string) =>
      vi.fn(async () => {
        started.push(name);
        await Promise.resolve();
      });

    queue.enqueue(makeTask('offscreen'), () => false, { priority: 'offscreen' });
    queue.enqueue(makeTask('visible'), () => false, { priority: 'visible' });

    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['visible']);

    await vi.advanceTimersByTimeAsync(120);
    expect(started).toEqual(['visible', 'offscreen']);
  });

  it('can promote queued work to selected priority before it starts', async () => {
    vi.useFakeTimers();
    const queue = new InitialRenderQueue(new Logger(), 120, 1);
    const started: string[] = [];

    const firstId = queue.enqueue(
      vi.fn(async () => {
        started.push('first');
        await Promise.resolve();
      }),
      () => false,
      { priority: 'offscreen' },
    );
    queue.enqueue(
      vi.fn(async () => {
        started.push('second');
        await Promise.resolve();
      }),
      () => false,
      { priority: 'visible' },
    );

    queue.reprioritize(firstId, 'selected');

    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['first']);
    await vi.advanceTimersByTimeAsync(120);
    expect(started).toEqual(['first', 'second']);
  });

  it('skips queued entries that are disposed before they start', async () => {
    vi.useFakeTimers();
    const queue = new InitialRenderQueue(new Logger(), 120, 1);
    const run = vi.fn(async () => undefined);
    let disposed = false;

    queue.enqueue(run, () => disposed, { priority: 'offscreen' });
    disposed = true;

    await vi.advanceTimersByTimeAsync(120);
    expect(run).not.toHaveBeenCalled();
  });
});
