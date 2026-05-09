import { EmbedBlockNode } from '../core/models';
import { normalizeNotionId } from '../notion/parser';

function toCompactId(id: string): string {
  return normalizeNotionId(id).replace(/-/g, '');
}

export function buildNotionBlockUrl(originalUrl: string, blockId: string): string {
  const url = new URL(originalUrl);
  url.hash = toCompactId(blockId);
  return url.toString();
}

export function resolveNotionOpenUrl(originalUrl: string, node?: EmbedBlockNode | null): string {
  if (!node?.capabilities.canOpenInNotion) {
    return originalUrl;
  }
  return buildNotionBlockUrl(originalUrl, node.id);
}
