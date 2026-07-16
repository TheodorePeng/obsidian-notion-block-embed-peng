import { requestUrl } from "obsidian";
import { NOTION_API_BASE, NOTION_VERSION } from "../core/constants";
import { PluginError } from "../core/errors";
import { Logger } from "../core/logger";
import { NotionApiBlock, NotionApiDatabase, NotionApiPage } from "../core/models";

interface ListChildrenResponse {
  results: NotionApiBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface AppendChildrenResponse {
  results: NotionApiBlock[];
}

interface SearchResponse<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

interface QueryDatabaseResponse {
  results: NotionApiPage[];
  has_more: boolean;
  next_cursor: string | null;
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function notionErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string") {
    return (payload as { message: string }).message;
  }
  return stringifyPayload(payload);
}

function buildNotionError(status: number, payload: unknown): PluginError {
  const detail = stringifyPayload(payload);
  const message = notionErrorMessage(payload);
  if (status === 401) return new PluginError("NOTION_UNAUTHORIZED", "Unauthorized", status, detail);
  if (status === 403) return new PluginError("NOTION_FORBIDDEN", "Forbidden", status, detail);
  if (status === 404) return new PluginError("NOTION_NOT_FOUND", "Not found", status, detail);
  if (status === 429) return new PluginError("NOTION_RATE_LIMIT", "Rate limit", status, detail);
  if (status === 400) return new PluginError("NOTION_BAD_REQUEST", message || "Bad request", status, detail);
  return new PluginError("UNKNOWN", `Notion API ${status}: ${message}`, status, detail);
}

const RETRY_DELAYS_MS = [300, 900, 1800] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class NotionClient {
  constructor(
    private readonly token: string,
    private readonly logger: Logger,
  ) {}

  private async request<T>(
    path: string,
    method: "GET" | "PATCH" | "DELETE" | "POST",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const maxAttempts = RETRY_DELAYS_MS.length + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await requestUrl({
          url: `${NOTION_API_BASE}${path}`,
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          throw: false,
        });

        const text = response.text ?? "";
        let payload: unknown;
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
        return payload as T;
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

  async getBlock(blockId: string): Promise<NotionApiBlock> {
    this.logger.debug(`GET block ${blockId}`);
    return this.request<NotionApiBlock>(`/blocks/${blockId}`, "GET");
  }

  async listBlockChildren(blockId: string): Promise<NotionApiBlock[]> {
    const results: NotionApiBlock[] = [];
    let cursor: string | null = null;

    while (true) {
      const query: string = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : "?page_size=100";
      this.logger.debug(`GET children ${blockId} cursor=${cursor ?? "none"}`);
      const page: ListChildrenResponse = await this.request<ListChildrenResponse>(
        `/blocks/${blockId}/children${query}`,
        "GET",
      );
      results.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return results;
  }

  async searchDatabases(): Promise<NotionApiDatabase[]> {
    const results: NotionApiDatabase[] = [];
    let cursor: string | null = null;

    while (true) {
      const body: Record<string, unknown> = {
        page_size: 100,
        filter: {
          property: "object",
          value: "database",
        },
      };
      if (cursor) {
        body.start_cursor = cursor;
      }
      this.logger.debug(`POST search databases cursor=${cursor ?? "none"}`);
      const page = await this.request<SearchResponse<NotionApiDatabase>>("/search", "POST", body);
      results.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }

    return results;
  }

  async queryDatabaseByNbeId(databaseId: string, nbeId: string): Promise<NotionApiPage[]> {
    const results: NotionApiPage[] = [];
    let cursor: string | null = null;

    while (true) {
      const body: Record<string, unknown> = {
        page_size: 100,
        filter: {
          property: "NBE ID",
          rich_text: {
            equals: nbeId,
          },
        },
      };
      if (cursor) {
        body.start_cursor = cursor;
      }
      this.logger.debug(`POST database query ${databaseId} nbe=${nbeId} cursor=${cursor ?? "none"}`);
      const page = await this.request<QueryDatabaseResponse>(`/databases/${databaseId}/query`, "POST", body);
      results.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }

    return results;
  }

  async updateBlock(blockId: string, payload: Record<string, unknown>): Promise<NotionApiBlock> {
    this.logger.debug(`PATCH block ${blockId}`);
    return this.request<NotionApiBlock>(`/blocks/${blockId}`, "PATCH", payload);
  }

  async appendBlockChildren(
    parentId: string,
    children: Array<Record<string, unknown>>,
    after?: string,
  ): Promise<NotionApiBlock[]> {
    this.logger.debug(`PATCH append children parent=${parentId} after=${after ?? "none"}`);
    const body: Record<string, unknown> = {
      children,
    };
    if (after) {
      body.after = after;
    }
    const response = await this.request<AppendChildrenResponse>(`/blocks/${parentId}/children`, "PATCH", body);
    return response.results;
  }

  async deleteBlock(blockId: string): Promise<NotionApiBlock> {
    this.logger.debug(`DELETE block ${blockId}`);
    return this.request<NotionApiBlock>(`/blocks/${blockId}`, "DELETE");
  }
}
