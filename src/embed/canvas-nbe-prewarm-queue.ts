import { Logger } from "../core/logger";

interface QueueEntry {
  pageNbeId: string;
  run: () => Promise<void>;
}

export class CanvasNbePrewarmQueue {
  private readonly seen = new Set<string>();
  private readonly queue: QueueEntry[] = [];
  private running = false;

  constructor(private readonly logger: Logger) {}

  enqueue(pageNbeId: string, run: () => Promise<void>): void {
    if (this.seen.has(pageNbeId)) {
      return;
    }
    this.seen.add(pageNbeId);
    this.queue.push({ pageNbeId, run });
    void this.pump();
  }

  clear(): void {
    this.queue.length = 0;
    this.seen.clear();
    this.running = false;
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;

    this.running = true;
    try {
      await next.run();
    } catch (error) {
      this.logger.debug(
        `nbe-page-index prewarm failed ${next.pageNbeId} ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
      void this.pump();
    }
  }
}
