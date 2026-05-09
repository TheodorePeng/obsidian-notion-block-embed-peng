import { createEmbedFooter, type EmbedFooterOptions } from "./footer/embed-footer";

export function renderLoading(container: HTMLElement): void {
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "nbe-loading";
  box.textContent = "Loading Notion content...";
  container.appendChild(box);
}

export function renderError(container: HTMLElement, message: string, footer?: EmbedFooterOptions): void {
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "nbe-embed";
  const content = document.createElement("div");
  content.className = "nbe-content";
  const box = document.createElement("div");
  box.className = "nbe-error";
  box.textContent = message;
  content.appendChild(box);
  wrapper.appendChild(content);
  if (footer) {
    wrapper.appendChild(createEmbedFooter(footer));
  }
  container.appendChild(wrapper);
}

export function renderEmpty(container: HTMLElement): void {
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "nbe-empty";
  box.textContent = "No content found for this Notion block.";
  container.appendChild(box);
}
