import { Logger } from "../core/logger";

export type InitialRenderPriority = "selected" | "visible" | "offscreen";

interface QueueEntry {
  id: string;
  run: () => Promise<void>;
  shouldSkip: () => boolean;
  readyAt: number;
  priority: InitialRenderPriority;
  sequence: number;
}

interface EnqueueOptions {
  delayMs?: number;
  priority?: InitialRenderPriority;
}

const PRIORITY_ORDER: Record<InitialRenderPriority, number> = {
  selected: 0,
  visible: 1,
  offscreen: 2,
};

export class InitialRenderQueue {
  private queue: QueueEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = 0;
  private nextId = 0;
  private nextSequence = 0;

  constructor(
    private readonly logger: Logger,
    private readonly delayMs: number,
    private readonly concurrency: number,
  ) {}

  enqueue(
    run: () => Promise<void>,
    shouldSkip: () => boolean,
    options?: EnqueueOptions,
  ): string {
    const priority = options?.priority ?? "offscreen";
    const id = `render-${this.nextId++}`;
    this.queue.push({
      id,
      run,
      shouldSkip,
      readyAt: Date.now() + (options?.delayMs ?? this.delayForPriority(priority)),
      priority,
      sequence: this.nextSequence++,
    });
    this.sortQueue();
    this.logger.debug(`enqueue reason=${priority}`);
    this.schedule();
    return id;
  }

  reprioritize(id: string, priority: InitialRenderPriority): void {
    const entry = this.queue.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (PRIORITY_ORDER[priority] >= PRIORITY_ORDER[entry.priority]) return;
    entry.priority = priority;
    entry.readyAt = Math.min(entry.readyAt, Date.now() + this.delayForPriority(priority));
    this.sortQueue();
    this.schedule();
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.running = 0;
  }

  private delayForPriority(priority: InitialRenderPriority): number {
    return priority === "offscreen" ? this.delayMs : 0;
  }

  private schedule(): void {
    if (this.running >= this.concurrency) return;
    const next = this.queue[0];
    if (!next) return;
    const waitMs = Math.max(0, next.readyAt - Date.now());
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, waitMs);
  }

  private async pump(): Promise<void> {
    while (this.running < this.concurrency) {
      this.sortQueue();
      const next = this.queue[0];
      if (!next) return;
      if (next.shouldSkip()) {
        this.logger.debug("skip disposed");
        this.queue.shift();
        continue;
      }
      const waitMs = next.readyAt - Date.now();
      if (waitMs > 0) {
        this.schedule();
        return;
      }
      this.queue.shift();
      this.running += 1;
      this.logger.debug(`dequeue priority=${next.priority}`);
      void next
        .run()
        .catch((error) => {
          this.logger.debug(`initial render failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          this.running = Math.max(0, this.running - 1);
          this.schedule();
        });
    }
  }

  private sortQueue(): void {
    this.queue.sort((left, right) => {
      const byPriority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (byPriority !== 0) return byPriority;
      const byReadyAt = left.readyAt - right.readyAt;
      if (byReadyAt !== 0) return byReadyAt;
      return left.sequence - right.sequence;
    });
  }
}
