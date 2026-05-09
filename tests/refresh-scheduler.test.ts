import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../src/core/logger";
import { RefreshScheduler } from "../src/embed/refresh-scheduler";

describe("RefreshScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers interval task when policy=interval", async () => {
    vi.useFakeTimers();
    const scheduler = new RefreshScheduler(new Logger());
    const task = vi.fn(async () => Promise.resolve());

    scheduler.configure({
      policy: "interval",
      intervalSec: 30,
      task,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(task).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("does not schedule when policy=manual", async () => {
    vi.useFakeTimers();
    const scheduler = new RefreshScheduler(new Logger());
    const task = vi.fn(async () => Promise.resolve());

    scheduler.configure({
      policy: "manual",
      intervalSec: 30,
      task,
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(task).toHaveBeenCalledTimes(0);
  });
});
