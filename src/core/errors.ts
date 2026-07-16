export type PluginErrorCode =
  | "INVALID_INPUT"
  | "CONFIG_MISSING_TOKEN"
  | "NOTION_UNAUTHORIZED"
  | "NOTION_FORBIDDEN"
  | "NOTION_NOT_FOUND"
  | "NOTION_RATE_LIMIT"
  | "NOTION_BAD_REQUEST"
  | "WRITE_CONFLICT"
  | "NETWORK"
  | "UNKNOWN";

export class PluginError extends Error {
  constructor(
    public readonly code: PluginErrorCode,
    message: string,
    public readonly status?: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "PluginError";
  }
}

export function toPluginError(value: unknown): PluginError {
  if (value instanceof PluginError) return value;
  return new PluginError("UNKNOWN", value instanceof Error ? value.message : String(value));
}

export function userMessageFromError(error: unknown): string {
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
