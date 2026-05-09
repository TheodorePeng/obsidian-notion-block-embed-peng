import { Logger } from "../core/logger";
import { RefreshPolicy } from "../core/settings";

interface ConfigureInput {
  policy: RefreshPolicy;
  intervalSec: number;
  task: () => Promise<void>;
}

export class RefreshScheduler {
  private timer: number | null = null;
  private running = false;

  constructor(private readonly logger: Logger) {}

  configure(input: ConfigureInput): void {
    this.stop();
    if (input.policy !== "interval") return;

    const intervalMs = Math.max(30, input.intervalSec) * 1000;
    this.timer = window.setInterval(async () => {
      if (this.running) return;
      this.running = true;
      try {
        await input.task();
      } catch (error) {
        this.logger.debug(
          `periodic refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.running = false;
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }
}
