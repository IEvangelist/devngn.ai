// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

/**
 * The persisted wellness sign-in, stored as JSON in VS Code secret storage.
 * Never written to settings (which may sync or be committed).
 */
export interface StoredSession {
  readonly accessToken: string;
  readonly tokenType: string;
  /** ISO-8601 expiry from the API's `AccessTokenResponse.expiresAt`. */
  readonly expiresAt: string;
  readonly login?: string;
}

/**
 * Whether a stored session's token is still usable, accounting for a small clock
 * skew so we don't send a token that's about to expire mid-flight. An unparseable
 * expiry is treated as usable — we fall back to reacting to a real `401`.
 */
export function isSessionUsable(
  session: StoredSession,
  nowMs: number,
  skewMs = 30_000,
): boolean {
  const expiry = Date.parse(session.expiresAt);
  if (Number.isNaN(expiry)) {
    return true;
  }
  return expiry - skewMs > nowMs;
}
