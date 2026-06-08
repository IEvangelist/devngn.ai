// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import type { PromptResponse } from "@devngn/wellness-types";
import type {
  StreamStatus,
  StreamStopReason,
  WellnessClient,
} from "@devngn/wellness-client";
import type { INotifier, NotificationMessage } from "./notifier.js";
import { toNumber } from "./util.js";

/** Why the daemon stopped: external interruption, `--once`, or an auth failure. */
export type DaemonStopReason = "aborted" | "once" | StreamStopReason;

/** Observability hooks for the daemon (wired to the console by the CLI command). */
export interface DaemonLogger {
  status(status: StreamStatus): void;
  prompt(message: NotificationMessage, prompt: PromptResponse): void;
  warn(error: unknown): void;
}

export interface DaemonOptions {
  readonly client: WellnessClient;
  readonly notifier: INotifier;
  readonly log: DaemonLogger;
  readonly timeZone: string;
  readonly channel?: string;
  /** Stops the daemon when aborted (wire this to SIGINT/SIGTERM). */
  readonly signal?: AbortSignal;
  /** Stop after the first delivered prompt (useful for tests/smoke). */
  readonly once?: boolean;
  /** How long a prompt id is suppressed from re-notifying. Default 10 min. */
  readonly dedupeTtlMs?: number;
}

export interface DaemonResult {
  readonly reason: DaemonStopReason;
}

/** Builds the OS-notification title/body for a delivered prompt. */
export function renderPromptNotification(
  prompt: PromptResponse,
): NotificationMessage {
  const seconds = toNumber(prompt.durationSeconds, 0);
  const meta = [
    seconds > 0 ? `~${seconds}s` : undefined,
    prompt.bodyArea,
    prompt.intensity,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" · ");
  const body = meta
    ? `${prompt.activityDescription}\n${meta}`
    : prompt.activityDescription;
  return { title: `Time to move: ${prompt.activityTitle}`, body };
}

/**
 * Subscribes to the wellness prompt stream and raises an OS notification for each
 * delivered prompt. Resolves on every terminal path — external abort, `--once`
 * after the first notification is attempted, or an auth stop (`unauthorized` /
 * `forbidden`) — always tearing down the underlying stream so no timers or readers
 * leak. Reconnect/replay duplicates of the same prompt id are suppressed.
 */
export function runWellnessDaemon(
  options: DaemonOptions,
): Promise<DaemonResult> {
  const { client, notifier, log, timeZone } = options;
  const channel = options.channel ?? "cli";
  const once = options.once ?? false;
  const dedupeTtlMs = options.dedupeTtlMs ?? 10 * 60 * 1000;
  const signal = options.signal;

  return new Promise<DaemonResult>((resolve) => {
    let settled = false;
    let consuming = false;
    let stop: () => void = () => undefined;
    const seen = new Map<string, number>();

    const finish = (reason: DaemonStopReason): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      stop();
      resolve({ reason });
    };

    const onAbort = (): void => finish("aborted");

    const handlePrompt = (prompt: PromptResponse): void => {
      if (settled || (once && consuming)) {
        return;
      }

      const now = Date.now();
      for (const [id, expiry] of seen) {
        if (expiry <= now) {
          seen.delete(id);
        }
      }
      if (seen.has(prompt.id)) {
        return;
      }
      seen.set(prompt.id, now + dedupeTtlMs);
      if (once) {
        consuming = true;
      }

      const message = renderPromptNotification(prompt);
      void (async () => {
        try {
          await notifier.notify(message);
          log.prompt(message, prompt);
        } catch (error) {
          log.warn(error);
        } finally {
          if (once) {
            finish("once");
          }
        }
      })();
    };

    stop = client.streamPrompts(
      {
        onPrompt: handlePrompt,
        onStatus: (status) => log.status(status),
        onStop: (reason: StreamStopReason) => finish(reason),
        onTransientError: (error) => log.warn(error),
      },
      { timeZone, channel },
    );

    if (signal) {
      if (signal.aborted) {
        finish("aborted");
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
  });
}
