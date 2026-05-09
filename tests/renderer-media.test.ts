import { afterEach, describe, expect, it, vi } from "vitest";
import { createNode, createPointerLikeEvent, stubPointerCapture } from "./fixtures/notion-blocks";
import { renderTestEmbed } from "./helpers/render";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderEmbed media", () => {
  it("renders image block when imageUrl exists", () => {
    const root = createNode("image", "Caption");
    root.props.imageUrl = "https://example.com/test.png";

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
    });

    const image = container.querySelector("img");
    expect(image).toBeTruthy();
    expect(image?.getAttribute("src")).toBe("https://example.com/test.png");
    expect(container.textContent).toContain("Caption");
  });

  it("applies remembered image width and renders resize handle", () => {
    const root = createNode("image", "Caption");
    root.id = "image-block-1";
    root.props.imageUrl = "https://example.com/test.png";
    const touch = vi.fn();

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      imageSizing: {
        getWidthRatio: vi.fn(() => 0.42),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch,
        flush: vi.fn(async () => undefined),
      },
    });

    const frame = container.querySelector(".nbe-image-frame") as HTMLElement | null;
    const handle = container.querySelector(".nbe-image-resize-handle");
    expect(frame?.style.width).toBe("42%");
    expect(handle).toBeTruthy();
    expect(touch).toHaveBeenCalledWith("image-block-1");
  });

  it("resets remembered image width on double click", () => {
    const root = createNode("image", "Caption");
    root.id = "image-block-reset";
    root.props.imageUrl = "https://example.com/test.png";
    const resetWidthRatio = vi.fn();

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      imageSizing: {
        getWidthRatio: vi.fn(() => 0.48),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio,
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
    });

    const frame = container.querySelector(".nbe-image-frame") as HTMLElement | null;
    frame?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(resetWidthRatio).toHaveBeenCalledWith("image-block-reset");
    expect(frame?.style.width).toBe("100%");
  });

  it("commits resized image width on drag end", () => {
    const root = createNode("image", "Caption");
    root.id = "image-block-drag";
    root.props.imageUrl = "https://example.com/test.png";
    const rememberWidthRatio = vi.fn();

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      imageSizing: {
        getWidthRatio: vi.fn(() => 0.5),
        rememberWidthRatio,
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
    });

    const figure = container.querySelector(".nbe-image") as HTMLElement | null;
    const frame = container.querySelector(".nbe-image-frame") as HTMLElement | null;
    const handle = container.querySelector(".nbe-image-resize-handle") as HTMLElement | null;
    expect(figure).toBeTruthy();
    expect(frame).toBeTruthy();
    expect(handle).toBeTruthy();
    stubPointerCapture(handle!);

    Object.defineProperty(figure, "getBoundingClientRect", {
      value: () => ({ width: 400 }),
    });
    Object.defineProperty(frame, "getBoundingClientRect", {
      value: () => ({ width: 200 }),
    });

    handle?.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle?.dispatchEvent(createPointerLikeEvent("pointermove", 180));
    handle?.dispatchEvent(createPointerLikeEvent("pointerup", 180));

    expect(rememberWidthRatio).toHaveBeenCalledTimes(1);
    expect(rememberWidthRatio).toHaveBeenCalledWith("image-block-drag", 0.7);
    expect(frame?.style.width).toBe("70%");
  });

  it("prevents resize drag events from bubbling to the outer canvas/card host", () => {
    const root = createNode("image", "Caption");
    root.id = "image-block-stop-prop";
    root.props.imageUrl = "https://example.com/test.png";
    const pointerDownSpy = vi.fn();
    const pointerMoveSpy = vi.fn();

    const { container } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      imageSizing: {
        getWidthRatio: vi.fn(() => 0.5),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
    });
    container.addEventListener("pointerdown", pointerDownSpy);
    container.addEventListener("pointermove", pointerMoveSpy);

    const figure = container.querySelector(".nbe-image") as HTMLElement | null;
    const frame = container.querySelector(".nbe-image-frame") as HTMLElement | null;
    const handle = container.querySelector(".nbe-image-resize-handle") as HTMLElement | null;
    stubPointerCapture(handle!);
    Object.defineProperty(figure, "getBoundingClientRect", {
      value: () => ({ width: 400 }),
    });
    Object.defineProperty(frame, "getBoundingClientRect", {
      value: () => ({ width: 200 }),
    });

    handle?.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle?.dispatchEvent(createPointerLikeEvent("pointermove", 180));

    expect(pointerDownSpy).not.toHaveBeenCalled();
    expect(pointerMoveSpy).not.toHaveBeenCalled();
  });

  it("flushes image resize cleanup before rerender so the latest width is restored", () => {
    const root = createNode("image", "Caption");
    root.id = "image-block-cleanup";
    root.props.imageUrl = "https://example.com/test.png";
    let rememberedRatio = 0.5;

    const { container, cleanup } = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      imageSizing: {
        getWidthRatio: vi.fn(() => rememberedRatio),
        rememberWidthRatio: vi.fn((_, widthRatio: number) => {
          rememberedRatio = widthRatio;
        }),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
    });

    const figure = container.querySelector(".nbe-image") as HTMLElement | null;
    const frame = container.querySelector(".nbe-image-frame") as HTMLElement | null;
    const handle = container.querySelector(".nbe-image-resize-handle") as HTMLElement | null;
    stubPointerCapture(handle!);
    Object.defineProperty(figure, "getBoundingClientRect", {
      value: () => ({ width: 400 }),
    });
    Object.defineProperty(frame, "getBoundingClientRect", {
      value: () => ({ width: 200 }),
    });

    handle?.dispatchEvent(createPointerLikeEvent("pointerdown", 100));
    handle?.dispatchEvent(createPointerLikeEvent("pointermove", 180));
    cleanup();

    const rerender = renderTestEmbed(root, {
      currentUrl: "https://www.notion.so/page#block",
      imageSizing: {
        getWidthRatio: vi.fn(() => rememberedRatio),
        rememberWidthRatio: vi.fn((_, widthRatio: number) => {
          rememberedRatio = widthRatio;
        }),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
    });

    const nextFrame = rerender.container.querySelector(".nbe-image-frame") as HTMLElement | null;
    expect(rememberedRatio).toBe(0.7);
    expect(nextFrame?.style.width).toBe("70%");
    rerender.cleanup();
  });
});
