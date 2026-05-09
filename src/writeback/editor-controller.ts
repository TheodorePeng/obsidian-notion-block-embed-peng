import { Notice } from "obsidian";
import { EmbedBlockNode } from "../core/models";
import { userMessageFromError } from "../core/errors";

interface OpenEditorOptions {
  anchorEl: HTMLElement;
  block: EmbedBlockNode;
  initialText: string;
  onSave: (nextText: string) => Promise<void>;
}

export class FloatingEditorController {
  private root: HTMLElement | null = null;
  private outsideClick: ((evt: MouseEvent) => void) | null = null;
  private escHandler: ((evt: KeyboardEvent) => void) | null = null;

  open(options: OpenEditorOptions): void {
    this.close();

    const root = document.createElement("div");
    root.className = "nbe-floating-editor";

    const title = document.createElement("h4");
    title.textContent = "Edit Notion Block";
    root.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "nbe-editor-meta";
    meta.textContent = `${options.block.type} · ${options.block.id.slice(0, 8)}`;
    root.appendChild(meta);

    const textarea = document.createElement("textarea");
    textarea.value = options.initialText;
    root.appendChild(textarea);

    const errorLine = document.createElement("div");
    errorLine.className = "nbe-editor-error";
    root.appendChild(errorLine);

    const actions = document.createElement("div");
    actions.className = "nbe-editor-actions";

    const cancel = document.createElement("button");
    cancel.className = "nbe-button";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.close());

    const save = document.createElement("button");
    save.className = "nbe-button";
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      errorLine.textContent = "";
      save.disabled = true;
      cancel.disabled = true;
      try {
        await options.onSave(textarea.value);
        this.close();
        new Notice("Notion block updated.");
      } catch (error) {
        errorLine.textContent = userMessageFromError(error);
      } finally {
        save.disabled = false;
        cancel.disabled = false;
      }
    });

    actions.appendChild(cancel);
    actions.appendChild(save);
    root.appendChild(actions);
    document.body.appendChild(root);

    this.positionRoot(root, options.anchorEl);
    this.root = root;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    this.outsideClick = (event: MouseEvent) => {
      if (!this.root) return;
      const target = event.target as Node | null;
      if (target && !this.root.contains(target)) this.close();
    };
    this.escHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") this.close();
    };
    window.addEventListener("mousedown", this.outsideClick, true);
    window.addEventListener("keydown", this.escHandler, true);
  }

  close(): void {
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    if (this.outsideClick) {
      window.removeEventListener("mousedown", this.outsideClick, true);
      this.outsideClick = null;
    }
    if (this.escHandler) {
      window.removeEventListener("keydown", this.escHandler, true);
      this.escHandler = null;
    }
  }

  private positionRoot(root: HTMLElement, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 16);
    root.style.width = `${width}px`;
    root.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    root.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 240)}px`;
  }
}
