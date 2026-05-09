import { PluginError } from "../core/errors";
import { ParsedNotionTarget } from "../core/models";
import { parseNbeProtocolUrl } from "../nbe/ref";

const HEX_32 = /^[0-9a-f]{32}$/i;

export function normalizeNotionId(raw: string): string {
  const compact = raw.replace(/-/g, "").toLowerCase();
  if (!HEX_32.test(compact)) {
    throw new PluginError("INVALID_INPUT", `Invalid Notion ID: ${raw}`);
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(
    16,
    20,
  )}-${compact.slice(20)}`;
}

function extractLastPathId(pathname: string): string | null {
  const matches = pathname.match(/[0-9a-fA-F]{32}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

function extractHashId(hash: string): string | null {
  const cleaned = hash.replace(/^#/, "").trim();
  const match = cleaned.match(/[0-9a-fA-F]{32}/);
  return match ? match[0] : null;
}

function assertNotionDomain(url: URL): void {
  if (!/notion\.so$/i.test(url.hostname) && !/\.notion\.site$/i.test(url.hostname)) {
    throw new PluginError("INVALID_INPUT", "URL must be a Notion URL.");
  }
}

function parseUrl(rawUrl: string, label: string): URL {
  try {
    return new URL(rawUrl.trim());
  } catch {
    throw new PluginError("INVALID_INPUT", `Invalid ${label} URL.`);
  }
}

export function parseNotionBlockUrl(rawUrl: string): ParsedNotionTarget {
  const url = parseUrl(rawUrl, "Notion block");
  assertNotionDomain(url);

  const pageRaw = extractLastPathId(url.pathname);
  const blockRaw = extractHashId(url.hash);
  if (!pageRaw) {
    throw new PluginError("INVALID_INPUT", "Page ID not found in URL path.");
  }
  if (!blockRaw) {
    throw new PluginError("INVALID_INPUT", "Block ID not found in URL hash.");
  }

  return {
    mode: "block_url",
    originalUrl: rawUrl.trim(),
    pageId: normalizeNotionId(pageRaw),
    blockId: normalizeNotionId(blockRaw),
  };
}

export function parseNotionPageUrl(rawUrl: string): { originalUrl: string; pageId: string } {
  const url = parseUrl(rawUrl, "Notion page");
  assertNotionDomain(url);
  const pageRaw = extractLastPathId(url.pathname);
  if (!pageRaw) {
    throw new PluginError("INVALID_INPUT", "Page ID not found in URL path.");
  }
  return {
    originalUrl: rawUrl.trim(),
    pageId: normalizeNotionId(pageRaw),
  };
}

export function buildCanonicalNotionBlockUrl(pageId: string, blockId: string): string {
  const compactPageId = normalizeNotionId(pageId).replace(/-/g, "");
  const compactBlockId = normalizeNotionId(blockId).replace(/-/g, "");
  return `https://www.notion.so/${compactPageId}#${compactBlockId}`;
}

export function parseNbeUri(rawUrl: string): ParsedNotionTarget {
  const parsed = parseNbeProtocolUrl(rawUrl, { requireOpenRefAction: true });
  return {
    mode: "nbe_uri",
    originalUrl: parsed.originalUrl,
    action: parsed.action,
    vault: parsed.vault,
    ref: parsed.ref,
    pageNbeId: parsed.pageNbeId,
    blockNbeId: parsed.blockNbeId,
  };
}

function normalizeHeadingInput(value: string): string {
  return value.replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function parseKeyValueSource(source: string): Record<string, string> {
  const lines = source
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: Record<string, string> = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index <= 0) {
      throw new PluginError("INVALID_INPUT", "Invalid notion-embed format. Use either URL line or key:value lines.");
    }
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (!value) {
      throw new PluginError("INVALID_INPUT", `Value is required for "${key}".`);
    }
    if (!["url", "heading"].includes(key)) {
      throw new PluginError("INVALID_INPUT", `Unsupported key "${key}". Allowed keys: url, heading.`);
    }
    out[key] = value;
  }
  return out;
}

export function parseNotionTargetFromSource(source: string): ParsedNotionTarget {
  const lines = source
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      mode: "empty_block_url",
      originalUrl: "",
    };
  }

  if (lines.length === 1) {
    if (/^obsidian:\/\//i.test(lines[0]) || isShortlinkStudioUrl(lines[0])) {
      return parseNbeUri(lines[0]);
    }
    if (/^https?:\/\//i.test(lines[0])) {
      return parseNotionBlockUrl(lines[0]);
    }
  }

  const map = parseKeyValueSource(source);
  const rawUrl = map.url;
  const heading = normalizeHeadingInput(map.heading ?? "");
  if (!rawUrl) {
    throw new PluginError("INVALID_INPUT", 'Missing "url" for page heading mode.');
  }
  if (!heading) {
    throw new PluginError("INVALID_INPUT", 'Missing "heading" for page heading mode.');
  }

  const page = parseNotionPageUrl(rawUrl);
  return {
    mode: "page_heading",
    originalUrl: page.originalUrl,
    pageId: page.pageId,
    heading,
  };
}

function isShortlinkStudioUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.trim());
    return ["http:", "https:"].includes(url.protocol) && url.hostname.toLowerCase() === "www.shortlink.studio";
  } catch {
    return false;
  }
}
