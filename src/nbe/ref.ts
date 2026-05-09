import { PluginError } from "../core/errors";
import { ParsedNbeRef } from "../core/models";

export const NBE_PROPERTY_NAME = "NBE ID";
export const NBE_PROTOCOL_ACTION = "notion-block-embed";
export const NBE_OPEN_REF_ACTION = "open-ref";

const NBE_ID_PART = /^[A-Za-z0-9_-]+$/;

export interface ParsedNbeProtocolUrl extends ParsedNbeRef {
  originalUrl: string;
  action: string;
  vault?: string;
}

function normalizeIdPart(raw: string, label: string): string {
  const value = raw.trim();
  if (!value) {
    throw new PluginError("INVALID_INPUT", `${label} is required.`);
  }
  if (!NBE_ID_PART.test(value)) {
    throw new PluginError("INVALID_INPUT", `Invalid ${label}: ${raw}`);
  }
  return value;
}

export function normalizeNbeRef(raw: string): ParsedNbeRef {
  const value = raw.trim();
  const parts = value.split("::");
  if (parts.length !== 2) {
    throw new PluginError("INVALID_INPUT", "Invalid NBE reference. Expected <PageID>::<BlockID>.");
  }
  const pageNbeId = normalizeIdPart(parts[0], "Page ID");
  const blockNbeId = normalizeIdPart(parts[1], "Block ID");
  return {
    ref: `${pageNbeId}::${blockNbeId}`,
    pageNbeId,
    blockNbeId,
  };
}

export function parseNbeProtocolUrl(rawUrl: string, options?: { requireOpenRefAction?: boolean }): ParsedNbeProtocolUrl {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new PluginError("INVALID_INPUT", "Invalid Obsidian NBE URI.");
  }

  if (url.protocol !== "obsidian:") {
    throw new PluginError("INVALID_INPUT", "NBE URI must use the obsidian:// scheme.");
  }
  if (url.hostname !== NBE_PROTOCOL_ACTION) {
    throw new PluginError("INVALID_INPUT", `Unsupported Obsidian action: ${url.hostname}`);
  }

  const action = (url.searchParams.get("action") ?? "").trim();
  if (!action) {
    throw new PluginError("INVALID_INPUT", 'Missing "action" in NBE URI.');
  }
  if (options?.requireOpenRefAction && action !== NBE_OPEN_REF_ACTION) {
    throw new PluginError("INVALID_INPUT", `Unsupported NBE action: ${action}`);
  }

  const nbeParam = (url.searchParams.get("nbe") ?? "").trim();
  if (!nbeParam) {
    throw new PluginError("INVALID_INPUT", 'Missing "nbe" in NBE URI.');
  }

  return {
    originalUrl: rawUrl.trim(),
    action,
    vault: url.searchParams.get("vault")?.trim() || undefined,
    ...normalizeNbeRef(nbeParam),
  };
}

export function extractNbeRefFromProtocolUrl(rawUrl: string): ParsedNbeRef | null {
  try {
    const parsed = parseNbeProtocolUrl(rawUrl);
    return {
      ref: parsed.ref,
      pageNbeId: parsed.pageNbeId,
      blockNbeId: parsed.blockNbeId,
    };
  } catch {
    return null;
  }
}

export function searchTokenForNbeRef(ref: string): string {
  return `nbe=${normalizeNbeRef(ref).ref}`;
}
