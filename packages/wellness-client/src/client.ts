// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import type {
  AccessTokenResponse,
  AuthenticatedUserResponse,
  DeviceFlowStartResponse,
  PromptResponse,
} from "@devngn/wellness-types";

/** Reason a long-lived stream stopped without the caller asking it to. */
export type StreamStopReason = "unauthorized" | "forbidden";

/** Connection state surfaced to the UI for the status bar / output channel. */
export type StreamStatus = "connecting" | "open" | "reconnecting" | "stopped";

export interface StreamHandlers {
  /** A prompt was delivered. May be called many times over the connection's life. */
  onPrompt(prompt: PromptResponse): void;
  /** Connection state changed. */
  onStatus?(status: StreamStatus): void;
  /**
   * The stream stopped and will NOT reconnect because the failure is not
   * transient: `unauthorized` (sign in again) or `forbidden` (accept consent).
   */
  onStop?(reason: StreamStopReason): void;
  /** A transient network/server failure occurred; a reconnect is scheduled. */
  onTransientError?(error: unknown): void;
}

export interface StreamOptions {
  /** IANA time zone passed to the API so gap windows respect the user's day. */
  readonly timeZone: string;
  /** Delivery channel query value; defaults to `vscode`. */
  readonly channel?: string;
  /** Milliseconds between successful empty polls. Default 15 minutes. */
  readonly pollIntervalMs?: number;
  /** Per-request timeout for a prompt poll. Default 30 seconds. */
  readonly requestTimeoutMs?: number;
  /** Upper bound on reconnect backoff after transient failures. Default 30s. */
  readonly backoffCapMs?: number;
  /**
   * @deprecated Use {@link pollIntervalMs}. Retained for compatibility with
   * callers that configured the former SSE heartbeat watchdog.
   */
  readonly heartbeatTimeoutMs?: number;
}

/** Result of a single device-flow poll, normalized from the API's status codes. */
export type DevicePollResult =
  | { readonly kind: "success"; readonly token: AccessTokenResponse }
  | { readonly kind: "pending"; readonly retryAfterSeconds?: number }
  | { readonly kind: "slowDown"; readonly retryAfterSeconds?: number }
  | {
      readonly kind: "error";
      readonly error: string;
      readonly description?: string;
    };

/** Thrown by the REST helpers when no usable bearer token is available. */
export class WellnessAuthError extends Error {
  constructor(message = "Not signed in to the wellness service.") {
    super(message);
    this.name = "WellnessAuthError";
  }
}

export interface WellnessClientConfig {
  /** API origin, e.g. `https://devngn.ai`. */
  readonly baseUrl: string;
  /** Returns the current bearer token, or `undefined` when signed out / expired. */
  readonly getToken: () => string | undefined;
  /** Injectable `fetch` for tests; defaults to the global. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Thin, dependency-free HTTP client for the devngn.ai Wellness API. Owns the
 * polling-based prompt subscription (with auth-aware reconnect and capped
 * exponential backoff) plus the prompt-lifecycle and GitHub device-flow REST
 * calls. All typing flows from the generated `@devngn/wellness-types` package.
 */
export class WellnessClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: WellnessClientConfig) {
    this.baseUrl = config.baseUrl;
    this.getToken = config.getToken;
    // The global `fetch` must be invoked with `this` bound to the realm's global
    // object; storing a bare reference and calling `this.fetchImpl(...)` would run it
    // with `this === WellnessClient`, which browsers reject with
    // "Failed to execute 'fetch' on 'Window': Illegal invocation". Bind the default.
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis);
  }

  // -----------------------------------------------------------------------
  // Streaming (polling transport)

  /**
   * Polls `POST /v1/prompts/next` on a recurring schedule, surfacing each new
   * prompt via {@link StreamHandlers.onPrompt}. Returns a stop function that
   * cancels any in-flight request, clears the pending sleep, and guarantees no
   * further polls. Transient failures reconnect with capped exponential backoff;
   * `401`/`403` stop permanently via {@link StreamHandlers.onStop}.
   *
   * The same pending prompt is deduplicated within a session: consecutive polls
   * that return the same prompt ID (before the user acts on it) are suppressed.
   * The dedup state resets on a 204 response (no pending prompt), ensuring the
   * next arriving prompt is always surfaced.
   */
  streamPrompts(handlers: StreamHandlers, options: StreamOptions): () => void {
    const controller = new AbortController();
    const pollIntervalMs = Math.max(
      1,
      options.pollIntervalMs ?? options.heartbeatTimeoutMs ?? 15 * 60_000,
    );
    const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 30_000);
    const backoffCapMs = Math.max(1, options.backoffCapMs ?? 30_000);
    let stopped = false;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;

    const abortableSleep = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (stopped || controller.signal.aborted) {
          resolve();
          return;
        }

        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settle = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          if (timer !== undefined) {
            clearTimeout(timer);
            if (sleepTimer === timer) {
              sleepTimer = undefined;
            }
          }
          controller.signal.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = (): void => {
          settle();
        };

        controller.signal.addEventListener("abort", onAbort, { once: true });
        if (controller.signal.aborted) {
          settle();
          return;
        }
        timer = setTimeout(settle, ms);
        sleepTimer = timer;
      });

    const run = async (): Promise<void> => {
      let attempt = 0;
      // Tracks the most recently delivered prompt ID so consecutive polls that
      // return the same pending prompt do not call onPrompt redundantly.
      // Reset when the server returns 204 (prompt was handled elsewhere).
      let lastPromptId: string | undefined;
      // Tracks whether we have reached "open" state so that repeated successful
      // polls do not re-emit "connecting"/"open" on every cycle.
      let isOpen = false;
      let requestId = createRequestId();

      while (!stopped) {
        try {
          if (!isOpen) {
            handlers.onStatus?.(attempt === 0 ? "connecting" : "reconnecting");
          }

          const token = this.getToken();
          if (token === undefined) {
            handlers.onStop?.("unauthorized");
            return;
          }

          const url = this.url("/v1/prompts/next", {
            channel: options.channel ?? "vscode",
            tz: options.timeZone,
          });
          const response = await fetchWithTimeout(
            this.fetchImpl,
            url,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "Idempotency-Key": requestId,
              },
            },
            controller.signal,
            requestTimeoutMs,
          );
          if (response.status === 401) {
            handlers.onStop?.("unauthorized");
            return;
          }
          if (response.status === 403) {
            handlers.onStop?.("forbidden");
            return;
          }

          if (response.status === 204) {
            if (!isOpen) {
              handlers.onStatus?.("open");
              isOpen = true;
            }
            attempt = 0;
            requestId = createRequestId();
            lastPromptId = undefined;
            const retryAfterSeconds = parseRetryAfter(
              response.headers.get("Retry-After"),
            );
            await abortableSleep(
              retryAfterSeconds === undefined
                ? pollIntervalMs
                : Math.max(1, retryAfterSeconds * 1_000),
            );
            continue;
          }

          if (!response.ok) {
            throw new Error(`Prompt poll failed: HTTP ${response.status}`);
          }

          const prompt = (await response.json()) as PromptResponse;
          if (!isOpen) {
            handlers.onStatus?.("open");
            isOpen = true;
          }
          attempt = 0;
          requestId = createRequestId();
          // Suppress re-delivery of the same pending prompt across polls.
          if (prompt.id !== lastPromptId) {
            lastPromptId = prompt.id;
            handlers.onPrompt(prompt);
          }
          const retryAfterSeconds = parseRetryAfter(
            response.headers.get("Retry-After"),
          );
          await abortableSleep(
            retryAfterSeconds === undefined
              ? pollIntervalMs
              : Math.max(1, retryAfterSeconds * 1_000),
          );
          continue;
        } catch (error) {
          isOpen = false;
          if (stopped || controller.signal.aborted) {
            break;
          }
          handlers.onTransientError?.(error);
        }

        if (stopped) {
          break;
        }
        attempt += 1;
        const backoff = Math.min(
          backoffCapMs,
          1_000 * 2 ** Math.min(attempt, 5),
        );
        await abortableSleep(backoff);
      }

      handlers.onStatus?.("stopped");
    };

    // Defer the loop so the caller has the returned stop handle assigned before
    // any onStatus/onStop callback can fire — eliminating sync-callback races.
    queueMicrotask(() => void run());

    return () => {
      if (stopped) {
        return;
      }
      stopped = true;
      if (sleepTimer !== undefined) {
        clearTimeout(sleepTimer);
        sleepTimer = undefined;
      }
      controller.abort();
    };
  }

  // -----------------------------------------------------------------------
  // Prompt lifecycle (authenticated)

  /** `POST /v1/prompts/{id}/complete`; resolves `undefined` on 404. */
  complete(id: string): Promise<PromptResponse | undefined> {
    return this.mutatePrompt(`/v1/prompts/${encodeURIComponent(id)}/complete`);
  }

  /** `POST /v1/prompts/{id}/dismiss`; resolves `undefined` on 404. */
  dismiss(id: string): Promise<PromptResponse | undefined> {
    return this.mutatePrompt(`/v1/prompts/${encodeURIComponent(id)}/dismiss`);
  }

  /** `POST /v1/prompts/{id}/feedback`; resolves `undefined` on 404. */
  sendFeedback(
    id: string,
    rating: number,
  ): Promise<PromptResponse | undefined> {
    return this.mutatePrompt(`/v1/prompts/${encodeURIComponent(id)}/feedback`, {
      rating,
    });
  }

  /** `POST /v1/prompts/next`; resolves `undefined` when there is no prompt (204). */
  async next(
    timeZone: string,
    channel = "vscode",
  ): Promise<PromptResponse | undefined> {
    const response = await this.authedFetch(
      this.url("/v1/prompts/next", { channel, tz: timeZone }),
      {
        method: "POST",
        headers: { "Idempotency-Key": createRequestId() },
      },
    );
    if (response.status === 204) {
      return undefined;
    }
    if (response.status === 401) {
      throw new WellnessAuthError("The wellness session has expired.");
    }
    if (!response.ok) {
      throw new Error(`Next prompt failed: HTTP ${response.status}`);
    }
    return (await response.json()) as PromptResponse;
  }

  /** `GET /v1/auth/me`; resolves `undefined` on 401/404 so callers can detect sign-out. */
  async me(): Promise<AuthenticatedUserResponse | undefined> {
    const response = await this.authedFetch(this.url("/v1/auth/me"), {
      method: "GET",
    });
    if (response.status === 401 || response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Identity check failed: HTTP ${response.status}`);
    }
    return (await response.json()) as AuthenticatedUserResponse;
  }

  private async mutatePrompt(
    path: string,
    body?: unknown,
  ): Promise<PromptResponse | undefined> {
    const init: RequestInit = { method: "POST" };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const response = await this.authedFetch(this.url(path), init);
    if (response.status === 404) {
      return undefined;
    }
    if (response.status === 401) {
      throw new WellnessAuthError("The wellness session has expired.");
    }
    if (!response.ok) {
      throw new Error(`Prompt update failed: HTTP ${response.status}`);
    }
    return (await response.json()) as PromptResponse;
  }

  // -----------------------------------------------------------------------
  // GitHub device flow (anonymous)

  /** `POST /v1/auth/github/device` — begins a device-authorization session. */
  async startDeviceFlow(): Promise<DeviceFlowStartResponse> {
    const response = await this.fetchImpl(this.url("/v1/auth/github/device"), {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Device flow start failed: HTTP ${response.status}`);
    }
    return (await response.json()) as DeviceFlowStartResponse;
  }

  /**
   * `POST /v1/auth/dev/login` — development-only sign-in that bypasses GitHub and
   * returns a first-party token for a synthetic local user. The endpoint only exists
   * when the API runs in the Development environment; a 404 here means it's disabled.
   */
  async devLogin(identity?: {
    login?: string;
    displayName?: string;
  }): Promise<AccessTokenResponse> {
    const response = await this.fetchImpl(this.url("/v1/auth/dev/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identity ?? {}),
    });
    if (response.status === 404) {
      throw new Error(
        "Dev sign-in is unavailable — the API is not running in Development mode.",
      );
    }
    if (!response.ok) {
      throw new Error(`Dev sign-in failed: HTTP ${response.status}`);
    }
    return (await response.json()) as AccessTokenResponse;
  }

  /** `POST /v1/auth/github/device/poll` — one poll tick, normalized to a result union. */
  async pollDeviceFlow(sessionId: string): Promise<DevicePollResult> {
    const response = await this.fetchImpl(
      this.url("/v1/auth/github/device/poll"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      },
    );

    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));

    if (response.status === 200) {
      return {
        kind: "success",
        token: (await response.json()) as AccessTokenResponse,
      };
    }
    if (response.status === 202) {
      return { kind: "pending", retryAfterSeconds: retryAfter };
    }
    if (response.status === 429) {
      return { kind: "slowDown", retryAfterSeconds: retryAfter };
    }

    let error = `http_${response.status}`;
    let description: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: string;
        description?: string;
      };
      if (typeof body.error === "string") {
        error = body.error;
      }
      if (typeof body.description === "string") {
        description = body.description;
      }
    } catch {
      // Non-JSON error body; keep the status-derived code.
    }
    return { kind: "error", error, description };
  }

  // -----------------------------------------------------------------------
  // Helpers

  private async authedFetch(url: string, init: RequestInit): Promise<Response> {
    const token = this.getToken();
    if (token === undefined) {
      throw new WellnessAuthError();
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return this.fetchImpl(url, { ...init, headers });
  }

  private url(path: string, query?: Record<string, string>): string {
    const url = new URL(path, ensureTrailingSlash(this.baseUrl));
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  parentSignal: AbortSignal,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const abortFromParent = (): void => {
    controller.abort(parentSignal.reason);
  };

  if (parentSignal.aborted) {
    abortFromParent();
  } else {
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(
        `Prompt poll timed out after ${timeoutMs}ms.`,
        "TimeoutError",
      ),
    );
  }, timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
