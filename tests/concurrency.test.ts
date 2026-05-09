import { describe, expect, it } from "vitest";
import { mapWithConcurrency, runWithConcurrency } from "../src/embed/concurrency";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runWithConcurrency", () => {
  it("limits concurrent workers", async () => {
    let running = 0;
    let maxRunning = 0;
    const calls: number[] = [];

    const out = await runWithConcurrency(6, 3, async (index) => {
      calls.push(index);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await wait(15);
      running -= 1;
      return index * 2;
    });

    expect(calls).toHaveLength(6);
    expect(maxRunning).toBeLessThanOrEqual(3);
    expect(out).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe("mapWithConcurrency", () => {
  it("maps values while keeping order", async () => {
    const values = await mapWithConcurrency(["a", "b", "c"], 2, async (value, index) => `${value}-${index}`);
    expect(values).toEqual(["a-0", "b-1", "c-2"]);
  });
});
