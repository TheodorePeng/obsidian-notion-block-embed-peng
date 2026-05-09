import { NotionApiBlock, NotionApiBlockTree } from "../core/models";

function headingLevel(type: string): number | null {
  if (type === "heading_1") return 1;
  if (type === "heading_2") return 2;
  if (type === "heading_3") return 3;
  return null;
}

function blockPlainText(block: NotionApiBlock): string {
  const data = block[block.type] as { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> } | undefined;
  if (!data?.rich_text || !Array.isArray(data.rich_text)) return "";
  return data.rich_text.map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}

export function normalizeHeading(value: string): string {
  return value.replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

export function extractHeadingSection(nodes: NotionApiBlockTree[], heading: string): NotionApiBlockTree[] {
  const normalizedHeading = normalizeHeading(heading);
  let start = -1;
  let startLevel = 0;

  for (let i = 0; i < nodes.length; i++) {
    const level = headingLevel(nodes[i].block.type);
    if (!level) continue;
    const text = normalizeHeading(blockPlainText(nodes[i].block));
    if (text === normalizedHeading) {
      start = i;
      startLevel = level;
      break;
    }
  }

  if (start < 0) return [];

  const out: NotionApiBlockTree[] = [];
  for (let i = start; i < nodes.length; i++) {
    const node = nodes[i];
    if (i > start) {
      const level = headingLevel(node.block.type);
      if (level !== null && level <= startLevel) break;
    }
    out.push(node);
  }
  return out;
}
