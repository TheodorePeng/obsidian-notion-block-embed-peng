import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { PluginError, userMessageFromError } from "../src/core/errors";
import { Logger } from "../src/core/logger";
import { NotionClient } from "../src/notion/client";

const requestUrlMock = vi.mocked(requestUrl);

function response(status: number, payload: Record<string, unknown>): never {
  return {
    status,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: payload,
    text: JSON.stringify(payload),
  } as never;
}

describe("NotionClient HTTP error handling", () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a 400 response as a Notion API error and disables requestUrl throwing", async () => {
    requestUrlMock.mockResolvedValue(response(400, {
      object: "error",
      status: 400,
      code: "validation_error",
      message: "Block type ai_block is not supported via the API for your bot type.",
    }));
    const client = new NotionClient("token", new Logger());

    let caught: unknown;
    try {
      await client.getBlock("block-1");
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "NOTION_BAD_REQUEST",
      status: 400,
      message: "Block type ai_block is not supported via the API for your bot type.",
    });
    expect(caught).toBeInstanceOf(PluginError);
    expect(userMessageFromError(caught)).toBe(
      "Notion API rejected the request: Block type ai_block is not supported via the API for your bot type.",
    );
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(requestUrlMock).toHaveBeenCalledWith(expect.objectContaining({ throw: false }));
  });

  it("preserves a 404 response as NOTION_NOT_FOUND without retrying", async () => {
    requestUrlMock.mockResolvedValue(response(404, {
      object: "error",
      status: 404,
      code: "object_not_found",
      message: "Could not find block.",
    }));
    const client = new NotionClient("token", new Logger());

    await expect(client.getBlock("missing")).rejects.toMatchObject({
      code: "NOTION_NOT_FOUND",
      status: 404,
    });
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and 5xx responses but does not retry ordinary 4xx responses", async () => {
    vi.useFakeTimers();
    requestUrlMock.mockResolvedValue(response(429, {
      object: "error",
      status: 429,
      code: "rate_limited",
      message: "Rate limited.",
    }));
    const client = new NotionClient("token", new Logger());
    const rateLimited = client.getBlock("rate-limited").catch((error) => error);
    await vi.runAllTimersAsync();
    await expect(rateLimited).resolves.toMatchObject({ code: "NOTION_RATE_LIMIT", status: 429 });
    expect(requestUrlMock).toHaveBeenCalledTimes(4);

    requestUrlMock.mockReset();
    requestUrlMock.mockResolvedValue(response(500, {
      object: "error",
      status: 500,
      code: "internal_server_error",
      message: "Internal server error.",
    }));
    const serverError = client.getBlock("server-error").catch((error) => error);
    await vi.runAllTimersAsync();
    await expect(serverError).resolves.toMatchObject({ code: "UNKNOWN", status: 500 });
    expect(requestUrlMock).toHaveBeenCalledTimes(4);
  });

  it("maps a requestUrl transport failure to NETWORK after retries", async () => {
    vi.useFakeTimers();
    requestUrlMock.mockRejectedValue(new Error("socket closed"));
    const client = new NotionClient("token", new Logger());

    const result = client.getBlock("network-failure").catch((error) => error);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ code: "NETWORK", message: "socket closed" });
    expect(requestUrlMock).toHaveBeenCalledTimes(4);
  });
});
