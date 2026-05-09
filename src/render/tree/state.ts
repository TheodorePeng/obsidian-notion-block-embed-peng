import { EmbedBlockNode } from "../../core/models";
import { TreeContext, TreeGuideState, TreeIconKind } from "./types";

interface BuildTreeGuideStateOptions {
  node: EmbedBlockNode;
  siblings: EmbedBlockNode[];
  index: number;
  context: TreeContext;
  showChildren: boolean;
  iconKind: TreeIconKind;
}

export function createRootTreeContext(): TreeContext {
  return {
    depth: 0,
    ancestorRails: [],
  };
}

export function createChildTreeContext(state: TreeGuideState): TreeContext {
  return {
    depth: state.depth + 1,
    ancestorRails: [...state.ancestorRails, true],
  };
}

export function getTreeIconKind(node: EmbedBlockNode): TreeIconKind {
  switch (node.type) {
    case "toggle":
      return "toggle";
    case "bulleted_list_item":
      return "bullet";
    case "numbered_list_item":
      return "number";
    default:
      return "none";
  }
}

export function isTreeLike(node: EmbedBlockNode): boolean {
  return getTreeIconKind(node) !== "none";
}

export function buildTreeGuideState(options: BuildTreeGuideStateOptions): TreeGuideState {
  const { node, siblings, index, context, showChildren, iconKind } = options;
  const hasIcon = iconKind !== "none";
  const hasVisibleChildren = showChildren && node.children.length > 0;
  const isVisibleLeaf = !hasVisibleChildren;
  const hasPrevTreeSibling = hasIcon && index > 0 && isTreeLike(siblings[index - 1]);
  const hasNextTreeSibling = hasIcon && index < siblings.length - 1 && isTreeLike(siblings[index + 1]);
  const showCurrentRails = hasIcon && !isVisibleLeaf;

  return {
    depth: context.depth,
    ancestorRails: context.ancestorRails,
    currentTopRail: showCurrentRails && hasPrevTreeSibling,
    currentBottomRail: showCurrentRails && (hasNextTreeSibling || hasVisibleChildren),
    hasIcon,
    isVisibleLeaf,
    iconKind,
  };
}
