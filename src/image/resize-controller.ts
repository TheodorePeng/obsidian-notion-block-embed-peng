import { applyImageWidthRatio } from "./presentation";
import { clampImageWidthRatio } from "./size-store";

interface ImageResizeControllerOptions {
  blockId: string;
  targetEl: HTMLElement;
  handleEl: HTMLElement;
  initialWidthRatio?: number;
  onCommit: (blockId: string, widthRatio: number) => void;
  onReset: (blockId: string) => void;
  onFlush?: () => Promise<void> | void;
  watchRoots?: Array<HTMLElement | null | undefined>;
}

export interface ImageResizeSession {
  flushPending: () => void;
  dispose: () => void;
}

export function attachImageResizeController(options: ImageResizeControllerOptions): ImageResizeSession {
  const { blockId, targetEl, handleEl, onCommit, onReset, onFlush } = options;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  let parentWidth = 0;
  let nextRatio = clampImageWidthRatio(options.initialWidthRatio ?? 1);
  let lastCommittedRatio = clampImageWidthRatio(options.initialWidthRatio ?? 1);
  let activePointerId: number | null = null;
  let disconnectObserver: MutationObserver | null = null;
  let disconnectCheckFrame: number | null = null;

  const watchedRoots = (): HTMLElement[] =>
    [targetEl, handleEl, ...(options.watchRoots ?? [])].filter((value): value is HTMLElement => Boolean(value));

  const commitPending = () => {
    const ratio = clampImageWidthRatio(nextRatio);
    if (Math.abs(ratio - lastCommittedRatio) < 0.0001) return;
    lastCommittedRatio = ratio;
    onCommit(blockId, ratio);
  };

  const flushPersistedState = () => {
    if (!onFlush) return;
    void onFlush();
  };

  const teardownInteractionGuard = () => {
    if (disconnectObserver) {
      disconnectObserver.disconnect();
      disconnectObserver = null;
    }
    if (disconnectCheckFrame !== null) {
      cancelAnimationFrame(disconnectCheckFrame);
      disconnectCheckFrame = null;
    }
    window.removeEventListener("blur", onWindowBlur, true);
    document.removeEventListener("visibilitychange", onVisibilityChange, true);
  };

  const hasDisconnectedRoot = () => watchedRoots().some((root) => !root.isConnected);

  const scheduleDisconnectCheck = () => {
    if (!dragging || disconnectCheckFrame !== null) return;
    disconnectCheckFrame = requestAnimationFrame(() => {
      disconnectCheckFrame = null;
      if (!dragging) return;
      if (hasDisconnectedRoot()) {
        finalizeResize();
        return;
      }
      scheduleDisconnectCheck();
    });
  };

  const onWindowBlur = () => {
    finalizeResize();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      finalizeResize();
    }
  };

  const setupInteractionGuard = () => {
    teardownInteractionGuard();
    window.addEventListener("blur", onWindowBlur, true);
    document.addEventListener("visibilitychange", onVisibilityChange, true);
    if (typeof MutationObserver !== "undefined" && document.body) {
      disconnectObserver = new MutationObserver(() => {
        if (!dragging) return;
        if (hasDisconnectedRoot()) {
          finalizeResize();
          return;
        }
        scheduleDisconnectCheck();
      });
      disconnectObserver.observe(document.body, { childList: true, subtree: true });
    }
    scheduleDisconnectCheck();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - startX;
    const ratio = clampImageWidthRatio((startWidth + deltaX) / Math.max(parentWidth, 1));
    nextRatio = ratio;
    applyImageWidthRatio(targetEl, ratio);
    commitPending();
  };

  const releasePointerCapture = () => {
    if (activePointerId === null) return;
    if (typeof handleEl.hasPointerCapture === "function" && !handleEl.hasPointerCapture(activePointerId)) return;
    if (typeof handleEl.releasePointerCapture === "function") {
      try {
        handleEl.releasePointerCapture(activePointerId);
      } catch {
        // Ignore release failures from stale pointers.
      }
    }
  };

  const finalizeResize = (event?: PointerEvent) => {
    if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
    if (!dragging) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragging = false;
    document.body.classList.remove("nbe-image-is-resizing");
    commitPending();
    flushPersistedState();
    teardownInteractionGuard();
    releasePointerCapture();
    activePointerId = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const parent = targetEl.parentElement;
    if (!parent) return;

    activePointerId = typeof event.pointerId === "number" ? event.pointerId : 1;
    dragging = true;
    startX = event.clientX;
    startWidth = targetEl.getBoundingClientRect().width;
    parentWidth = parent.getBoundingClientRect().width;
    nextRatio = clampImageWidthRatio(startWidth / Math.max(parentWidth, 1));
    lastCommittedRatio = nextRatio;
    document.body.classList.add("nbe-image-is-resizing");
    setupInteractionGuard();
    if (typeof handleEl.setPointerCapture === "function") {
      try {
        handleEl.setPointerCapture(activePointerId);
      } catch {
        // Ignore capture failures in unsupported environments.
      }
    }
  };

  const onDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragging = false;
    activePointerId = null;
    document.body.classList.remove("nbe-image-is-resizing");
    teardownInteractionGuard();
    applyImageWidthRatio(targetEl, 1);
    onReset(blockId);
    flushPersistedState();
  };

  handleEl.addEventListener("pointerdown", onPointerDown);
  handleEl.addEventListener("pointermove", onPointerMove);
  handleEl.addEventListener("pointerup", finalizeResize);
  handleEl.addEventListener("pointercancel", finalizeResize);
  handleEl.addEventListener("lostpointercapture", finalizeResize);
  targetEl.addEventListener("dblclick", onDoubleClick);

  return {
    flushPending: () => {
      commitPending();
      flushPersistedState();
    },
    dispose: () => {
      commitPending();
      flushPersistedState();
      dragging = false;
      document.body.classList.remove("nbe-image-is-resizing");
      teardownInteractionGuard();
      releasePointerCapture();
      activePointerId = null;
      handleEl.removeEventListener("pointerdown", onPointerDown);
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", finalizeResize);
      handleEl.removeEventListener("pointercancel", finalizeResize);
      handleEl.removeEventListener("lostpointercapture", finalizeResize);
      targetEl.removeEventListener("dblclick", onDoubleClick);
    },
  };
}
