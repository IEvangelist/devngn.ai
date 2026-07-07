// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

export const AUTH_CALLBACK_NONCE_KEY = "devngn_auth_callback_nonce";

export type AuthCallbackFragment =
  | {
      kind: "success";
      accessToken: string;
      tokenType?: string;
      expiresAt?: string;
    }
  | {
      kind: "error";
      error: string;
      errorDescription?: string;
    }
  | {
      kind: "missing-token";
    };

export function createAuthCallbackNonce(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildAuthCallbackReturnPath(nonce: string): string {
  return `/auth/callback?n=${encodeURIComponent(nonce)}`;
}

export function parseAuthCallbackFragment(hash: string): AuthCallbackFragment {
  const rawFragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(rawFragment);
  const error = params.get("error");

  if (error) {
    return {
      kind: "error",
      error,
      errorDescription: params.get("error_description") ?? undefined,
    };
  }

  const accessToken = params.get("access_token");
  if (!accessToken) {
    return { kind: "missing-token" };
  }

  return {
    kind: "success",
    accessToken,
    tokenType: params.get("token_type") ?? undefined,
    expiresAt: params.get("expires_at") ?? undefined,
  };
}

export function hasValidAuthCallbackNonce(
  search: string,
  storedNonce: string | null | undefined,
): boolean {
  const rawSearch = search.startsWith("?") ? search.slice(1) : search;
  const callbackNonce = new URLSearchParams(rawSearch).get("n");
  return !!storedNonce && !!callbackNonce && callbackNonce === storedNonce;
}
