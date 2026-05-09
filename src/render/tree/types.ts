export type TreeIconKind = "toggle" | "bullet" | "number" | "none";

export interface TreeContext {
  depth: number;
  ancestorRails: boolean[];
}

export interface TreeGuideState {
  depth: number;
  ancestorRails: boolean[];
  currentTopRail: boolean;
  currentBottomRail: boolean;
  hasIcon: boolean;
  isVisibleLeaf: boolean;
  iconKind: TreeIconKind;
}

export interface TreeShellParts {
  wrapper: HTMLDivElement;
  row: HTMLDivElement;
  main: HTMLDivElement;
}
