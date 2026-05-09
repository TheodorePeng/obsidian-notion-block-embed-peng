export class Logger {
  private enabled = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  debug(message: string): void {
    if (!this.enabled) return;
    // eslint-disable-next-line no-console
    console.log(`[notion-block-embed] ${message}`);
  }
}
