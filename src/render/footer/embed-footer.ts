import { createUrlBarController } from "./url-bar-controller";

export interface EmbedFooterOptions {
  currentUrl: string;
  onApplyUrl?: (nextUrl: string) => boolean | Promise<boolean>;
  onRefresh: () => void | Promise<void>;
}

export function createEmbedFooter(options: EmbedFooterOptions): HTMLDivElement {
  const footer = document.createElement("div");
  footer.className = "nbe-footer";

  const urlBar = createUrlBarController({
    currentUrl: options.currentUrl,
    onApplyUrl: options.onApplyUrl,
  });

  const actions = document.createElement("div");
  actions.className = "nbe-actions";
  const refresh = document.createElement("button");
  refresh.className = "nbe-button";
  refresh.type = "button";
  refresh.textContent = "Refresh";
  refresh.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  refresh.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      if (urlBar.isEditing()) {
        const committed = await urlBar.commitIfDirty();
        if (!committed) return;
      }
      await options.onRefresh();
    })();
  });
  actions.appendChild(refresh);

  footer.appendChild(urlBar.element);
  footer.appendChild(actions);
  return footer;
}
