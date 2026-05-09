import { EmbedBlockNode } from '../../src/core/models';

export function createNode(type: string, text: string): EmbedBlockNode {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    type,
    richText: [{ plainText: text }],
    children: [],
    props: {},
    meta: {
      sourcePageId: '44444444-4444-4444-4444-444444444444',
      notionTypeData: {},
    },
    capabilities: { writable: false },
  };
}

export function createPointerLikeEvent(type: string, clientX: number, pointerId = 1): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: pointerId,
  });
  return event;
}

export function stubPointerCapture(handle: HTMLElement): void {
  let capturedPointerId: number | null = null;
  Object.defineProperty(handle, 'setPointerCapture', {
    configurable: true,
    value: (pointerId: number) => {
      capturedPointerId = pointerId;
    },
  });
  Object.defineProperty(handle, 'releasePointerCapture', {
    configurable: true,
    value: (pointerId: number) => {
      if (capturedPointerId === pointerId) {
        capturedPointerId = null;
      }
    },
  });
  Object.defineProperty(handle, 'hasPointerCapture', {
    configurable: true,
    value: (pointerId: number) => capturedPointerId === pointerId,
  });
}
