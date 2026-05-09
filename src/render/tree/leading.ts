import { TreeGuideState } from "./types";

function createGuideSegment(kind: "full" | "top" | "bottom"): HTMLSpanElement {
  const segment = document.createElement("span");
  segment.className = `nbe-tree-guide nbe-tree-guide-${kind}`;
  segment.setAttribute("aria-hidden", "true");
  return segment;
}

export function renderTreeLeading(state: TreeGuideState, iconEl?: HTMLElement): HTMLDivElement {
  const leading = document.createElement("div");
  leading.className = "nbe-tree-leading";
  leading.style.setProperty("--nbe-tree-depth", String(state.depth));

  for (let depth = 0; depth <= state.depth; depth += 1) {
    const slot = document.createElement("span");
    slot.className = "nbe-tree-slot";
    slot.style.setProperty("--nbe-tree-slot-depth", String(depth));

    if (depth < state.depth) {
      slot.classList.add("nbe-tree-slot-ancestor");
      if (state.ancestorRails[depth]) {
        slot.classList.add("is-active");
        slot.appendChild(createGuideSegment("full"));
      }
      leading.appendChild(slot);
      continue;
    }

    slot.classList.add("nbe-tree-slot-current");
    if (state.currentTopRail) {
      slot.classList.add("nbe-tree-has-prev-segment");
      slot.appendChild(createGuideSegment("top"));
    }
    if (state.currentBottomRail) {
      slot.classList.add("nbe-tree-has-next-segment");
      slot.appendChild(createGuideSegment("bottom"));
    }

    const iconHost = document.createElement("span");
    iconHost.className = "nbe-tree-icon-host";
    if (iconEl && state.hasIcon) {
      slot.classList.add("has-icon");
      iconHost.appendChild(iconEl);
    } else {
      slot.classList.add("is-empty");
    }
    slot.appendChild(iconHost);
    leading.appendChild(slot);
  }

  return leading;
}
