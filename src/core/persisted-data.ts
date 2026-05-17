import { DEFAULT_SETTINGS, NotionBlockEmbedSettings } from "./settings";
import {
  NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN,
  NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN,
  NBE_RESOLUTION_CACHE_TTL_MS,
} from "./constants";
import {
  NbeCanvasReferenceLocation,
  NbeResolvedTarget,
  NbeResolvedTargetCacheMap,
  NbeResolutionCacheMap,
  NbeResolvedPageIndex,
  NbeMarkdownReferenceLocation,
  NbeReferenceLocation,
  NbeReferenceRegistryEntry,
  NbeReferenceRegistryMap,
} from "./models";
import { normalizeNbeRef } from "../nbe/ref";

export interface ImageSizeMemoryEntry {
  blockId: string;
  widthRatio: number;
  lastSeenAt: number;
}

export type ImageSizeMemoryMap = Record<string, ImageSizeMemoryEntry>;

export interface PersistedPluginData {
  settings: NotionBlockEmbedSettings;
  imageSizeMemory: ImageSizeMemoryMap;
  nbeRegistry: NbeReferenceRegistryMap;
  nbeResolutionCache: NbeResolutionCacheMap;
  nbeResolvedTargetCache: NbeResolvedTargetCacheMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeImageSizeMemory(raw: unknown): ImageSizeMemoryMap {
  if (!isRecord(raw)) return {};

  const entries = Object.entries(raw);
  const normalized: ImageSizeMemoryMap = {};
  for (const [blockId, value] of entries) {
    if (!isRecord(value)) continue;
    const widthRatio = typeof value.widthRatio === "number" ? value.widthRatio : null;
    const lastSeenAt = typeof value.lastSeenAt === "number" ? value.lastSeenAt : null;
    if (!widthRatio || !lastSeenAt) continue;
    normalized[blockId] = {
      blockId,
      widthRatio,
      lastSeenAt,
    };
  }
  return normalized;
}

function normalizeRegistryLocation(raw: unknown): NbeReferenceLocation | null {
  if (!isRecord(raw) || typeof raw.kind !== "string" || typeof raw.key !== "string" || typeof raw.path !== "string") {
    return null;
  }
  if (raw.kind === "markdown") {
    const lineStart = typeof raw.lineStart === "number" ? raw.lineStart : null;
    const lineEnd = typeof raw.lineEnd === "number" ? raw.lineEnd : null;
    if (lineStart === null || lineEnd === null) return null;
    const location: NbeMarkdownReferenceLocation = {
      kind: "markdown",
      key: raw.key,
      path: raw.path,
      lineStart,
      lineEnd,
    };
    return location;
  }
  if (raw.kind === "canvas") {
    const nodeId = typeof raw.nodeId === "string" ? raw.nodeId : null;
    if (!nodeId) return null;
    const location: NbeCanvasReferenceLocation = {
      kind: "canvas",
      key: raw.key,
      path: raw.path,
      nodeId,
    };
    return location;
  }
  return null;
}

function normalizeNbeRegistry(raw: unknown): NbeReferenceRegistryMap {
  if (!isRecord(raw)) return {};
  const registry: NbeReferenceRegistryMap = {};

  for (const [ref, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    let parsedRef;
    try {
      parsedRef = normalizeNbeRef(ref);
    } catch {
      try {
        parsedRef = typeof value.ref === "string" ? normalizeNbeRef(value.ref) : null;
      } catch {
        parsedRef = null;
      }
    }
    if (!parsedRef) continue;
    const locations = Array.isArray(value.locations)
      ? value.locations.map(normalizeRegistryLocation).filter((item): item is NbeReferenceLocation => Boolean(item))
      : [];
    const lastSeenAt = typeof value.lastSeenAt === "number" ? value.lastSeenAt : Date.now();
    const primaryLocationKey = typeof value.primaryLocationKey === "string" ? value.primaryLocationKey : undefined;
    const existing = registry[parsedRef.ref];
    const mergedLocations = existing
      ? [...existing.locations, ...locations].filter(
          (location, index, all) => all.findIndex((item) => item.key === location.key) === index,
        )
      : locations;
    const entry: NbeReferenceRegistryEntry = {
      ref: parsedRef.ref,
      locations: mergedLocations,
      primaryLocationKey: primaryLocationKey && locations.some((item) => item.key === primaryLocationKey)
        ? primaryLocationKey
        : existing?.primaryLocationKey,
      lastSeenAt: Math.max(lastSeenAt, existing?.lastSeenAt ?? 0),
    };
    registry[parsedRef.ref] = entry;
  }

  return registry;
}

function normalizeResolvedPageIndex(raw: unknown, pageNbeId: string): NbeResolvedPageIndex | null {
  if (!isRecord(raw) || typeof raw.pageId !== "string" || !isRecord(raw.blocks)) {
    return null;
  }

  const blocks = Object.fromEntries(
    Object.entries(raw.blocks)
      .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"),
  );
  const resolvedAt = typeof raw.resolvedAt === "number" ? raw.resolvedAt : Date.now();

  return {
    pageNbeId,
    pageId: raw.pageId,
    blocks,
    resolvedAt,
  };
}

function normalizeResolvedTarget(raw: unknown, ref: string): NbeResolvedTarget | null {
  if (
    !isRecord(raw) ||
    typeof raw.pageNbeId !== "string" ||
    typeof raw.blockNbeId !== "string" ||
    typeof raw.pageId !== "string" ||
    typeof raw.blockId !== "string"
  ) {
    return null;
  }
  let parsedRef;
  try {
    parsedRef = normalizeNbeRef(ref);
  } catch {
    try {
      parsedRef = typeof raw.ref === "string" ? normalizeNbeRef(raw.ref) : null;
    } catch {
      parsedRef = null;
    }
  }
  if (!parsedRef) return null;

  const resolvedAt = typeof raw.resolvedAt === "number" ? raw.resolvedAt : Date.now();

  return {
    ref: parsedRef.ref,
    pageNbeId: parsedRef.pageNbeId,
    blockNbeId: parsedRef.blockNbeId,
    pageId: raw.pageId,
    blockId: raw.blockId,
    resolvedAt,
  };
}

function normalizeNbeResolutionCache(raw: unknown): NbeResolutionCacheMap {
  if (!isRecord(raw)) return {};
  const now = Date.now();

  const namespaces: NbeResolutionCacheMap = {};
  for (const [tokenFingerprint, namespace] of Object.entries(raw)) {
    if (!isRecord(namespace)) continue;
    const normalizedEntries = Object.entries(namespace)
      .map(([pageNbeId, value]) => [pageNbeId, normalizeResolvedPageIndex(value, pageNbeId)] as const)
      .filter((entry): entry is [string, NbeResolvedPageIndex] => Boolean(entry[1]))
      .filter(([, pageIndex]) => pageIndex.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS > now)
      .sort(([, left], [, right]) => right.resolvedAt - left.resolvedAt)
      .slice(0, NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN);
    const normalizedNamespace = Object.fromEntries(
      normalizedEntries,
    );
    if (Object.keys(normalizedNamespace).length === 0) continue;
    namespaces[tokenFingerprint] = normalizedNamespace;
  }

  return namespaces;
}

function normalizeNbeResolvedTargetCache(raw: unknown): NbeResolvedTargetCacheMap {
  if (!isRecord(raw)) return {};
  const now = Date.now();

  const namespaces: NbeResolvedTargetCacheMap = {};
  for (const [tokenFingerprint, namespace] of Object.entries(raw)) {
    if (!isRecord(namespace)) continue;
    const normalizedEntries = Object.entries(namespace)
      .map(([ref, value]) => normalizeResolvedTarget(value, ref))
      .filter((target): target is NbeResolvedTarget => Boolean(target))
      .filter((target) => target.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS > now)
      .sort((left, right) => right.resolvedAt - left.resolvedAt);
    const normalizedNamespace: Record<string, NbeResolvedTarget> = {};
    for (const target of normalizedEntries) {
      if (normalizedNamespace[target.ref]) continue;
      normalizedNamespace[target.ref] = target;
      if (Object.keys(normalizedNamespace).length >= NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN) {
        break;
      }
    }
    if (Object.keys(normalizedNamespace).length === 0) continue;
    namespaces[tokenFingerprint] = normalizedNamespace;
  }

  return namespaces;
}

export function pruneNbeResolutionCache(cache: NbeResolutionCacheMap): NbeResolutionCacheMap {
  return normalizeNbeResolutionCache(cache);
}

export function pruneNbeResolvedTargetCache(cache: NbeResolvedTargetCacheMap): NbeResolvedTargetCacheMap {
  return normalizeNbeResolvedTargetCache(cache);
}

export function coercePersistedPluginData(raw: unknown): PersistedPluginData {
  if (isRecord(raw) && isRecord(raw.settings)) {
    return {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings as Partial<NotionBlockEmbedSettings>) },
      imageSizeMemory: normalizeImageSizeMemory(raw.imageSizeMemory),
      nbeRegistry: normalizeNbeRegistry(raw.nbeRegistry),
      nbeResolutionCache: normalizeNbeResolutionCache(raw.nbeResolutionCache),
      nbeResolvedTargetCache: normalizeNbeResolvedTargetCache(raw.nbeResolvedTargetCache),
    };
  }

  return {
    settings: { ...DEFAULT_SETTINGS, ...(isRecord(raw) ? (raw as Partial<NotionBlockEmbedSettings>) : {}) },
    imageSizeMemory: {},
    nbeRegistry: normalizeNbeRegistry(isRecord(raw) ? raw.nbeRegistry : undefined),
    nbeResolutionCache: normalizeNbeResolutionCache(isRecord(raw) ? raw.nbeResolutionCache : undefined),
    nbeResolvedTargetCache: normalizeNbeResolvedTargetCache(isRecord(raw) ? raw.nbeResolvedTargetCache : undefined),
  };
}

export function createPersistedPluginData(
  settings: NotionBlockEmbedSettings,
  imageSizeMemory: ImageSizeMemoryMap,
  nbeRegistry: NbeReferenceRegistryMap = {},
  nbeResolutionCache: NbeResolutionCacheMap = {},
  nbeResolvedTargetCache: NbeResolvedTargetCacheMap = {},
): PersistedPluginData {
  return {
    settings,
    imageSizeMemory,
    nbeRegistry,
    nbeResolutionCache,
    nbeResolvedTargetCache,
  };
}
