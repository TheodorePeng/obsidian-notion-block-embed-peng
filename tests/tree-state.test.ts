import { describe, expect, it } from "vitest";
import { EmbedBlockNode } from "../src/core/models";
import { buildTreeGuideState, createChildTreeContext, createRootTreeContext } from "../src/render/tree/state";
import { TreeContext } from "../src/render/tree/types";

function createNode(type: string, text: string): EmbedBlockNode {
  return {
    id: `${type}-${text}`,
    type,
    richText: [{ plainText: text }],
    children: [],
    props: {},
    meta: {
      sourcePageId: "page-id",
      notionTypeData: {},
    },
    capabilities: { writable: false },
  };
}

function buildState(
  siblings: EmbedBlockNode[],
  index: number,
  iconKind: "toggle" | "bullet" | "number" | "none",
  context: TreeContext = createRootTreeContext(),
) {
  return buildTreeGuideState({
    node: siblings[index],
    siblings,
    index,
    context,
    showChildren: true,
    iconKind,
  });
}

describe("tree state builder", () => {
  it("does not draw current-depth continuation rails for a visible leaf", () => {
    const siblings = [createNode("bulleted_list_item", "Leaf bullet")];

    const state = buildState(siblings, 0, "bullet");

    expect(state.isVisibleLeaf).toBe(true);
    expect(state.currentTopRail).toBe(false);
    expect(state.currentBottomRail).toBe(false);
    expect(state.hasIcon).toBe(true);
  });

  it("draws current-depth bottom rail when a node has visible children", () => {
    const toggle = createNode("toggle", "Parent");
    toggle.children = [createNode("paragraph", "Child")];
    const siblings = [toggle];

    const state = buildState(siblings, 0, "toggle");

    expect(state.isVisibleLeaf).toBe(false);
    expect(state.currentTopRail).toBe(false);
    expect(state.currentBottomRail).toBe(true);
  });

  it("draws both top and bottom current-depth rails for a middle tree sibling with children", () => {
    const first = createNode("bulleted_list_item", "First");
    const middle = createNode("toggle", "Middle");
    middle.children = [createNode("paragraph", "Child")];
    const last = createNode("numbered_list_item", "Last");
    const siblings = [first, middle, last];

    const state = buildState(siblings, 1, "toggle");

    expect(state.currentTopRail).toBe(true);
    expect(state.currentBottomRail).toBe(true);
    expect(state.iconKind).toBe("toggle");
  });

  it("preserves ancestor rails for plain descendants while keeping current-depth rails empty", () => {
    const parent = createNode("toggle", "Parent");
    parent.children = [createNode("paragraph", "Child")];
    const parentState = buildState([parent], 0, "toggle");
    const childContext = createChildTreeContext(parentState);
    const plainChild = parent.children[0];

    const childState = buildTreeGuideState({
      node: plainChild,
      siblings: parent.children,
      index: 0,
      context: childContext,
      showChildren: true,
      iconKind: "none",
    });

    expect(childState.depth).toBe(1);
    expect(childState.ancestorRails).toEqual([true]);
    expect(childState.hasIcon).toBe(false);
    expect(childState.currentTopRail).toBe(false);
    expect(childState.currentBottomRail).toBe(false);
  });
});
