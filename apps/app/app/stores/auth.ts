// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type { AuthenticatedUserResponse, DeviceFlowStartResponse } from "@devngn/wellness-types";
import { WellnessClient } from "@devngn/wellness-client";
import {
  AUTH_CALLBACK_NONCE_KEY,
  buildAuthCallbackReturnPath,
  createAuthCallbackNonce,
} from "~/utils/authCallback";

const TOKEN_KEY = "devngn_token";

export const useAuthStore = defineStore("auth", () => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBaseUrl as string;
  const isTauri = useTauri();

  const token = ref<string | undefined>(undefined);
  const user = ref<AuthenticatedUserResponse | undefined>(undefined);
  const isAuthenticated = computed(() => !!token.value && !!user.value);

  const deviceFlow = ref<{
    userCode: string;
    verificationUri: string;
    sessionId: string;
    intervalSeconds: number;
  } | null>(null);

  const isSigningIn = ref(false);
  const signInError = ref<string | undefined>(undefined);

  function _client() {
    return new WellnessClient({ baseUrl, getToken: () => token.value });
  }

  /** Restore a persisted token on app init. */
  async function init(): Promise<void> {
    if (isTauri) {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("devngn.json");
        const stored = await store.get<string>(TOKEN_KEY);
        if (stored) {
          token.value = stored;
          await refreshUser();
        }
      } catch (e) {
        console.warn("[auth] Tauri store init failed:", e);
      }
    } else {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        token.value = stored;
        await refreshUser();
      }
    }
  }

  async function _persistToken(t: string): Promise<void> {
    token.value = t;
    if (isTauri) {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("devngn.json");
        await store.set(TOKEN_KEY, t);
      } catch (e) {
        console.warn("[auth] Tauri store persist failed:", e);
        localStorage.setItem(TOKEN_KEY, t);
      }
    } else {
      localStorage.setItem(TOKEN_KEY, t);
    }
  }

  async function refreshUser(): Promise<void> {
    try {
      const me = await _client().me();
      user.value = me;
      if (!me) {
        token.value = undefined;
        await _clearToken();
      }
    } catch {
      user.value = undefined;
    }
  }

  async function _clearToken(): Promise<void> {
    token.value = undefined;
    user.value = undefined;
    if (isTauri) {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("devngn.json");
        await store.delete(TOKEN_KEY);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  /**
   * Desktop: GitHub device flow (opens browser, polls for approval).
   * Web/PWA: redirects to the API's /v1/auth/github/web/start endpoint.
   */
  async function signIn(): Promise<void> {
    signInError.value = undefined;
    isSigningIn.value = true;

    try {
      if (isTauri) {
        await _startDeviceFlow();
      } else {
        _startWebFlow();
      }
    } catch (e) {
      signInError.value = e instanceof Error ? e.message : "Sign-in failed.";
      isSigningIn.value = false;
    }
  }

  async function _startDeviceFlow(): Promise<void> {
    const client = _client();
    const flow: DeviceFlowStartResponse = await client.startDeviceFlow();

    deviceFlow.value = {
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      sessionId: flow.sessionId,
      intervalSeconds: Number(flow.intervalSeconds) ?? 5,
    };

    // Open the verification URL in the default browser (Tauri desktop).
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(flow.verificationUri);
    } catch {
      // Fallback: caller can display the URL
    }

    await _pollDeviceFlow(client, flow.sessionId, Number(flow.intervalSeconds) || 5);
  }

  async function _pollDeviceFlow(
    client: InstanceType<typeof WellnessClient>,
    sessionId: string,
    interval: number,
  ): Promise<void> {
    const wait = (s: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, s * 1000));

    while (isSigningIn.value) {
      await wait(interval);
      const result = await client.pollDeviceFlow(sessionId);

      if (result.kind === "success") {
        await _persistToken(result.token.accessToken);
        // The token response embeds the user; set it directly to avoid an extra round-trip.
        user.value = result.token.user;
        deviceFlow.value = null;
        isSigningIn.value = false;
        return;
      }
      if (result.kind === "error") {
        signInError.value = result.description ?? result.error;
        deviceFlow.value = null;
        isSigningIn.value = false;
        return;
      }
      if (result.kind === "slowDown") {
        interval = (result.retryAfterSeconds ?? interval) + 5;
      }
      // "pending" → keep polling
    }
  }

  /**
   * Development-only: sign in as a synthetic local user WITHOUT GitHub. Backed by the
   * API's `/v1/auth/dev/login` endpoint, which only exists in the Development
   * environment. Surfaced behind `import.meta.dev` in the UI so it never ships.
   */
  async function devSignIn(): Promise<void> {
    signInError.value = undefined;
    isSigningIn.value = true;
    try {
      const result = await _client().devLogin();
      await _persistToken(result.accessToken);
      // The response embeds the user; set it directly to avoid an extra round-trip.
      user.value = result.user;
    } catch (e) {
      signInError.value = e instanceof Error ? e.message : "Dev sign-in failed.";
    } finally {
      isSigningIn.value = false;
    }
  }

  function _startWebFlow(): void {
    const nonce = createAuthCallbackNonce();
    window.sessionStorage.setItem(AUTH_CALLBACK_NONCE_KEY, nonce);
    const returnPath = encodeURIComponent(buildAuthCallbackReturnPath(nonce));
    window.location.href = `${baseUrl.replace(/\/$/, "")}/v1/auth/github/web/start?returnPath=${returnPath}`;
  }

  /** Handle the OAuth callback (web flow) — called from the callback route or deep-link handler. */
  async function handleCallback(accessToken: string): Promise<void> {
    await _persistToken(accessToken);
    await refreshUser();
    isSigningIn.value = false;
  }

  async function signOut(): Promise<void> {
    await _clearToken();
  }

  return {
    token,
    user,
    isAuthenticated,
    isSigningIn,
    signInError,
    deviceFlow,
    init,
    signIn,
    devSignIn,
    signOut,
    handleCallback,
    refreshUser,
  };
});
