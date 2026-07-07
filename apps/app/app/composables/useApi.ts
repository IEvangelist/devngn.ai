// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import { WellnessClient } from "@devngn/wellness-client";

/**
 * Returns a WellnessClient configured with the current runtime API base URL
 * and a token getter that reads lazily from the auth store.
 */
export function useApi(): WellnessClient {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBaseUrl as string;

  // Lazily resolve the auth store token at call time — avoids circular deps.
  const getToken = (): string | undefined => {
    try {
      const auth = useAuthStore();
      return auth.token;
    } catch {
      return undefined;
    }
  };

  return new WellnessClient({ baseUrl, getToken });
}

/**
 * Typed $fetch wrapper that injects the bearer token and the configured API
 * base URL. Use this for endpoints not covered by WellnessClient (e.g. goals,
 * activities, schedule) while @devngn/wellness-types provides response shapes.
 */
export function useApiFetch() {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBaseUrl as string;

  return async <T = unknown>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> => {
    let tokenVal: string | undefined;
    try {
      const auth = useAuthStore();
      tokenVal = auth.token;
    } catch {
      tokenVal = undefined;
    }

    const headers = new Headers(options.headers as HeadersInit | undefined);
    headers.set("Accept", "application/json");
    if (tokenVal) {
      headers.set("Authorization", `Bearer ${tokenVal}`);
    }

    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${path}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  };
}
