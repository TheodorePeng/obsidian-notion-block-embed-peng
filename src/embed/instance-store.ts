import { MarkdownRenderChild } from "obsidian";
import { Logger } from "../core/logger";
import { runWithConcurrency } from "./concurrency";

import { RenderSessionHandle } from './types';


class EmbedLifecycleChild extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private readonly onDispose: () => void,
  ) {
    super(containerEl);
  }

  onload(): void {}

  onunload(): void {
    this.onDispose();
  }
}

export class EmbedInstanceStore {
  private nextId = 0;
  private active = new Map<string, RenderSessionHandle>();

  constructor(private readonly logger: Logger) {}

  track(
    container: HTMLElement,
    registerChild: (child: MarkdownRenderChild) => void,
    session: RenderSessionHandle,
  ): string {
    const id = `nbe-${this.nextId++}`;
    this.active.set(id, session);
    registerChild(
      new EmbedLifecycleChild(container, () => {
        const active = this.active.get(id);
        this.active.delete(id);
        active?.dispose();
      }),
    );
    return id;
  }

  async refreshAll(options?: { concurrency?: number }): Promise<void> {
    const sessions = Array.from(this.active.values());
    if (sessions.length === 0) return;

    await runWithConcurrency(sessions.length, options?.concurrency ?? 1, async (index) => {
      try {
        await sessions[index].rerender();
      } catch (error) {
        this.logger.debug(`refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  clear(): void {
    for (const session of this.active.values()) {
      session.dispose();
    }
    this.active.clear();
  }

  hasActiveEmbeds(): boolean {
    return this.active.size > 0;
  }
}
