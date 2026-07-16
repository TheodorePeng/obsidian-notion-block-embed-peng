"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NotionBlockEmbedPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

// src/core/logger.ts
var Logger = class {
  constructor() {
    this.enabled = false;
  }
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  debug(message) {
    if (!this.enabled) return;
    console.log(`[notion-block-embed] ${message}`);
  }
};

// src/core/settings.ts
var DEFAULT_SETTINGS = {
  notionToken: "",
  showChildren: true,
  toggleDefaultExpanded: true,
  maxHeight: 560,
  debugLogs: false,
  allowWriteback: false,
  refreshIntervalSec: 300,
  inputMode: "block_url",
  refreshPolicy: "manual",
  writebackConflictPolicy: "none",
  renderMode: "compact",
  notionOpenMode: "side_panel"
};
function tokenFingerprint(token) {
  const value = token.trim();
  if (!value) return "no-token";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = hash * 31 + value.charCodeAt(i) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// src/core/constants.ts
var NOTION_API_BASE = "https://api.notion.com/v1";
var NOTION_VERSION = "2022-06-28";
var MAX_TREE_DEPTH = 20;
var CACHE_TTL_MS = 6e4;
var TREE_CACHE_MAX_ENTRIES = 128;
var NBE_RESOLUTION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN = 256;
var NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN = 2048;
var REPOSITORY_TREE_CONCURRENCY = 2;
var REFRESH_ALL_CONCURRENCY = 2;
var REGISTRY_INCREMENTAL_DEBOUNCE_MS = 1500;
var REGISTRY_LAZY_FULL_REBUILD_DELAY_MS = 1e4;
var INITIAL_RENDER_DELAY_MS = 120;
var INITIAL_RENDER_CONCURRENCY = 2;

// src/core/errors.ts
var PluginError = class extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "PluginError";
  }
};
function toPluginError(value) {
  if (value instanceof PluginError) return value;
  return new PluginError("UNKNOWN", value instanceof Error ? value.message : String(value));
}
function userMessageFromError(error) {
  const resolved = toPluginError(error);
  if (resolved.code === "CONFIG_MISSING_TOKEN") {
    return "Notion Integration Token is required. Set it in plugin settings.";
  }
  if (resolved.code === "INVALID_INPUT") {
    return resolved.message;
  }
  if (resolved.code === "NOTION_UNAUTHORIZED") {
    return "Notion authorization failed. Check your Integration Token.";
  }
  if (resolved.code === "NOTION_FORBIDDEN") {
    return "Notion access denied. Share the page/block with your integration.";
  }
  if (resolved.code === "NOTION_NOT_FOUND") {
    return "Notion block or page not found. Check the URL and permissions.";
  }
  if (resolved.code === "NOTION_RATE_LIMIT") {
    return "Notion API rate limit reached. Please retry in a moment.";
  }
  if (resolved.code === "NOTION_BAD_REQUEST") {
    return `Notion API rejected the request: ${resolved.message}`;
  }
  if (resolved.code === "WRITE_CONFLICT") {
    return "Remote content changed while editing. Refresh and try again.";
  }
  if (resolved.code === "NETWORK") {
    return "Network error while contacting Notion API.";
  }
  return resolved.message;
}

// src/nbe/ref.ts
var NBE_PROPERTY_NAME = "NBE ID";
var NBE_PROTOCOL_ACTION = "notion-block-embed";
var NBE_OPEN_REF_ACTION = "open-ref";
var NBE_ID_PART = /^[A-Za-z0-9_-]+$/;
var NBE_REF_SEPARATOR = "_";
var LEGACY_NBE_REF_SEPARATOR = "::";
var SHORTLINK_HOST = "www.shortlink.studio";
var SHORTLINK_SIMPLE_PREFIX = "/1/";
function normalizeIdPart(raw, label) {
  const value = raw.trim();
  if (!value) {
    throw new PluginError("INVALID_INPUT", `${label} is required.`);
  }
  if (!NBE_ID_PART.test(value)) {
    throw new PluginError("INVALID_INPUT", `Invalid ${label}: ${raw}`);
  }
  return value;
}
function normalizeNbeRef(raw) {
  const value = raw.trim();
  const parts = splitNbeRef(value);
  const pageNbeId = normalizeIdPart(parts.pageNbeId, "Page ID");
  const blockNbeId = normalizeIdPart(parts.blockNbeId, "Block ID");
  return {
    ref: buildCanonicalNbeRef(pageNbeId, blockNbeId),
    pageNbeId,
    blockNbeId
  };
}
function buildNbeRef(pageNbeId, blockNbeId) {
  const normalizedPageNbeId = normalizeIdPart(pageNbeId, "Page ID");
  const normalizedBlockNbeId = normalizeIdPart(blockNbeId, "Block ID");
  return {
    ref: buildCanonicalNbeRef(normalizedPageNbeId, normalizedBlockNbeId),
    pageNbeId: normalizedPageNbeId,
    blockNbeId: normalizedBlockNbeId
  };
}
function splitNbeRef(value) {
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
    blockNbeId: value.slice(separatorIndex + 1)
  };
}
function throwInvalidNbeRef() {
  throw new PluginError("INVALID_INPUT", "Invalid NBE reference. Expected <PageID>_<BlockID>.");
}
function buildCanonicalNbeRef(pageNbeId, blockNbeId) {
  return `${pageNbeId}${NBE_REF_SEPARATOR}${blockNbeId}`;
}
function normalizeNbeUrlCandidate(rawUrl) {
  const original = rawUrl.trim();
  if (/^obsidian:\/\//i.test(original)) {
    return original;
  }
  let wrapper;
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
function parseNbeProtocolUrl(rawUrl, options) {
  const originalUrl = rawUrl.trim();
  const normalizedUrl = normalizeNbeUrlCandidate(originalUrl);
  let url;
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
    vault: url.searchParams.get("vault")?.trim() || void 0,
    ...normalizeNbeRef(nbeParam)
  };
}
function searchTokenForNbeRef(ref) {
  return normalizeNbeRef(ref).ref;
}

// src/core/persisted-data.ts
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeImageSizeMemory(raw) {
  if (!isRecord(raw)) return {};
  const entries = Object.entries(raw);
  const normalized = {};
  for (const [blockId, value] of entries) {
    if (!isRecord(value)) continue;
    const widthRatio = typeof value.widthRatio === "number" ? value.widthRatio : null;
    const lastSeenAt = typeof value.lastSeenAt === "number" ? value.lastSeenAt : null;
    if (!widthRatio || !lastSeenAt) continue;
    normalized[blockId] = {
      blockId,
      widthRatio,
      lastSeenAt
    };
  }
  return normalized;
}
function normalizeRegistryLocation(raw) {
  if (!isRecord(raw) || typeof raw.kind !== "string" || typeof raw.key !== "string" || typeof raw.path !== "string") {
    return null;
  }
  if (raw.kind === "markdown") {
    const lineStart = typeof raw.lineStart === "number" ? raw.lineStart : null;
    const lineEnd = typeof raw.lineEnd === "number" ? raw.lineEnd : null;
    if (lineStart === null || lineEnd === null) return null;
    const location = {
      kind: "markdown",
      key: raw.key,
      path: raw.path,
      lineStart,
      lineEnd
    };
    return location;
  }
  if (raw.kind === "canvas") {
    const nodeId = typeof raw.nodeId === "string" ? raw.nodeId : null;
    if (!nodeId) return null;
    const location = {
      kind: "canvas",
      key: raw.key,
      path: raw.path,
      nodeId
    };
    return location;
  }
  return null;
}
function normalizeNbeRegistry(raw) {
  if (!isRecord(raw)) return {};
  const registry = {};
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
    const locations = Array.isArray(value.locations) ? value.locations.map(normalizeRegistryLocation).filter((item) => Boolean(item)) : [];
    const lastSeenAt = typeof value.lastSeenAt === "number" ? value.lastSeenAt : Date.now();
    const primaryLocationKey = typeof value.primaryLocationKey === "string" ? value.primaryLocationKey : void 0;
    const existing = registry[parsedRef.ref];
    const mergedLocations = existing ? [...existing.locations, ...locations].filter(
      (location, index, all) => all.findIndex((item) => item.key === location.key) === index
    ) : locations;
    const entry = {
      ref: parsedRef.ref,
      locations: mergedLocations,
      primaryLocationKey: primaryLocationKey && locations.some((item) => item.key === primaryLocationKey) ? primaryLocationKey : existing?.primaryLocationKey,
      lastSeenAt: Math.max(lastSeenAt, existing?.lastSeenAt ?? 0)
    };
    registry[parsedRef.ref] = entry;
  }
  return registry;
}
function normalizeResolvedPageIndex(raw, pageNbeId) {
  if (!isRecord(raw) || typeof raw.pageId !== "string" || !isRecord(raw.blocks)) {
    return null;
  }
  const blocks = Object.fromEntries(
    Object.entries(raw.blocks).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string")
  );
  const resolvedAt = typeof raw.resolvedAt === "number" ? raw.resolvedAt : Date.now();
  return {
    pageNbeId,
    pageId: raw.pageId,
    blocks,
    resolvedAt
  };
}
function normalizeResolvedTarget(raw, ref) {
  if (!isRecord(raw) || typeof raw.pageNbeId !== "string" || typeof raw.blockNbeId !== "string" || typeof raw.pageId !== "string" || typeof raw.blockId !== "string") {
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
    resolvedAt
  };
}
function normalizeNbeResolutionCache(raw) {
  if (!isRecord(raw)) return {};
  const now2 = Date.now();
  const namespaces = {};
  for (const [tokenFingerprint2, namespace] of Object.entries(raw)) {
    if (!isRecord(namespace)) continue;
    const normalizedEntries = Object.entries(namespace).map(([pageNbeId, value]) => [pageNbeId, normalizeResolvedPageIndex(value, pageNbeId)]).filter((entry) => Boolean(entry[1])).filter(([, pageIndex]) => pageIndex.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS > now2).sort(([, left], [, right]) => right.resolvedAt - left.resolvedAt).slice(0, NBE_RESOLUTION_CACHE_MAX_PAGES_PER_TOKEN);
    const normalizedNamespace = Object.fromEntries(
      normalizedEntries
    );
    if (Object.keys(normalizedNamespace).length === 0) continue;
    namespaces[tokenFingerprint2] = normalizedNamespace;
  }
  return namespaces;
}
function normalizeNbeResolvedTargetCache(raw) {
  if (!isRecord(raw)) return {};
  const now2 = Date.now();
  const namespaces = {};
  for (const [tokenFingerprint2, namespace] of Object.entries(raw)) {
    if (!isRecord(namespace)) continue;
    const normalizedEntries = Object.entries(namespace).map(([ref, value]) => normalizeResolvedTarget(value, ref)).filter((target) => Boolean(target)).filter((target) => target.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS > now2).sort((left, right) => right.resolvedAt - left.resolvedAt);
    const normalizedNamespace = {};
    for (const target of normalizedEntries) {
      if (normalizedNamespace[target.ref]) continue;
      normalizedNamespace[target.ref] = target;
      if (Object.keys(normalizedNamespace).length >= NBE_RESOLVED_TARGET_CACHE_MAX_REFS_PER_TOKEN) {
        break;
      }
    }
    if (Object.keys(normalizedNamespace).length === 0) continue;
    namespaces[tokenFingerprint2] = normalizedNamespace;
  }
  return namespaces;
}
function pruneNbeResolutionCache(cache) {
  return normalizeNbeResolutionCache(cache);
}
function pruneNbeResolvedTargetCache(cache) {
  return normalizeNbeResolvedTargetCache(cache);
}
function coercePersistedPluginData(raw) {
  if (isRecord(raw) && isRecord(raw.settings)) {
    return {
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      imageSizeMemory: normalizeImageSizeMemory(raw.imageSizeMemory),
      nbeRegistry: normalizeNbeRegistry(raw.nbeRegistry),
      nbeResolutionCache: normalizeNbeResolutionCache(raw.nbeResolutionCache),
      nbeResolvedTargetCache: normalizeNbeResolvedTargetCache(raw.nbeResolvedTargetCache)
    };
  }
  return {
    settings: { ...DEFAULT_SETTINGS, ...isRecord(raw) ? raw : {} },
    imageSizeMemory: {},
    nbeRegistry: normalizeNbeRegistry(isRecord(raw) ? raw.nbeRegistry : void 0),
    nbeResolutionCache: normalizeNbeResolutionCache(isRecord(raw) ? raw.nbeResolutionCache : void 0),
    nbeResolvedTargetCache: normalizeNbeResolvedTargetCache(isRecord(raw) ? raw.nbeResolvedTargetCache : void 0)
  };
}
function createPersistedPluginData(settings, imageSizeMemory, nbeRegistry = {}, nbeResolutionCache = {}, nbeResolvedTargetCache = {}) {
  return {
    settings,
    imageSizeMemory,
    nbeRegistry,
    nbeResolutionCache,
    nbeResolvedTargetCache
  };
}

// src/core/persisted-data-store.ts
var PersistedDataStore = class {
  constructor(initialData, save) {
    this.save = save;
    this.writeChain = Promise.resolve();
    this.debounceTimer = null;
    this.debouncedWaiters = [];
    this.data = {
      settings: { ...initialData.settings },
      imageSizeMemory: { ...initialData.imageSizeMemory },
      nbeRegistry: cloneRegistry(initialData.nbeRegistry),
      nbeResolutionCache: pruneNbeResolutionCache(cloneResolutionCache(initialData.nbeResolutionCache)),
      nbeResolvedTargetCache: pruneNbeResolvedTargetCache(cloneResolvedTargetCache(initialData.nbeResolvedTargetCache))
    };
  }
  getData() {
    return {
      settings: { ...this.data.settings },
      imageSizeMemory: { ...this.data.imageSizeMemory },
      nbeRegistry: cloneRegistry(this.data.nbeRegistry),
      nbeResolutionCache: pruneNbeResolutionCache(cloneResolutionCache(this.data.nbeResolutionCache)),
      nbeResolvedTargetCache: pruneNbeResolvedTargetCache(cloneResolvedTargetCache(this.data.nbeResolvedTargetCache))
    };
  }
  setSettings(settings, options) {
    this.data = createPersistedPluginData(
      settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      this.data.nbeResolvedTargetCache
    );
    const debounceMs = options?.debounceMs ?? 0;
    return debounceMs > 0 ? this.schedulePersist(debounceMs) : this.persistNow();
  }
  setImageSizeMemory(imageSizeMemory) {
    this.data = createPersistedPluginData(
      this.data.settings,
      imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      this.data.nbeResolvedTargetCache
    );
    return this.persistNow();
  }
  setNbeRegistry(nbeRegistry) {
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      cloneRegistry(nbeRegistry),
      this.data.nbeResolutionCache,
      this.data.nbeResolvedTargetCache
    );
    return this.persistNow();
  }
  getNbeResolutionPageIndex(tokenFingerprint2, pageNbeId) {
    return this.data.nbeResolutionCache[tokenFingerprint2]?.[pageNbeId] ? cloneResolvedPageIndex(this.data.nbeResolutionCache[tokenFingerprint2][pageNbeId]) : null;
  }
  getNbeResolvedTarget(tokenFingerprint2, ref) {
    const normalizedRef = normalizeNbeRef(ref).ref;
    return this.data.nbeResolvedTargetCache[tokenFingerprint2]?.[normalizedRef] ? cloneResolvedTarget(this.data.nbeResolvedTargetCache[tokenFingerprint2][normalizedRef]) : null;
  }
  setNbeResolutionPageIndex(tokenFingerprint2, pageIndex) {
    const nextCache = cloneResolutionCache(this.data.nbeResolutionCache);
    const namespace = {
      ...nextCache[tokenFingerprint2] ?? {}
    };
    namespace[pageIndex.pageNbeId] = cloneResolvedPageIndex(pageIndex);
    nextCache[tokenFingerprint2] = namespace;
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      nextCache,
      this.data.nbeResolvedTargetCache
    );
    this.pruneResolutionCacheInPlace();
    return this.persistNow();
  }
  setNbeResolvedTarget(tokenFingerprint2, target) {
    const nextCache = cloneResolvedTargetCache(this.data.nbeResolvedTargetCache);
    const namespace = {
      ...nextCache[tokenFingerprint2] ?? {}
    };
    namespace[target.ref] = cloneResolvedTarget(target);
    nextCache[tokenFingerprint2] = namespace;
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      nextCache
    );
    this.pruneResolvedTargetCacheInPlace();
    return this.persistNow();
  }
  deleteNbeResolutionPageIndex(tokenFingerprint2, pageNbeId) {
    if (!this.data.nbeResolutionCache[tokenFingerprint2]?.[pageNbeId]) {
      return Promise.resolve();
    }
    const nextCache = cloneResolutionCache(this.data.nbeResolutionCache);
    const namespace = {
      ...nextCache[tokenFingerprint2] ?? {}
    };
    delete namespace[pageNbeId];
    if (Object.keys(namespace).length === 0) {
      delete nextCache[tokenFingerprint2];
    } else {
      nextCache[tokenFingerprint2] = namespace;
    }
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      nextCache,
      this.data.nbeResolvedTargetCache
    );
    this.pruneResolutionCacheInPlace();
    return this.persistNow();
  }
  deleteNbeResolvedTarget(tokenFingerprint2, ref) {
    const normalizedRef = normalizeNbeRef(ref).ref;
    if (!this.data.nbeResolvedTargetCache[tokenFingerprint2]?.[normalizedRef]) {
      return Promise.resolve();
    }
    const nextCache = cloneResolvedTargetCache(this.data.nbeResolvedTargetCache);
    const namespace = {
      ...nextCache[tokenFingerprint2] ?? {}
    };
    delete namespace[normalizedRef];
    if (Object.keys(namespace).length === 0) {
      delete nextCache[tokenFingerprint2];
    } else {
      nextCache[tokenFingerprint2] = namespace;
    }
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      nextCache
    );
    this.pruneResolvedTargetCacheInPlace();
    return this.persistNow();
  }
  clearNbeResolutionCache(tokenFingerprint2) {
    const nextCache = cloneResolutionCache(this.data.nbeResolutionCache);
    if (tokenFingerprint2) {
      if (!nextCache[tokenFingerprint2]) {
        return Promise.resolve();
      }
      delete nextCache[tokenFingerprint2];
    } else if (Object.keys(nextCache).length === 0) {
      return Promise.resolve();
    } else {
      for (const key of Object.keys(nextCache)) {
        delete nextCache[key];
      }
    }
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      nextCache,
      this.data.nbeResolvedTargetCache
    );
    this.pruneResolutionCacheInPlace();
    return this.persistNow();
  }
  clearNbeResolvedTargetCache(tokenFingerprint2) {
    const nextCache = cloneResolvedTargetCache(this.data.nbeResolvedTargetCache);
    if (tokenFingerprint2) {
      if (!nextCache[tokenFingerprint2]) {
        return Promise.resolve();
      }
      delete nextCache[tokenFingerprint2];
    } else if (Object.keys(nextCache).length === 0) {
      return Promise.resolve();
    } else {
      for (const key of Object.keys(nextCache)) {
        delete nextCache[key];
      }
    }
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      nextCache
    );
    this.pruneResolvedTargetCacheInPlace();
    return this.persistNow();
  }
  flush() {
    if (!this.debounceTimer) return this.writeChain;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    const waiters = this.drainDebouncedWaiters();
    const task = this.enqueuePersist();
    task.then(
      () => {
        for (const waiter of waiters) waiter.resolve();
      },
      (error) => {
        for (const waiter of waiters) waiter.reject(error);
      }
    );
    return task;
  }
  schedulePersist(debounceMs) {
    return new Promise((resolve, reject) => {
      this.debouncedWaiters.push({ resolve, reject });
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        const waiters = this.drainDebouncedWaiters();
        const task = this.enqueuePersist();
        task.then(
          () => {
            for (const waiter of waiters) waiter.resolve();
          },
          (error) => {
            for (const waiter of waiters) waiter.reject(error);
          }
        );
      }, debounceMs);
    });
  }
  persistNow() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const waiters = this.drainDebouncedWaiters();
    const task = this.enqueuePersist();
    task.then(
      () => {
        for (const waiter of waiters) waiter.resolve();
      },
      (error) => {
        for (const waiter of waiters) waiter.reject(error);
      }
    );
    return task;
  }
  enqueuePersist() {
    this.pruneResolutionCacheInPlace();
    const snapshot = this.getData();
    this.writeChain = this.writeChain.catch(() => void 0).then(() => this.save(snapshot));
    return this.writeChain;
  }
  drainDebouncedWaiters() {
    const waiters = this.debouncedWaiters;
    this.debouncedWaiters = [];
    return waiters;
  }
  pruneResolutionCacheInPlace() {
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      pruneNbeResolutionCache(this.data.nbeResolutionCache),
      this.data.nbeResolvedTargetCache
    );
  }
  pruneResolvedTargetCacheInPlace() {
    this.data = createPersistedPluginData(
      this.data.settings,
      this.data.imageSizeMemory,
      this.data.nbeRegistry,
      this.data.nbeResolutionCache,
      pruneNbeResolvedTargetCache(this.data.nbeResolvedTargetCache)
    );
  }
};
function cloneRegistry(registry) {
  if (!registry) return {};
  return Object.fromEntries(
    Object.entries(registry).map(([ref, entry]) => [
      ref,
      {
        ref: entry.ref,
        primaryLocationKey: entry.primaryLocationKey,
        lastSeenAt: entry.lastSeenAt,
        locations: entry.locations.map((location) => ({ ...location }))
      }
    ])
  );
}
function cloneResolutionCache(cache) {
  if (!cache) return {};
  return Object.fromEntries(
    Object.entries(cache).map(([tokenFingerprint2, namespace]) => [
      tokenFingerprint2,
      Object.fromEntries(
        Object.entries(namespace).map(([pageNbeId, pageIndex]) => [pageNbeId, cloneResolvedPageIndex(pageIndex)])
      )
    ])
  );
}
function cloneResolvedTargetCache(cache) {
  if (!cache) return {};
  return Object.fromEntries(
    Object.entries(cache).map(([tokenFingerprint2, namespace]) => [
      tokenFingerprint2,
      Object.fromEntries(Object.entries(namespace).map(([ref, target]) => [ref, cloneResolvedTarget(target)]))
    ])
  );
}
function cloneResolvedPageIndex(pageIndex) {
  return {
    pageNbeId: pageIndex.pageNbeId,
    pageId: pageIndex.pageId,
    blocks: { ...pageIndex.blocks },
    resolvedAt: pageIndex.resolvedAt
  };
}
function cloneResolvedTarget(target) {
  return {
    ref: target.ref,
    pageNbeId: target.pageNbeId,
    blockNbeId: target.blockNbeId,
    pageId: target.pageId,
    blockId: target.blockId,
    resolvedAt: target.resolvedAt
  };
}

// src/embed/cache.ts
var AsyncTtlCache = class {
  constructor(ttlMs, maxEntries = Number.POSITIVE_INFINITY) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.values = /* @__PURE__ */ new Map();
    this.inFlight = /* @__PURE__ */ new Map();
  }
  async getOrLoad(key, loader) {
    const now2 = Date.now();
    const cached = this.values.get(key);
    if (cached) {
      if (cached.expiresAt > now2) {
        this.touch(key, cached);
        return cached.value;
      }
      this.values.delete(key);
    }
    const running = this.inFlight.get(key);
    if (running) return running;
    const task = loader().then((result) => {
      this.values.set(key, { value: result, expiresAt: Date.now() + this.ttlMs });
      this.pruneOverflow();
      return result;
    }).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, task);
    return task;
  }
  hasFresh(key) {
    const cached = this.values.get(key);
    if (!cached) return false;
    if (cached.expiresAt > Date.now()) return true;
    this.values.delete(key);
    return false;
  }
  hasInFlight(key) {
    return this.inFlight.has(key);
  }
  clearAll() {
    this.values.clear();
    this.inFlight.clear();
  }
  delete(key) {
    this.values.delete(key);
    this.inFlight.delete(key);
  }
  invalidatePrefix(prefix) {
    this.deleteWhere((key) => key.startsWith(prefix));
  }
  deleteWhere(predicate) {
    for (const key of this.values.keys()) {
      if (predicate(key)) this.values.delete(key);
    }
    for (const key of this.inFlight.keys()) {
      if (predicate(key)) this.inFlight.delete(key);
    }
  }
  touch(key, entry) {
    this.values.delete(key);
    this.values.set(key, entry);
  }
  pruneOverflow() {
    if (!Number.isFinite(this.maxEntries) || this.maxEntries <= 0) return;
    while (this.values.size > this.maxEntries) {
      const oldestKey = this.values.keys().next().value;
      if (typeof oldestKey !== "string") return;
      this.values.delete(oldestKey);
    }
  }
};

// src/embed/instance-store.ts
var import_obsidian = require("obsidian");

// src/embed/concurrency.ts
async function runWithConcurrency(total, concurrency, worker) {
  if (total <= 0) return [];
  const limit = Math.max(1, Math.min(concurrency, total));
  const result = new Array(total);
  let nextIndex = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= total) break;
      result[index] = await worker(index);
    }
  });
  await Promise.all(workers);
  return result;
}
async function mapWithConcurrency(items, concurrency, mapper) {
  return runWithConcurrency(items.length, concurrency, async (index) => mapper(items[index], index));
}

// src/embed/instance-store.ts
var EmbedLifecycleChild = class extends import_obsidian.MarkdownRenderChild {
  constructor(containerEl, onDispose) {
    super(containerEl);
    this.onDispose = onDispose;
  }
  onload() {
  }
  onunload() {
    this.onDispose();
  }
};
var EmbedInstanceStore = class {
  constructor(logger) {
    this.logger = logger;
    this.nextId = 0;
    this.active = /* @__PURE__ */ new Map();
  }
  track(container, registerChild, session) {
    const id = `nbe-${this.nextId++}`;
    this.active.set(id, session);
    registerChild(
      new EmbedLifecycleChild(container, () => {
        const active = this.active.get(id);
        this.active.delete(id);
        active?.dispose();
      })
    );
    return id;
  }
  async refreshAll(options) {
    const sessions = Array.from(this.active.values());
    if (sessions.length === 0) return;
    await runWithConcurrency(sessions.length, options?.concurrency ?? 1, async (index) => {
      try {
        await sessions[index].rerender();
      } catch (error) {
        this.logger.debug(`refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  clear() {
    for (const session of this.active.values()) {
      session.dispose();
    }
    this.active.clear();
  }
  hasActiveEmbeds() {
    return this.active.size > 0;
  }
};

// src/embed/refresh-scheduler.ts
var RefreshScheduler = class {
  constructor(logger) {
    this.logger = logger;
    this.timer = null;
    this.running = false;
  }
  configure(input) {
    this.stop();
    if (input.policy !== "interval") return;
    const intervalMs = Math.max(30, input.intervalSec) * 1e3;
    this.timer = window.setInterval(async () => {
      if (this.running) return;
      this.running = true;
      try {
        await input.task();
      } catch (error) {
        this.logger.debug(
          `periodic refresh failed: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        this.running = false;
      }
    }, intervalMs);
  }
  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }
};

// src/writeback/capabilities.ts
var BLOCK_CAPABILITY_POLICIES = {
  paragraph: {
    writableType: "paragraph",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true
  },
  heading_1: {
    writableType: "heading_1",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true
  },
  heading_2: {
    writableType: "heading_2",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true
  },
  heading_3: {
    writableType: "heading_3",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true
  },
  quote: {
    writableType: "quote",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true
  },
  code: {
    writableType: "code",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true
  },
  bulleted_list_item: {
    writableType: "bulleted_list_item",
    textEditMode: "simple_plain_text",
    canInsertSiblingBelow: true,
    canOpenInNotion: true
  },
  numbered_list_item: {
    writableType: "numbered_list_item",
    textEditMode: "simple_plain_text",
    canOpenInNotion: true
  },
  to_do: {
    writableType: "to_do",
    textEditMode: "simple_plain_text",
    canInsertSiblingBelow: true,
    canToggleTodo: true,
    canOpenInNotion: true
  },
  toggle: {
    canOpenInNotion: true
  }
};
function getRawRichText(block) {
  const typeData = block[block.type];
  if (!typeData || typeof typeData !== "object") return [];
  const value = typeData.rich_text;
  return Array.isArray(value) ? value : [];
}
function hasNonDefaultAnnotations(item) {
  const annotations = item.annotations;
  if (!annotations) return false;
  return Boolean(
    annotations.bold || annotations.italic || annotations.strikethrough || annotations.underline || annotations.code || annotations.color && annotations.color !== "default"
  );
}
function isSimplePlainTextBlock(block) {
  const items = getRawRichText(block);
  if (items.length === 0) return true;
  return items.every((item) => {
    if (item.type !== "text") return false;
    if (item.href || item.text?.link?.url) return false;
    if (hasNonDefaultAnnotations(item)) return false;
    return true;
  });
}
function resolveCanEditText(policy, block) {
  return policy.textEditMode === "simple_plain_text" ? isSimplePlainTextBlock(block) : false;
}
function getBlockCapabilities(block, childCount = 0) {
  const policy = BLOCK_CAPABILITY_POLICIES[block.type] ?? {};
  const writableType = policy.writableType;
  const writable = Boolean(writableType);
  if (!writable) {
    return {
      writable: false,
      canOpenInNotion: Boolean(policy.canOpenInNotion)
    };
  }
  return {
    writable,
    writableType,
    canEditText: resolveCanEditText(policy, block),
    canInsertSiblingBelow: Boolean(policy.canInsertSiblingBelow),
    canDeleteSelf: Boolean(policy.canInsertSiblingBelow) && childCount === 0,
    canToggleTodo: Boolean(policy.canToggleTodo),
    canOpenInNotion: Boolean(policy.canOpenInNotion)
  };
}

// src/notion/adapters.ts
function getTypeData(block) {
  const data = block[block.type];
  return data && typeof data === "object" ? data : {};
}
function getRichText(block) {
  const value = getTypeData(block).rich_text;
  if (!Array.isArray(value)) return [];
  return mapRichTextList(value);
}
function mapRichTextList(items) {
  return items.map((item) => ({
    plainText: item.plain_text ?? item.equation?.expression ?? item.text?.content ?? "",
    href: item.href ?? item.text?.link?.url ?? null,
    sourceType: item.type,
    equationExpression: item.type === "equation" ? item.equation?.expression ?? item.plain_text ?? "" : void 0,
    annotations: item.annotations ? {
      bold: Boolean(item.annotations.bold),
      italic: Boolean(item.annotations.italic),
      strikethrough: Boolean(item.annotations.strikethrough),
      underline: Boolean(item.annotations.underline),
      code: Boolean(item.annotations.code),
      color: typeof item.annotations.color === "string" ? item.annotations.color : void 0
    } : void 0
  }));
}
function getUrlFromTypeData(data, key) {
  const value = data[key];
  if (!value || typeof value !== "object") return void 0;
  const url = value.url;
  return typeof url === "string" && url.trim() ? url : void 0;
}
function getImageProps(data) {
  const type = typeof data.type === "string" ? data.type : "";
  const directUrl = typeof data.url === "string" && data.url.trim() ? data.url : void 0;
  if (directUrl) {
    return { imageUrl: directUrl };
  }
  if (type === "external") {
    const imageUrl = getUrlFromTypeData(data, "external");
    return imageUrl ? { imageUrl } : { imageUnavailableReason: "External image URL is missing." };
  }
  if (type === "file") {
    const imageUrl = getUrlFromTypeData(data, "file");
    return imageUrl ? { imageUrl } : { imageUnavailableReason: "Notion did not return a downloadable URL for this image file." };
  }
  if (type === "file_upload") {
    const imageUrl = getUrlFromTypeData(data, "file_upload");
    return imageUrl ? { imageUrl } : {
      imageUnavailableReason: "Notion returned a file_upload reference without a downloadable URL. Re-fetch the block after the upload is attached."
    };
  }
  const fallbackUrl = getUrlFromTypeData(data, "file") ?? getUrlFromTypeData(data, "external");
  if (fallbackUrl) {
    return { imageUrl: fallbackUrl };
  }
  if (!type && Array.isArray(data.caption) && Object.keys(data).length === 1) {
    return {
      imageUnavailableReason: "Notion did not expose a file source for this image. This often happens with private attachment images imported into Notion."
    };
  }
  return {
    imageUnavailableReason: type ? `Unsupported Notion image type: ${type}.` : "Image URL is missing."
  };
}
function getProps(block) {
  const data = getTypeData(block);
  if (block.type === "to_do") {
    return {
      checked: Boolean(data.checked)
    };
  }
  if (block.type === "code") {
    return {
      codeLanguage: typeof data.language === "string" ? data.language : "plain text"
    };
  }
  if (block.type === "image") {
    return getImageProps(data);
  }
  if (block.type === "column") {
    return {
      columnWidthRatio: typeof data.width_ratio === "number" ? data.width_ratio : void 0
    };
  }
  if (block.type === "equation") {
    return {
      equationExpression: typeof data.expression === "string" ? data.expression : void 0
    };
  }
  if (block.type === "synced_block") {
    const syncedFrom = data.synced_from;
    return {
      syncedFromBlockId: typeof syncedFrom?.block_id === "string" ? syncedFrom.block_id : null
    };
  }
  return {};
}
function getNodeRichText(block) {
  if (block.type !== "image") {
    return getRichText(block);
  }
  const data = getTypeData(block);
  if (!Array.isArray(data.caption)) return [];
  return mapRichTextList(data.caption);
}
function mapNode(node, sourcePageId) {
  const children = node.children.map((child) => mapNode(child, sourcePageId));
  const parent = node.block.parent;
  return {
    id: node.block.id,
    type: node.block.type,
    richText: getNodeRichText(node.block),
    children,
    props: getProps(node.block),
    meta: {
      sourcePageId,
      parentId: typeof parent?.block_id === "string" ? parent.block_id : typeof parent?.page_id === "string" ? parent.page_id : void 0,
      parentType: parent?.type === "block_id" || parent?.type === "page_id" ? parent.type : void 0,
      lastEditedTime: node.block.last_edited_time,
      notionTypeData: getTypeData(node.block)
    },
    capabilities: getBlockCapabilities(node.block, children.length)
  };
}
function toEmbedNodeTree(tree, sourcePageId) {
  return mapNode(tree, sourcePageId);
}

// src/notion/parser.ts
var HEX_32 = /^[0-9a-f]{32}$/i;
function normalizeNotionId(raw) {
  const compact = raw.replace(/-/g, "").toLowerCase();
  if (!HEX_32.test(compact)) {
    throw new PluginError("INVALID_INPUT", `Invalid Notion ID: ${raw}`);
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(
    16,
    20
  )}-${compact.slice(20)}`;
}
function extractLastPathId(pathname) {
  const matches = pathname.match(/[0-9a-fA-F]{32}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}
function extractHashId(hash) {
  const cleaned = hash.replace(/^#/, "").trim();
  const match = cleaned.match(/[0-9a-fA-F]{32}/);
  return match ? match[0] : null;
}
function assertNotionDomain(url) {
  const hostname = url.hostname.toLowerCase();
  if (!/notion\.so$/i.test(hostname) && !/\.notion\.site$/i.test(hostname) && hostname !== "app.notion.com") {
    throw new PluginError("INVALID_INPUT", "URL must be a Notion URL.");
  }
}
function parseUrl(rawUrl, label) {
  try {
    return new URL(rawUrl.trim());
  } catch {
    throw new PluginError("INVALID_INPUT", `Invalid ${label} URL.`);
  }
}
function parseNotionBlockUrl(rawUrl) {
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
    blockId: normalizeNotionId(blockRaw)
  };
}
function parseNotionPageUrl(rawUrl) {
  const url = parseUrl(rawUrl, "Notion page");
  assertNotionDomain(url);
  const pageRaw = extractLastPathId(url.pathname);
  if (!pageRaw) {
    throw new PluginError("INVALID_INPUT", "Page ID not found in URL path.");
  }
  return {
    originalUrl: rawUrl.trim(),
    pageId: normalizeNotionId(pageRaw)
  };
}
function parseNbeUri(rawUrl) {
  const parsed = parseNbeProtocolUrl(rawUrl, { requireOpenRefAction: true });
  return {
    mode: "nbe_uri",
    originalUrl: parsed.originalUrl,
    action: parsed.action,
    vault: parsed.vault,
    ref: parsed.ref,
    pageNbeId: parsed.pageNbeId,
    blockNbeId: parsed.blockNbeId
  };
}
function normalizeHeadingInput(value) {
  return value.replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}
function parseKeyValueSource(source) {
  const lines = source.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
  const out = {};
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
function parseNotionTargetFromSource(source) {
  const lines = source.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return {
      mode: "empty_block_url",
      originalUrl: ""
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
    heading
  };
}
function isShortlinkStudioUrl(rawUrl) {
  try {
    const url = new URL(rawUrl.trim());
    return ["http:", "https:"].includes(url.protocol) && url.hostname.toLowerCase() === "www.shortlink.studio";
  } catch {
    return false;
  }
}

// src/embed/source-loader.ts
function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function buildSharedLoadKey(source, settings) {
  return `${settings.showChildren ? "children" : "single"}::${source}`;
}
var sharedLoadTasks = /* @__PURE__ */ new Map();
function parseTarget(source) {
  return parseNotionTargetFromSource(source);
}
function createEmptyRoot() {
  return {
    id: "nbe-empty-root",
    type: "section_container",
    richText: [],
    children: [],
    props: {},
    meta: {
      sourcePageId: "",
      notionTypeData: {}
    },
    capabilities: {
      writable: false
    }
  };
}
async function loadTree(repository, target, settings) {
  if (target.mode === "empty_block_url") {
    throw new Error("Empty block URL target should not load a repository tree.");
  }
  if (target.mode === "block_url") {
    return {
      tree: await repository.getBlockTree(target.blockId, settings.showChildren),
      sourcePageId: target.pageId,
      cacheScopes: repository.cacheScopesForTarget(target),
      writebackAllowed: settings.allowWriteback
    };
  }
  if (target.mode === "page_heading") {
    return {
      tree: await repository.getPageSectionByHeading(target.pageId, target.heading, settings.showChildren),
      sourcePageId: target.pageId,
      cacheScopes: repository.cacheScopesForTarget(target),
      writebackAllowed: false
    };
  }
  const resolved = await repository.getBlockTreeByNbeRef(target.pageNbeId, target.blockNbeId, settings.showChildren);
  return {
    tree: resolved.tree,
    sourcePageId: resolved.pageId,
    cacheScopes: [
      { kind: "page_tree", pageId: resolved.pageId },
      { kind: "block_tree", blockId: resolved.blockId }
    ],
    writebackAllowed: false
  };
}
function createDetailedResult(parsedTarget, root, writebackAllowed, cacheScopes, metrics) {
  return {
    loaded: {
      parsedTarget,
      sourceMode: parsedTarget.mode,
      root,
      writebackAllowed,
      cacheScopes
    },
    metrics: {
      parseMs: metrics.parseMs,
      repositoryMs: metrics.repositoryMs,
      adapterMs: metrics.adapterMs,
      totalMs: metrics.totalMs,
      sharedLoadState: metrics.sharedLoadState ?? "leader"
    }
  };
}
async function loadEmbedPipeline(source, settings, repository) {
  const totalStart = now();
  const parseStart = now();
  const parsedTarget = parseTarget(source);
  const parseMs = now() - parseStart;
  if (parsedTarget.mode === "empty_block_url") {
    return createDetailedResult(parsedTarget, createEmptyRoot(), false, [], {
      parseMs,
      repositoryMs: 0,
      adapterMs: 0,
      totalMs: now() - totalStart
    });
  }
  const repositoryStart = now();
  const loaded = await loadTree(repository, parsedTarget, settings);
  const repositoryMs = now() - repositoryStart;
  const adapterStart = now();
  const root = toEmbedNodeTree(loaded.tree, loaded.sourcePageId);
  const adapterMs = now() - adapterStart;
  return createDetailedResult(parsedTarget, root, loaded.writebackAllowed, loaded.cacheScopes, {
    parseMs,
    repositoryMs,
    adapterMs,
    totalMs: now() - totalStart
  });
}
function isEmbedSourceLikelyWarm(source, settings, repository) {
  try {
    return repository.isLikelyWarmTarget(parseTarget(source), settings.showChildren);
  } catch {
    return false;
  }
}
async function loadEmbedFromSourceDetailed(source, settings, repository, logger) {
  const sharedKey = buildSharedLoadKey(source, settings);
  const running = sharedLoadTasks.get(sharedKey);
  if (running) {
    logger?.debug(`shared-load hit ${sharedKey}`);
    logger?.debug(`shared-load join ${sharedKey}`);
    const detailed = await running;
    return {
      loaded: detailed.loaded,
      metrics: {
        ...detailed.metrics,
        sharedLoadState: "join"
      }
    };
  }
  const task = loadEmbedPipeline(source, settings, repository).finally(() => {
    if (sharedLoadTasks.get(sharedKey) === task) {
      sharedLoadTasks.delete(sharedKey);
    }
  });
  sharedLoadTasks.set(sharedKey, task);
  return task;
}
function clearSharedEmbedLoadTasks() {
  sharedLoadTasks.clear();
}

// src/notion/client.ts
var import_obsidian2 = require("obsidian");
function stringifyPayload(payload) {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}
function notionErrorMessage(payload) {
  if (payload && typeof payload === "object" && typeof payload.message === "string") {
    return payload.message;
  }
  return stringifyPayload(payload);
}
function buildNotionError(status, payload) {
  const detail = stringifyPayload(payload);
  const message = notionErrorMessage(payload);
  if (status === 401) return new PluginError("NOTION_UNAUTHORIZED", "Unauthorized", status, detail);
  if (status === 403) return new PluginError("NOTION_FORBIDDEN", "Forbidden", status, detail);
  if (status === 404) return new PluginError("NOTION_NOT_FOUND", "Not found", status, detail);
  if (status === 429) return new PluginError("NOTION_RATE_LIMIT", "Rate limit", status, detail);
  if (status === 400) return new PluginError("NOTION_BAD_REQUEST", message || "Bad request", status, detail);
  return new PluginError("UNKNOWN", `Notion API ${status}: ${message}`, status, detail);
}
var RETRY_DELAYS_MS = [300, 900, 1800];
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}
var NotionClient = class {
  constructor(token, logger) {
    this.token = token;
    this.logger = logger;
  }
  async request(path, method, body) {
    const maxAttempts = RETRY_DELAYS_MS.length + 1;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await (0, import_obsidian2.requestUrl)({
          url: `${NOTION_API_BASE}${path}`,
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
          },
          body: body ? JSON.stringify(body) : void 0,
          throw: false
        });
        const text = response.text ?? "";
        let payload;
        try {
          payload = response.json ?? JSON.parse(text);
        } catch {
          payload = text;
        }
        if (response.status < 200 || response.status >= 300) {
          const error = buildNotionError(response.status, payload);
          if (shouldRetryStatus(response.status) && attempt < maxAttempts) {
            await delay(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
            continue;
          }
          throw error;
        }
        return payload;
      } catch (error) {
        if (error instanceof PluginError) {
          if (error.status && shouldRetryStatus(error.status) && attempt < maxAttempts) {
            await delay(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
            continue;
          }
          throw error;
        }
        lastError = error;
        if (attempt < maxAttempts) {
          await delay(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
          continue;
        }
        throw new PluginError("NETWORK", error instanceof Error ? error.message : String(error));
      }
    }
    throw new PluginError("UNKNOWN", String(lastError ?? "Unknown request failure"));
  }
  async getBlock(blockId) {
    this.logger.debug(`GET block ${blockId}`);
    return this.request(`/blocks/${blockId}`, "GET");
  }
  async listBlockChildren(blockId) {
    const results = [];
    let cursor = null;
    while (true) {
      const query = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
      this.logger.debug(`GET children ${blockId} cursor=${cursor ?? "none"}`);
      const page = await this.request(
        `/blocks/${blockId}/children${query}`,
        "GET"
      );
      results.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return results;
  }
  async searchDatabases() {
    const results = [];
    let cursor = null;
    while (true) {
      const body = {
        page_size: 100,
        filter: {
          property: "object",
          value: "database"
        }
      };
      if (cursor) {
        body.start_cursor = cursor;
      }
      this.logger.debug(`POST search databases cursor=${cursor ?? "none"}`);
      const page = await this.request("/search", "POST", body);
      results.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return results;
  }
  async queryDatabaseByNbeId(databaseId, nbeId) {
    const results = [];
    let cursor = null;
    while (true) {
      const body = {
        page_size: 100,
        filter: {
          property: "NBE ID",
          rich_text: {
            equals: nbeId
          }
        }
      };
      if (cursor) {
        body.start_cursor = cursor;
      }
      this.logger.debug(`POST database query ${databaseId} nbe=${nbeId} cursor=${cursor ?? "none"}`);
      const page = await this.request(`/databases/${databaseId}/query`, "POST", body);
      results.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return results;
  }
  async updateBlock(blockId, payload) {
    this.logger.debug(`PATCH block ${blockId}`);
    return this.request(`/blocks/${blockId}`, "PATCH", payload);
  }
  async appendBlockChildren(parentId, children, after) {
    this.logger.debug(`PATCH append children parent=${parentId} after=${after ?? "none"}`);
    const body = {
      children
    };
    if (after) {
      body.after = after;
    }
    const response = await this.request(`/blocks/${parentId}/children`, "PATCH", body);
    return response.results;
  }
  async deleteBlock(blockId) {
    this.logger.debug(`DELETE block ${blockId}`);
    return this.request(`/blocks/${blockId}`, "DELETE");
  }
};

// src/notion/children-hydration.ts
var NotionChildrenHydrator = class {
  constructor(client, logger) {
    this.client = client;
    this.logger = logger;
  }
  async loadChildren(parentId, depth) {
    if (depth > MAX_TREE_DEPTH) return [];
    const children = await this.client.listBlockChildren(parentId);
    return mapWithConcurrency(children, REPOSITORY_TREE_CONCURRENCY, async (child) => ({
      block: child,
      children: child.has_children ? await this.loadChildrenForBlock(child, depth + 1) : []
    }));
  }
  async loadChildrenForBlock(block, depth) {
    if (!block.has_children || depth > MAX_TREE_DEPTH) return [];
    if (block.type !== "synced_block") {
      return this.loadChildren(block.id, depth);
    }
    return this.loadSyncedChildren(block, depth);
  }
  async loadSyncedChildren(block, depth) {
    if (depth > MAX_TREE_DEPTH) return [];
    const listedChildren = await this.loadChildren(block.id, depth);
    if (listedChildren.length > 0) {
      return listedChildren;
    }
    const syncedData = this.getSyncedBlockData(block);
    const inlineChildren = this.getInlineSyncedChildren(syncedData);
    if (inlineChildren.length > 0) {
      return this.mapInlineChildren(inlineChildren, depth);
    }
    const sourceBlockId = this.getSyncedSourceBlockId(syncedData);
    if (!sourceBlockId || sourceBlockId === block.id || depth >= MAX_TREE_DEPTH) {
      return [];
    }
    try {
      return await this.loadChildren(sourceBlockId, depth + 1);
    } catch (error) {
      this.logger.debug(
        `repository synced_block fallback failed block=${block.id} source=${sourceBlockId} error=${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
  async mapInlineChildren(children, depth) {
    return mapWithConcurrency(children, REPOSITORY_TREE_CONCURRENCY, async (child) => {
      const inlineGrandChildren = this.getInlineChildChildren(child);
      let grandChildren = [];
      if (inlineGrandChildren.length > 0 && depth < MAX_TREE_DEPTH) {
        grandChildren = await this.mapInlineChildren(inlineGrandChildren, depth + 1);
      } else if (child.has_children && depth < MAX_TREE_DEPTH) {
        grandChildren = await this.loadChildrenForBlock(child, depth + 1);
      }
      return {
        block: child,
        children: grandChildren
      };
    });
  }
  getSyncedBlockData(block) {
    const value = block.synced_block;
    return value && typeof value === "object" ? value : {};
  }
  getInlineSyncedChildren(data) {
    const value = data.children;
    if (!Array.isArray(value)) return [];
    return value.filter((item) => Boolean(item && typeof item === "object"));
  }
  getSyncedSourceBlockId(data) {
    const syncedFrom = data.synced_from;
    if (!syncedFrom || typeof syncedFrom !== "object") return null;
    return typeof syncedFrom.block_id === "string" ? syncedFrom.block_id : null;
  }
  getInlineChildChildren(block) {
    const typeData = block[block.type];
    if (!typeData || typeof typeData !== "object") return [];
    const children = typeData.children;
    if (!Array.isArray(children)) return [];
    return children.filter((item) => Boolean(item && typeof item === "object"));
  }
};

// src/notion/heading-section.ts
function headingLevel(type) {
  if (type === "heading_1") return 1;
  if (type === "heading_2") return 2;
  if (type === "heading_3") return 3;
  return null;
}
function blockPlainText(block) {
  const data = block[block.type];
  if (!data?.rich_text || !Array.isArray(data.rich_text)) return "";
  return data.rich_text.map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}
function normalizeHeading(value) {
  return value.replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}
function extractHeadingSection(nodes, heading) {
  const normalizedHeading = normalizeHeading(heading);
  let start = -1;
  let startLevel = 0;
  for (let i = 0; i < nodes.length; i++) {
    const level = headingLevel(nodes[i].block.type);
    if (!level) continue;
    const text = normalizeHeading(blockPlainText(nodes[i].block));
    if (text === normalizedHeading) {
      start = i;
      startLevel = level;
      break;
    }
  }
  if (start < 0) return [];
  const out = [];
  for (let i = start; i < nodes.length; i++) {
    const node = nodes[i];
    if (i > start) {
      const level = headingLevel(node.block.type);
      if (level !== null && level <= startLevel) break;
    }
    out.push(node);
  }
  return out;
}

// src/notion/repository.ts
var NotionRepository = class {
  constructor(client, cache, logger, keyPrefix, nbeResolutionCacheStore) {
    this.client = client;
    this.cache = cache;
    this.logger = logger;
    this.keyPrefix = keyPrefix;
    this.nbeResolutionCacheStore = nbeResolutionCacheStore;
    this.nbePageCache = /* @__PURE__ */ new Map();
    this.nbeResolvedTargetCache = /* @__PURE__ */ new Map();
    this.nbeResolvedPageIndexCache = /* @__PURE__ */ new Map();
    this.nbeDatabasesCache = null;
    this.hydrator = new NotionChildrenHydrator(client, logger);
  }
  async getBlockTree(blockId, includeChildren) {
    const key = this.buildBlockTreeKey(blockId, includeChildren);
    this.logger.debug(`repository getBlockTree ${key}`);
    return this.cache.getOrLoad(key, async () => freezeDeep(await this.loadTree(blockId, includeChildren)));
  }
  isLikelyWarmTarget(target, includeChildren) {
    if (target.mode === "empty_block_url") return true;
    if (target.mode === "block_url") {
      return this.hasWarmTreeKey(this.buildBlockTreeKey(target.blockId, includeChildren));
    }
    if (target.mode === "page_heading") {
      return this.hasWarmTreeKey(this.buildPageSectionKey(target.pageId, normalizeHeading(target.heading), includeChildren));
    }
    const ref = target.ref;
    const resolvedTarget = this.readTimed(this.nbeResolvedTargetCache, ref) ?? this.readPersistedResolvedTarget(ref);
    if (!resolvedTarget) return false;
    return this.hasWarmTreeKey(this.buildBlockTreeKey(resolvedTarget.blockId, includeChildren));
  }
  async getBlockTreeByNbeRef(pageNbeId, blockNbeId, includeChildren) {
    const ref = buildNbeRef(pageNbeId, blockNbeId).ref;
    const memoryTarget = this.readTimed(this.nbeResolvedTargetCache, ref);
    if (memoryTarget) {
      this.logger.debug(`nbe-target memory hit ${ref}`);
      const resolved = await this.resolveFromResolvedTarget(memoryTarget, includeChildren);
      if (resolved) return resolved;
      this.logger.debug(`nbe-target stale -> fallback ${ref}`);
    }
    const persistedTarget = this.readPersistedResolvedTarget(ref);
    if (persistedTarget) {
      this.logger.debug(`nbe-target persisted hit ${ref}`);
      const resolved = await this.resolveFromResolvedTarget(persistedTarget, includeChildren);
      if (resolved) return resolved;
      this.logger.debug(`nbe-target stale -> fallback ${ref}`);
    }
    const memoryIndex = this.readTimed(this.nbeResolvedPageIndexCache, pageNbeId);
    if (memoryIndex) {
      this.logger.debug(`nbe-page-index memory hit ${pageNbeId}`);
      const resolved = await this.resolveFromPageIndex(memoryIndex, pageNbeId, blockNbeId, includeChildren);
      if (resolved) return resolved;
      this.logger.debug(`nbe-page-index stale -> rebuild ${pageNbeId}`);
    }
    const persistedIndex = this.readPersistedPageIndex(pageNbeId);
    if (persistedIndex) {
      this.logger.debug(`nbe-page-index persisted hit ${pageNbeId}`);
      const resolved = await this.resolveFromPageIndex(persistedIndex, pageNbeId, blockNbeId, includeChildren);
      if (resolved) {
        this.writeTimedWithTtl(this.nbeResolvedPageIndexCache, pageNbeId, persistedIndex, NBE_RESOLUTION_CACHE_TTL_MS);
        return resolved;
      }
      this.logger.debug(`nbe-page-index stale -> rebuild ${pageNbeId}`);
    }
    this.logger.debug(`nbe-page-index rebuild ${pageNbeId}`);
    const rebuiltIndex = await this.rebuildPageIndex(pageNbeId);
    const rebuilt = await this.resolveFromPageIndex(rebuiltIndex.pageIndex, pageNbeId, blockNbeId, includeChildren);
    if (rebuilt) return rebuilt;
    if (rebuiltIndex.duplicateBlockNbeIds.has(blockNbeId)) {
      throw new PluginError("INVALID_INPUT", `Duplicate Block ID on page for ref: ${ref}`);
    }
    throw new PluginError("INVALID_INPUT", `NBE block not found on page: ${ref}`);
  }
  async prewarmNbePageIndex(pageNbeId) {
    const memoryIndex = this.readTimed(this.nbeResolvedPageIndexCache, pageNbeId);
    if (memoryIndex) {
      this.logger.debug(`nbe-page-index prewarm hit ${pageNbeId}`);
      return;
    }
    const persistedIndex = this.readPersistedPageIndex(pageNbeId);
    if (persistedIndex) {
      this.logger.debug(`nbe-page-index prewarm hit ${pageNbeId}`);
      this.writeTimedWithTtl(this.nbeResolvedPageIndexCache, pageNbeId, persistedIndex, NBE_RESOLUTION_CACHE_TTL_MS);
      return;
    }
    this.logger.debug(`nbe-page-index prewarm rebuild ${pageNbeId}`);
    await this.rebuildPageIndex(pageNbeId);
  }
  async getPageSectionByHeading(pageId, heading, includeChildren) {
    const normalizedHeading = normalizeHeading(heading);
    const key = this.buildPageSectionKey(pageId, normalizedHeading, includeChildren);
    this.logger.debug(`repository getPageSectionByHeading ${key}`);
    return this.cache.getOrLoad(key, async () => {
      const pageTree = await this.getPageTree(pageId, includeChildren);
      const sectionChildren = extractHeadingSection(pageTree.children, normalizedHeading);
      if (sectionChildren.length === 0) {
        throw new PluginError("INVALID_INPUT", `Heading not found: ${heading}`);
      }
      const synthetic = {
        object: "block",
        id: pageId,
        type: "section_container",
        has_children: sectionChildren.length > 0,
        last_edited_time: pageTree.block.last_edited_time,
        section_container: {
          title: heading
        }
      };
      return freezeDeep({
        block: synthetic,
        children: sectionChildren
      });
    });
  }
  async getPageTree(pageId, includeChildren) {
    const key = this.buildPageTreeKey(pageId, includeChildren);
    this.logger.debug(`repository getPageTree ${key}`);
    return this.cache.getOrLoad(key, async () => {
      const pageBlock = await this.client.getBlock(pageId);
      const topLevel = await this.loadTopLevel(pageId, includeChildren);
      return freezeDeep({
        block: pageBlock,
        children: topLevel
      });
    });
  }
  cacheScopesForTarget(target) {
    if (target.mode === "empty_block_url" || target.mode === "nbe_uri") {
      return [];
    }
    if (target.mode === "block_url") {
      return [{ kind: "block_tree", blockId: target.blockId }];
    }
    return [
      { kind: "page_tree", pageId: target.pageId },
      { kind: "page_section", pageId: target.pageId }
    ];
  }
  invalidateScopes(scopes) {
    for (const scope of scopes) {
      if (scope.kind === "block_tree") {
        const prefix2 = `${this.keyPrefix}:block:${scope.blockId}:`;
        this.cache.invalidatePrefix(prefix2);
        continue;
      }
      if (scope.kind === "page_tree") {
        const treePrefix = `${this.keyPrefix}:page:${scope.pageId}:tree:`;
        const sectionPrefix = `${this.keyPrefix}:page:${scope.pageId}:section:`;
        this.cache.invalidatePrefix(treePrefix);
        this.cache.invalidatePrefix(sectionPrefix);
        continue;
      }
      const prefix = `${this.keyPrefix}:page:${scope.pageId}:section:`;
      this.cache.invalidatePrefix(prefix);
    }
  }
  clearContentCache() {
    this.cache.clearAll();
  }
  clearCache() {
    this.cache.clearAll();
    this.nbeDatabasesCache = null;
    this.nbePageCache.clear();
    this.nbeResolvedTargetCache.clear();
    this.nbeResolvedPageIndexCache.clear();
    void this.nbeResolutionCacheStore?.clearNamespace?.(this.keyPrefix);
  }
  hasWarmTreeKey(key) {
    return this.cache.hasFresh(key) || this.cache.hasInFlight(key);
  }
  async getPageByNbeId(pageNbeId) {
    const cached = this.readTimed(this.nbePageCache, pageNbeId);
    if (cached) return cached;
    const databases = await this.getNbeDatabases();
    if (databases.length === 0) {
      throw new PluginError("INVALID_INPUT", `NBE page not found: ${pageNbeId}`);
    }
    const matches = (await mapWithConcurrency(
      databases,
      REPOSITORY_TREE_CONCURRENCY,
      async (database) => this.client.queryDatabaseByNbeId(database.id, pageNbeId)
    )).flat();
    if (matches.length === 0) {
      throw new PluginError("INVALID_INPUT", `NBE page not found: ${pageNbeId}`);
    }
    if (matches.length > 1) {
      throw new PluginError("INVALID_INPUT", `Duplicate NBE ID: ${pageNbeId}`);
    }
    const page = matches[0];
    this.writeTimed(this.nbePageCache, pageNbeId, page);
    return page;
  }
  async getNbeDatabases() {
    const now2 = Date.now();
    if (this.nbeDatabasesCache && this.nbeDatabasesCache.expiresAt > now2) {
      return this.nbeDatabasesCache.value;
    }
    const databases = (await this.client.searchDatabases()).filter((database) => hasNbeProperty(database));
    this.nbeDatabasesCache = {
      expiresAt: now2 + CACHE_TTL_MS,
      value: databases
    };
    return databases;
  }
  readPersistedPageIndex(pageNbeId) {
    const persisted = this.nbeResolutionCacheStore?.getPageIndex(this.keyPrefix, pageNbeId);
    if (!persisted) return null;
    if (persisted.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS <= Date.now()) {
      void this.nbeResolutionCacheStore?.deletePageIndex(this.keyPrefix, pageNbeId);
      return null;
    }
    return persisted;
  }
  readPersistedResolvedTarget(ref) {
    const persisted = this.nbeResolutionCacheStore?.getResolvedTarget(this.keyPrefix, ref);
    if (!persisted) return null;
    if (persisted.resolvedAt + NBE_RESOLUTION_CACHE_TTL_MS <= Date.now()) {
      void this.nbeResolutionCacheStore?.deleteResolvedTarget(this.keyPrefix, ref);
      return null;
    }
    return persisted;
  }
  async rebuildPageIndex(pageNbeId) {
    const page = await this.getPageByNbeId(pageNbeId);
    this.logger.debug(`nbe-page-index light-scan rebuild ${pageNbeId}`);
    const scanner = new LightweightNbePageScanner(this.client, this.logger);
    const { pageIndex, duplicateBlockNbeIds } = await scanner.scan(pageNbeId, page.id);
    this.writeTimedWithTtl(this.nbeResolvedPageIndexCache, pageNbeId, pageIndex, NBE_RESOLUTION_CACHE_TTL_MS);
    await this.nbeResolutionCacheStore?.setPageIndex(this.keyPrefix, pageIndex);
    return { pageIndex, duplicateBlockNbeIds };
  }
  async resolveFromPageIndex(pageIndex, pageNbeId, blockNbeId, includeChildren) {
    const ref = buildNbeRef(pageNbeId, blockNbeId).ref;
    const blockId = pageIndex.blocks[blockNbeId];
    if (!blockId) {
      return null;
    }
    try {
      const tree = await this.getBlockTree(blockId, includeChildren);
      await this.cacheResolvedTarget({
        ref,
        pageNbeId,
        blockNbeId,
        pageId: pageIndex.pageId,
        blockId,
        resolvedAt: Date.now()
      });
      return {
        pageId: pageIndex.pageId,
        blockId,
        tree
      };
    } catch (error) {
      if (!shouldInvalidateResolvedTarget(error)) throw error;
      await this.nbeResolutionCacheStore?.deletePageIndex(this.keyPrefix, pageNbeId);
      this.nbeResolvedPageIndexCache.delete(pageNbeId);
      await this.invalidateResolvedTarget(ref);
      return null;
    }
  }
  async resolveFromResolvedTarget(target, includeChildren) {
    try {
      const tree = await this.getBlockTree(target.blockId, includeChildren);
      this.writeTimedWithTtl(this.nbeResolvedTargetCache, target.ref, target, NBE_RESOLUTION_CACHE_TTL_MS);
      return {
        pageId: target.pageId,
        blockId: target.blockId,
        tree
      };
    } catch (error) {
      if (!shouldInvalidateResolvedTarget(error)) throw error;
      await this.invalidateResolvedTarget(target.ref);
      return null;
    }
  }
  async cacheResolvedTarget(target) {
    this.writeTimedWithTtl(this.nbeResolvedTargetCache, target.ref, target, NBE_RESOLUTION_CACHE_TTL_MS);
    await this.nbeResolutionCacheStore?.setResolvedTarget(this.keyPrefix, target);
    this.logger.debug(`nbe-target refreshed from nbe ${target.ref}`);
  }
  async invalidateResolvedTarget(ref) {
    this.nbeResolvedTargetCache.delete(ref);
    await this.nbeResolutionCacheStore?.deleteResolvedTarget(this.keyPrefix, ref);
  }
  buildBlockTreeKey(blockId, includeChildren) {
    return `${this.keyPrefix}:block:${blockId}:${includeChildren ? "with-children" : "root-only"}`;
  }
  buildPageTreeKey(pageId, includeChildren) {
    return `${this.keyPrefix}:page:${pageId}:tree:${includeChildren ? "with-children" : "root-only"}`;
  }
  buildPageSectionKey(pageId, heading, includeChildren) {
    return `${this.keyPrefix}:page:${pageId}:section:${heading}:${includeChildren ? "with-children" : "root-only"}`;
  }
  async loadTree(blockId, includeChildren) {
    const root = await this.client.getBlock(blockId);
    if (!includeChildren || !root.has_children) {
      return { block: root, children: [] };
    }
    return {
      block: root,
      children: await this.hydrator.loadChildrenForBlock(root, 1)
    };
  }
  async loadTopLevel(pageId, includeNestedChildren) {
    const children = await this.client.listBlockChildren(pageId);
    if (!includeNestedChildren) {
      return children.map((block) => ({ block, children: [] }));
    }
    return mapWithConcurrency(children, REPOSITORY_TREE_CONCURRENCY, async (child) => {
      const grandChildren = child.has_children ? await this.hydrator.loadChildrenForBlock(child, 2) : [];
      return {
        block: child,
        children: grandChildren
      };
    });
  }
  readTimed(map, key) {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }
  writeTimed(map, key, value) {
    this.writeTimedWithTtl(map, key, value, CACHE_TTL_MS);
  }
  writeTimedWithTtl(map, key, value, ttlMs) {
    map.set(key, {
      expiresAt: Date.now() + ttlMs,
      value
    });
  }
};
function hasNbeProperty(database) {
  const property = database.properties?.[NBE_PROPERTY_NAME];
  if (!property) return false;
  return property.type === "rich_text";
}
function getTypeData2(block) {
  const data = block[block.type];
  return data && typeof data === "object" ? data : {};
}
var LightweightNbePageScanner = class {
  constructor(client, logger) {
    this.client = client;
    this.logger = logger;
  }
  async scan(pageNbeId, pageId) {
    const blocks = {};
    const duplicateRefs = /* @__PURE__ */ new Set();
    const topLevel = await this.client.listBlockChildren(pageId);
    await this.processBlocks(topLevel, 1, pageNbeId, blocks, duplicateRefs);
    return {
      pageIndex: {
        pageNbeId,
        pageId,
        blocks,
        resolvedAt: Date.now()
      },
      duplicateBlockNbeIds: duplicateRefs
    };
  }
  async processBlocks(blocksAtDepth, depth, pageNbeId, resolvedBlocks, duplicateRefs) {
    if (depth > MAX_TREE_DEPTH) return;
    await mapWithConcurrency(blocksAtDepth, REPOSITORY_TREE_CONCURRENCY, async (block) => {
      this.indexBlockRefs(block, pageNbeId, resolvedBlocks, duplicateRefs);
      if (depth >= MAX_TREE_DEPTH) return;
      const children = await this.loadDescendantBlocks(block, depth + 1);
      if (children.length === 0) return;
      await this.processBlocks(children, depth + 1, pageNbeId, resolvedBlocks, duplicateRefs);
    });
  }
  indexBlockRefs(block, pageNbeId, resolvedBlocks, duplicateRefs) {
    const refs = extractNbeRefsFromBlock(block);
    for (const parsed of refs) {
      if (parsed.pageNbeId !== pageNbeId) continue;
      if (resolvedBlocks[parsed.blockNbeId] && resolvedBlocks[parsed.blockNbeId] !== block.id) {
        duplicateRefs.add(parsed.blockNbeId);
        delete resolvedBlocks[parsed.blockNbeId];
        continue;
      }
      if (!duplicateRefs.has(parsed.blockNbeId)) {
        resolvedBlocks[parsed.blockNbeId] = block.id;
      }
    }
  }
  async loadDescendantBlocks(block, depth) {
    if (depth > MAX_TREE_DEPTH) return [];
    if (block.type === "unsupported") {
      const unsupported = block.unsupported;
      const blockType = unsupported && typeof unsupported === "object" && typeof unsupported.block_type === "string" ? unsupported.block_type : "unknown";
      this.logger.debug(`repository light-scan skipped unsupported block=${block.id} type=${blockType}`);
      return [];
    }
    if (block.type !== "synced_block") {
      if (!block.has_children) return [];
      return this.client.listBlockChildren(block.id);
    }
    const listedChildren = block.has_children ? await this.client.listBlockChildren(block.id) : [];
    if (listedChildren.length > 0) {
      return listedChildren;
    }
    const syncedData = this.getSyncedBlockData(block);
    const inlineChildren = this.getInlineSyncedChildren(syncedData);
    if (inlineChildren.length > 0) {
      return inlineChildren;
    }
    const sourceBlockId = this.getSyncedSourceBlockId(syncedData);
    if (!sourceBlockId || sourceBlockId === block.id) {
      return [];
    }
    try {
      return await this.client.listBlockChildren(sourceBlockId);
    } catch (error) {
      this.logger.debug(
        `repository light-scan synced_block fallback failed block=${block.id} source=${sourceBlockId} error=${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
  getSyncedBlockData(block) {
    const value = block.synced_block;
    return value && typeof value === "object" ? value : {};
  }
  getInlineSyncedChildren(data) {
    const value = data.children;
    if (!Array.isArray(value)) return [];
    return value.filter((item) => Boolean(item && typeof item === "object"));
  }
  getSyncedSourceBlockId(data) {
    const syncedFrom = data.synced_from;
    if (!syncedFrom || typeof syncedFrom !== "object") return null;
    return typeof syncedFrom.block_id === "string" ? syncedFrom.block_id : null;
  }
};
var NBE_URI_TEXT_PATTERN = /obsidian:\/\/notion-block-embed\?[^\s<>"']+/gi;
var SHORTLINK_NBE_TEXT_PATTERN = /https?:\/\/www\.shortlink\.studio\/1\/[^\s<>"']+/gi;
function extractNbeRefsFromBlock(block) {
  const richText = getTypeData2(block).rich_text;
  if (!Array.isArray(richText)) return [];
  const refs = /* @__PURE__ */ new Map();
  for (const item of richText) {
    if (!item || typeof item !== "object") continue;
    for (const ref of extractNbeRefsFromRichTextItem(item)) {
      refs.set(ref.ref, ref);
    }
  }
  return Array.from(refs.values());
}
function extractNbeRefsFromRichTextItem(item) {
  const refs = /* @__PURE__ */ new Map();
  const directCandidates = /* @__PURE__ */ new Set();
  if (typeof item.href === "string") {
    directCandidates.add(item.href);
  }
  if (typeof item.text?.link?.url === "string") {
    directCandidates.add(item.text.link.url);
  }
  for (const candidate of directCandidates) {
    const parsed = parseStrictNbeRefCandidate(candidate);
    if (parsed) {
      refs.set(parsed.ref, parsed);
    }
  }
  if (typeof item.plain_text === "string" && item.plain_text) {
    for (const candidate of extractNbeUriCandidatesFromPlainText(item.plain_text)) {
      const parsed = parseStrictNbeRefCandidate(candidate);
      if (parsed) {
        refs.set(parsed.ref, parsed);
      }
    }
  }
  return Array.from(refs.values());
}
function extractNbeUriCandidatesFromPlainText(text) {
  const matches = [
    ...text.match(NBE_URI_TEXT_PATTERN) ?? [],
    ...text.match(SHORTLINK_NBE_TEXT_PATTERN) ?? []
  ];
  return matches.map((match) => match.replace(/[)\]}>，。！？、；：,.!?;:]+$/u, "")).filter(Boolean);
}
function parseStrictNbeRefCandidate(rawUrl) {
  try {
    const parsed = parseNbeProtocolUrl(rawUrl, { requireOpenRefAction: true });
    return {
      ref: parsed.ref,
      pageNbeId: parsed.pageNbeId,
      blockNbeId: parsed.blockNbeId
    };
  } catch {
    return null;
  }
}
function shouldInvalidateResolvedTarget(error) {
  return error instanceof PluginError && error.status === 404;
}
function freezeDeep(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (!value || typeof value !== "object") return value;
  const target = value;
  if (seen.has(target)) return value;
  seen.add(target);
  if (Array.isArray(value)) {
    for (const item of value) {
      freezeDeep(item, seen);
    }
    return Object.freeze(value);
  }
  for (const nested of Object.values(value)) {
    freezeDeep(nested, seen);
  }
  return Object.freeze(value);
}

// src/writeback/conflict.ts
function hasWriteConflict(input) {
  if (input.policy !== "fail_on_conflict") return false;
  if (!input.localLastEditedTime || !input.remoteLastEditedTime) return false;
  return input.localLastEditedTime !== input.remoteLastEditedTime;
}

// src/writeback/patchers.ts
function buildPlainTextRichText(content) {
  if (!content.trim()) return [];
  return [
    {
      type: "text",
      plain_text: content,
      text: {
        content
      }
    }
  ];
}
function requireWritableType(node) {
  if (!node.capabilities.writable || !node.capabilities.writableType) {
    throw new PluginError("INVALID_INPUT", `Block type ${node.type} is read-only in limited writeback mode.`);
  }
  return node.capabilities.writableType;
}
function getTypeData3(node) {
  return node.meta.notionTypeData;
}
function getRawRichText2(node) {
  const value = getTypeData3(node).rich_text;
  return Array.isArray(value) ? value : [];
}
function createPayloadForRichText(node, richText, overrides) {
  const type = requireWritableType(node);
  const data = getTypeData3(node);
  const payload = {};
  if (type === "paragraph") {
    payload.paragraph = {
      rich_text: richText,
      color: data.color ?? "default"
    };
    return payload;
  }
  if (type === "heading_1" || type === "heading_2" || type === "heading_3") {
    const headingPayload = {
      rich_text: richText,
      color: data.color ?? "default"
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
      color: data.color ?? "default"
    };
    return payload;
  }
  if (type === "code") {
    payload.code = {
      rich_text: richText,
      language: data.language ?? "plain text",
      caption: Array.isArray(data.caption) ? data.caption : [],
      color: data.color ?? "default"
    };
    return payload;
  }
  if (type === "bulleted_list_item" || type === "numbered_list_item") {
    payload[type] = {
      rich_text: richText,
      color: data.color ?? "default"
    };
    return payload;
  }
  if (type === "to_do") {
    payload.to_do = {
      rich_text: richText,
      checked: overrides?.checked ?? Boolean(data.checked),
      color: data.color ?? "default"
    };
    return payload;
  }
  throw new PluginError("INVALID_INPUT", `Unsupported writable type: ${type}`);
}
function buildUpdatePayload(node, nextText) {
  return createPayloadForRichText(node, buildPlainTextRichText(nextText));
}
function buildTodoCheckedPayload(node, checked) {
  return createPayloadForRichText(node, getRawRichText2(node), { checked });
}
function buildInsertSiblingBelowChildren(node) {
  const data = getTypeData3(node);
  if (node.type === "bulleted_list_item") {
    return [
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [],
          color: data.color ?? "default"
        }
      }
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
          color: data.color ?? "default"
        }
      }
    ];
  }
  throw new PluginError("INVALID_INPUT", `Block type ${node.type} does not support sibling insertion.`);
}

// src/writeback/service.ts
var WritebackService = class {
  constructor(client, logger, conflictPolicy, invalidateScopes) {
    this.client = client;
    this.logger = logger;
    this.conflictPolicy = conflictPolicy;
    this.invalidateScopes = invalidateScopes;
  }
  invalidateWritebackScopes(node) {
    const scopes = [
      { kind: "block_tree", blockId: node.id },
      { kind: "page_tree", pageId: node.meta.sourcePageId },
      { kind: "page_section", pageId: node.meta.sourcePageId }
    ];
    if (node.meta.parentId && node.meta.parentType === "block_id") {
      scopes.push({ kind: "block_tree", blockId: node.meta.parentId });
    }
    this.invalidateScopes(scopes);
  }
  async updateBlockText(node, nextText) {
    if (!node.capabilities.writable) {
      throw new PluginError("INVALID_INPUT", `Block type ${node.type} is read-only in limited writeback mode.`);
    }
    if (this.conflictPolicy !== "none") {
      const latest = await this.client.getBlock(node.id);
      if (hasWriteConflict({
        policy: this.conflictPolicy,
        localLastEditedTime: node.meta.lastEditedTime,
        remoteLastEditedTime: latest.last_edited_time
      })) {
        throw new PluginError("WRITE_CONFLICT", "Remote content changed while editing.");
      }
    }
    const payload = buildUpdatePayload(node, nextText);
    const updated = await this.client.updateBlock(node.id, payload);
    this.logger.debug(`writeback success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return updated;
  }
  async insertSiblingBelow(node) {
    if (!node.capabilities.canInsertSiblingBelow) {
      throw new PluginError("INVALID_INPUT", `Block type ${node.type} does not support sibling insertion.`);
    }
    if (!node.meta.parentId) {
      throw new PluginError("INVALID_INPUT", "Unable to determine the parent list for this block.");
    }
    const children = buildInsertSiblingBelowChildren(node);
    const inserted = await this.client.appendBlockChildren(node.meta.parentId, children, node.id);
    this.logger.debug(`insert sibling below success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return inserted;
  }
  async deleteBlockNode(node) {
    if (!node.capabilities.canDeleteSelf) {
      throw new PluginError("INVALID_INPUT", "Only simple leaf list items can be deleted here.");
    }
    if (node.children.length > 0) {
      throw new PluginError("INVALID_INPUT", "Items with children must be deleted from Notion.");
    }
    const deleted = await this.client.deleteBlock(node.id);
    this.logger.debug(`delete block success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return deleted;
  }
  async updateTodoChecked(node, checked) {
    if (!node.capabilities.canToggleTodo || node.type !== "to_do") {
      throw new PluginError("INVALID_INPUT", "Only to-do items support checked-state updates.");
    }
    const payload = buildTodoCheckedPayload(node, checked);
    const updated = await this.client.updateBlock(node.id, payload);
    this.logger.debug(`toggle to_do success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return updated;
  }
};

// src/core/runtime.ts
var PluginRuntime = class {
  constructor(logger, cache, instanceStore, refreshScheduler) {
    this.logger = logger;
    this.cache = cache;
    this.instanceStore = instanceStore;
    this.refreshScheduler = refreshScheduler;
    this.settings = DEFAULT_SETTINGS;
    this.token = "";
    this.fingerprint = "no-token";
    this.client = null;
    this.repository = null;
    this.writebackService = null;
    this.persistedDataStore = null;
  }
  applySettings(next) {
    const nextToken = next.notionToken.trim();
    const tokenChanged = nextToken !== this.token;
    const conflictChanged = next.writebackConflictPolicy !== this.settings.writebackConflictPolicy;
    this.settings = next;
    if (tokenChanged) {
      this.token = nextToken;
      this.fingerprint = tokenFingerprint(nextToken);
      this.client = null;
      this.repository = null;
      this.writebackService = null;
      this.clearContentCache();
    } else if (conflictChanged) {
      this.writebackService = null;
    }
    this.configureRefreshScheduler();
  }
  getSettings() {
    return this.settings;
  }
  trackEmbed(container, registerChild, session) {
    return this.instanceStore.track(container, registerChild, session);
  }
  getRepository() {
    this.assertToken();
    if (!this.client) {
      this.client = new NotionClient(this.token, this.logger);
    }
    if (!this.repository) {
      this.repository = new NotionRepository(
        this.client,
        this.cache,
        this.logger,
        this.fingerprint,
        this.createNbeResolutionCacheStore()
      );
    }
    return this.repository;
  }
  attachPersistedDataStore(store) {
    this.persistedDataStore = store;
    this.repository = null;
  }
  getWritebackService() {
    this.assertToken();
    if (!this.client) {
      this.client = new NotionClient(this.token, this.logger);
    }
    if (!this.writebackService) {
      this.writebackService = new WritebackService(
        this.client,
        this.logger,
        this.settings.writebackConflictPolicy,
        (scopes) => this.invalidateScopes(scopes)
      );
    }
    return this.writebackService;
  }
  clearContentCache() {
    clearSharedEmbedLoadTasks();
    if (this.repository) {
      this.repository.clearContentCache();
      return;
    }
    this.cache.clearAll();
  }
  clearAllCache() {
    clearSharedEmbedLoadTasks();
    if (this.repository) {
      this.repository.clearCache();
      return;
    }
    this.cache.clearAll();
    void this.persistedDataStore?.clearNbeResolutionCache(this.fingerprint);
    void this.persistedDataStore?.clearNbeResolvedTargetCache(this.fingerprint);
  }
  invalidateScopes(scopes) {
    if (scopes.length === 0) return;
    if (!this.repository) return;
    this.repository.invalidateScopes(scopes);
  }
  async refreshAllEmbeds(options) {
    if (options?.forceGlobal) {
      this.clearContentCache();
    }
    await this.instanceStore.refreshAll({
      concurrency: options?.concurrency ?? REFRESH_ALL_CONCURRENCY
    });
  }
  dispose() {
    this.refreshScheduler.stop();
    this.instanceStore.clear();
    clearSharedEmbedLoadTasks();
    this.clearContentCache();
  }
  assertToken() {
    if (!this.token) {
      throw new PluginError("CONFIG_MISSING_TOKEN", "Notion Integration Token is required.");
    }
  }
  configureRefreshScheduler() {
    this.refreshScheduler.configure({
      policy: this.settings.refreshPolicy,
      intervalSec: this.settings.refreshIntervalSec,
      task: async () => {
        if (!this.instanceStore.hasActiveEmbeds()) {
          return;
        }
        await this.refreshAllEmbeds({
          forceGlobal: true,
          concurrency: REFRESH_ALL_CONCURRENCY
        });
      }
    });
  }
  createNbeResolutionCacheStore() {
    if (!this.persistedDataStore) return void 0;
    return {
      getPageIndex: (tokenFingerprint2, pageNbeId) => this.persistedDataStore?.getNbeResolutionPageIndex(tokenFingerprint2, pageNbeId) ?? null,
      setPageIndex: async (tokenFingerprint2, pageIndex) => {
        await this.persistedDataStore?.setNbeResolutionPageIndex(tokenFingerprint2, pageIndex);
      },
      deletePageIndex: async (tokenFingerprint2, pageNbeId) => {
        await this.persistedDataStore?.deleteNbeResolutionPageIndex(tokenFingerprint2, pageNbeId);
      },
      getResolvedTarget: (tokenFingerprint2, ref) => this.persistedDataStore?.getNbeResolvedTarget(tokenFingerprint2, ref) ?? null,
      setResolvedTarget: async (tokenFingerprint2, target) => {
        await this.persistedDataStore?.setNbeResolvedTarget(tokenFingerprint2, target);
      },
      deleteResolvedTarget: async (tokenFingerprint2, ref) => {
        await this.persistedDataStore?.deleteNbeResolvedTarget(tokenFingerprint2, ref);
      },
      clearNamespace: async (tokenFingerprint2) => {
        await this.persistedDataStore?.clearNbeResolutionCache(tokenFingerprint2);
        await this.persistedDataStore?.clearNbeResolvedTargetCache(tokenFingerprint2);
      }
    };
  }
};
function createRuntime(logger) {
  const cache = new AsyncTtlCache(CACHE_TTL_MS, TREE_CACHE_MAX_ENTRIES);
  const store = new EmbedInstanceStore(logger);
  const scheduler = new RefreshScheduler(logger);
  return new PluginRuntime(logger, cache, store, scheduler);
}

// src/core/settings-tab.ts
var import_obsidian3 = require("obsidian");
var SETTINGS_DEBOUNCE_MS = 250;
var NotionBlockEmbedSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin, deps) {
    super(app, plugin);
    this.deps = deps;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.deps.getSettings();
    new import_obsidian3.Setting(containerEl).setName("Notion Integration Token").setDesc("Required for reading and optional limited writeback via Notion API.").addText(
      (text) => text.setPlaceholder("secret_xxx").setValue(settings.notionToken).onChange(async (value) => {
        await this.updateSettings({ notionToken: value.trim() }, { debounceMs: SETTINGS_DEBOUNCE_MS });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Show child blocks").setDesc("Render the target block with its children.").addToggle(
      (toggle) => toggle.setValue(settings.showChildren).onChange(async (value) => {
        await this.updateSettings({ showChildren: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Toggle default expanded").setDesc("When enabled, toggle blocks start in expanded state.").addToggle(
      (toggle) => toggle.setValue(settings.toggleDefaultExpanded).onChange(async (value) => {
        await this.updateSettings({ toggleDefaultExpanded: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Max render height").setDesc("Maximum height of the rendered content area.").addSlider(
      (slider) => slider.setLimits(240, 1200, 20).setValue(settings.maxHeight).setDynamicTooltip().onChange(async (value) => {
        await this.updateSettings({ maxHeight: value }, { debounceMs: SETTINGS_DEBOUNCE_MS });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Enable limited writeback").setDesc("Allow editable text blocks to update Notion via API.").addToggle(
      (toggle) => toggle.setValue(settings.allowWriteback).onChange(async (value) => {
        await this.updateSettings({ allowWriteback: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Writeback conflict policy").setDesc("Behavior when remote content changed before saving.").addDropdown(
      (dropdown) => dropdown.addOption("none", "Ignore conflict").addOption("fail_on_conflict", "Fail on conflict").setValue(settings.writebackConflictPolicy).onChange(async (value) => {
        await this.updateSettings({
          writebackConflictPolicy: value
        });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Debug logs").setDesc("Print debug logs to developer console.").addToggle(
      (toggle) => toggle.setValue(settings.debugLogs).onChange(async (value) => {
        await this.updateSettings({ debugLogs: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Refresh policy").setDesc("Manual refresh only, or periodic background refresh.").addDropdown(
      (dropdown) => dropdown.addOption("manual", "Manual").addOption("interval", "Interval").setValue(settings.refreshPolicy).onChange(async (value) => {
        await this.updateSettings({ refreshPolicy: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Refresh interval (seconds)").setDesc("Used only when refresh policy is set to interval.").addSlider(
      (slider) => slider.setLimits(30, 3600, 30).setValue(settings.refreshIntervalSec).setDynamicTooltip().onChange(async (value) => {
        await this.updateSettings({ refreshIntervalSec: value }, { debounceMs: SETTINGS_DEBOUNCE_MS });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Open Notion in").setDesc("Choose how internal Notion web editing opens inside Obsidian.").addDropdown(
      (dropdown) => dropdown.addOption("side_panel", "Fixed side panel").addOption("floating_window", "Floating window").addOption("external_browser", "External default browser").setValue(settings.notionOpenMode).onChange(async (value) => {
        await this.updateSettings({ notionOpenMode: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Manual refresh").setDesc("Refresh all active notion-embed blocks in current views.").addButton(
      (button) => button.setButtonText("Refresh now").onClick(async () => {
        await this.deps.onManualRefresh();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Clear cache").setDesc("Clear in-memory embed cache.").addButton(
      (button) => button.setButtonText("Clear cache").onClick(() => {
        this.deps.onClearCache();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Clear remembered image sizes").setDesc("Reset all remembered image widths back to default.").addButton(
      (button) => button.setButtonText("Clear image sizes").onClick(async () => {
        await this.deps.onClearImageSizes();
      })
    );
  }
  async updateSettings(partial, options) {
    const merged = { ...this.deps.getSettings(), ...partial };
    await this.deps.saveSettings(merged, options);
  }
};

// src/embed/canvas-nbe-prewarm-queue.ts
var CanvasNbePrewarmQueue = class {
  constructor(logger) {
    this.logger = logger;
    this.seen = /* @__PURE__ */ new Set();
    this.queue = [];
    this.running = false;
  }
  enqueue(pageNbeId, run) {
    if (this.seen.has(pageNbeId)) {
      return;
    }
    this.seen.add(pageNbeId);
    this.queue.push({ pageNbeId, run });
    void this.pump();
  }
  clear() {
    this.queue.length = 0;
    this.seen.clear();
    this.running = false;
  }
  async pump() {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;
    this.running = true;
    try {
      await next.run();
    } catch (error) {
      this.logger.debug(
        `nbe-page-index prewarm failed ${next.pageNbeId} ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.running = false;
      void this.pump();
    }
  }
};

// src/embed/initial-render-queue.ts
var PRIORITY_ORDER = {
  selected: 0,
  visible: 1,
  offscreen: 2
};
var InitialRenderQueue = class {
  constructor(logger, delayMs, concurrency) {
    this.logger = logger;
    this.delayMs = delayMs;
    this.concurrency = concurrency;
    this.queue = [];
    this.timer = null;
    this.running = 0;
    this.nextId = 0;
    this.nextSequence = 0;
  }
  enqueue(run, shouldSkip, options) {
    const priority = options?.priority ?? "offscreen";
    const id = `render-${this.nextId++}`;
    this.queue.push({
      id,
      run,
      shouldSkip,
      readyAt: Date.now() + (options?.delayMs ?? this.delayForPriority(priority)),
      priority,
      sequence: this.nextSequence++
    });
    this.sortQueue();
    this.logger.debug(`enqueue reason=${priority}`);
    this.schedule();
    return id;
  }
  reprioritize(id, priority) {
    const entry = this.queue.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (PRIORITY_ORDER[priority] >= PRIORITY_ORDER[entry.priority]) return;
    entry.priority = priority;
    entry.readyAt = Math.min(entry.readyAt, Date.now() + this.delayForPriority(priority));
    this.sortQueue();
    this.schedule();
  }
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.running = 0;
  }
  delayForPriority(priority) {
    return priority === "offscreen" ? this.delayMs : 0;
  }
  schedule() {
    if (this.running >= this.concurrency) return;
    const next = this.queue[0];
    if (!next) return;
    const waitMs = Math.max(0, next.readyAt - Date.now());
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, waitMs);
  }
  async pump() {
    while (this.running < this.concurrency) {
      this.sortQueue();
      const next = this.queue[0];
      if (!next) return;
      if (next.shouldSkip()) {
        this.logger.debug("skip disposed");
        this.queue.shift();
        continue;
      }
      const waitMs = next.readyAt - Date.now();
      if (waitMs > 0) {
        this.schedule();
        return;
      }
      this.queue.shift();
      this.running += 1;
      this.logger.debug(`dequeue priority=${next.priority}`);
      void next.run().catch((error) => {
        this.logger.debug(`initial render failed: ${error instanceof Error ? error.message : String(error)}`);
      }).finally(() => {
        this.running = Math.max(0, this.running - 1);
        this.schedule();
      });
    }
  }
  sortQueue() {
    this.queue.sort((left, right) => {
      const byPriority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (byPriority !== 0) return byPriority;
      const byReadyAt = left.readyAt - right.readyAt;
      if (byReadyAt !== 0) return byReadyAt;
      return left.sequence - right.sequence;
    });
  }
};

// src/embed/render-session.ts
var import_obsidian7 = require("obsidian");

// src/render/math.ts
var import_obsidian4 = require("obsidian");
var mathLoadPromise = null;
function createMathFallback(expression, display) {
  const el = document.createElement(display ? "div" : "span");
  el.className = `nbe-math ${display ? "nbe-math-display" : "nbe-math-inline"} is-fallback`;
  el.textContent = expression;
  return el;
}
async function preloadMathRendering() {
  if (!mathLoadPromise) {
    mathLoadPromise = (0, import_obsidian4.loadMathJax)().catch((error) => {
      mathLoadPromise = null;
      throw error;
    });
  }
  await mathLoadPromise;
}
async function flushMathRendering() {
  try {
    await (0, import_obsidian4.finishRenderMath)();
  } catch {
  }
}
function createMathElement(expression, display) {
  const normalized = expression?.trim() ?? "";
  try {
    const rendered = (0, import_obsidian4.renderMath)(normalized, display);
    rendered.classList.add("nbe-math", display ? "nbe-math-display" : "nbe-math-inline");
    return rendered;
  } catch {
    return createMathFallback(normalized, display);
  }
}
function nodeTreeContainsMath(node) {
  if (typeof node.props.equationExpression === "string" && node.props.equationExpression.trim().length > 0) {
    return true;
  }
  if (node.richText.some((item) => typeof item.equationExpression === "string" && item.equationExpression.trim().length > 0)) {
    return true;
  }
  return node.children.some((child) => nodeTreeContainsMath(child));
}

// src/render/blocks/layout.ts
function buildColumnGridTemplate(columns) {
  if (columns.length === 0) return "minmax(0, 1fr)";
  const ratios = columns.map((column) => {
    const ratio = column.props.columnWidthRatio;
    return typeof ratio === "number" ? ratio : null;
  });
  const hasValidRatios = ratios.every((ratio) => ratio !== null && Number.isFinite(ratio) && ratio > 0);
  const validRatios = hasValidRatios ? ratios : null;
  const totalRatio = validRatios ? validRatios.reduce((sum, ratio) => sum + ratio, 0) : 0;
  if (validRatios && totalRatio > 0) {
    return validRatios.map((ratio) => `minmax(0, ${ratio}fr)`).join(" ");
  }
  return `repeat(${columns.length}, minmax(0, 1fr))`;
}
function buildColumnElement(node, ctx, renderNodes2, standalone = false) {
  const column = document.createElement("div");
  column.className = standalone ? "nbe-column nbe-column-standalone" : "nbe-column";
  if (typeof node.props.columnWidthRatio === "number" && Number.isFinite(node.props.columnWidthRatio)) {
    column.dataset.widthRatio = String(node.props.columnWidthRatio);
  }
  const content = document.createElement("div");
  content.className = "nbe-column-content";
  column.appendChild(content);
  if (ctx.showChildren && node.children.length > 0) {
    renderNodes2(content, node.children, ctx);
  }
  return column;
}
function renderLayoutBlockContent(host, node, ctx, renderNodes2) {
  if (node.type === "column") {
    host.appendChild(buildColumnElement(node, ctx, renderNodes2, true));
    return true;
  }
  if (node.type !== "column_list") return false;
  const wrapper = document.createElement("div");
  wrapper.className = "nbe-column-list";
  if (!ctx.showChildren || node.children.length === 0) {
    host.appendChild(wrapper);
    return true;
  }
  const columns = node.children.filter((child) => child.type === "column");
  const looseChildren = node.children.filter((child) => child.type !== "column");
  if (columns.length > 0) {
    const grid = document.createElement("div");
    grid.className = "nbe-column-list-grid";
    grid.style.setProperty("--nbe-column-grid-template", buildColumnGridTemplate(columns));
    for (const column of columns) {
      grid.appendChild(buildColumnElement(column, ctx, renderNodes2));
    }
    wrapper.appendChild(grid);
  }
  if (looseChildren.length > 0) {
    const loose = document.createElement("div");
    loose.className = "nbe-column-list-loose";
    renderNodes2(loose, looseChildren, ctx);
    wrapper.appendChild(loose);
  }
  host.appendChild(wrapper);
  return true;
}

// src/image/size-store.ts
var IMAGE_WIDTH_RATIO_MIN = 0.2;
var IMAGE_WIDTH_RATIO_MAX = 1;
var IMAGE_SIZE_RETENTION_MS = 60 * 24 * 60 * 60 * 1e3;
var TOUCH_PERSIST_GRANULARITY_MS = 12 * 60 * 60 * 1e3;
var PERSIST_DEBOUNCE_MS = 300;
function cloneMemory(memory) {
  return Object.fromEntries(Object.entries(memory).map(([blockId, entry]) => [blockId, { ...entry }]));
}
function clampImageWidthRatio(widthRatio) {
  if (!Number.isFinite(widthRatio)) return IMAGE_WIDTH_RATIO_MAX;
  return Math.min(IMAGE_WIDTH_RATIO_MAX, Math.max(IMAGE_WIDTH_RATIO_MIN, widthRatio));
}
var ImageSizeStore = class {
  constructor(deps) {
    this.deps = deps;
    this.persistTimer = null;
    this.persistChain = Promise.resolve();
    this.memory = cloneMemory(deps.initialMemory);
    this.now = deps.now ?? (() => Date.now());
  }
  getWidthRatio(blockId) {
    return this.memory[blockId]?.widthRatio;
  }
  rememberWidthRatio(blockId, widthRatio) {
    this.memory[blockId] = this.createEntry(blockId, clampImageWidthRatio(widthRatio), this.now());
    this.pruneExpiredInternal();
    this.schedulePersist();
  }
  resetWidthRatio(blockId) {
    if (!this.memory[blockId]) return;
    delete this.memory[blockId];
    this.schedulePersist();
  }
  touch(blockId) {
    const entry = this.memory[blockId];
    if (!entry) return;
    const now2 = this.now();
    if (now2 - entry.lastSeenAt < TOUCH_PERSIST_GRANULARITY_MS) return;
    entry.lastSeenAt = now2;
    this.schedulePersist();
  }
  clearAll() {
    this.memory = {};
    this.schedulePersist();
  }
  pruneExpired() {
    const changed = this.pruneExpiredInternal();
    if (changed) this.schedulePersist();
    return changed;
  }
  exportData() {
    return cloneMemory(this.memory);
  }
  flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      return this.enqueuePersist();
    }
    return this.persistChain;
  }
  dispose() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      void this.enqueuePersist();
    }
  }
  createEntry(blockId, widthRatio, lastSeenAt) {
    return {
      blockId,
      widthRatio,
      lastSeenAt
    };
  }
  pruneExpiredInternal() {
    const cutoff = this.now() - IMAGE_SIZE_RETENTION_MS;
    let changed = false;
    for (const [blockId, entry] of Object.entries(this.memory)) {
      if (entry.lastSeenAt >= cutoff) continue;
      delete this.memory[blockId];
      changed = true;
    }
    return changed;
  }
  schedulePersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.enqueuePersist();
    }, PERSIST_DEBOUNCE_MS);
  }
  enqueuePersist() {
    const snapshot = this.exportData();
    this.persistChain = this.persistChain.catch(() => void 0).then(() => this.deps.save(snapshot));
    return this.persistChain;
  }
};

// src/image/presentation.ts
function applyImageWidthRatio(target, widthRatio) {
  if (typeof widthRatio !== "number") {
    target.style.width = `${IMAGE_WIDTH_RATIO_MAX * 100}%`;
    return;
  }
  target.style.width = `${clampImageWidthRatio(widthRatio) * 100}%`;
}

// src/image/resize-controller.ts
function attachImageResizeController(options) {
  const { blockId, targetEl, handleEl, onCommit, onReset, onFlush } = options;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  let parentWidth = 0;
  let nextRatio = clampImageWidthRatio(options.initialWidthRatio ?? 1);
  let lastCommittedRatio = clampImageWidthRatio(options.initialWidthRatio ?? 1);
  let activePointerId = null;
  let disconnectObserver = null;
  let disconnectCheckFrame = null;
  const watchedRoots = () => [targetEl, handleEl, ...options.watchRoots ?? []].filter((value) => Boolean(value));
  const commitPending = () => {
    const ratio = clampImageWidthRatio(nextRatio);
    if (Math.abs(ratio - lastCommittedRatio) < 1e-4) return;
    lastCommittedRatio = ratio;
    onCommit(blockId, ratio);
  };
  const flushPersistedState = () => {
    if (!onFlush) return;
    void onFlush();
  };
  const teardownInteractionGuard = () => {
    if (disconnectObserver) {
      disconnectObserver.disconnect();
      disconnectObserver = null;
    }
    if (disconnectCheckFrame !== null) {
      cancelAnimationFrame(disconnectCheckFrame);
      disconnectCheckFrame = null;
    }
    window.removeEventListener("blur", onWindowBlur, true);
    document.removeEventListener("visibilitychange", onVisibilityChange, true);
  };
  const hasDisconnectedRoot = () => watchedRoots().some((root) => !root.isConnected);
  const scheduleDisconnectCheck = () => {
    if (!dragging || disconnectCheckFrame !== null) return;
    disconnectCheckFrame = requestAnimationFrame(() => {
      disconnectCheckFrame = null;
      if (!dragging) return;
      if (hasDisconnectedRoot()) {
        finalizeResize();
        return;
      }
      scheduleDisconnectCheck();
    });
  };
  const onWindowBlur = () => {
    finalizeResize();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      finalizeResize();
    }
  };
  const setupInteractionGuard = () => {
    teardownInteractionGuard();
    window.addEventListener("blur", onWindowBlur, true);
    document.addEventListener("visibilitychange", onVisibilityChange, true);
    if (typeof MutationObserver !== "undefined" && document.body) {
      disconnectObserver = new MutationObserver(() => {
        if (!dragging) return;
        if (hasDisconnectedRoot()) {
          finalizeResize();
          return;
        }
        scheduleDisconnectCheck();
      });
      disconnectObserver.observe(document.body, { childList: true, subtree: true });
    }
    scheduleDisconnectCheck();
  };
  const onPointerMove = (event) => {
    if (!dragging) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - startX;
    const ratio = clampImageWidthRatio((startWidth + deltaX) / Math.max(parentWidth, 1));
    nextRatio = ratio;
    applyImageWidthRatio(targetEl, ratio);
    commitPending();
  };
  const releasePointerCapture = () => {
    if (activePointerId === null) return;
    if (typeof handleEl.hasPointerCapture === "function" && !handleEl.hasPointerCapture(activePointerId)) return;
    if (typeof handleEl.releasePointerCapture === "function") {
      try {
        handleEl.releasePointerCapture(activePointerId);
      } catch {
      }
    }
  };
  const finalizeResize = (event) => {
    if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
    if (!dragging) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragging = false;
    document.body.classList.remove("nbe-image-is-resizing");
    commitPending();
    flushPersistedState();
    teardownInteractionGuard();
    releasePointerCapture();
    activePointerId = null;
  };
  const onPointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const parent = targetEl.parentElement;
    if (!parent) return;
    activePointerId = typeof event.pointerId === "number" ? event.pointerId : 1;
    dragging = true;
    startX = event.clientX;
    startWidth = targetEl.getBoundingClientRect().width;
    parentWidth = parent.getBoundingClientRect().width;
    nextRatio = clampImageWidthRatio(startWidth / Math.max(parentWidth, 1));
    lastCommittedRatio = nextRatio;
    document.body.classList.add("nbe-image-is-resizing");
    setupInteractionGuard();
    if (typeof handleEl.setPointerCapture === "function") {
      try {
        handleEl.setPointerCapture(activePointerId);
      } catch {
      }
    }
  };
  const onDoubleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragging = false;
    activePointerId = null;
    document.body.classList.remove("nbe-image-is-resizing");
    teardownInteractionGuard();
    applyImageWidthRatio(targetEl, 1);
    onReset(blockId);
    flushPersistedState();
  };
  handleEl.addEventListener("pointerdown", onPointerDown);
  handleEl.addEventListener("pointermove", onPointerMove);
  handleEl.addEventListener("pointerup", finalizeResize);
  handleEl.addEventListener("pointercancel", finalizeResize);
  handleEl.addEventListener("lostpointercapture", finalizeResize);
  targetEl.addEventListener("dblclick", onDoubleClick);
  return {
    flushPending: () => {
      commitPending();
      flushPersistedState();
    },
    dispose: () => {
      commitPending();
      flushPersistedState();
      dragging = false;
      document.body.classList.remove("nbe-image-is-resizing");
      teardownInteractionGuard();
      releasePointerCapture();
      activePointerId = null;
      handleEl.removeEventListener("pointerdown", onPointerDown);
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", finalizeResize);
      handleEl.removeEventListener("pointercancel", finalizeResize);
      handleEl.removeEventListener("lostpointercapture", finalizeResize);
      targetEl.removeEventListener("dblclick", onDoubleClick);
    }
  };
}

// src/render/rich-text.ts
function createRichTextFragment(items) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    if (item.sourceType === "equation") {
      fragment.appendChild(createMathElement(item.equationExpression ?? item.plainText, false));
      return;
    }
    const tag = item.href ? "a" : "span";
    const el = document.createElement(tag);
    el.textContent = item.plainText;
    if (item.href && tag === "a") {
      el.href = item.href;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }
    const ann = item.annotations;
    if (ann?.bold) el.classList.add("nbe-rich-bold");
    if (ann?.italic) el.classList.add("nbe-rich-italic");
    if (ann?.code) el.classList.add("nbe-rich-code");
    if (ann?.strikethrough) el.classList.add("nbe-rich-strike");
    if (ann?.underline) el.classList.add("nbe-rich-underline");
    fragment.appendChild(el);
  });
  return fragment;
}
function appendRichTextOrFallback(parent, items) {
  if (!items.length) {
    const span = document.createElement("span");
    span.className = "nbe-rich-code";
    span.textContent = "(empty)";
    parent.appendChild(span);
    return;
  }
  parent.appendChild(createRichTextFragment(items));
}
function plainTextFromRichText(items) {
  return items.map((item) => item.plainText ?? "").join("");
}

// src/render/blocks/media.ts
function renderMediaBlockContent(host, node, ctx) {
  if (node.type !== "image") return false;
  const figure = document.createElement("figure");
  figure.className = "nbe-image";
  const frame = document.createElement("div");
  frame.className = "nbe-image-frame";
  figure.appendChild(frame);
  if (node.props.imageUrl) {
    const image = document.createElement("img");
    image.className = "nbe-image-img";
    image.src = node.props.imageUrl;
    image.alt = node.richText.map((item) => item.plainText).join(" ").trim() || "Notion image";
    image.loading = "lazy";
    frame.appendChild(image);
    const rememberedRatio = ctx.imageSizing?.getWidthRatio(node.id);
    applyImageWidthRatio(frame, rememberedRatio);
    ctx.imageSizing?.touch(node.id);
    const handle = document.createElement("button");
    handle.className = "nbe-image-resize-handle";
    handle.type = "button";
    handle.setAttribute("aria-label", "Resize image");
    frame.appendChild(handle);
    const resizeSession = attachImageResizeController({
      blockId: node.id,
      targetEl: frame,
      handleEl: handle,
      initialWidthRatio: rememberedRatio,
      watchRoots: [figure, host],
      onCommit: (blockId, widthRatio) => {
        ctx.imageSizing?.rememberWidthRatio(blockId, widthRatio);
      },
      onReset: (blockId) => {
        ctx.imageSizing?.resetWidthRatio(blockId);
      },
      onFlush: () => ctx.imageSizing?.flush()
    });
    ctx.registerCleanup?.(() => {
      resizeSession.flushPending();
      resizeSession.dispose();
    });
  } else {
    const missing = document.createElement("div");
    missing.className = "nbe-unsupported";
    missing.textContent = node.props.imageUnavailableReason ?? "Image URL is missing.";
    frame.appendChild(missing);
  }
  if (node.richText.length > 0) {
    const caption = document.createElement("figcaption");
    caption.className = "nbe-image-caption";
    appendRichTextOrFallback(caption, node.richText);
    figure.appendChild(caption);
  }
  host.appendChild(figure);
  return true;
}

// src/render/blocks/shared.ts
function createActionIcon(pathData, viewBox = "0 0 16 16") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("nbe-row-action-icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathData);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}
function createTextEditIcon() {
  return createActionIcon("M3 11.5L11.8 2.7L13.3 4.2L4.5 13H3V11.5ZM10.7 3.8L12.2 5.3");
}
function createInsertIcon() {
  return createActionIcon("M8 3V13M3 8H13");
}
function createOpenInNotionIcon() {
  return createActionIcon("M6 4.5H3.75C3.336 4.5 3 4.836 3 5.25V12.25C3 12.664 3.336 13 3.75 13H10.75C11.164 13 11.5 12.664 11.5 12.25V10M8 3H13V8M12.5 3.5L7.5 8.5");
}
function createDeleteIcon() {
  return createActionIcon("M3.5 4.5H12.5M5 4.5V13H11V4.5M6.5 4.5V3H9.5V4.5M7 7V10.5M9 7V10.5");
}
function createRowActionButton(spec) {
  const button = document.createElement("button");
  button.className = `nbe-row-action-btn ${spec.className}`;
  button.type = "button";
  button.setAttribute("aria-label", spec.title);
  button.title = spec.title;
  button.appendChild(spec.icon);
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    spec.onTrigger(button);
  });
  return button;
}
function attachRowActions(host, node, ctx) {
  const actions = [];
  if (ctx.onEdit && node.capabilities.canEditText) {
    actions.push({
      className: "is-edit-text",
      title: "Edit text",
      icon: createTextEditIcon(),
      onTrigger: (button) => ctx.onEdit?.(button, node)
    });
  }
  if (ctx.onOpenInNotion && node.capabilities.canOpenInNotion) {
    actions.push({
      className: "is-open-in-notion",
      title: "Open in Notion",
      icon: createOpenInNotionIcon(),
      onTrigger: (button) => ctx.onOpenInNotion?.(button, node)
    });
  }
  if (ctx.onInsertSiblingBelow && node.capabilities.canInsertSiblingBelow) {
    actions.push({
      className: "is-insert-below",
      title: "Insert item below",
      icon: createInsertIcon(),
      onTrigger: (button) => ctx.onInsertSiblingBelow?.(button, node)
    });
  }
  if (ctx.onDeleteBlock && node.capabilities.canDeleteSelf) {
    actions.push({
      className: "is-delete-block",
      title: "Delete item",
      icon: createDeleteIcon(),
      onTrigger: (button) => ctx.onDeleteBlock?.(button, node)
    });
  }
  if (actions.length === 0) return;
  host.classList.add("nbe-row-actions-host");
  host.classList.add("nbe-row-interaction-surface");
  const overlay = document.createElement("div");
  overlay.className = "nbe-row-actions";
  for (const action of actions) {
    overlay.appendChild(createRowActionButton(action));
  }
  host.appendChild(overlay);
}
function renderUnsupported(parent, node) {
  const box = document.createElement("div");
  box.className = "nbe-unsupported";
  box.textContent = `Unsupported block type: ${node.type}`;
  parent.appendChild(box);
}

// src/render/blocks/text.ts
function renderSyncedBlockContent(host, node, ctx, renderNodes2) {
  if (node.type !== "synced_block") return false;
  const wrapper = document.createElement("div");
  wrapper.className = "nbe-synced-block";
  const label = document.createElement("div");
  label.className = "nbe-synced-block-label";
  label.textContent = "Synced block";
  wrapper.appendChild(label);
  if (ctx.showChildren && node.children.length > 0 && renderNodes2) {
    const body = document.createElement("div");
    body.className = "nbe-synced-block-body";
    renderNodes2(body, node.children, ctx);
    wrapper.appendChild(body);
  }
  host.appendChild(wrapper);
  return true;
}
function renderTextBlockContent(host, node, ctx, renderNodes2) {
  if (renderSyncedBlockContent(host, node, ctx, renderNodes2)) {
    return true;
  }
  if (node.type === "paragraph") {
    const row = document.createElement("p");
    row.className = "nbe-item-line";
    appendRichTextOrFallback(row, node.richText);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }
  if (node.type === "heading_1" || node.type === "heading_2" || node.type === "heading_3") {
    const tag = node.type === "heading_1" ? "h1" : node.type === "heading_2" ? "h2" : "h3";
    const row = document.createElement(tag);
    row.className = "nbe-item-line";
    appendRichTextOrFallback(row, node.richText);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }
  if (node.type === "quote") {
    const row = document.createElement("blockquote");
    row.className = "nbe-item-line nbe-quote";
    appendRichTextOrFallback(row, node.richText);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }
  if (node.type === "code") {
    const row = document.createElement("div");
    row.className = "nbe-item-line";
    const pre = document.createElement("pre");
    pre.className = "nbe-code";
    const code = document.createElement("code");
    code.textContent = node.richText.map((item) => item.plainText).join("");
    pre.appendChild(code);
    row.appendChild(pre);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }
  if (node.type === "equation") {
    const row = document.createElement("div");
    row.className = "nbe-equation-block";
    row.appendChild(createMathElement(node.props.equationExpression ?? "", true));
    host.appendChild(row);
    return true;
  }
  if (node.type === "to_do") {
    const row = document.createElement("div");
    row.className = "nbe-todo nbe-item-line nbe-item-line-inline-controls";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(node.props.checked);
    checkbox.disabled = !ctx.onToggleTodo || !node.capabilities.canToggleTodo;
    if (!checkbox.disabled) {
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;
        try {
          await ctx.onToggleTodo?.(node, checkbox.checked);
        } catch {
          checkbox.checked = !checkbox.checked;
        } finally {
          checkbox.disabled = false;
        }
      });
    }
    const textWrap = document.createElement("span");
    textWrap.className = "nbe-todo-text";
    appendRichTextOrFallback(textWrap, node.richText);
    row.appendChild(checkbox);
    row.appendChild(textWrap);
    attachRowActions(row, node, ctx);
    host.appendChild(row);
    return true;
  }
  return false;
}

// src/render/tree/leading.ts
function createGuideSegment(kind) {
  const segment = document.createElement("span");
  segment.className = `nbe-tree-guide nbe-tree-guide-${kind}`;
  segment.setAttribute("aria-hidden", "true");
  return segment;
}
function renderTreeLeading(state, iconEl) {
  const leading = document.createElement("div");
  leading.className = "nbe-tree-leading";
  leading.style.setProperty("--nbe-tree-depth", String(state.depth));
  for (let depth = 0; depth <= state.depth; depth += 1) {
    const slot = document.createElement("span");
    slot.className = "nbe-tree-slot";
    slot.style.setProperty("--nbe-tree-slot-depth", String(depth));
    if (depth < state.depth) {
      slot.classList.add("nbe-tree-slot-ancestor");
      if (state.ancestorRails[depth]) {
        slot.classList.add("is-active");
        slot.appendChild(createGuideSegment("full"));
      }
      leading.appendChild(slot);
      continue;
    }
    slot.classList.add("nbe-tree-slot-current");
    if (state.currentTopRail) {
      slot.classList.add("nbe-tree-has-prev-segment");
      slot.appendChild(createGuideSegment("top"));
    }
    if (state.currentBottomRail) {
      slot.classList.add("nbe-tree-has-next-segment");
      slot.appendChild(createGuideSegment("bottom"));
    }
    const iconHost = document.createElement("span");
    iconHost.className = "nbe-tree-icon-host";
    if (iconEl && state.hasIcon) {
      slot.classList.add("has-icon");
      iconHost.appendChild(iconEl);
    } else {
      slot.classList.add("is-empty");
    }
    slot.appendChild(iconHost);
    leading.appendChild(slot);
  }
  return leading;
}

// src/render/tree/shell.ts
function applyTreeStateClasses(wrapper, state) {
  wrapper.dataset.depth = String(state.depth);
  wrapper.dataset.iconKind = state.iconKind;
  wrapper.classList.toggle("nbe-tree-is-leaf-visible-node", state.isVisibleLeaf);
  wrapper.classList.toggle("nbe-tree-has-current-top-rail", state.currentTopRail);
  wrapper.classList.toggle("nbe-tree-has-current-bottom-rail", state.currentBottomRail);
}
function createTreeShell(options) {
  const wrapper = document.createElement("div");
  wrapper.className = `nbe-block nbe-tree-item ${options.wrapperClassName}`;
  applyTreeStateClasses(wrapper, options.state);
  const row = document.createElement("div");
  row.className = `nbe-tree-row ${options.rowClassName}`;
  row.appendChild(renderTreeLeading(options.state, options.iconEl));
  const main = document.createElement("div");
  main.className = `nbe-tree-main ${options.mainClassName}`;
  row.appendChild(main);
  wrapper.appendChild(row);
  return { wrapper, row, main };
}

// src/render/tree/state.ts
function createRootTreeContext() {
  return {
    depth: 0,
    ancestorRails: []
  };
}
function createChildTreeContext(state) {
  return {
    depth: state.depth + 1,
    ancestorRails: [...state.ancestorRails, true]
  };
}
function getTreeIconKind(node) {
  switch (node.type) {
    case "toggle":
      return "toggle";
    case "bulleted_list_item":
      return "bullet";
    case "numbered_list_item":
      return "number";
    default:
      return "none";
  }
}
function isTreeLike(node) {
  return getTreeIconKind(node) !== "none";
}
function buildTreeGuideState(options) {
  const { node, siblings, index, context, showChildren, iconKind } = options;
  const hasIcon = iconKind !== "none";
  const hasVisibleChildren = showChildren && node.children.length > 0;
  const isVisibleLeaf = !hasVisibleChildren;
  const hasPrevTreeSibling = hasIcon && index > 0 && isTreeLike(siblings[index - 1]);
  const hasNextTreeSibling = hasIcon && index < siblings.length - 1 && isTreeLike(siblings[index + 1]);
  const showCurrentRails = hasIcon && !isVisibleLeaf;
  return {
    depth: context.depth,
    ancestorRails: context.ancestorRails,
    currentTopRail: showCurrentRails && hasPrevTreeSibling,
    currentBottomRail: showCurrentRails && (hasNextTreeSibling || hasVisibleChildren),
    hasIcon,
    isVisibleLeaf,
    iconKind
  };
}

// src/render/blocks/tree.ts
function createToggleCaretIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("nbe-toggle-caret");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M6 3.5L11 8L6 12.5");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}
function renderTreeChildren(parent, node, ctx, state, renderNodes2) {
  if (state.isVisibleLeaf) return;
  const children = document.createElement("div");
  children.className = "nbe-tree-children";
  renderNodes2(children, node.children, ctx, createChildTreeContext(state));
  parent.appendChild(children);
}
function renderToggleBlock(parent, node, ctx, state, renderNodes2) {
  const trigger = document.createElement("button");
  trigger.className = "nbe-tree-icon-btn nbe-toggle-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Toggle");
  trigger.appendChild(createToggleCaretIcon());
  const { wrapper, row, main } = createTreeShell({
    state,
    wrapperClassName: "nbe-tree-item-toggle",
    rowClassName: "nbe-toggle-row",
    mainClassName: "nbe-toggle-main",
    iconEl: trigger
  });
  const title = document.createElement("span");
  title.className = "nbe-toggle-title";
  appendRichTextOrFallback(title, node.richText);
  main.appendChild(title);
  attachRowActions(row, node, ctx);
  if (state.isVisibleLeaf) {
    trigger.disabled = true;
    trigger.classList.add("is-disabled");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-disabled", "true");
    if (node.children.length === 0) {
      trigger.style.visibility = "hidden";
    }
    parent.appendChild(wrapper);
    return;
  }
  const children = document.createElement("div");
  children.className = "nbe-tree-children nbe-toggle-children";
  renderNodes2(children, node.children, ctx, createChildTreeContext(state));
  wrapper.appendChild(children);
  let expanded = ctx.toggleDefaultExpanded;
  const applyState = () => {
    wrapper.classList.toggle("is-expanded", expanded);
    trigger.setAttribute("aria-expanded", String(expanded));
    children.hidden = !expanded;
  };
  applyState();
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    expanded = !expanded;
    applyState();
  });
  parent.appendChild(wrapper);
}
function renderListBlock(parent, node, ctx, ordered, orderedIndex, state, renderNodes2) {
  const marker = document.createElement("span");
  marker.className = ordered ? "nbe-tree-icon nbe-list-number" : "nbe-tree-icon nbe-list-bullet";
  marker.textContent = ordered ? `${orderedIndex}.` : "";
  const { wrapper, row, main } = createTreeShell({
    state,
    wrapperClassName: ordered ? "nbe-tree-item-list nbe-tree-item-numbered" : "nbe-tree-item-list",
    rowClassName: "nbe-list-row",
    mainClassName: "nbe-list-main",
    iconEl: marker
  });
  const text = document.createElement("span");
  text.className = "nbe-list-text";
  appendRichTextOrFallback(text, node.richText);
  main.appendChild(text);
  attachRowActions(row, node, ctx);
  renderTreeChildren(wrapper, node, ctx, state, renderNodes2);
  parent.appendChild(wrapper);
}
function createPlainTreeShell(state) {
  return createTreeShell({
    state,
    wrapperClassName: "nbe-tree-item-plain",
    rowClassName: "nbe-tree-row-plain",
    mainClassName: "nbe-tree-main-plain"
  });
}

// src/render/block-renderers.ts
function layoutBlockOwnsChildRendering(type) {
  return type === "column" || type === "column_list" || type === "synced_block";
}
function renderBlockContent(host, node, ctx) {
  if (renderLayoutBlockContent(host, node, ctx, renderNodes)) return;
  if (renderTextBlockContent(host, node, ctx, renderNodes)) return;
  if (renderMediaBlockContent(host, node, ctx)) return;
  renderUnsupported(host, node);
}
function renderSingleBlock(parent, node, ctx, treeState) {
  let wrapper = document.createElement("div");
  wrapper.className = "nbe-block";
  let host = wrapper;
  if (treeState) {
    const shell = createPlainTreeShell(treeState);
    wrapper = shell.wrapper;
    host = shell.main;
  }
  renderBlockContent(host, node, ctx);
  parent.appendChild(wrapper);
  if (layoutBlockOwnsChildRendering(node.type)) return;
  if (!ctx.showChildren || node.children.length === 0) return;
  if (treeState) {
    const children = document.createElement("div");
    children.className = "nbe-tree-children";
    renderNodes(children, node.children, ctx, createChildTreeContext(treeState));
    wrapper.appendChild(children);
    return;
  }
  renderNodes(parent, node.children, ctx);
}
function renderNodes(parent, nodes, ctx, treeContext) {
  let numberedIndex = 0;
  const baseTreeContext = treeContext ?? createRootTreeContext();
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const iconKind = getTreeIconKind(node);
    const shouldRenderAsTree = Boolean(treeContext) || iconKind !== "none";
    const state = shouldRenderAsTree ? buildTreeGuideState({
      node,
      siblings: nodes,
      index: i,
      context: baseTreeContext,
      showChildren: ctx.showChildren,
      iconKind
    }) : void 0;
    if (node.type === "numbered_list_item") {
      numberedIndex = i > 0 && nodes[i - 1].type === "numbered_list_item" ? numberedIndex + 1 : 1;
      renderListBlock(parent, node, ctx, true, numberedIndex, state, renderNodes);
      continue;
    }
    numberedIndex = 0;
    if (node.type === "bulleted_list_item") {
      renderListBlock(parent, node, ctx, false, 0, state, renderNodes);
      continue;
    }
    if (node.type === "toggle") {
      renderToggleBlock(parent, node, ctx, state, renderNodes);
      continue;
    }
    renderSingleBlock(parent, node, ctx, state);
  }
}

// src/render/footer/url-bar-controller.ts
function createUrlBarController(options) {
  const element = document.createElement("div");
  element.className = "nbe-urlbar";
  element.classList.add("is-view");
  const inputEl = document.createElement("input");
  inputEl.className = "nbe-url-input";
  inputEl.type = "text";
  inputEl.value = options.currentUrl;
  inputEl.spellcheck = false;
  inputEl.autocomplete = "off";
  element.appendChild(inputEl);
  const canApply = Boolean(options.onApplyUrl);
  let isEditing = false;
  let isApplying = false;
  let lastCommittedUrl = options.currentUrl;
  const collapseSelection = () => {
    const cursor = inputEl.value.length;
    inputEl.setSelectionRange(cursor, cursor);
  };
  const setEditingState = (editing, selectAll = false) => {
    isEditing = editing && canApply;
    inputEl.readOnly = !isEditing;
    element.classList.toggle("is-editing", isEditing);
    element.classList.toggle("is-view", !isEditing);
    if (selectAll && isEditing) {
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.select();
        const end = inputEl.value.length;
        inputEl.setSelectionRange(0, end);
      });
    }
  };
  const commitIfDirty = async () => {
    if (!canApply) return true;
    if (isApplying) return false;
    const nextValue = inputEl.value;
    if (nextValue === lastCommittedUrl) {
      setEditingState(false);
      collapseSelection();
      return true;
    }
    isApplying = true;
    element.classList.add("is-applying");
    try {
      const applied = await options.onApplyUrl?.(nextValue);
      if (applied === false) {
        setEditingState(true, true);
        return false;
      }
      lastCommittedUrl = nextValue;
      setEditingState(false);
      collapseSelection();
      return true;
    } catch {
      setEditingState(true, true);
      return false;
    } finally {
      isApplying = false;
      element.classList.remove("is-applying");
    }
  };
  setEditingState(false);
  if (canApply) {
    const enterEditing = () => {
      if (isEditing || isApplying) return;
      setEditingState(true, true);
    };
    element.addEventListener("mousedown", (event) => {
      if (event.target === inputEl || inputEl.contains(event.target)) return;
      event.preventDefault();
      enterEditing();
    });
    inputEl.addEventListener("focus", () => {
      enterEditing();
    });
    inputEl.addEventListener("blur", () => {
      collapseSelection();
      if (!isEditing) return;
      void commitIfDirty();
    });
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        void commitIfDirty();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        inputEl.value = lastCommittedUrl;
        setEditingState(false);
        inputEl.blur();
      }
    });
  }
  return {
    element,
    inputEl,
    isEditing: () => isEditing,
    commitIfDirty
  };
}

// src/render/footer/embed-footer.ts
function createEmbedFooter(options) {
  const footer = document.createElement("div");
  footer.className = "nbe-footer";
  const urlBar = createUrlBarController({
    currentUrl: options.currentUrl,
    onApplyUrl: options.onApplyUrl
  });
  const actions = document.createElement("div");
  actions.className = "nbe-actions";
  const refresh = document.createElement("button");
  refresh.className = "nbe-button";
  refresh.type = "button";
  refresh.textContent = "Refresh";
  refresh.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  refresh.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      if (urlBar.isEditing()) {
        const committed = await urlBar.commitIfDirty();
        if (!committed) return;
      }
      await options.onRefresh();
    })();
  });
  actions.appendChild(refresh);
  footer.appendChild(urlBar.element);
  footer.appendChild(actions);
  return footer;
}

// src/render/renderer.ts
function renderEmbed(container, root, options) {
  container.innerHTML = "";
  const cleanups = [];
  const wrapper = document.createElement("div");
  wrapper.className = "nbe-embed";
  const content = document.createElement("div");
  content.className = "nbe-content";
  content.style.maxHeight = `${Math.max(240, options.maxHeight)}px`;
  const viewRoot = {
    ...root,
    children: options.showChildren ? root.children : []
  };
  const nodesToRender = viewRoot.type === "section_container" ? viewRoot.children : [viewRoot];
  if (options.emptyStateMessage && nodesToRender.length === 0) {
    renderEmptyStateMessage(content, options.emptyStateMessage);
  } else {
    renderNodes(content, nodesToRender, {
      showChildren: options.showChildren,
      toggleDefaultExpanded: options.toggleDefaultExpanded,
      onEdit: options.onEdit,
      onOpenInNotion: options.onOpenInNotion,
      onInsertSiblingBelow: options.onInsertSiblingBelow,
      onDeleteBlock: options.onDeleteBlock,
      onToggleTodo: options.onToggleTodo,
      imageSizing: options.imageSizing,
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup);
      }
    });
  }
  wrapper.appendChild(content);
  if (options.showFooter !== false) {
    const footer = createEmbedFooter({
      currentUrl: options.currentUrl,
      onApplyUrl: options.onApplyUrl,
      onRefresh: options.onRefresh
    });
    wrapper.appendChild(footer);
  }
  container.appendChild(wrapper);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) {
      cleanup();
    }
  };
}
function renderEmptyStateMessage(container, message) {
  const note = document.createElement("div");
  note.className = "nbe-empty-note";
  note.textContent = message;
  container.appendChild(note);
}
function plainTextFromNode(node) {
  return plainTextFromRichText(node.richText);
}

// src/render/ui.ts
function renderLoading(container) {
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "nbe-loading";
  box.textContent = "Loading Notion content...";
  container.appendChild(box);
}
function renderError(container, message, footer) {
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "nbe-embed";
  const content = document.createElement("div");
  content.className = "nbe-content";
  const box = document.createElement("div");
  box.className = "nbe-error";
  box.textContent = message;
  content.appendChild(box);
  wrapper.appendChild(content);
  if (footer) {
    wrapper.appendChild(createEmbedFooter(footer));
  }
  container.appendChild(wrapper);
}
function renderEmpty(container) {
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "nbe-empty";
  box.textContent = "No content found for this Notion block.";
  container.appendChild(box);
}

// src/embed/source-editor.ts
var import_obsidian5 = require("obsidian");

// src/nbe/source.ts
function extractNotionEmbedCodeBlocks(text) {
  const lines = text.split(/\r?\n/g);
  const blocks = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trimStart() ?? "";
    if (!line.startsWith("```notion-embed")) continue;
    let end = index + 1;
    while (end < lines.length && lines[end].trim() !== "```") {
      end += 1;
    }
    if (end >= lines.length) {
      break;
    }
    blocks.push({
      source: lines.slice(index + 1, end).join("\n"),
      lineStart: index,
      lineEnd: end
    });
    index = end;
  }
  return blocks;
}
function extractNbeRefsFromDocument(text) {
  const refs = [];
  for (const block of extractNotionEmbedCodeBlocks(text)) {
    try {
      const target = parseNotionTargetFromSource(block.source);
      if (target.mode !== "nbe_uri") continue;
      refs.push({
        ref: target.ref,
        pageNbeId: target.pageNbeId,
        blockNbeId: target.blockNbeId,
        lineStart: block.lineStart,
        lineEnd: block.lineEnd
      });
    } catch {
    }
  }
  return refs;
}

// src/embed/source-editor.ts
function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
function lineStartOffset(text, line) {
  if (line <= 0) return 0;
  let currentLine = 0;
  for (let i = 0; i < text.length; i++) {
    if (currentLine === line) return i;
    if (text[i] === "\n") currentLine += 1;
  }
  return text.length;
}
function lineEndOffset(text, line) {
  return lineStartOffset(text, line + 1);
}
function replaceBlockInSection(sectionText, nextSource) {
  const newline = detectNewline(sectionText);
  const normalizedSource = nextSource.trim();
  const block = `\`\`\`notion-embed${newline}${normalizedSource}${newline}\`\`\``;
  const pattern = /```notion-embed[^\n\r]*[\s\S]*?```/;
  if (pattern.test(sectionText)) {
    return sectionText.replace(pattern, block);
  }
  return block;
}
function replaceSectionText(content, section, replacement) {
  const sectionStart = lineStartOffset(content, section.lineStart);
  const sectionEnd = lineEndOffset(content, section.lineEnd);
  const sectionText = content.slice(sectionStart, sectionEnd);
  const pattern = /```notion-embed[^\n\r]*[\s\S]*?```/;
  if (!pattern.test(sectionText)) {
    throw new PluginError("UNKNOWN", "Unable to locate the notion-embed code block in the current note section.");
  }
  const updatedSection = sectionText.replace(pattern, replacement);
  return `${content.slice(0, sectionStart)}${updatedSection}${content.slice(sectionEnd)}`;
}
function classifyNotionEmbedSource(source) {
  const lines = source.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return "empty";
  }
  return lines.length === 1 ? "single_line" : "multi_line";
}
function getEditableFooterSourceValue(source) {
  const shape = classifyNotionEmbedSource(source);
  if (shape !== "single_line") return null;
  const trimmed = source.trim();
  return trimmed || null;
}
function canApplyNotionEmbedSourceUpdate(ctx, hostEl) {
  const section = ctx.getSectionInfo(hostEl);
  if (section) return true;
  const sourcePath = ctx.sourcePath?.trim();
  return typeof sourcePath === "string" && sourcePath.endsWith(".canvas");
}
function rewritePageHeadingSource(source, nextUrl) {
  const lines = source.split(/\r?\n/g);
  let replaced = false;
  const rewritten = lines.map((line) => {
    if (/^\s*url\s*:/i.test(line)) {
      replaced = true;
      return `url: ${nextUrl}`;
    }
    return line;
  });
  if (!replaced) {
    throw new PluginError("INVALID_INPUT", 'Missing "url:" line in page-heading source.');
  }
  return rewritten.join(detectNewline(source));
}
function rewriteNotionEmbedSourceUrl(source, nextUrl) {
  const trimmedUrl = nextUrl.trim();
  if (!trimmedUrl) {
    throw new PluginError("INVALID_INPUT", "Embed URL is required.");
  }
  const sourceShape = classifyNotionEmbedSource(source);
  if (sourceShape === "empty") {
    throw new PluginError("INVALID_INPUT", "Empty notion-embed must be edited in source.");
  }
  if (sourceShape === "single_line") {
    return trimmedUrl;
  }
  const currentTarget = parseNotionTargetFromSource(source);
  if (currentTarget.mode === "page_heading") {
    return rewritePageHeadingSource(source, trimmedUrl);
  }
  throw new PluginError("INVALID_INPUT", "This embed source must be edited in source.");
}
async function applyNotionEmbedSourceUpdate(app, ctx, hostEl, nextSource, currentSource) {
  const target = await resolveSourceUpdateTarget(app, ctx, hostEl, currentSource ?? null);
  if (!target) {
    throw new PluginError("INVALID_INPUT", "Unable to locate embed source section.");
  }
  if (target.kind === "markdown-section") {
    const replacement = replaceBlockInSection(target.section.text, nextSource);
    if (target.view) {
      const content2 = target.view.getViewData();
      const updated2 = replaceSectionText(content2, target.section, replacement);
      if (updated2 === content2) {
        throw new PluginError("UNKNOWN", "No source change was applied.");
      }
      target.view.setViewData(updated2, false);
      target.view.requestSave();
      return;
    }
    if (target.file) {
      const content2 = await app.vault.read(target.file);
      const updated2 = replaceSectionText(content2, target.section, replacement);
      if (updated2 === content2) {
        throw new PluginError("UNKNOWN", "No source change was applied.");
      }
      await app.vault.modify(target.file, updated2);
      return;
    }
    throw new PluginError("INVALID_INPUT", "Unable to update this embed source from the current note context.");
  }
  const content = await app.vault.read(target.file);
  const updated = replaceNotionEmbedBlockInCanvasTextNode(content, target, nextSource);
  if (updated === content) {
    throw new PluginError("UNKNOWN", "No source change was applied.");
  }
  await app.vault.modify(target.file, updated);
}
async function resolveSourceUpdateTarget(app, ctx, hostEl, currentSource) {
  const section = ctx.getSectionInfo(hostEl);
  if (!section) {
    const sourcePath2 = ctx.sourcePath?.trim();
    if (sourcePath2?.endsWith(".canvas")) {
      return resolveCanvasTextNodeTarget(app, sourcePath2, currentSource);
    }
    return null;
  }
  const sourcePath = ctx.sourcePath?.trim();
  if (sourcePath) {
    const matchedView = findPreferredMarkdownView(app, sourcePath);
    if (matchedView?.file) {
      return {
        kind: "markdown-section",
        section,
        view: matchedView,
        file: matchedView.file
      };
    }
    const file = app.vault.getFileByPath(sourcePath);
    if (file) {
      return {
        kind: "markdown-section",
        section,
        file
      };
    }
    return {
      kind: "markdown-section",
      section
    };
  }
  const activeView = app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
  if (activeView?.file) {
    return {
      kind: "markdown-section",
      section,
      view: activeView,
      file: activeView.file
    };
  }
  const activeFile = app.workspace.getActiveFile();
  if (activeFile) {
    const matchedView = findPreferredMarkdownView(app, activeFile.path);
    if (matchedView?.file) {
      return {
        kind: "markdown-section",
        section,
        view: matchedView,
        file: matchedView.file
      };
    }
    const file = app.vault.getFileByPath(activeFile.path);
    if (file) {
      return {
        kind: "markdown-section",
        section,
        file
      };
    }
  }
  return {
    kind: "markdown-section",
    section
  };
}
function findPreferredMarkdownView(app, filePath) {
  const activeView = app.workspace.getActiveViewOfType(import_obsidian5.MarkdownView);
  if (activeView?.file?.path === filePath) {
    return activeView;
  }
  let matchedView = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (matchedView) return;
    if (leaf.view instanceof import_obsidian5.MarkdownView && leaf.view.file?.path === filePath) {
      matchedView = leaf.view;
    }
  });
  return matchedView;
}
async function resolveCanvasTextNodeTarget(app, sourcePath, currentSource) {
  const file = app.vault.getFileByPath(sourcePath);
  if (!file) {
    throw new PluginError("INVALID_INPUT", "Unable to update this embed source from the current note context.");
  }
  const raw = await app.vault.read(file);
  const parsed = parseCanvasDocument(raw);
  const selectedNodeId = resolveSelectedCanvasTextNodeId(app, sourcePath);
  if (selectedNodeId) {
    const selectedNode = findCanvasTextNodeById(parsed, selectedNodeId);
    const selectedMatch = selectedNode ? resolveEditableCanvasBlock(selectedNode.text, currentSource) : null;
    if (selectedMatch?.kind === "match") {
      return {
        kind: "canvas-text-node",
        file,
        nodeId: selectedNodeId,
        expectedSource: selectedMatch.block.source
      };
    }
  }
  const matches = [];
  for (const node of getCanvasTextNodes(parsed)) {
    const match = resolveEditableCanvasBlock(node.text, currentSource, !currentSource);
    if (match?.kind === "match") {
      matches.push({
        nodeId: node.id,
        source: match.block.source
      });
    }
  }
  if (matches.length === 1) {
    return {
      kind: "canvas-text-node",
      file,
      nodeId: matches[0].nodeId,
      expectedSource: matches[0].source
    };
  }
  throw new PluginError("INVALID_INPUT", "Unable to determine the Canvas text node for this embed source.");
}
function replaceNotionEmbedBlockInCanvasTextNode(rawCanvas, target, nextSource) {
  const parsed = parseCanvasDocument(rawCanvas);
  const textNode = findCanvasTextNodeById(parsed, target.nodeId);
  if (!textNode) {
    throw new PluginError("INVALID_INPUT", "Unable to determine the Canvas text node for this embed source.");
  }
  const updatedText = replaceEmbedBlockInTextNode(textNode.text, nextSource, target.expectedSource);
  if (updatedText === textNode.text) {
    return rawCanvas;
  }
  textNode.text = updatedText;
  return `${JSON.stringify(parsed, null, 2)}
`;
}
function replaceEmbedBlockInTextNode(text, nextSource, expectedSource) {
  const match = resolveEditableCanvasBlock(text, expectedSource);
  if (!match || match.kind !== "match") {
    throw new PluginError("INVALID_INPUT", "Unable to determine the Canvas text node for this embed source.");
  }
  const start = lineStartOffset(text, match.block.lineStart);
  const end = lineEndOffset(text, match.block.lineEnd);
  const blockText = text.slice(start, end);
  const replacement = replaceBlockInSection(blockText, nextSource);
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}
function resolveEditableCanvasBlock(text, currentSource, allowUniqueFallback = true) {
  const blocks = extractNotionEmbedCodeBlocks(text);
  if (blocks.length === 0) {
    return null;
  }
  if (currentSource) {
    const exactMatches = blocks.filter((block) => block.source === currentSource);
    if (exactMatches.length === 1) {
      return { kind: "match", block: exactMatches[0] };
    }
    if (exactMatches.length > 1) {
      return { kind: "ambiguous" };
    }
    if (!allowUniqueFallback) {
      return null;
    }
  }
  if (blocks.length === 1) {
    return { kind: "match", block: blocks[0] };
  }
  return { kind: "ambiguous" };
}
function parseCanvasDocument(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new PluginError("INVALID_INPUT", "Unable to read the current Canvas file.");
  }
}
function getCanvasTextNodes(data) {
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  return nodes.filter((node) => node.type === "text" && typeof node.text === "string");
}
function findCanvasTextNodeById(data, nodeId) {
  return getCanvasTextNodes(data).find((node) => node.id === nodeId) ?? null;
}
function resolveSelectedCanvasTextNodeId(app, sourcePath) {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile || activeFile.path !== sourcePath || activeFile.extension !== "canvas") {
    return null;
  }
  const activeLeaf = app.workspace.activeLeaf;
  const activeView = activeLeaf?.view;
  if (activeView?.getViewType?.() !== "canvas") {
    return null;
  }
  const selection = activeView.canvas?.selection;
  const selectedItems = Array.isArray(selection) ? selection : selection ? Array.from(selection) : [];
  const selectedNode = selectedItems[0];
  return selectedNode?.id ?? selectedNode?.node?.id ?? selectedNode?.data?.id ?? null;
}

// src/embed/render-version.ts
var RenderVersionTracker = class {
  constructor() {
    this.value = 0;
  }
  next() {
    this.value += 1;
    return this.value;
  }
  isCurrent(version) {
    return version === this.value;
  }
};

// src/embed/action-bridge.ts
var import_obsidian6 = require("obsidian");

// src/notion-web/url.ts
function toCompactId(id) {
  return normalizeNotionId(id).replace(/-/g, "");
}
function buildNotionBlockUrl(originalUrl, blockId) {
  const url = new URL(originalUrl);
  url.hash = toCompactId(blockId);
  return url.toString();
}
function resolveNotionOpenUrl(originalUrl, node) {
  if (!node?.capabilities.canOpenInNotion) {
    return originalUrl;
  }
  return buildNotionBlockUrl(originalUrl, node.id);
}

// src/embed/empty-state.ts
var EMPTY_NOTION_EMBED_MESSAGE = "Empty Notion embed. Add a Notion Block URL in source.";

// src/embed/action-bridge.ts
function ensureWritebackEnabled(settings, loaded) {
  if (!loaded.writebackAllowed) {
    return "This embed is read-only in the current mode.";
  }
  if (!settings.allowWriteback) {
    return "Writeback is disabled in settings.";
  }
  return true;
}
function createEditHandler(args) {
  return async (anchorEl, node) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      new import_obsidian6.Notice(allowed);
      return;
    }
    if (!node.capabilities.canEditText) {
      new import_obsidian6.Notice("This block is not safe for plain-text editing here. Edit it in Notion instead.");
      return;
    }
    args.editor.open({
      anchorEl,
      block: node,
      initialText: plainTextFromNode(node),
      onSave: async (nextText) => {
        const writeback = args.getWritebackService();
        await writeback.updateBlockText(node, nextText);
        await args.rerender({
          invalidateScopes: args.loaded.cacheScopes
        });
      }
    });
  };
}
function createInsertBelowHandler(args) {
  return async (_anchorEl, node) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      new import_obsidian6.Notice(allowed);
      return;
    }
    if (!node.capabilities.canInsertSiblingBelow) {
      new import_obsidian6.Notice("This block does not support safe sibling insertion here.");
      return;
    }
    try {
      await args.getWritebackService().insertSiblingBelow(node);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes
      });
      new import_obsidian6.Notice("List item inserted.");
    } catch (error) {
      new import_obsidian6.Notice(userMessageFromError(error));
    }
  };
}
function createDeleteHandler(args) {
  return async (_anchorEl, node) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      new import_obsidian6.Notice(allowed);
      return;
    }
    if (!node.capabilities.canDeleteSelf) {
      new import_obsidian6.Notice("Only simple leaf list items can be deleted here.");
      return;
    }
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const confirmed = window.confirm("Delete this list item from Notion?");
      if (!confirmed) return;
    }
    try {
      await args.getWritebackService().deleteBlockNode(node);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes
      });
      new import_obsidian6.Notice("List item deleted.");
    } catch (error) {
      new import_obsidian6.Notice(userMessageFromError(error));
    }
  };
}
function createTodoToggleHandler(args) {
  return async (node, checked) => {
    const settings = args.getSettings();
    const allowed = ensureWritebackEnabled(settings, args.loaded);
    if (allowed !== true) {
      throw new Error(allowed);
    }
    try {
      await args.getWritebackService().updateTodoChecked(node, checked);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes
      });
    } catch (error) {
      new import_obsidian6.Notice(userMessageFromError(error));
      throw error;
    }
  };
}
function createApplyUrlHandler(args) {
  const sourceEditable = canApplyNotionEmbedSourceUpdate(args.ctx, args.hostEl);
  if (!sourceEditable) return void 0;
  return async (nextUrl) => {
    try {
      const nextSource = rewriteNotionEmbedSourceUrl(args.currentSource, nextUrl);
      await applyNotionEmbedSourceUpdate(args.app, args.ctx, args.hostEl, nextSource, args.currentSource);
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes,
        nextSource
      });
      new import_obsidian6.Notice("Notion embed source updated.");
      return true;
    } catch (error) {
      new import_obsidian6.Notice(userMessageFromError(error));
      return false;
    }
  };
}
function createOpenInNotionHandler(args) {
  if (args.loaded.parsedTarget.mode === "nbe_uri") return void 0;
  return async (anchorEl, node) => {
    if (!node.capabilities.canOpenInNotion) return;
    try {
      const url = resolveNotionOpenUrl(args.loaded.parsedTarget.originalUrl, node);
      await args.notionWebHost.openUrl(url, args.getSettings().notionOpenMode, anchorEl);
    } catch (error) {
      new import_obsidian6.Notice(userMessageFromError(error));
    }
  };
}
function createRenderOptions(args) {
  const settings = args.getSettings();
  return {
    maxHeight: settings.maxHeight,
    showChildren: settings.showChildren,
    toggleDefaultExpanded: settings.toggleDefaultExpanded,
    currentUrl: args.loaded.parsedTarget.originalUrl,
    showFooter: args.loaded.parsedTarget.mode !== "empty_block_url",
    emptyStateMessage: args.loaded.parsedTarget.mode === "empty_block_url" ? EMPTY_NOTION_EMBED_MESSAGE : void 0,
    onRefresh: async () => {
      await args.rerender({
        invalidateScopes: args.loaded.cacheScopes
      });
    },
    onApplyUrl: args.loaded.parsedTarget.mode === "block_url" || args.loaded.parsedTarget.mode === "page_heading" || args.loaded.parsedTarget.mode === "nbe_uri" ? createApplyUrlHandler(args) : void 0,
    onEdit: createEditHandler(args),
    onOpenInNotion: createOpenInNotionHandler(args),
    onInsertSiblingBelow: createInsertBelowHandler(args),
    onDeleteBlock: createDeleteHandler(args),
    onToggleTodo: createTodoToggleHandler(args),
    imageSizing: args.imageSizing
  };
}

// src/embed/render-session.ts
function createRenderSession(args) {
  let currentSource = args.source;
  let disposeCurrentRender = null;
  let lastSuccessfulCacheScopes = [];
  const renderVersion = new RenderVersionTracker();
  const cleanupCurrentRender = () => {
    if (!disposeCurrentRender) return;
    const dispose = disposeCurrentRender;
    disposeCurrentRender = null;
    dispose();
  };
  const rerender = async (input) => {
    const version = renderVersion.next();
    const settings = args.runtime.getSettings();
    const renderStartedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    const repository = args.runtime.getRepository();
    try {
      if (input?.invalidateScopes && input.invalidateScopes.length > 0) {
        args.runtime.invalidateScopes(input.invalidateScopes);
      }
      if (typeof input?.nextSource === "string") {
        currentSource = input.nextSource;
      }
      const warmPath = isEmbedSourceLikelyWarm(currentSource, settings, repository);
      if (!warmPath) {
        cleanupCurrentRender();
        renderLoading(args.mount);
      }
      const loadedResult = await loadEmbedFromSourceDetailed(currentSource, settings, repository, args.logger);
      if (!renderVersion.isCurrent(version)) {
        args.logger.debug("dropped stale embed render result");
        return;
      }
      const loaded = loadedResult.loaded;
      lastSuccessfulCacheScopes = loaded.cacheScopes;
      if (!loaded.root) {
        cleanupCurrentRender();
        renderEmpty(args.mount);
        return;
      }
      const hasMath = nodeTreeContainsMath(loaded.root);
      if (hasMath) {
        try {
          await preloadMathRendering();
        } catch (error) {
          args.logger.debug(`math preload failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!renderVersion.isCurrent(version)) {
          args.logger.debug("dropped stale embed render result after math preload");
          return;
        }
      }
      cleanupCurrentRender();
      const renderPhaseStartedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
      disposeCurrentRender = renderEmbed(
        args.mount,
        loaded.root,
        createRenderOptions({
          app: args.app,
          mount: args.mount,
          hostEl: args.hostEl,
          ctx: args.ctx,
          currentSource,
          loaded,
          getSettings: () => args.runtime.getSettings(),
          getWritebackService: () => args.runtime.getWritebackService(),
          imageSizing: args.imageSizing,
          editor: args.editor,
          notionWebHost: args.notionWebHost,
          rerender
        })
      );
      if (hasMath) {
        await flushMathRendering();
        if (!renderVersion.isCurrent(version)) {
          args.logger.debug("dropped stale embed render result after math flush");
          return;
        }
      }
      if (settings.debugLogs) {
        const renderFinishedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
        const renderMs = renderFinishedAt - renderPhaseStartedAt;
        const totalMs = renderFinishedAt - renderStartedAt;
        args.logger.debug(
          `perf parse=${loadedResult.metrics.parseMs.toFixed(1)}ms repository=${loadedResult.metrics.repositoryMs.toFixed(1)}ms adapter=${loadedResult.metrics.adapterMs.toFixed(1)}ms render=${renderMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`
        );
      }
    } catch (error) {
      if (!renderVersion.isCurrent(version)) {
        args.logger.debug("dropped stale embed render error");
        return;
      }
      args.logger.debug(`render error: ${error instanceof Error ? error.message : String(error)}`);
      cleanupCurrentRender();
      const editableSource = getEditableFooterSourceValue(currentSource);
      const sourceEditable = editableSource && canApplyNotionEmbedSourceUpdate(args.ctx, args.hostEl);
      renderError(
        args.mount,
        userMessageFromError(error),
        sourceEditable ? {
          currentUrl: editableSource,
          onApplyUrl: async (nextUrl) => {
            try {
              const nextSource = rewriteNotionEmbedSourceUrl(currentSource, nextUrl);
              await applyNotionEmbedSourceUpdate(args.app, args.ctx, args.hostEl, nextSource, currentSource);
              await rerender({
                invalidateScopes: lastSuccessfulCacheScopes,
                nextSource
              });
              new import_obsidian7.Notice("Notion embed source updated.");
              return true;
            } catch (applyError) {
              args.logger.debug(
                `error footer apply failed: ${applyError instanceof Error ? applyError.message : String(applyError)}`
              );
              new import_obsidian7.Notice(userMessageFromError(applyError));
              return false;
            }
          },
          onRefresh: async () => {
            await rerender({
              invalidateScopes: lastSuccessfulCacheScopes
            });
          }
        } : void 0
      );
    }
  };
  return {
    rerender,
    dispose: cleanupCurrentRender
  };
}

// src/embed/processor.ts
var NotionEmbedProcessor = class {
  constructor(deps) {
    this.deps = deps;
    this.selectedCanvasNodeTextCache = /* @__PURE__ */ new Map();
    this.usedInitialFastPath = false;
    this.initialRenderQueue = new InitialRenderQueue(
      deps.logger,
      INITIAL_RENDER_DELAY_MS,
      INITIAL_RENDER_CONCURRENCY
    );
    this.canvasPrewarmQueue = new CanvasNbePrewarmQueue(deps.logger);
  }
  dispose() {
    this.initialRenderQueue.clear();
    this.canvasPrewarmQueue.clear();
    this.selectedCanvasNodeTextCache.clear();
    this.usedInitialFastPath = false;
  }
  async process(source, el, ctx) {
    this.prewarmCanvasNbePageIndex(source, ctx);
    const mount = document.createElement("div");
    el.innerHTML = "";
    el.appendChild(mount);
    let disposed = false;
    let cleanupSignals = () => void 0;
    const rawSession = createRenderSession({
      ...this.deps,
      source,
      mount,
      hostEl: el,
      ctx
    });
    const session = {
      rerender: async (input) => {
        if (disposed) return;
        await rawSession.rerender(input);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        cleanupSignals();
        rawSession.dispose();
      }
    };
    this.deps.runtime.trackEmbed(mount, (child) => ctx.addChild(child), session);
    const initialPriority = this.getInitialPriority(el);
    if (!this.usedInitialFastPath && initialPriority !== "offscreen") {
      this.usedInitialFastPath = true;
      this.deps.logger.debug("initial-render fast-path");
      void session.rerender();
      return;
    }
    const queueId = this.initialRenderQueue.enqueue(
      () => session.rerender(),
      () => disposed,
      { priority: initialPriority }
    );
    cleanupSignals = this.observeCanvasPrioritySignals(source, el, ctx, queueId, () => disposed);
  }
  prewarmCanvasNbePageIndex(source, ctx) {
    if (!ctx.sourcePath?.endsWith(".canvas")) return;
    let pageNbeId = null;
    try {
      const target = parseNotionTargetFromSource(source);
      if (target.mode !== "nbe_uri") return;
      pageNbeId = target.pageNbeId;
    } catch {
      return;
    }
    this.canvasPrewarmQueue.enqueue(pageNbeId, async () => {
      await this.deps.runtime.getRepository().prewarmNbePageIndex(pageNbeId);
    });
  }
  getInitialPriority(hostEl) {
    return this.isElementLikelyVisible(hostEl) ? "visible" : "offscreen";
  }
  observeCanvasPrioritySignals(source, hostEl, ctx, queueId, isDisposed) {
    const cleanups = [];
    if (ctx.sourcePath?.endsWith(".canvas")) {
      const globalObserver = globalThis;
      const IntersectionObserverCtor = globalObserver.IntersectionObserver;
      if (typeof IntersectionObserverCtor === "function") {
        const observer = new IntersectionObserverCtor((entries) => {
          if (isDisposed()) return;
          if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
            this.initialRenderQueue.reprioritize(queueId, "visible");
          }
        });
        observer.observe(hostEl);
        cleanups.push(() => observer.disconnect());
      }
      void this.promoteSelectedCanvasEmbed(source, ctx.sourcePath, queueId, isDisposed);
    }
    return () => {
      for (const cleanup of cleanups.splice(0).reverse()) {
        cleanup();
      }
    };
  }
  async promoteSelectedCanvasEmbed(source, sourcePath, queueId, isDisposed) {
    const selectedNodeId = this.resolveSelectedCanvasTextNodeId(sourcePath);
    if (!selectedNodeId) return;
    const selectedNodeText = await this.readSelectedCanvasTextNode(sourcePath, selectedNodeId);
    if (isDisposed()) return;
    if (selectedNodeText?.includes(source)) {
      this.initialRenderQueue.reprioritize(queueId, "selected");
    }
  }
  resolveSelectedCanvasTextNodeId(sourcePath) {
    const activeFile = this.deps.app.workspace.getActiveFile();
    if (!activeFile || activeFile.path !== sourcePath || activeFile.extension !== "canvas") {
      return null;
    }
    const activeLeaf = this.deps.app.workspace.activeLeaf;
    const activeView = activeLeaf?.view;
    if (activeView?.getViewType?.() !== "canvas") {
      return null;
    }
    const selection = activeView.canvas?.selection;
    const selectedItems = Array.isArray(selection) ? selection : selection ? Array.from(selection) : [];
    const selectedNode = selectedItems[0];
    return selectedNode?.id ?? selectedNode?.node?.id ?? selectedNode?.data?.id ?? null;
  }
  async readSelectedCanvasTextNode(sourcePath, nodeId) {
    const cacheKey = `${sourcePath}::${nodeId}`;
    let cached = this.selectedCanvasNodeTextCache.get(cacheKey);
    if (!cached) {
      cached = this.loadSelectedCanvasTextNode(sourcePath, nodeId);
      this.selectedCanvasNodeTextCache.set(cacheKey, cached);
    }
    return cached;
  }
  async loadSelectedCanvasTextNode(sourcePath, nodeId) {
    const file = this.deps.app.vault.getFileByPath(sourcePath);
    if (!file) return null;
    const vault = this.deps.app.vault;
    const raw = await (vault.cachedRead ? vault.cachedRead(file) : vault.read(file));
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const textNode = nodes.find(
      (node) => node.type === "text" && node.id === nodeId && typeof node.text === "string"
    );
    return textNode?.text ?? null;
  }
  isElementLikelyVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.right === 0) {
      return true;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
  }
};

// src/embed/quick-insert-command.ts
var QUICK_INSERT_NOTION_EMBED_COMMAND_ID = "quick-insert-notion-embed";
var QUICK_INSERT_NOTION_EMBED_COMMAND_NAME = "Quick insert Notion embed";
var EMPTY_NOTION_EMBED_CODE_BLOCK = ["```notion-embed", "", "```"].join("\n");
function insertEmptyNotionEmbed(editor) {
  const start = editor.getCursor("from");
  editor.replaceSelection(EMPTY_NOTION_EMBED_CODE_BLOCK);
  editor.setCursor({
    line: start.line + 1,
    ch: 0
  });
}
function createQuickInsertNotionEmbedCommand() {
  return {
    id: QUICK_INSERT_NOTION_EMBED_COMMAND_ID,
    name: QUICK_INSERT_NOTION_EMBED_COMMAND_NAME,
    editorCheckCallback: (checking, editor) => {
      if (checking) return true;
      insertEmptyNotionEmbed(editor);
      return true;
    }
  };
}

// src/nbe/registry.ts
var import_obsidian8 = require("obsidian");
var CANVAS_NODE_READY_RETRY_DELAYS_MS = [0, 50, 100, 200, 400];
var CANVAS_ZOOM_RETRY_DELAY_MS = 50;
var NbeReferenceRegistryService = class {
  constructor(app, logger, store) {
    this.app = app;
    this.logger = logger;
    this.store = store;
    this.rebuildPromise = null;
    this.rebuildTimer = null;
    this.rescanTimers = /* @__PURE__ */ new Map();
    this.registry = this.store.getData().nbeRegistry;
    this.refsByPath = buildPathIndex(this.registry);
  }
  getEntry(ref) {
    return this.registry[normalizeNbeRef(ref).ref];
  }
  getRegistry() {
    return structuredCloneRegistry(this.registry);
  }
  dispose() {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    this.clearAllScheduledRescans();
  }
  scheduleRebuild(delayMs = REGISTRY_LAZY_FULL_REBUILD_DELAY_MS) {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      void this.rebuild();
    }, delayMs);
  }
  scheduleRescanPath(path, delayMs = REGISTRY_INCREMENTAL_DEBOUNCE_MS) {
    if (!this.isIndexedFilePath(path)) return;
    const existing = this.rescanTimers.get(path);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.rescanTimers.delete(path);
      void this.rescanPath(path);
    }, delayMs);
    this.rescanTimers.set(path, timer);
  }
  async rescanPath(path) {
    if (!this.isIndexedFilePath(path)) return;
    this.clearScheduledRescan(path);
    if (this.rebuildPromise) {
      await this.rebuildPromise;
    }
    const scanned = await this.scanPath(path);
    const removed = this.removeLocationsForPath(path);
    let changed = removed;
    for (const item of scanned) {
      changed = this.addLocation(item.ref, item.location) || changed;
    }
    if (changed) {
      await this.persistRegistry();
      this.logger.debug(`rescanned NBE registry path=${path}`);
    }
  }
  async removePath(path) {
    if (!this.isIndexedFilePath(path)) return;
    this.clearScheduledRescan(path);
    if (this.rebuildPromise) {
      await this.rebuildPromise;
    }
    if (!this.removeLocationsForPath(path)) {
      return;
    }
    await this.persistRegistry();
    this.logger.debug(`removed NBE registry path=${path}`);
  }
  async handleRename(oldPath, newPath) {
    await this.removePath(oldPath);
    this.scheduleRescanPath(newPath);
  }
  async rebuild() {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    this.clearAllScheduledRescans();
    if (this.rebuildPromise) return this.rebuildPromise;
    this.rebuildPromise = this.performRebuild().finally(() => {
      this.rebuildPromise = null;
    });
    return this.rebuildPromise;
  }
  async setPrimaryFromActiveContext() {
    const current = await this.resolveCurrentContext();
    if (!current) {
      return false;
    }
    if (!this.registry[current.ref]) {
      await this.rescanPath(current.path);
    }
    const entry = this.registry[current.ref];
    if (!entry) return false;
    entry.primaryLocationKey = current.locationKey;
    entry.lastSeenAt = Date.now();
    await this.persistRegistry();
    return true;
  }
  async openRef(ref) {
    const normalizedRef = normalizeNbeRef(ref).ref;
    let entry = this.registry[normalizedRef];
    if (!entry || entry.locations.length === 0) {
      await this.rebuild();
      entry = this.registry[normalizedRef];
      if (!entry || entry.locations.length === 0) {
        await this.searchFallback(normalizedRef);
        this.scheduleRebuild();
        return "searched";
      }
    }
    const directLocation = resolveDirectLocation(entry);
    if (directLocation) {
      const opened = await this.tryOpenDirectLocation(directLocation, normalizedRef);
      if (opened) {
        return "opened";
      }
    }
    await this.searchFallback(normalizedRef);
    this.scheduleRebuild();
    return "searched";
  }
  async tryOpenDirectLocation(location, ref) {
    try {
      return location.kind === "markdown" ? await this.openMarkdownLocation(location) : await this.openCanvasLocation(location);
    } catch (error) {
      this.logger.debug(
        `open NBE direct location failed ref=${ref} error=${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }
  async performRebuild() {
    const nextRegistry = {};
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const canvasFiles = this.app.vault.getFiles().filter((file) => file.extension === "canvas");
    const scannedGroups = await Promise.all([
      ...markdownFiles.map((file) => this.scanFile(file)),
      ...canvasFiles.map((file) => this.scanFile(file))
    ]);
    for (const scanned of scannedGroups) {
      for (const item of scanned) {
        addLocationToRegistry(nextRegistry, item.ref, item.location);
      }
    }
    preservePrimaryLocations(this.registry, nextRegistry);
    this.registry = nextRegistry;
    this.refsByPath = buildPathIndex(nextRegistry);
    await this.persistRegistry();
    this.logger.debug(`rebuilt NBE registry entries=${Object.keys(this.registry).length}`);
  }
  async resolveCurrentContext() {
    const markdown = this.resolveCurrentMarkdownContext();
    if (markdown) return markdown;
    return this.resolveCurrentCanvasContext();
  }
  resolveCurrentMarkdownContext() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian8.MarkdownView);
    const file = view?.file;
    if (!view || !file) return null;
    const content = view.getViewData();
    const refs = extractNbeRefsFromDocument(content);
    if (refs.length === 0) return null;
    const editor = view.editor;
    const currentLine = editor?.getCursor?.().line;
    const activeRef = typeof currentLine === "number" ? refs.find((item) => item.lineStart <= currentLine && currentLine <= item.lineEnd) : refs.length === 1 ? refs[0] : null;
    if (!activeRef) return null;
    return {
      ref: activeRef.ref,
      locationKey: createMarkdownLocationKey(file.path, activeRef.lineStart, activeRef.lineEnd),
      path: file.path
    };
  }
  async resolveCurrentCanvasContext() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "canvas") return null;
    const activeLeaf = this.app.workspace.activeLeaf;
    const canvasView = activeLeaf?.view;
    if (canvasView?.getViewType?.() !== "canvas") return null;
    const selection = canvasView.canvas?.selection;
    const selected = Array.isArray(selection) ? selection : selection ? Array.from(selection) : [];
    const selectedNode = selected[0];
    const nodeId = selectedNode?.id ?? selectedNode?.node?.id ?? selectedNode?.data?.id;
    if (!nodeId) return null;
    const file = this.app.vault.getFileByPath(activeFile.path);
    if (!file) return null;
    const raw = await this.app.vault.read(file);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const textNode = parsed.nodes.find((node) => node.type === "text" && node.id === nodeId);
    if (!textNode) return null;
    const refs = extractNbeRefsFromDocument(textNode.text);
    if (refs.length === 0) return null;
    return {
      ref: refs[0].ref,
      locationKey: createCanvasLocationKey(activeFile.path, nodeId),
      path: activeFile.path
    };
  }
  async openMarkdownLocation(location) {
    const file = this.app.vault.getFileByPath(location.path);
    if (!file) return false;
    const leaf = this.findLeafForFile(location.path, "markdown") ?? this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    await this.safeRevealLeaf(leaf, `markdown path=${location.path}`);
    this.safeSetActiveLeaf(leaf, `markdown path=${location.path}`);
    await this.safeSetMarkdownSourceMode(leaf, location.path);
    const view = leaf.view instanceof import_obsidian8.MarkdownView ? leaf.view : this.app.workspace.getActiveViewOfType(import_obsidian8.MarkdownView);
    const editor = view ? view.editor : void 0;
    this.safeFocusMarkdownEditor(editor, location);
    return true;
  }
  async openCanvasLocation(location) {
    const file = this.app.vault.getFileByPath(location.path);
    if (!file) return false;
    const leaf = this.findLeafForFile(location.path, "canvas") ?? this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    await this.safeRevealLeaf(leaf, `canvas path=${location.path}`);
    this.safeSetActiveLeaf(leaf, `canvas path=${location.path}`);
    const resolved = await this.waitForCanvasNode(leaf, location);
    if (!resolved) return false;
    this.safeSelectCanvasNode(resolved.canvas, resolved.node, location);
    await this.safeZoomCanvasSelection(resolved.canvas, location);
    return true;
  }
  async safeRevealLeaf(leaf, context) {
    try {
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      this.logger.debug(`reveal NBE leaf failed ${context} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  safeSetActiveLeaf(leaf, context) {
    try {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    } catch (error) {
      this.logger.debug(`activate NBE leaf failed ${context} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async safeSetMarkdownSourceMode(leaf, path) {
    try {
      const currentState = leaf.getViewState();
      await leaf.setViewState({
        ...currentState,
        state: {
          ...currentState.state ?? {},
          mode: "source"
        }
      });
    } catch (error) {
      this.logger.debug(`set markdown NBE source mode failed path=${path} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  safeFocusMarkdownEditor(editor, location) {
    try {
      editor?.setCursor?.({ line: location.lineStart + 1, ch: 0 });
    } catch (error) {
      this.logger.debug(`set markdown NBE cursor failed path=${location.path} error=${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      editor?.focus?.();
    } catch (error) {
      this.logger.debug(`focus markdown NBE editor failed path=${location.path} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async waitForCanvasNode(leaf, location) {
    for (const delayMs of CANVAS_NODE_READY_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      const view = this.resolveCanvasView(leaf);
      const canvas = view?.canvas;
      const node = canvas?.nodes?.get?.(location.nodeId);
      if (canvas && node) {
        return { canvas, node };
      }
    }
    return null;
  }
  resolveCanvasView(leaf) {
    const view = leaf.view;
    if (view?.getViewType?.() !== "canvas") return null;
    return view;
  }
  safeSelectCanvasNode(canvas, node, location) {
    try {
      const selection = canvas.selection;
      if (selection instanceof Set) {
        selection.clear();
        selection.add(node);
      } else {
        selection?.clear?.();
        selection?.add?.(node);
      }
    } catch (error) {
      this.logger.debug(`select canvas NBE node failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      canvas.updateSelection?.(true);
    } catch (error) {
      this.logger.debug(`update canvas NBE selection failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async safeZoomCanvasSelection(canvas, location) {
    try {
      canvas.zoomToSelection?.();
      return;
    } catch (error) {
      this.logger.debug(`zoom canvas NBE selection failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(CANVAS_ZOOM_RETRY_DELAY_MS);
    try {
      canvas.zoomToSelection?.();
    } catch (error) {
      this.logger.debug(`retry zoom canvas NBE selection failed path=${location.path} node=${location.nodeId} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async searchFallback(ref) {
    const query = searchTokenForNbeRef(ref);
    const appAny = this.app;
    try {
      appAny.commands?.executeCommandById?.("global-search:open");
    } catch (error) {
      this.logger.debug(`open global search command failed error=${error instanceof Error ? error.message : String(error)}`);
    }
    if (await this.trySetGlobalSearchQuery(query)) {
      return;
    }
    const searchPlugin = appAny.internalPlugins?.getPluginById?.("global-search")?.instance;
    if (typeof searchPlugin?.openGlobalSearch === "function") {
      try {
        searchPlugin.openGlobalSearch();
      } catch (error) {
        this.logger.debug(`open global search plugin failed error=${error instanceof Error ? error.message : String(error)}`);
      }
      if (await this.trySetGlobalSearchQuery(query)) {
        return;
      }
    }
    new import_obsidian8.Notice(`Search for ${query}`);
  }
  async trySetGlobalSearchQuery(query) {
    const searchLeaf = this.app.workspace.getLeavesOfType("search")[0];
    const searchView = searchLeaf?.view;
    if (!searchLeaf || typeof searchView?.setQuery !== "function") {
      return false;
    }
    try {
      await this.app.workspace.revealLeaf(searchLeaf);
      searchView.setQuery(query);
      return true;
    } catch (error) {
      this.logger.debug(`set global search query failed error=${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  findLeafForFile(path, viewType) {
    let match = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (match) return;
      const view = leaf.view;
      if (viewType === "markdown" && leaf.view instanceof import_obsidian8.MarkdownView && leaf.view.file?.path === path) {
        match = leaf;
        return;
      }
      if (viewType === "canvas" && view.getViewType?.() === "canvas" && view.file?.path === path) {
        match = leaf;
      }
    });
    return match;
  }
  clearScheduledRescan(path) {
    const timer = this.rescanTimers.get(path);
    if (!timer) return;
    clearTimeout(timer);
    this.rescanTimers.delete(path);
  }
  clearAllScheduledRescans() {
    for (const timer of this.rescanTimers.values()) {
      clearTimeout(timer);
    }
    this.rescanTimers.clear();
  }
  isIndexedFilePath(path) {
    return path.endsWith(".md") || path.endsWith(".canvas");
  }
  async scanPath(path) {
    const file = this.app.vault.getFileByPath(path);
    if (!file || !this.isIndexedFilePath(file.path)) return [];
    return this.scanFile(file);
  }
  async scanFile(file) {
    try {
      const raw = await this.app.vault.read(file);
      if (file.extension === "md") {
        return extractNbeRefsFromDocument(raw).map((ref) => ({
          ref: ref.ref,
          location: {
            kind: "markdown",
            key: createMarkdownLocationKey(file.path, ref.lineStart, ref.lineEnd),
            path: file.path,
            lineStart: ref.lineStart,
            lineEnd: ref.lineEnd
          }
        }));
      }
      if (file.extension !== "canvas") return [];
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
      const scanned = [];
      for (const node of parsed.nodes ?? []) {
        if (node.type !== "text" || typeof node.text !== "string") continue;
        const textNode = node;
        const refs = extractNbeRefsFromDocument(textNode.text);
        for (const ref of refs) {
          scanned.push({
            ref: ref.ref,
            location: {
              kind: "canvas",
              key: createCanvasLocationKey(file.path, textNode.id),
              path: file.path,
              nodeId: textNode.id
            }
          });
        }
      }
      return scanned;
    } catch (error) {
      this.logger.debug(`scan NBE refs failed path=${file.path} error=${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  addLocation(ref, location) {
    const existing = this.registry[ref];
    if (!existing) {
      this.registry[ref] = {
        ref,
        locations: [location],
        lastSeenAt: Date.now()
      };
      addPathRef(this.refsByPath, location.path, ref);
      return true;
    }
    if (existing.locations.some((item) => item.key === location.key)) {
      existing.lastSeenAt = Date.now();
      addPathRef(this.refsByPath, location.path, ref);
      return false;
    }
    existing.locations.push(location);
    existing.lastSeenAt = Date.now();
    addPathRef(this.refsByPath, location.path, ref);
    return true;
  }
  removeLocationsForPath(path) {
    const refs = this.refsByPath.get(path);
    if (!refs || refs.size === 0) return false;
    let changed = false;
    for (const ref of refs) {
      const entry = this.registry[ref];
      if (!entry) continue;
      const nextLocations = entry.locations.filter((location) => location.path !== path);
      if (nextLocations.length === entry.locations.length) continue;
      changed = true;
      if (nextLocations.length === 0) {
        delete this.registry[ref];
        continue;
      }
      entry.locations = nextLocations;
      if (entry.primaryLocationKey && !nextLocations.some((location) => location.key === entry.primaryLocationKey)) {
        delete entry.primaryLocationKey;
      }
      entry.lastSeenAt = Date.now();
    }
    this.refsByPath.delete(path);
    return changed;
  }
  async persistRegistry() {
    await this.store.setNbeRegistry(this.registry);
  }
};
function addLocationToRegistry(registry, ref, location) {
  const existing = registry[ref];
  if (!existing) {
    registry[ref] = {
      ref,
      locations: [location],
      lastSeenAt: Date.now()
    };
    return;
  }
  if (!existing.locations.some((item) => item.key === location.key)) {
    existing.locations.push(location);
  }
  existing.lastSeenAt = Date.now();
}
function preservePrimaryLocations(previous, next) {
  for (const [ref, entry] of Object.entries(next)) {
    const previousEntry = previous[ref];
    if (!previousEntry?.primaryLocationKey) continue;
    if (entry.locations.some((location) => location.key === previousEntry.primaryLocationKey)) {
      entry.primaryLocationKey = previousEntry.primaryLocationKey;
    }
  }
}
function resolveDirectLocation(entry) {
  if (entry.primaryLocationKey) {
    const primary = entry.locations.find((location) => location.key === entry.primaryLocationKey);
    if (primary) return primary;
  }
  if (entry.locations.length === 1) {
    return entry.locations[0];
  }
  return null;
}
function createMarkdownLocationKey(path, lineStart, lineEnd) {
  return `md:${path}:${lineStart}:${lineEnd}`;
}
function createCanvasLocationKey(path, nodeId) {
  return `canvas:${path}:${nodeId}`;
}
function structuredCloneRegistry(registry) {
  return Object.fromEntries(
    Object.entries(registry).map(([ref, entry]) => [
      ref,
      {
        ref: entry.ref,
        primaryLocationKey: entry.primaryLocationKey,
        lastSeenAt: entry.lastSeenAt,
        locations: entry.locations.map((location) => ({ ...location }))
      }
    ])
  );
}
function buildPathIndex(registry) {
  const refsByPath = /* @__PURE__ */ new Map();
  for (const [ref, entry] of Object.entries(registry)) {
    for (const location of entry.locations) {
      addPathRef(refsByPath, location.path, ref);
    }
  }
  return refsByPath;
}
function addPathRef(index, path, ref) {
  const refs = index.get(path) ?? /* @__PURE__ */ new Set();
  refs.add(ref);
  index.set(path, refs);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/notion-web/host.ts
var WEBVIEWER_PLUGIN_ID = "webviewer";
var WEBVIEWER_VIEW_TYPE = "webviewer";
var FLOATING_WINDOW_SIZE = { width: 1280, height: 900 };
function createWebviewerState(url) {
  return {
    type: WEBVIEWER_VIEW_TYPE,
    active: true,
    state: {
      url,
      title: url,
      navigate: true
    }
  };
}
var NotionWebHostService = class {
  constructor(app) {
    this.app = app;
    this.sideInstance = null;
    this.floatingInstance = null;
  }
  async openUrl(url, mode, _anchorEl) {
    if (mode === "external_browser") {
      this.closeSideInstance();
      this.closeFloatingInstance();
      await this.openInExternalBrowser(url);
      return;
    }
    await this.ensureWebviewerEnabled();
    if (mode === "side_panel") {
      this.closeFloatingInstance();
      this.sideInstance = await this.ensureSideInstance(url);
      return;
    }
    this.closeSideInstance();
    this.floatingInstance = await this.ensureFloatingInstance(url);
  }
  handleWorkspaceWindowClose() {
    if (!this.isInstanceAlive(this.floatingInstance)) {
      this.floatingInstance = null;
    }
  }
  dispose() {
    this.closeSideInstance();
    this.closeFloatingInstance();
  }
  async openInExternalBrowser(url) {
    const electron = window.require?.("electron");
    const openExternal = electron?.shell?.openExternal;
    if (typeof openExternal === "function") {
      await openExternal(url);
      return;
    }
    if (typeof window.open === "function") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    throw new Error("Unable to open Notion in the external browser.");
  }
  async ensureSideInstance(url) {
    const state = createWebviewerState(url);
    const workspace = this.app.workspace;
    if (this.isInstanceAlive(this.sideInstance)) {
      await this.sideInstance.leaf.setViewState(state);
      return this.sideInstance;
    }
    if (typeof workspace.ensureSideLeaf === "function") {
      const existingLeaves = this.app.workspace.getLeavesOfType(WEBVIEWER_VIEW_TYPE);
      const leaf2 = await workspace.ensureSideLeaf(WEBVIEWER_VIEW_TYPE, "right", {
        active: true,
        reveal: true,
        state: state.state
      });
      await leaf2.setViewState(state);
      return {
        mode: "side_panel",
        windowKind: "side",
        leaf: leaf2,
        owned: !existingLeaves.includes(leaf2)
      };
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      throw new Error("Unable to open the Web viewer in the right sidebar.");
    }
    await leaf.setViewState(state);
    return {
      mode: "side_panel",
      windowKind: "side",
      leaf,
      owned: true
    };
  }
  async ensureFloatingInstance(url) {
    const state = createWebviewerState(url);
    if (this.isInstanceAlive(this.floatingInstance)) {
      await this.floatingInstance.leaf.setViewState(state);
      return this.floatingInstance;
    }
    const leaf = await this.app.workspace.openPopoutLeaf({ size: FLOATING_WINDOW_SIZE });
    await leaf.setViewState(state);
    return {
      mode: "floating_window",
      windowKind: "floating",
      leaf,
      owned: true
    };
  }
  async ensureWebviewerEnabled() {
    const internalPlugins = this.app.internalPlugins;
    const plugin = internalPlugins?.getPluginById?.(WEBVIEWER_PLUGIN_ID) ?? null;
    if (!plugin) {
      throw new Error("Obsidian Web viewer core plugin is unavailable.");
    }
    if (plugin.enabled) return;
    if (typeof plugin.enable === "function") {
      await plugin.enable();
    } else if (typeof internalPlugins?.enablePluginAndSave === "function") {
      await internalPlugins.enablePluginAndSave(WEBVIEWER_PLUGIN_ID);
    } else if (typeof internalPlugins?.enablePlugin === "function") {
      await internalPlugins.enablePlugin(WEBVIEWER_PLUGIN_ID);
    }
    const hasWebviewerView = Boolean(
      this.app.workspace.getViewCreatorByType?.(
        WEBVIEWER_VIEW_TYPE
      )
    );
    if (!plugin.enabled && !hasWebviewerView) {
      throw new Error("Failed to enable the Obsidian Web viewer core plugin.");
    }
  }
  isInstanceAlive(instance) {
    if (!instance) return false;
    return this.app.workspace.getLeavesOfType(WEBVIEWER_VIEW_TYPE).includes(instance.leaf);
  }
  closeSideInstance() {
    this.closeInstance(this.sideInstance);
    this.sideInstance = null;
  }
  closeFloatingInstance() {
    this.closeInstance(this.floatingInstance);
    this.floatingInstance = null;
  }
  closeInstance(instance) {
    if (!instance) return;
    if (!instance.owned) return;
    if (this.isInstanceAlive(instance)) {
      instance.leaf.detach();
    }
  }
};

// src/writeback/editor-controller.ts
var import_obsidian9 = require("obsidian");
var FloatingEditorController = class {
  constructor() {
    this.root = null;
    this.outsideClick = null;
    this.escHandler = null;
  }
  open(options) {
    this.close();
    const root = document.createElement("div");
    root.className = "nbe-floating-editor";
    const title = document.createElement("h4");
    title.textContent = "Edit Notion Block";
    root.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "nbe-editor-meta";
    meta.textContent = `${options.block.type} \xB7 ${options.block.id.slice(0, 8)}`;
    root.appendChild(meta);
    const textarea = document.createElement("textarea");
    textarea.value = options.initialText;
    root.appendChild(textarea);
    const errorLine = document.createElement("div");
    errorLine.className = "nbe-editor-error";
    root.appendChild(errorLine);
    const actions = document.createElement("div");
    actions.className = "nbe-editor-actions";
    const cancel = document.createElement("button");
    cancel.className = "nbe-button";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.close());
    const save = document.createElement("button");
    save.className = "nbe-button";
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      errorLine.textContent = "";
      save.disabled = true;
      cancel.disabled = true;
      try {
        await options.onSave(textarea.value);
        this.close();
        new import_obsidian9.Notice("Notion block updated.");
      } catch (error) {
        errorLine.textContent = userMessageFromError(error);
      } finally {
        save.disabled = false;
        cancel.disabled = false;
      }
    });
    actions.appendChild(cancel);
    actions.appendChild(save);
    root.appendChild(actions);
    document.body.appendChild(root);
    this.positionRoot(root, options.anchorEl);
    this.root = root;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    this.outsideClick = (event) => {
      if (!this.root) return;
      const target = event.target;
      if (target && !this.root.contains(target)) this.close();
    };
    this.escHandler = (event) => {
      if (event.key === "Escape") this.close();
    };
    window.addEventListener("mousedown", this.outsideClick, true);
    window.addEventListener("keydown", this.escHandler, true);
  }
  close() {
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    if (this.outsideClick) {
      window.removeEventListener("mousedown", this.outsideClick, true);
      this.outsideClick = null;
    }
    if (this.escHandler) {
      window.removeEventListener("keydown", this.escHandler, true);
      this.escHandler = null;
    }
  }
  positionRoot(root, anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 16);
    root.style.width = `${width}px`;
    root.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    root.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 240)}px`;
  }
};

// src/main.ts
var NotionBlockEmbedPlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.logger = new Logger();
    this.editor = new FloatingEditorController();
    this.runtime = createRuntime(this.logger);
    this.imageSizeStore = null;
    this.persistedDataStore = null;
    this.processor = null;
    this.notionWebHost = null;
    this.nbeRegistry = null;
  }
  async onload() {
    await this.loadSettings();
    this.logger.setEnabled(this.settings.debugLogs);
    this.runtime.applySettings(this.settings);
    this.imageSizeStore?.pruneExpired();
    this.notionWebHost = new NotionWebHostService(this.app);
    if (this.persistedDataStore) {
      this.nbeRegistry = new NbeReferenceRegistryService(this.app, this.logger, this.persistedDataStore);
    }
    this.registerEvent(
      this.app.workspace.on("window-close", () => {
        this.notionWebHost?.handleWorkspaceWindowClose();
      })
    );
    this.registerVaultIndexEvents();
    this.registerObsidianProtocolHandler(NBE_PROTOCOL_ACTION, async (params) => {
      const rawRef = typeof params.nbe === "string" ? params.nbe : "";
      if (!rawRef) {
        new import_obsidian10.Notice('Missing "nbe" in Obsidian URI.');
        return;
      }
      try {
        const ref = normalizeNbeRef(rawRef).ref;
        await this.nbeRegistry?.openRef(ref);
      } catch (error) {
        new import_obsidian10.Notice(error instanceof Error ? error.message : String(error));
      }
    });
    this.processor = new NotionEmbedProcessor({
      app: this.app,
      logger: this.logger,
      runtime: {
        getSettings: () => this.runtime.getSettings(),
        getRepository: () => this.runtime.getRepository(),
        getWritebackService: () => this.runtime.getWritebackService(),
        invalidateScopes: (scopes) => this.runtime.invalidateScopes(scopes),
        trackEmbed: (container, registerChild, session) => this.runtime.trackEmbed(container, registerChild, session)
      },
      imageSizing: {
        getWidthRatio: (blockId) => this.imageSizeStore?.getWidthRatio(blockId),
        rememberWidthRatio: (blockId, widthRatio) => this.imageSizeStore?.rememberWidthRatio(blockId, widthRatio),
        resetWidthRatio: (blockId) => this.imageSizeStore?.resetWidthRatio(blockId),
        touch: (blockId) => this.imageSizeStore?.touch(blockId),
        flush: async () => {
          await this.imageSizeStore?.flush();
        }
      },
      editor: this.editor,
      notionWebHost: this.notionWebHost
    });
    this.registerMarkdownCodeBlockProcessor("notion-embed", async (source, el, ctx) => {
      if (!this.processor) return;
      await this.processor.process(source, el, ctx);
    });
    this.addCommand({
      id: "refresh-all-notion-embeds",
      name: "Refresh all Notion embeds",
      callback: async () => {
        await this.runtime.refreshAllEmbeds({ forceGlobal: true });
        new import_obsidian10.Notice("Refreshed all Notion embeds.");
      }
    });
    this.addCommand({
      id: "clear-notion-embed-cache",
      name: "Clear Notion embed cache",
      callback: () => {
        this.runtime.clearAllCache();
        new import_obsidian10.Notice("Notion embed cache cleared.");
      }
    });
    this.addCommand({
      id: "clear-remembered-image-sizes",
      name: "Clear remembered image sizes",
      callback: async () => {
        this.imageSizeStore?.clearAll();
        await this.runtime.refreshAllEmbeds({ forceGlobal: false });
        new import_obsidian10.Notice("Cleared remembered image sizes.");
      }
    });
    this.addCommand({
      id: "rebuild-nbe-reference-registry",
      name: "Rebuild NBE reference registry",
      callback: async () => {
        await this.nbeRegistry?.rebuild();
        new import_obsidian10.Notice("Rebuilt NBE reference registry.");
      }
    });
    this.addCommand({
      id: "set-current-nbe-embed-as-primary-reference",
      name: "Set current NBE embed as primary reference",
      callback: async () => {
        const updated = await this.nbeRegistry?.setPrimaryFromActiveContext();
        new import_obsidian10.Notice(updated ? "Set primary NBE reference." : "Could not resolve the current NBE embed.");
      }
    });
    this.addCommand(createQuickInsertNotionEmbedCommand());
    this.addSettingTab(
      new NotionBlockEmbedSettingTab(this.app, this, {
        getSettings: () => this.settings,
        saveSettings: async (next, options) => {
          await this.updateSettings(next, options);
        },
        onManualRefresh: async () => {
          await this.runtime.refreshAllEmbeds({ forceGlobal: true });
          new import_obsidian10.Notice("Refreshed all Notion embeds.");
        },
        onClearCache: () => {
          this.runtime.clearAllCache();
          new import_obsidian10.Notice("Notion embed cache cleared.");
        },
        onClearImageSizes: async () => {
          this.imageSizeStore?.clearAll();
          await this.runtime.refreshAllEmbeds({ forceGlobal: false });
          new import_obsidian10.Notice("Cleared remembered image sizes.");
        }
      })
    );
  }
  onunload() {
    this.processor?.dispose();
    this.nbeRegistry?.dispose();
    this.editor.close();
    this.notionWebHost?.dispose();
    this.imageSizeStore?.dispose();
    void this.persistedDataStore?.flush();
    this.runtime.dispose();
  }
  async loadSettings() {
    const persisted = coercePersistedPluginData(await this.loadData());
    this.persistedDataStore = new PersistedDataStore(persisted, async (next) => {
      await this.saveData(next);
    });
    this.runtime.attachPersistedDataStore(this.persistedDataStore);
    this.settings = persisted.settings;
    this.imageSizeStore = new ImageSizeStore({
      initialMemory: persisted.imageSizeMemory,
      save: async (imageSizeMemory) => {
        await this.persistedDataStore?.setImageSizeMemory(imageSizeMemory);
      }
    });
  }
  async updateSettings(next, options) {
    this.settings = next;
    this.logger.setEnabled(this.settings.debugLogs);
    await this.persistedDataStore?.setSettings(this.settings, options);
    this.runtime.applySettings(this.settings);
  }
  registerVaultIndexEvents() {
    const schedule = (file) => {
      if (!file || !this.isRegistryIndexedFile(file.path)) return;
      this.nbeRegistry?.scheduleRescanPath(file.path);
    };
    this.registerEvent(this.app.vault.on("modify", (file) => schedule(file)));
    this.registerEvent(this.app.vault.on("create", (file) => schedule(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (!file || !this.isRegistryIndexedFile(file.path)) return;
      void this.nbeRegistry?.removePath(file.path);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      void this.nbeRegistry?.handleRename(oldPath, file.path);
    }));
  }
  isRegistryIndexedFile(path) {
    return path.endsWith(".md") || path.endsWith(".canvas");
  }
};
