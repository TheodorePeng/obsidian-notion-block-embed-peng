import { describe, expect, it } from "vitest";
import { renderTreeLeading } from "../src/render/tree/leading";
import { TreeGuideState } from "../src/render/tree/types";

function createState(overrides: Partial<TreeGuideState> = {}): TreeGuideState {
  return {
    depth: 0,
    ancestorRails: [],
    currentTopRail: false,
    currentBottomRail: false,
    hasIcon: true,
    isVisibleLeaf: true,
    iconKind: "bullet",
    ...overrides,
  };
}

describe("tree leading renderer", () => {
  it("renders ancestor rails and an empty current slot for plain tree children", () => {
    const leading = renderTreeLeading(
      createState({
        depth: 1,
        ancestorRails: [true],
        hasIcon: false,
        iconKind: "none",
      }),
    );

    expect(leading.querySelector(".nbe-tree-slot-ancestor.is-active .nbe-tree-guide-full")).toBeTruthy();
    expect(leading.querySelector(".nbe-tree-slot-current.is-empty")).toBeTruthy();
    expect(leading.querySelector(".nbe-tree-slot-current.has-icon")).toBeFalsy();
  });

  it("renders current top and bottom segments on the shared icon axis", () => {
    const icon = document.createElement("button");
    icon.className = "nbe-tree-icon-btn";

    const leading = renderTreeLeading(
      createState({
        depth: 0,
        currentTopRail: true,
        currentBottomRail: true,
        hasIcon: true,
        isVisibleLeaf: false,
        iconKind: "toggle",
      }),
      icon,
    );

    const currentSlot = leading.querySelector(".nbe-tree-slot-current.has-icon");
    expect(currentSlot?.querySelector(".nbe-tree-guide-top")).toBeTruthy();
    expect(currentSlot?.querySelector(".nbe-tree-guide-bottom")).toBeTruthy();
    expect(currentSlot?.querySelector(".nbe-tree-icon-host .nbe-tree-icon-btn")).toBeTruthy();
  });

  it("does not render current-depth segments for leaf nodes", () => {
    const leading = renderTreeLeading(
      createState({
        depth: 0,
        currentTopRail: false,
        currentBottomRail: false,
        isVisibleLeaf: true,
        hasIcon: true,
        iconKind: "number",
      }),
      document.createElement("span"),
    );

    const currentSlot = leading.querySelector(".nbe-tree-slot-current");
    expect(currentSlot?.querySelector(".nbe-tree-guide-top")).toBeFalsy();
    expect(currentSlot?.querySelector(".nbe-tree-guide-bottom")).toBeFalsy();
  });
});
