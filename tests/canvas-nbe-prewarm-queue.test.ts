import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../src/core/logger";
import { CanvasNbePrewarmQueue } from "../src/embed/canvas-nbe-prewarm-queue";

describe("CanvasNbePrewarmQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates repeated page ids and runs prewarm work serially", async () => {
    vi.useFakeTimers();
    const queue = new CanvasNbePrewarmQueue(new Logger());
    const starts: string[] = [];
    let running = 0;
    let maxRunning = 0;

    const makeTask = (name: string) => async () => {
      starts.push(name);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
    };

    queue.enqueue("page-a", makeTask("page-a"));
    queue.enqueue("page-a", makeTask("page-a-duplicate"));
    queue.enqueue("page-b", makeTask("page-b"));

    expect(starts).toEqual(["page-a"]);

    await vi.advanceTimersByTimeAsync(20);
    expect(starts).toEqual(["page-a", "page-b"]);
    expect(maxRunning).toBe(1);
  });
});
