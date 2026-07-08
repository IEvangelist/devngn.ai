// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type { PromptResponse } from "@devngn/wellness-types";
import type { StreamStatus } from "@devngn/wellness-client";
import { useInterruptionStream } from "~/composables/useInterruptionStream";

export type SnoozeEntry = { promptId: string; until: number };

export const useInterruptionsStore = defineStore("interruptions", () => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBaseUrl as string;
  const auth = useAuthStore();
  const toast = useToast();
  const { $i18n } = useNuxtApp();

  const prompts = ref<PromptResponse[]>([]);
  const streamStatus = ref<StreamStatus>("stopped");
  const snoozed = ref<SnoozeEntry[]>([]);

  const activePrompts = computed(() =>
    prompts.value.filter((p) => {
      if (p.completedAt || p.dismissedAt) return false;
      const snoozeEntry = snoozed.value.find((s) => s.promptId === p.id);
      if (snoozeEntry && Date.now() < snoozeEntry.until) return false;
      return true;
    }),
  );

  const { connect, disconnect, client } = useInterruptionStream(
    () => auth.token,
    baseUrl,
    {
      onPrompt(prompt) {
        const idx = prompts.value.findIndex((p) => p.id === prompt.id);
        if (idx >= 0) {
          prompts.value[idx] = prompt;
        } else {
          prompts.value.unshift(prompt);
        }
        _maybeFireNotification(prompt);
      },
      onStatus(s) {
        streamStatus.value = s;
      },
      onStop(reason) {
        streamStatus.value = "stopped";
        if (reason === "unauthorized") {
          toast.warning($i18n.t("common.sessionExpired"));
          void auth.signOut();
        }
      },
      onTransientError(err) {
        console.warn("[interruptions] stream error:", err);
      },
    },
  );

  async function _maybeFireNotification(prompt: PromptResponse): Promise<void> {
    if (!import.meta.client) return;
    const notif = useNotificationsStore();
    await notif.fireForPrompt(prompt);
  }

  function startStream(): void {
    if (!auth.isAuthenticated) return;
    connect();
  }

  function stopStream(): void {
    disconnect();
  }

  async function complete(id: string): Promise<void> {
    const updated = await client.complete(id);
    _applyUpdate(id, updated);
  }

  async function dismiss(id: string): Promise<void> {
    const updated = await client.dismiss(id);
    _applyUpdate(id, updated);
  }

  async function sendFeedback(id: string, rating: number): Promise<void> {
    const updated = await client.sendFeedback(id, rating);
    _applyUpdate(id, updated);
  }

  function snooze(id: string, minutes = 15): void {
    const until = Date.now() + minutes * 60 * 1000;
    const existing = snoozed.value.findIndex((s) => s.promptId === id);
    if (existing >= 0) {
      snoozed.value[existing]!.until = until;
    } else {
      snoozed.value.push({ promptId: id, until });
    }
    // Auto-clear snooze after it expires
    setTimeout(() => {
      snoozed.value = snoozed.value.filter((s) => s.promptId !== id);
    }, minutes * 60 * 1000);
  }

  function _applyUpdate(id: string, updated: PromptResponse | undefined): void {
    if (!updated) {
      prompts.value = prompts.value.filter((p) => p.id !== id);
      return;
    }
    const idx = prompts.value.findIndex((p) => p.id === id);
    if (idx >= 0) {
      prompts.value[idx] = updated;
    }
  }

  return {
    prompts,
    activePrompts,
    streamStatus,
    snoozed,
    startStream,
    stopStream,
    complete,
    dismiss,
    sendFeedback,
    snooze,
  };
});
