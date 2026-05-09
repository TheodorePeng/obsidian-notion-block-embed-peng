import { describe, expect, it } from "vitest";
import { RenderVersionTracker } from "../src/embed/render-version";

describe("RenderVersionTracker", () => {
  it("marks older versions as stale", () => {
    const tracker = new RenderVersionTracker();
    const first = tracker.next();
    const second = tracker.next();

    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
  });
});
