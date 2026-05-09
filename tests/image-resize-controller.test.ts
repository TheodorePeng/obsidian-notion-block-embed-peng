import { afterEach, describe, expect, it, vi } from "vitest";
import { attachImageResizeController } from "../src/image/resize-controller";

function createPointerLikeEvent(type: string, clientX: number, pointerId = 1): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
  });
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: pointerId,
  });
  return event;
}

function stubPointerCapture(handle: HTMLElement): void {
  let capturedPointerId: number | null = null;
  Object.defineProperty(handle, "setPointerCapture", {
    configurable: true,
    value: vi.fn((pointerId: number) => {
      capturedPointerId = pointerId;
    }),
  });
  Object.defineProperty(handle, "releasePointerCapture", {
    configurable: true,
    value: vi.fn((pointerId: number) => {
      if (capturedPointerId === pointerId) {
        capturedPointerId = null;
      }
    }),
  });
  Object.defineProperty(handle, "hasPointerCapture", {
    configurable: true,
    value: vi.fn((pointerId: number) => capturedPointerId === pointerId),
  });
}

function setupDom() {
  const host = document.createElement("div");
  const frame = document.createElement("div");
  const handle = document.createElement("button");
  host.appendChild(frame);
  frame.appendChild(handle);
  document.body.appendChild(host);

  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({ width: 400 }),
  });
  Object.defineProperty(frame, "getBoundingClientRect", {
    value: () => ({ width: 200 }),
  });
  stubPointerCapture(handle);

  return { host, frame, handle };
}

describe("attachImageResizeController", () => {
  afterEach(() => {
    document.body.classList.remove("nbe-image-is-resizing");
    document.body.innerHTML = "";
  });

  it("uses pointer events to resize and remember the latest width", () => {
    const { host, frame, handle } = setupDom();
    const onCommit = vi.fn();

    attachImageResizeController({
      blockId: "image-1",
      targetEl: frame,
      handleEl: handle,
      initialWidthRatio: 0.5,
      onCommit,
      onReset: vi.fn(),
    });

    const parentPointerDown = vi.fn();
    host.addEventListener("pointerdown", parentPointerDown);

    handle.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle.dispatchEvent(createPointerLikeEvent("pointermove", 180));
    handle.dispatchEvent(createPointerLikeEvent("pointerup", 180));

    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledWith("image-1", 0.7);
    expect(frame.style.width).toBe("70%");
    expect(document.body.classList.contains("nbe-image-is-resizing")).toBe(false);
  });

  it("finalizes cleanly on pointercancel and lostpointercapture", () => {
    const { frame, handle } = setupDom();
    const onCommit = vi.fn();

    attachImageResizeController({
      blockId: "image-2",
      targetEl: frame,
      handleEl: handle,
      initialWidthRatio: 0.5,
      onCommit,
      onReset: vi.fn(),
    });

    handle.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle.dispatchEvent(createPointerLikeEvent("pointermove", 140));
    handle.dispatchEvent(createPointerLikeEvent("pointercancel", 140));

    expect(onCommit).toHaveBeenCalledWith("image-2", 0.6);
    expect(document.body.classList.contains("nbe-image-is-resizing")).toBe(false);

    handle.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle.dispatchEvent(createPointerLikeEvent("pointermove", 180));
    handle.dispatchEvent(createPointerLikeEvent("lostpointercapture", 180));

    expect(onCommit).toHaveBeenCalledWith("image-2", 0.7);
    expect(document.body.classList.contains("nbe-image-is-resizing")).toBe(false);
  });

  it("flushes the latest ratio and detaches listeners on dispose", () => {
    const { frame, handle } = setupDom();
    const onCommit = vi.fn();
    const onFlush = vi.fn();

    const session = attachImageResizeController({
      blockId: "image-3",
      targetEl: frame,
      handleEl: handle,
      initialWidthRatio: 0.5,
      onCommit,
      onReset: vi.fn(),
      onFlush,
    });

    handle.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle.dispatchEvent(createPointerLikeEvent("pointermove", 160));
    session.dispose();
    handle.dispatchEvent(createPointerLikeEvent("pointermove", 220));

    expect(onCommit).toHaveBeenCalledWith("image-3", 0.65);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalled();
    expect(document.body.classList.contains("nbe-image-is-resizing")).toBe(false);
  });

  it("flushes the latest ratio when the window blurs during drag", () => {
    const { frame, handle } = setupDom();
    const onCommit = vi.fn();
    const onFlush = vi.fn();

    attachImageResizeController({
      blockId: "image-4",
      targetEl: frame,
      handleEl: handle,
      initialWidthRatio: 0.5,
      onCommit,
      onReset: vi.fn(),
      onFlush,
    });

    handle.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle.dispatchEvent(createPointerLikeEvent("pointermove", 180));
    window.dispatchEvent(new Event("blur"));

    expect(onCommit).toHaveBeenCalledWith("image-4", 0.7);
    expect(onFlush).toHaveBeenCalled();
    expect(document.body.classList.contains("nbe-image-is-resizing")).toBe(false);
  });

  it("flushes the latest ratio when watched roots disconnect during drag", async () => {
    const { host, frame, handle } = setupDom();
    const onCommit = vi.fn();
    const onFlush = vi.fn();

    attachImageResizeController({
      blockId: "image-5",
      targetEl: frame,
      handleEl: handle,
      initialWidthRatio: 0.5,
      onCommit,
      onReset: vi.fn(),
      onFlush,
      watchRoots: [host],
    });

    handle.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle.dispatchEvent(createPointerLikeEvent("pointermove", 160));
    host.remove();
    await Promise.resolve();
    await Promise.resolve();

    expect(onCommit).toHaveBeenCalledWith("image-5", 0.65);
    expect(onFlush).toHaveBeenCalled();
    expect(document.body.classList.contains("nbe-image-is-resizing")).toBe(false);
  });
});
