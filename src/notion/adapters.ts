import {
  EmbedBlockNode,
  EmbedRichText,
  NotionApiBlock,
  NotionApiBlockTree,
  NotionApiRichText,
} from "../core/models";
import { getBlockCapabilities } from "../writeback/capabilities";

function getTypeData(block: NotionApiBlock): Record<string, unknown> {
  const data = block[block.type];
  return (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
}

function getRichText(block: NotionApiBlock): EmbedRichText[] {
  const value = getTypeData(block).rich_text;
  if (!Array.isArray(value)) return [];
  return mapRichTextList(value as NotionApiRichText[]);
}

function mapRichTextList(items: NotionApiRichText[]): EmbedRichText[] {
  return items.map((item) => ({
    plainText: item.plain_text ?? item.equation?.expression ?? item.text?.content ?? "",
    href: item.href ?? item.text?.link?.url ?? null,
    sourceType: item.type,
    equationExpression: item.type === "equation" ? item.equation?.expression ?? item.plain_text ?? "" : undefined,
    annotations: item.annotations
      ? {
          bold: Boolean(item.annotations.bold),
          italic: Boolean(item.annotations.italic),
          strikethrough: Boolean(item.annotations.strikethrough),
          underline: Boolean(item.annotations.underline),
          code: Boolean(item.annotations.code),
          color: typeof item.annotations.color === "string" ? item.annotations.color : undefined,
        }
      : undefined,
  }));
}

function getImageUrl(data: Record<string, unknown>): string | undefined {
  const type = typeof data.type === "string" ? data.type : "";
  if (type === "external") {
    const external = data.external as { url?: unknown } | undefined;
    return typeof external?.url === "string" ? external.url : undefined;
  }
  if (type === "file") {
    const file = data.file as { url?: unknown } | undefined;
    return typeof file?.url === "string" ? file.url : undefined;
  }
  return undefined;
}

function getProps(block: NotionApiBlock): {
  checked?: boolean;
  codeLanguage?: string;
  imageUrl?: string;
  columnWidthRatio?: number;
  equationExpression?: string;
  syncedFromBlockId?: string | null;
} {
  const data = getTypeData(block);
  if (block.type === "to_do") {
    return {
      checked: Boolean(data.checked),
    };
  }
  if (block.type === "code") {
    return {
      codeLanguage: typeof data.language === "string" ? data.language : "plain text",
    };
  }
  if (block.type === "image") {
    return {
      imageUrl: getImageUrl(data),
    };
  }
  if (block.type === "column") {
    return {
      columnWidthRatio: typeof data.width_ratio === "number" ? data.width_ratio : undefined,
    };
  }
  if (block.type === "equation") {
    return {
      equationExpression: typeof data.expression === "string" ? data.expression : undefined,
    };
  }
  if (block.type === "synced_block") {
    const syncedFrom = data.synced_from as { block_id?: unknown } | null | undefined;
    return {
      syncedFromBlockId: typeof syncedFrom?.block_id === "string" ? syncedFrom.block_id : null,
    };
  }
  return {};
}

function getNodeRichText(block: NotionApiBlock): EmbedRichText[] {
  if (block.type !== "image") {
    return getRichText(block);
  }
  const data = getTypeData(block);
  if (!Array.isArray(data.caption)) return [];
  return mapRichTextList(data.caption as NotionApiRichText[]);
}

function mapNode(node: NotionApiBlockTree, sourcePageId: string): EmbedBlockNode {
  const children = node.children.map((child) => mapNode(child, sourcePageId));
  const parent = node.block.parent as
    | {
        type?: unknown;
        block_id?: unknown;
        page_id?: unknown;
      }
    | undefined;

  return {
    id: node.block.id,
    type: node.block.type,
    richText: getNodeRichText(node.block),
    children,
    props: getProps(node.block),
    meta: {
      sourcePageId,
      parentId:
        typeof parent?.block_id === "string"
          ? parent.block_id
          : typeof parent?.page_id === "string"
            ? parent.page_id
            : undefined,
      parentType:
        parent?.type === "block_id" || parent?.type === "page_id"
          ? (parent.type as "block_id" | "page_id")
          : undefined,
      lastEditedTime: node.block.last_edited_time,
      notionTypeData: getTypeData(node.block),
    },
    capabilities: getBlockCapabilities(node.block, children.length),
  };
}

export function toEmbedNodeTree(tree: NotionApiBlockTree, sourcePageId: string): EmbedBlockNode {
  return mapNode(tree, sourcePageId);
}
