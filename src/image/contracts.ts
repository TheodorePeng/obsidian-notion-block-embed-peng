export interface ImageSizeAccess {
  getWidthRatio: (blockId: string) => number | undefined;
  rememberWidthRatio: (blockId: string, widthRatio: number) => void;
  resetWidthRatio: (blockId: string) => void;
  touch: (blockId: string) => void;
  flush: () => Promise<void>;
}
