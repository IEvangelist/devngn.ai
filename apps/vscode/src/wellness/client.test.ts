// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { WellnessAuthError, WellnessClient } from "./client.js";

const encoder = new TextEncoder();

function streamResponse(chunks: string[], keepOpen: boolean): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
        return;
      }
      if (!keepOpen) {
        controller.close();
      }
      // Otherwise leave the stream open: the next read() stays pending, which
      // mimics a live SSE connection waiting for the next heartbeat.
    },
  });

  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers(),
  } as unknown as Response;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

function emptyResponse(
  status: number,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => {
      throw new Error("no body");
    },
  } as unknown as Response;
}

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("WellnessClient.streamPrompts", () => {
  it("delivers a parsed prompt from the SSE stream", async () => {
    const prompt = { id: "p1", activityTitle: "Stretch", durationSeconds: 30 };
    const sse = `event: prompt\ndata: ${JSON.stringify(prompt)}\n\n`;
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([sse], true));
    const client = new WellnessClient({
      baseUrl: "http://localhost:5000",
      getToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const onStop = vi.fn();
    let stop: () => void = () => undefined;
    const received = await new Promise<unknown>((resolve) => {
      stop = client.streamPrompts(
        { onPrompt: resolve, onStop },
        { timeZone: "UTC", heartbeatTimeoutMs: 0 },
      );
    });
    stop();

    expect(received).toEqual(prompt);
    expect(onStop).not.toHaveBeenCalled();
    const requestedUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(requestedUrl).toContain("/v1/prompts/stream");
    expect(requestedUrl).toContain("channel=vscode");
    expect(requestedUrl).toContain("tz=UTC");
  });

  it("stops without reconnecting when there is no token", async () => {
    const fetchImpl = vi.fn();
    const client = new WellnessClient({
      baseUrl: "http://localhost:5000",
      getToken: () => undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const onStop = vi.fn();
    client.streamPrompts({ onPrompt: vi.fn(), onStop }, { timeZone: "UTC" });
    await tick();

    expect(onStop).toHaveBeenCalledWith("unauthorized");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops on a 403 (consent required) without reconnecting", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(emptyResponse(403));
    const client = new WellnessClient({
      baseUrl: "http://localhost:5000",
      getToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const onStop = vi.fn();
    const stop = client.streamPrompts(
      { onPrompt: vi.fn(), onStop },
      { timeZone: "UTC" },
    );
    await tick();
    stop();

    expect(onStop).toHaveBeenCalledWith("forbidden");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("WellnessClient prompt lifecycle", () => {
  const make = (
    fetchImpl: ReturnType<typeof vi.fn>,
    token: string | undefined = "tok",
  ) =>
    new WellnessClient({
      baseUrl: "http://localhost:5000/",
      getToken: () => token,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

  it("returns the updated prompt on complete", async () => {
    const updated = { id: "p1", completedAt: "2026-01-01T00:00:00Z" };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, updated));
    const result = await make(fetchImpl).complete("p1");
    expect(result).toEqual(updated);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/v1/prompts/p1/complete");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("resolves undefined when the prompt is missing (404)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(emptyResponse(404));
    expect(await make(fetchImpl).dismiss("missing")).toBeUndefined();
  });

  it("resolves undefined when next has no prompt (204)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(emptyResponse(204));
    expect(await make(fetchImpl).next("UTC")).toBeUndefined();
  });

  it("throws WellnessAuthError when there is no token", async () => {
    const fetchImpl = vi.fn();
    const client = new WellnessClient({
      baseUrl: "http://localhost:5000",
      getToken: () => undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.complete("p1")).rejects.toBeInstanceOf(
      WellnessAuthError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends an Authorization header on authenticated calls", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: "p1" }));
    await make(fetchImpl).complete("p1");
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok");
  });

  it("posts a rating on feedback", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: "p1" }));
    await make(fetchImpl).sendFeedback("p1", 5);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ rating: 5 });
  });
});

describe("WellnessClient.pollDeviceFlow", () => {
  const make = (fetchImpl: ReturnType<typeof vi.fn>) =>
    new WellnessClient({
      baseUrl: "http://localhost:5000",
      getToken: () => undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

  it("maps 200 to success", async () => {
    const token = { accessToken: "jwt", tokenType: "Bearer" };
    const result = await make(
      vi.fn().mockResolvedValue(jsonResponse(200, token)),
    ).pollDeviceFlow("s1");
    expect(result).toEqual({ kind: "success", token });
  });

  it("maps 202 to pending with Retry-After", async () => {
    const result = await make(
      vi.fn().mockResolvedValue(emptyResponse(202, { "Retry-After": "5" })),
    ).pollDeviceFlow("s1");
    expect(result).toEqual({ kind: "pending", retryAfterSeconds: 5 });
  });

  it("maps 429 to slowDown", async () => {
    const result = await make(
      vi.fn().mockResolvedValue(emptyResponse(429, { "Retry-After": "10" })),
    ).pollDeviceFlow("s1");
    expect(result).toEqual({ kind: "slowDown", retryAfterSeconds: 10 });
  });

  it("maps an error status to an error result", async () => {
    const result = await make(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(410, { error: "expired_token", description: "gone" }),
        ),
    ).pollDeviceFlow("s1");
    expect(result).toEqual({
      kind: "error",
      error: "expired_token",
      description: "gone",
    });
  });
});
