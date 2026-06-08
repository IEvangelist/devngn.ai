// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import type { StoredSession, WellnessClient } from "@devngn/wellness-client";
import { abortableSleep, describeError, toNumber } from "./util.js";

/** Sink for the device-flow's human-facing instructions and errors. */
export interface SignInLogger {
  info(line: string): void;
  error(line: string): void;
}

export interface SignInDeps {
  readonly log: SignInLogger;
  readonly signal?: AbortSignal;
  /** Injectable clock for tests; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Injectable sleep for tests; defaults to an abortable timer. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Drives the GitHub device-authorization flow on a headless terminal: it starts a
 * session, prints the verification URL + user code, then polls (honoring the
 * server's interval / `slow_down` / `Retry-After` and the expiry deadline) until a
 * token is issued. Returns the session to persist, or `null` when the user aborts,
 * the flow errors, or it times out.
 */
export async function runDeviceFlowLogin(
  client: WellnessClient,
  deps: SignInDeps,
): Promise<StoredSession | null> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? abortableSleep;

  let start;
  try {
    start = await client.startDeviceFlow();
  } catch (error) {
    deps.log.error(`Could not start sign-in: ${describeError(error)}`);
    return null;
  }

  deps.log.info(
    `To sign in, open ${start.verificationUri} in your browser and enter code: ${start.userCode}`,
  );
  deps.log.info("Waiting for GitHub authorization…");

  let intervalMs = Math.max(1, toNumber(start.intervalSeconds, 5)) * 1000;
  const deadline =
    now() + Math.max(60, toNumber(start.expiresInSeconds, 300)) * 1000;

  while (now() < deadline) {
    if (deps.signal?.aborted) {
      return null;
    }
    await sleep(intervalMs, deps.signal);
    if (deps.signal?.aborted) {
      return null;
    }

    let result;
    try {
      result = await client.pollDeviceFlow(start.sessionId);
    } catch (error) {
      deps.log.error(`Sign-in failed: ${describeError(error)}`);
      return null;
    }

    switch (result.kind) {
      case "success":
        return {
          accessToken: result.token.accessToken,
          tokenType: result.token.tokenType,
          expiresAt: String(result.token.expiresAt),
          login: result.token.user?.login,
        };
      case "pending":
        if (result.retryAfterSeconds !== undefined) {
          intervalMs = result.retryAfterSeconds * 1000;
        }
        break;
      case "slowDown":
        intervalMs = (result.retryAfterSeconds ?? intervalMs / 1000 + 5) * 1000;
        break;
      case "error":
        deps.log.error(
          `Sign-in failed: ${result.error}${
            result.description ? ` (${result.description})` : ""
          }`,
        );
        return null;
    }
  }

  deps.log.error("Sign-in timed out. Please try again.");
  return null;
}
