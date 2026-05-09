import { PluginError } from "../core/errors";
import { EmbedBlockNode, NotionApiRichText, WritableBlockType } from "../core/models";

function buildPlainTextRichText(content: string): NotionApiRichText[] {
  if (!content.trim()) return [];
  return [
    {
      type: "text",
      plain_text: content,
      text: {
        content,
      },
    },
  ];
}

function requireWritableType(node: EmbedBlockNode): WritableBlockType {
  if (!node.capabilities.writable || !node.capabilities.writableType) {
    throw new PluginError("INVALID_INPUT", `Block type ${node.type} is read-only in limited writeback mode.`);
  }
  return node.capabilities.writableType;
}

function getTypeData(node: EmbedBlockNode): Record<string, unknown> {
  return node.meta.notionTypeData;
}

function getRawRichText(node: EmbedBlockNode): NotionApiRichText[] {
  const value = getTypeData(node).rich_text;
  return Array.isArray(value) ? (value as NotionApiRichText[]) : [];
}

function createPayloadForRichText(
  node: EmbedBlockNode,
  richText: NotionApiRichText[],
  overrides?: { checked?: boolean },
): Record<string, unknown> {
  const type = requireWritableType(node);
  const data = getTypeData(node);
  const payload: Record<string, unknown> = {};

  if (type === "paragraph") {
    payload.paragraph = {
      rich_text: richText,
      color: data.color ?? "default",
    };
    return payload;
  }
  if (type === "heading_1" || type === "heading_2" || type === "heading_3") {
    const headingPayload: Record<string, unknown> = {
      rich_text: richText,
      color: data.color ?? "default",
    };
    if (Object.prototype.hasOwnProperty.call(data, "is_toggleable")) {
      headingPayload.is_toggleable = Boolean(data.is_toggleable);
    }
    payload[type] = headingPayload;
    return payload;
  }
  if (type === "quote") {
    payload.quote = {
      rich_text: richText,
      color: data.color ?? "default",
    };
    return payload;
  }
  if (type === "code") {
    payload.code = {
      rich_text: richText,
      language: data.language ?? "plain text",
      caption: Array.isArray(data.caption) ? data.caption : [],
      color: data.color ?? "default",
    };
    return payload;
  }
  if (type === "bulleted_list_item" || type === "numbered_list_item") {
    payload[type] = {
      rich_text: richText,
      color: data.color ?? "default",
    };
    return payload;
  }
  if (type === "to_do") {
    payload.to_do = {
      rich_text: richText,
      checked: overrides?.checked ?? Boolean(data.checked),
      color: data.color ?? "default",
    };
    return payload;
  }
  throw new PluginError("INVALID_INPUT", `Unsupported writable type: ${type}`);
}

export function buildUpdatePayload(node: EmbedBlockNode, nextText: string): Record<string, unknown> {
  return createPayloadForRichText(node, buildPlainTextRichText(nextText));
}

export function buildTodoCheckedPayload(node: EmbedBlockNode, checked: boolean): Record<string, unknown> {
  return createPayloadForRichText(node, getRawRichText(node), { checked });
}

export function buildInsertSiblingBelowChildren(node: EmbedBlockNode): Array<Record<string, unknown>> {
  const data = getTypeData(node);
  if (node.type === "bulleted_list_item") {
    return [
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [],
          color: data.color ?? "default",
        },
      },
    ];
  }

  if (node.type === "to_do") {
    return [
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [],
          checked: false,
          color: data.color ?? "default",
        },
      },
    ];
  }

  throw new PluginError("INVALID_INPUT", `Block type ${node.type} does not support sibling insertion.`);
}
