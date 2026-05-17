import { PluginError } from "../core/errors";
import { ParsedNbeRef } from "../core/models";

export const NBE_PROPERTY_NAME = "NBE ID";
export const NBE_PROTOCOL_ACTION = "notion-block-embed";
export const NBE_OPEN_REF_ACTION = "open-ref";

const NBE_ID_PART = /^[A-Za-z0-9_-]+$/;
const NBE_REF_SEPARATOR = "_";
const LEGACY_NBE_REF_SEPARATOR = "::";
const SHORTLINK_HOST = "www.shortlink.studio";
const SHORTLINK_SIMPLE_PREFIX = "/1/";

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
  const parts = splitNbeRef(value);
  const pageNbeId = normalizeIdPart(parts.pageNbeId, "Page ID");
  const blockNbeId = normalizeIdPart(parts.blockNbeId, "Block ID");
  return {
    ref: buildCanonicalNbeRef(pageNbeId, blockNbeId),
    pageNbeId,
    blockNbeId,
  };
}

export function buildNbeRef(pageNbeId: string, blockNbeId: string): ParsedNbeRef {
  const normalizedPageNbeId = normalizeIdPart(pageNbeId, "Page ID");
  const normalizedBlockNbeId = normalizeIdPart(blockNbeId, "Block ID");
  return {
    ref: buildCanonicalNbeRef(normalizedPageNbeId, normalizedBlockNbeId),
    pageNbeId: normalizedPageNbeId,
    blockNbeId: normalizedBlockNbeId,
  };
}

function splitNbeRef(value: string): { pageNbeId: string; blockNbeId: string } {
  if (value.includes(LEGACY_NBE_REF_SEPARATOR)) {
    const parts = value.split(LEGACY_NBE_REF_SEPARATOR);
    if (parts.length !== 2) {
      throwInvalidNbeRef();
    }
    return { pageNbeId: parts[0], blockNbeId: parts[1] };
  }

  const separatorIndex = value.lastIndexOf(NBE_REF_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throwInvalidNbeRef();
  }
  return {
    pageNbeId: value.slice(0, separatorIndex),
    blockNbeId: value.slice(separatorIndex + 1),
  };
}

function throwInvalidNbeRef(): never {
  throw new PluginError("INVALID_INPUT", "Invalid NBE reference. Expected <PageID>_<BlockID>.");
}

function buildCanonicalNbeRef(pageNbeId: string, blockNbeId: string): string {
  return `${pageNbeId}${NBE_REF_SEPARATOR}${blockNbeId}`;
}

export function normalizeNbeUrlCandidate(rawUrl: string): string {
  const original = rawUrl.trim();
  if (/^obsidian:\/\//i.test(original)) {
    return original;
  }

  let wrapper: URL;
  try {
    wrapper = new URL(original);
  } catch {
    throw new PluginError("INVALID_INPUT", "Invalid Obsidian NBE URI.");
  }

  if (!["http:", "https:"].includes(wrapper.protocol) || wrapper.hostname.toLowerCase() !== SHORTLINK_HOST) {
    return original;
  }
  if (!wrapper.pathname.startsWith(SHORTLINK_SIMPLE_PREFIX) || wrapper.search || wrapper.hash) {
    throw new PluginError("INVALID_INPUT", "Unsupported Shortlink Studio NBE URL.");
  }

  const encodedTarget = wrapper.pathname.slice(SHORTLINK_SIMPLE_PREFIX.length);
  if (encodedTarget.includes("/")) {
    throw new PluginError("INVALID_INPUT", "Unsupported Shortlink Studio NBE URL.");
  }
  if (!encodedTarget) {
    throw new PluginError("INVALID_INPUT", "Missing Shortlink Studio target URL.");
  }

  try {
    return decodeURIComponent(encodedTarget);
  } catch {
    throw new PluginError("INVALID_INPUT", "Invalid Shortlink Studio target encoding.");
  }
}

export function parseNbeProtocolUrl(rawUrl: string, options?: { requireOpenRefAction?: boolean }): ParsedNbeProtocolUrl {
  const originalUrl = rawUrl.trim();
  const normalizedUrl = normalizeNbeUrlCandidate(originalUrl);
  let url: URL;
  try {
    url = new URL(normalizedUrl);
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
    originalUrl,
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
  return normalizeNbeRef(ref).ref;
}
