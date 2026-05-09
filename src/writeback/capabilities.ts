import { EmbedBlockCapabilities, NotionApiBlock, NotionApiRichText, WritableBlockType } from "../core/models";

type TextEditMode = "none" | "simple_plain_text";

interface BlockCapabilityPolicy {
  writableType?: WritableBlockType;
  textEditMode?: TextEditMode;
  canInsertSiblingBelow?: boolean;
  canToggleTodo?: boolean;
  canOpenInNotion?: boolean;
}

const BLOCK_CAPABILITY_POLICIES: Record<string, BlockCapabilityPolicy> = {
  paragraph: {
    writableType: "paragraph",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true,
  },
  heading_1: {
    writableType: "heading_1",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true,
  },
  heading_2: {
    writableType: "heading_2",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true,
  },
  heading_3: {
    writableType: "heading_3",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true,
  },
  quote: {
    writableType: "quote",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true,
  },
  code: {
    writableType: "code",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true,
  },
  bulleted_list_item: {
    writableType: "bulleted_list_item",
    textEditMode: "simple_plain_text",
    canInsertSiblingBelow: true,
    canOpenInNotion: true,
  },
  numbered_list_item: {
    writableType: "numbered_list_item",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true,
  },
  to_do: {
    writableType: "to_do",
    textEditMode: "simple_plain_text",
    canInsertSiblingBelow: true,
    canToggleTodo: true,
    canOpenInNotion: true,
  },
  toggle: {
    canOpenInNotion: true,
  },
};

export function resolveWritableType(type: string): WritableBlockType | null {
  return BLOCK_CAPABILITY_POLICIES[type]?.writableType ?? null;
}

function getRawRichText(block: NotionApiBlock): NotionApiRichText[] {
  const typeData = block[block.type];
  if (!typeData || typeof typeData !== "object") return [];
  const value = (typeData as { rich_text?: unknown }).rich_text;
  return Array.isArray(value) ? (value as NotionApiRichText[]) : [];
}

function hasNonDefaultAnnotations(item: NotionApiRichText): boolean {
  const annotations = item.annotations;
  if (!annotations) return false;
  return Boolean(
    annotations.bold ||
      annotations.italic ||
      annotations.strikethrough ||
      annotations.underline ||
      annotations.code ||
      (annotations.color && annotations.color !== "default"),
  );
}

function isSimplePlainTextBlock(block: NotionApiBlock): boolean {
  const items = getRawRichText(block);
  if (items.length === 0) return true;
  return items.every((item) => {
    if (item.type !== "text") return false;
    if (item.href || item.text?.link?.url) return false;
    if (hasNonDefaultAnnotations(item)) return false;
    return true;
  });
}

function resolveCanEditText(policy: BlockCapabilityPolicy, block: NotionApiBlock): boolean {
  return policy.textEditMode === "simple_plain_text" ? isSimplePlainTextBlock(block) : false;
}

export function getBlockCapabilities(block: NotionApiBlock, childCount = 0): EmbedBlockCapabilities {
  const policy = BLOCK_CAPABILITY_POLICIES[block.type] ?? {};
  const writableType = policy.writableType;
  const writable = Boolean(writableType);

  if (!writable) {
    return {
      writable: false,
      canOpenInNotion: Boolean(policy.canOpenInNotion),
    };
  }

  return {
    writable,
    writableType,
    canEditText: resolveCanEditText(policy, block),
    canInsertSiblingBelow: Boolean(policy.canInsertSiblingBelow),
    canDeleteSelf: Boolean(policy.canInsertSiblingBelow) && childCount === 0,
    canToggleTodo: Boolean(policy.canToggleTodo),
    canOpenInNotion: Boolean(policy.canOpenInNotion),
  };
}
