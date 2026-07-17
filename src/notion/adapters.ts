import {
  EmbedBlockNode,
  EmbedCalloutIcon,
  EmbedRichText,
  NotionApiBlock,
  NotionApiBlockTree,
  NotionApiRichText,
} from "../core/models";
import { getBlockCapabilities } from "../writeback/capabilities";
import { getUnsupportedBlockType } from "./unsupported-block";

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

function getUrlFromTypeData(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (!value || typeof value !== "object") return undefined;
  const url = (value as { url?: unknown }).url;
  return typeof url === "string" && url.trim() ? url : undefined;
}

function getImageProps(data: Record<string, unknown>): { imageUrl?: string; imageUnavailableReason?: string } {
  const type = typeof data.type === "string" ? data.type : "";
  const directUrl = typeof data.url === "string" && data.url.trim() ? data.url : undefined;
  if (directUrl) {
    return { imageUrl: directUrl };
  }

  if (type === "external") {
    const imageUrl = getUrlFromTypeData(data, "external");
    return imageUrl ? { imageUrl } : { imageUnavailableReason: "External image URL is missing." };
  }
  if (type === "file") {
    const imageUrl = getUrlFromTypeData(data, "file");
    return imageUrl
      ? { imageUrl }
      : { imageUnavailableReason: "Notion did not return a downloadable URL for this image file." };
  }
  if (type === "file_upload") {
    const imageUrl = getUrlFromTypeData(data, "file_upload");
    return imageUrl
      ? { imageUrl }
      : {
          imageUnavailableReason:
            "Notion returned a file_upload reference without a downloadable URL. Re-fetch the block after the upload is attached.",
        };
  }

  const fallbackUrl = getUrlFromTypeData(data, "file") ?? getUrlFromTypeData(data, "external");
  if (fallbackUrl) {
    return { imageUrl: fallbackUrl };
  }

  if (!type && Array.isArray(data.caption) && Object.keys(data).length === 1) {
    return {
      imageUnavailableReason:
        "Notion did not expose a file source for this image. This often happens with private attachment images imported into Notion.",
    };
  }

  return {
    imageUnavailableReason: type ? `Unsupported Notion image type: ${type}.` : "Image URL is missing.",
  };
}

function getCalloutIcon(data: Record<string, unknown>): EmbedCalloutIcon | undefined {
  const icon = data.icon;
  if (!icon || typeof icon !== "object") return undefined;
  const iconData = icon as Record<string, unknown>;
  if (iconData.type === "emoji" && typeof iconData.emoji === "string" && iconData.emoji) {
    return { kind: "emoji", value: iconData.emoji };
  }

  const iconType = iconData.type;
  if (iconType !== "external" && iconType !== "file" && iconType !== "custom_emoji") return undefined;
  const source = iconData[iconType];
  if (!source || typeof source !== "object") return undefined;
  const url = (source as { url?: unknown }).url;
  if (typeof url !== "string" || !url.trim()) return undefined;
  return { kind: "image", url, alt: iconType === "custom_emoji" ? "Custom emoji" : "Callout icon" };
}

function getTableCells(data: Record<string, unknown>): EmbedRichText[][] | undefined {
  if (!Array.isArray(data.cells)) return undefined;
  return data.cells.map((cell) => (Array.isArray(cell) ? mapRichTextList(cell as NotionApiRichText[]) : []));
}

function getProps(block: NotionApiBlock): {
  checked?: boolean;
  codeLanguage?: string;
  imageUrl?: string;
  imageUnavailableReason?: string;
  columnWidthRatio?: number;
  equationExpression?: string;
  syncedFromBlockId?: string | null;
  calloutColor?: string;
  calloutIcon?: EmbedCalloutIcon;
  tableWidth?: number;
  tableHasColumnHeader?: boolean;
  tableHasRowHeader?: boolean;
  tableCells?: EmbedRichText[][];
  unsupportedBlockType?: string;
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
    return getImageProps(data);
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
  if (block.type === "callout") {
    return {
      calloutColor: typeof data.color === "string" ? data.color : undefined,
      calloutIcon: getCalloutIcon(data),
    };
  }
  if (block.type === "table") {
    return {
      tableWidth: typeof data.table_width === "number" ? data.table_width : undefined,
      tableHasColumnHeader: Boolean(data.has_column_header),
      tableHasRowHeader: Boolean(data.has_row_header),
    };
  }
  if (block.type === "table_row") {
    return {
      tableCells: getTableCells(data),
    };
  }
  if (block.type === "unsupported") {
    return {
      unsupportedBlockType: getUnsupportedBlockType(block) ?? "unknown",
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
