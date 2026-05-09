export class RenderVersionTracker {
  private value = 0;

  next(): number {
    this.value += 1;
    return this.value;
  }

  isCurrent(version: number): boolean {
    return version === this.value;
  }
}
