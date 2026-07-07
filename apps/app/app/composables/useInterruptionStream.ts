// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import { WellnessClient } from "@devngn/wellness-client";
import type { StreamHandlers, StreamOptions, StreamStatus } from "@devngn/wellness-client";

export type { StreamStatus };

/**
 * Composable that manages the SSE prompt stream lifecycle.
 * Creates a WellnessClient instance, connects to /v1/prompts/stream, and
 * exposes status + stop handle to the caller. The interruptions store owns
 * the prompt list; this composable wires the transport layer to it.
 */
export function useInterruptionStream(
  getToken: () => string | undefined,
  baseUrl: string,
  handlers: Omit<StreamHandlers, "onStatus" | "onStop"> & {
    onStatus?: (s: StreamStatus) => void;
    onStop?: (reason: "unauthorized" | "forbidden") => void;
  },
) {
  const status = ref<StreamStatus>("connecting");
  let stopFn: (() => void) | null = null;

  const client = new WellnessClient({ baseUrl, getToken });

  function connect(): void {
    if (stopFn) return;

    const options: StreamOptions = {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      channel: "app",
    };

    stopFn = client.streamPrompts(
      {
        onPrompt: handlers.onPrompt,
        onStatus: (s) => {
          status.value = s;
          handlers.onStatus?.(s);
        },
        onStop: (reason) => {
          status.value = "stopped";
          handlers.onStop?.(reason);
          stopFn = null;
        },
        onTransientError: handlers.onTransientError,
      },
      options,
    );
  }

  function disconnect(): void {
    stopFn?.();
    stopFn = null;
    status.value = "stopped";
  }

  return { status: readonly(status), connect, disconnect, client };
}
