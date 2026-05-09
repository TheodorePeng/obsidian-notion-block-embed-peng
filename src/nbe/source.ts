import { ParsedNbeRef } from "../core/models";
import { parseNotionTargetFromSource } from "../notion/parser";

export interface NotionEmbedCodeBlock {
  source: string;
  lineStart: number;
  lineEnd: number;
}

export interface ExtractedNbeSourceRef extends ParsedNbeRef {
  lineStart: number;
  lineEnd: number;
}

export function extractNotionEmbedCodeBlocks(text: string): NotionEmbedCodeBlock[] {
  const lines = text.split(/\r?\n/g);
  const blocks: NotionEmbedCodeBlock[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trimStart() ?? "";
    if (!line.startsWith("```notion-embed")) continue;

    let end = index + 1;
    while (end < lines.length && lines[end].trim() !== "```") {
      end += 1;
    }
    if (end >= lines.length) {
      break;
    }

    blocks.push({
      source: lines.slice(index + 1, end).join("\n"),
      lineStart: index,
      lineEnd: end,
    });
    index = end;
  }

  return blocks;
}

export function extractNbeRefsFromDocument(text: string): ExtractedNbeSourceRef[] {
  const refs: ExtractedNbeSourceRef[] = [];
  for (const block of extractNotionEmbedCodeBlocks(text)) {
    try {
      const target = parseNotionTargetFromSource(block.source);
      if (target.mode !== "nbe_uri") continue;
      refs.push({
        ref: target.ref,
        pageNbeId: target.pageNbeId,
        blockNbeId: target.blockNbeId,
        lineStart: block.lineStart,
        lineEnd: block.lineEnd,
      });
    } catch {
      // Ignore invalid or legacy embeds while scanning registry input.
    }
  }
  return refs;
}
