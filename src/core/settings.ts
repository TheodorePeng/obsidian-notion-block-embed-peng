export type InputMode = "block_url";
export type RefreshPolicy = "manual" | "interval";
export type WritebackConflictPolicy = "none" | "fail_on_conflict";
export type RenderMode = "compact";
export type NotionOpenMode = "side_panel" | "floating_window" | "external_browser";

export interface NotionBlockEmbedSettings {
  notionToken: string;
  showChildren: boolean;
  toggleDefaultExpanded: boolean;
  maxHeight: number;
  debugLogs: boolean;
  allowWriteback: boolean;
  refreshIntervalSec: number;
  // Reserved for future feature switches.
  inputMode: InputMode;
  refreshPolicy: RefreshPolicy;
  writebackConflictPolicy: WritebackConflictPolicy;
  renderMode: RenderMode;
  notionOpenMode: NotionOpenMode;
}

export const DEFAULT_SETTINGS: NotionBlockEmbedSettings = {
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
  notionOpenMode: "side_panel",
};

export function tokenFingerprint(token: string): string {
  const value = token.trim();
  if (!value) return "no-token";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
