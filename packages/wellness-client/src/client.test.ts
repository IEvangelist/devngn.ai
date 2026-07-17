// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WellnessAuthError, WellnessClient } from "./client.js";

type FetchStub = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function jsonResponse(
  status: number,
  body: unknown,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
  });
}

function emptyResponse(status: number, headers?: HeadersInit): Response {
  return new Response(null, { status, headers });
}

function makeClient(fetchImpl: FetchStub, token?: string): WellnessClient {
  return new WellnessClient({
    baseUrl: "http://localhost:5000",
    getToken: () => token,
    fetchImpl,
  });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("WellnessClient.streamPrompts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the stop handle before any callback fires", () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const onStatus = vi.fn();

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn(), onStatus },
      { timeZone: "UTC" },
    );

    expect(typeof stop).toBe("function");
    expect(onStatus).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();

    stop();
  });

  it("polls POST /v1/prompts/next with tz + channel query params and JSON headers", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValueOnce(emptyResponse(204))
      .mockImplementation(() => new Promise<Response>(() => undefined));

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn() },
      { timeZone: "America/Chicago", channel: "cli", heartbeatTimeoutMs: 250 },
    );
    await flushMicrotasks();
    stop();

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(String(url)).toContain("/v1/prompts/next");
    expect(String(url)).toContain("tz=America%2FChicago");
    expect(String(url)).toContain("channel=cli");
    expect(init?.method).toBe("POST");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok");
    expect(headers.get("Accept")).not.toContain("text/event-stream");
    expect(headers.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });

  it("deduplicates consecutive prompt deliveries and resets deduplication after 204", async () => {
    const prompt = {
      id: "prompt-1",
      activityTitle: "Neck rolls",
      durationSeconds: 20,
    };
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValueOnce(jsonResponse(200, prompt))
      .mockResolvedValueOnce(jsonResponse(200, prompt))
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(jsonResponse(200, prompt))
      .mockImplementation(() => new Promise<Response>(() => undefined));

    const onPrompt = vi.fn();
    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt },
      { timeZone: "UTC", pollIntervalMs: 250 },
    );

    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(250);

    expect(onPrompt).toHaveBeenCalledTimes(2);
    expect(onPrompt).toHaveBeenNthCalledWith(1, prompt);
    expect(onPrompt).toHaveBeenNthCalledWith(2, prompt);

    stop();
  });

  it("treats 204 as idle, waits the configured poll interval, and does not call onStop", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValueOnce(emptyResponse(204))
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const onStop = vi.fn();

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn(), onStop },
      { timeZone: "UTC", pollIntervalMs: 500, backoffCapMs: 20 },
    );

    await flushMicrotasks();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(499);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    stop();
  });

  it("treats 404 as a transient API failure and retains the request id for retry", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValueOnce(emptyResponse(404))
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const onStatus = vi.fn();
    const onTransientError = vi.fn();

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn(), onStatus, onTransientError },
      { timeZone: "UTC", backoffCapMs: 1 },
    );

    await flushMicrotasks();
    expect(onTransientError).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenCalledWith("connecting");
    expect(onStatus).not.toHaveBeenCalledWith("open");

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const firstHeaders = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    const retryHeaders = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers);
    expect(retryHeaders.get("Idempotency-Key")).toBe(
      firstHeaders.get("Idempotency-Key"),
    );

    stop();
  });

  it("times out a stalled poll and retries it", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(init.signal?.reason);
            });
          }),
      )
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const onTransientError = vi.fn();

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn(), onTransientError },
      { timeZone: "UTC", requestTimeoutMs: 50, backoffCapMs: 1 },
    );

    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(50);
    expect(onTransientError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "TimeoutError" }),
    );

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    stop();
  });

  it("retries transient failures with capped exponential backoff", async () => {
    const transientError = new TypeError("Failed to fetch");
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const onTransientError = vi.fn();
    const onStatus = vi.fn();

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn(), onStatus, onTransientError },
      { timeZone: "UTC", backoffCapMs: 2_500 },
    );

    await flushMicrotasks();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onTransientError).toHaveBeenCalledWith(transientError);
    expect(onStatus).toHaveBeenNthCalledWith(1, "connecting");

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onTransientError).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenNthCalledWith(2, "reconnecting");

    await vi.advanceTimersByTimeAsync(2_499);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    stop();
  });

  it("aborts the in-flight fetch and emits stopped when stop() is called", async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn<FetchStub>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const onStatus = vi.fn();

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn(), onStatus },
      { timeZone: "UTC" },
    );

    await flushMicrotasks();
    expect(signal?.aborted).toBe(false);

    stop();
    await flushMicrotasks();

    expect(signal?.aborted).toBe(true);
    expect(onStatus).toHaveBeenLastCalledWith("stopped");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps abort-listener registration balanced across many idle poll cycles and settles cleanly on stop", async () => {
    const add = vi.spyOn(AbortSignal.prototype, "addEventListener");
    const remove = vi.spyOn(AbortSignal.prototype, "removeEventListener");
    const fetchImpl = vi.fn<FetchStub>().mockResolvedValue(emptyResponse(204));

    const pollIntervalMs = 20;
    const cycles = 40;
    const onStatus = vi.fn();

    const stop = makeClient(fetchImpl, "tok").streamPrompts(
      { onPrompt: vi.fn(), onStatus },
      {
        timeZone: "UTC",
        pollIntervalMs,
        backoffCapMs: pollIntervalMs,
      },
    );

    await flushMicrotasks();

    const outstandingAfterCycle: number[] = [];
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      await vi.advanceTimersByTimeAsync(pollIntervalMs);
      const abortAdds = add.mock.calls.filter(
        (call) => call[0] === "abort",
      ).length;
      const abortRemoves = remove.mock.calls.filter(
        (call) => call[0] === "abort",
      ).length;
      outstandingAfterCycle.push(abortAdds - abortRemoves);
    }

    // At least `cycles` polls actually happened via the real streamPrompts loop.
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(cycles);
    // A brand-new abort listener is registered for the next in-flight sleep
    // immediately after each completed one, so exactly one listener is ever
    // outstanding at a time. Before the fix this count grew by one every
    // cycle (an unbounded leak); after the fix it stays flat regardless of
    // how many cycles run.
    for (const outstanding of outstandingAfterCycle) {
      expect(outstanding).toBeLessThanOrEqual(1);
    }
    // Confirms the spy actually observed real add/remove activity (not a
    // vacuous 0-vs-0 comparison) while staying bounded across all cycles.
    expect(Math.max(...outstandingAfterCycle)).toBe(1);

    // stop()/abort() must still settle the stream cleanly after all those cycles.
    stop();
    await flushMicrotasks();

    expect(fetchImpl.mock.calls.length).toBe(cycles + 1);

    // The final in-flight sleep's listener must also be cleaned up once
    // abort settles it, leaving zero net outstanding abort listeners.
    const finalAdds = add.mock.calls.filter(
      (call) => call[0] === "abort",
    ).length;
    const finalRemoves = remove.mock.calls.filter(
      (call) => call[0] === "abort",
    ).length;
    expect(finalAdds - finalRemoves).toBe(0);

    expect(onStatus).toHaveBeenNthCalledWith(1, "connecting");
    expect(onStatus).toHaveBeenNthCalledWith(2, "open");
    expect(onStatus).toHaveBeenNthCalledWith(3, "stopped");

    // No further polling occurs once stopped, even if more time elapses.
    await vi.advanceTimersByTimeAsync(pollIntervalMs * 5);
    expect(fetchImpl.mock.calls.length).toBe(cycles + 1);
    expect(onStatus).toHaveBeenCalledTimes(3);

    add.mockRestore();
    remove.mockRestore();
  });

  it.each([
    { status: 401, reason: "unauthorized" },
    { status: 403, reason: "forbidden" },
  ] as const)(
    "stops permanently on HTTP $status",
    async ({ status, reason }) => {
      const fetchImpl = vi
        .fn<FetchStub>()
        .mockResolvedValue(emptyResponse(status));
      const onStop = vi.fn();

      const stop = makeClient(fetchImpl, "tok").streamPrompts(
        { onPrompt: vi.fn(), onStop },
        { timeZone: "UTC" },
      );

      await flushMicrotasks();
      stop();

      expect(onStop).toHaveBeenCalledWith(reason);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("stops immediately without polling when no token is available", async () => {
    const fetchImpl = vi.fn<FetchStub>();
    const onStop = vi.fn();

    makeClient(fetchImpl, undefined).streamPrompts(
      { onPrompt: vi.fn(), onStop },
      { timeZone: "UTC" },
    );
    await flushMicrotasks();

    expect(onStop).toHaveBeenCalledWith("unauthorized");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("WellnessClient prompt lifecycle", () => {
  it("returns the updated prompt on complete", async () => {
    const updated = { id: "p1", completedAt: "2026-01-01T00:00:00Z" };
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValue(jsonResponse(200, updated));

    await expect(makeClient(fetchImpl, "tok").complete("p1")).resolves.toEqual(
      updated,
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/v1/prompts/p1/complete",
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("resolves undefined when the prompt is missing", async () => {
    const fetchImpl = vi.fn<FetchStub>().mockResolvedValue(emptyResponse(404));
    await expect(
      makeClient(fetchImpl, "tok").dismiss("missing"),
    ).resolves.toBeUndefined();
  });

  it("resolves undefined when next has no prompt", async () => {
    const fetchImpl = vi.fn<FetchStub>().mockResolvedValue(emptyResponse(204));
    await expect(
      makeClient(fetchImpl, "tok").next("UTC"),
    ).resolves.toBeUndefined();
    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });

  it("throws when next returns 404 instead of treating it as an empty queue", async () => {
    const fetchImpl = vi.fn<FetchStub>().mockResolvedValue(emptyResponse(404));
    await expect(makeClient(fetchImpl, "tok").next("UTC")).rejects.toThrow(
      "Next prompt failed: HTTP 404",
    );
  });

  it("throws WellnessAuthError when there is no token", async () => {
    const fetchImpl = vi.fn<FetchStub>();
    await expect(
      makeClient(fetchImpl, undefined).complete("p1"),
    ).rejects.toBeInstanceOf(WellnessAuthError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends a bearer token on authenticated calls", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValue(jsonResponse(200, { id: "p1" }));

    await makeClient(fetchImpl, "tok").complete("p1");

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok");
  });

  it("posts a rating payload on feedback", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValue(jsonResponse(200, { id: "p1" }));

    await makeClient(fetchImpl, "tok").sendFeedback("p1", 5);

    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ rating: 5 }),
    );
  });
});

describe("WellnessClient.pollDeviceFlow", () => {
  it("maps 200 to success", async () => {
    const token = { accessToken: "jwt", tokenType: "Bearer" };
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValue(jsonResponse(200, token));

    await expect(makeClient(fetchImpl).pollDeviceFlow("s1")).resolves.toEqual({
      kind: "success",
      token,
    });
  });

  it("maps 202 to pending with Retry-After", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValue(emptyResponse(202, { "Retry-After": "5" }));

    await expect(makeClient(fetchImpl).pollDeviceFlow("s1")).resolves.toEqual({
      kind: "pending",
      retryAfterSeconds: 5,
    });
  });

  it("maps 429 to slowDown", async () => {
    const fetchImpl = vi
      .fn<FetchStub>()
      .mockResolvedValue(emptyResponse(429, { "Retry-After": "10" }));

    await expect(makeClient(fetchImpl).pollDeviceFlow("s1")).resolves.toEqual({
      kind: "slowDown",
      retryAfterSeconds: 10,
    });
  });

  it("maps non-success statuses to an error result", async () => {
    const fetchImpl = vi.fn<FetchStub>().mockResolvedValue(
      jsonResponse(410, {
        error: "expired_token",
        description: "gone",
      }),
    );

    await expect(makeClient(fetchImpl).pollDeviceFlow("s1")).resolves.toEqual({
      kind: "error",
      error: "expired_token",
      description: "gone",
    });
  });
});
