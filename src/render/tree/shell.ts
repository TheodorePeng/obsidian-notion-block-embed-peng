import { renderTreeLeading } from "./leading";
import { TreeGuideState, TreeShellParts } from "./types";

interface CreateTreeShellOptions {
  state: TreeGuideState;
  wrapperClassName: string;
  rowClassName: string;
  mainClassName: string;
  iconEl?: HTMLElement;
}

function applyTreeStateClasses(wrapper: HTMLElement, state: TreeGuideState): void {
  wrapper.dataset.depth = String(state.depth);
  wrapper.dataset.iconKind = state.iconKind;
  wrapper.classList.toggle("nbe-tree-is-leaf-visible-node", state.isVisibleLeaf);
  wrapper.classList.toggle("nbe-tree-has-current-top-rail", state.currentTopRail);
  wrapper.classList.toggle("nbe-tree-has-current-bottom-rail", state.currentBottomRail);
}

export function createTreeShell(options: CreateTreeShellOptions): TreeShellParts {
  const wrapper = document.createElement("div");
  wrapper.className = `nbe-block nbe-tree-item ${options.wrapperClassName}`;
  applyTreeStateClasses(wrapper, options.state);

  const row = document.createElement("div");
  row.className = `nbe-tree-row ${options.rowClassName}`;
  row.appendChild(renderTreeLeading(options.state, options.iconEl));

  const main = document.createElement("div");
  main.className = `nbe-tree-main ${options.mainClassName}`;
  row.appendChild(main);

  wrapper.appendChild(row);
  return { wrapper, row, main };
}
