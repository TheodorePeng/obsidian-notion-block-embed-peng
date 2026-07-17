export interface NotionApiRichText {
  type: string;
  plain_text: string;
  href?: string | null;
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  mention?: Record<string, unknown>;
  equation?: {
    expression?: string;
  };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

export interface NotionApiBlock {
  object: "block";
  id: string;
  type: string;
  has_children?: boolean;
  archived?: boolean;
  last_edited_time?: string;
  [key: string]: unknown;
}

export interface NotionApiDatabaseProperty {
  id?: string;
  name?: string;
  type?: string;
  [key: string]: unknown;
}

export interface NotionApiDatabase {
  object: "database";
  id: string;
  title?: NotionApiRichText[];
  properties?: Record<string, NotionApiDatabaseProperty>;
  [key: string]: unknown;
}

export interface NotionApiPageProperty {
  id?: string;
  type?: string;
  rich_text?: NotionApiRichText[];
  title?: NotionApiRichText[];
  [key: string]: unknown;
}

export interface NotionApiPage {
  object: "page";
  id: string;
  properties: Record<string, NotionApiPageProperty>;
  [key: string]: unknown;
}

export interface NotionApiBlockTree {
  block: NotionApiBlock;
  children: NotionApiBlockTree[];
}

export type WritableBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "quote"
  | "code"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "to_do";

export interface ParsedNbeRef {
  ref: string;
  pageNbeId: string;
  blockNbeId: string;
}

export type ParsedNotionTarget =
  | {
      mode: "empty_block_url";
      originalUrl: "";
    }
  | {
      mode: "block_url";
      originalUrl: string;
      pageId: string;
      blockId: string;
    }
  | {
      mode: "page_heading";
      originalUrl: string;
      pageId: string;
      heading: string;
    }
  | ({
      mode: "nbe_uri";
      originalUrl: string;
      action: string;
      vault?: string;
    } & ParsedNbeRef);

export type EmbedSourceMode = ParsedNotionTarget["mode"];

export type EmbedCacheScope =
  | {
      kind: "block_tree";
      blockId: string;
    }
  | {
      kind: "page_tree";
      pageId: string;
    }
  | {
      kind: "page_section";
      pageId: string;
    };

export interface EmbedRichText {
  plainText: string;
  href?: string | null;
  sourceType?: string;
  equationExpression?: string;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

export interface EmbedBlockProps {
  checked?: boolean;
  codeLanguage?: string;
  imageUrl?: string;
  imageUnavailableReason?: string;
  columnWidthRatio?: number;
  equationExpression?: string;
  syncedFromBlockId?: string | null;
}

export interface EmbedBlockCapabilities {
  writable: boolean;
  writableType?: WritableBlockType;
  canEditText?: boolean;
  canInsertSiblingBelow?: boolean;
  canDeleteSelf?: boolean;
  canToggleTodo?: boolean;
  canOpenInNotion?: boolean;
}

export interface EmbedBlockMeta {
  sourcePageId: string;
  parentId?: string;
  parentType?: "page_id" | "block_id";
  lastEditedTime?: string;
  notionTypeData: Record<string, unknown>;
}

export interface EmbedBlockNode {
  id: string;
  type: string;
  richText: EmbedRichText[];
  children: EmbedBlockNode[];
  props: EmbedBlockProps;
  meta: EmbedBlockMeta;
  capabilities: EmbedBlockCapabilities;
}

export interface EmbedLoadResult {
  parsedTarget: ParsedNotionTarget;
  sourceMode: EmbedSourceMode;
  root: EmbedBlockNode;
  writebackAllowed: boolean;
  cacheScopes: EmbedCacheScope[];
}

export interface NbeReferenceLocationBase {
  key: string;
  path: string;
}

export interface NbeMarkdownReferenceLocation extends NbeReferenceLocationBase {
  kind: "markdown";
  lineStart: number;
  lineEnd: number;
}

export interface NbeCanvasReferenceLocation extends NbeReferenceLocationBase {
  kind: "canvas";
  nodeId: string;
}

export type NbeReferenceLocation = NbeMarkdownReferenceLocation | NbeCanvasReferenceLocation;

export interface NbeReferenceRegistryEntry {
  ref: string;
  locations: NbeReferenceLocation[];
  primaryLocationKey?: string;
  lastSeenAt: number;
}

export type NbeReferenceRegistryMap = Record<string, NbeReferenceRegistryEntry>;

export interface NbeResolvedPageIndex {
  schemaVersion: number;
  pageNbeId: string;
  pageId: string;
  blocks: Record<string, string>;
  resolvedAt: number;
}

export interface NbeResolvedTarget extends ParsedNbeRef {
  schemaVersion: number;
  pageId: string;
  blockId: string;
  resolvedAt: number;
}

export type NbeResolutionCacheMap = Record<string, Record<string, NbeResolvedPageIndex>>;
export type NbeResolvedTargetCacheMap = Record<string, Record<string, NbeResolvedTarget>>;
