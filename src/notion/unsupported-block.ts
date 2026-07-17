import { NotionApiBlock } from "../core/models";

export function getUnsupportedBlockType(block: NotionApiBlock): string | null {
  if (block.type !== "unsupported") return null;
  const data = block.unsupported;
  if (data && typeof data === "object" && typeof (data as { block_type?: unknown }).block_type === "string") {
    return (data as { block_type: string }).block_type;
  }
  return "unknown";
}
