// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import type {
  AccessTokenResponse,
  AuthenticatedUserResponse,
  DeviceFlowStartResponse,
  PromptResponse,
} from "@devngn/wellness-types";
import { SseDecoder } from "./sse.js";

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
  /**
   * Abort + reconnect if no bytes (data OR heartbeat) arrive within this window.
   * Guards against a half-open connection that never resolves a read. Default 90s.
   */
  readonly heartbeatTimeoutMs?: number;
  /** Upper bound on reconnect backoff. Default 30s. */
  readonly backoffCapMs?: number;
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
  /** API origin, e.g. `http://localhost:5000`. */
  readonly baseUrl: string;
  /** Returns the current bearer token, or `undefined` when signed out / expired. */
  readonly getToken: () => string | undefined;
  /** Injectable `fetch` for tests; defaults to the global. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Thin, dependency-free HTTP client for the devngn.ai Wellness API. Owns the
 * Server-Sent Events subscription (with auth-aware reconnect and a dead-connection
 * watchdog) plus the prompt-lifecycle and GitHub device-flow REST calls. All typing
 * flows from the generated `@devngn/wellness-types` package.
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
  // Streaming

  /**
   * Subscribes to `GET /v1/prompts/stream`. Returns a function that stops the
   * subscription — aborting any in-flight request, cancelling a pending reconnect
   * sleep, and guaranteeing no further reconnects. Transient failures reconnect
   * with capped exponential backoff; `401`/`403` stop permanently via
   * {@link StreamHandlers.onStop}.
   */
  streamPrompts(handlers: StreamHandlers, options: StreamOptions): () => void {
    const controller = new AbortController();
    const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 90_000;
    const backoffCapMs = options.backoffCapMs ?? 30_000;
    let stopped = false;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;

    const abortableSleep = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (stopped) {
          resolve();
          return;
        }
        sleepTimer = setTimeout(resolve, ms);
        controller.signal.addEventListener(
          "abort",
          () => {
            if (sleepTimer !== undefined) {
              clearTimeout(sleepTimer);
              sleepTimer = undefined;
            }
            resolve();
          },
          { once: true },
        );
      });

    const run = async (): Promise<void> => {
      let attempt = 0;
      while (!stopped) {
        try {
          handlers.onStatus?.(attempt === 0 ? "connecting" : "reconnecting");

          const token = this.getToken();
          if (token === undefined) {
            handlers.onStop?.("unauthorized");
            return;
          }

          const url = this.url("/v1/prompts/stream", {
            channel: options.channel ?? "vscode",
            tz: options.timeZone,
          });
          const response = await this.fetchImpl(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "text/event-stream",
            },
            signal: controller.signal,
          });

          if (response.status === 401) {
            handlers.onStop?.("unauthorized");
            return;
          }
          if (response.status === 403) {
            handlers.onStop?.("forbidden");
            return;
          }
          if (!response.ok || response.body === null) {
            throw new Error(`Prompt stream failed: HTTP ${response.status}`);
          }

          handlers.onStatus?.("open");
          attempt = 0;
          await this.readStream(
            response.body,
            controller.signal,
            heartbeatTimeoutMs,
            handlers.onPrompt,
          );
          // A normal end of stream (server closed / watchdog cancelled) falls
          // through to the reconnect backoff below.
        } catch (error) {
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

  /**
   * Drains a response body as SSE, invoking `onPrompt` for each `prompt` event.
   * A watchdog cancels the reader (ending the loop so the caller can reconnect)
   * if no bytes arrive within `heartbeatTimeoutMs`; it is reset on every read,
   * including heartbeat comments.
   */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    heartbeatTimeoutMs: number,
    onPrompt: (prompt: PromptResponse) => void,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const sse = new SseDecoder();
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const armWatchdog = (): void => {
      if (heartbeatTimeoutMs <= 0) {
        return;
      }
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
      }
      watchdog = setTimeout(() => {
        reader.cancel().catch(() => undefined);
      }, heartbeatTimeoutMs);
    };

    // Cancelling the reader resolves any pending read() with done=true, so an
    // abort unwinds the loop even for body streams that don't observe the signal.
    const onAbort = (): void => {
      reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      armWatchdog();
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        armWatchdog();

        const text = decoder.decode(value, { stream: true });
        for (const event of sse.push(text)) {
          if (event.event !== "prompt" || event.data === "") {
            continue;
          }
          let prompt: PromptResponse;
          try {
            prompt = JSON.parse(event.data) as PromptResponse;
          } catch {
            continue;
          }
          onPrompt(prompt);
        }
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
      }
      reader.releaseLock();
    }
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
      { method: "POST" },
    );
    if (response.status === 204 || response.status === 404) {
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
  async devLogin(
    identity?: { login?: string; displayName?: string },
  ): Promise<AccessTokenResponse> {
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

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
