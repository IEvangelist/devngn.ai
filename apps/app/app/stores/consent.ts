// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type {
  ConsentSnapshot,
  CurrentConsentText,
} from "@devngn/wellness-types";
import { WellnessAuthError } from "@devngn/wellness-client";

type ConsentError = "load" | "accept";

export const useConsentStore = defineStore("consent", () => {
  const auth = useAuthStore();
  const client = useApi();

  const accepted = ref<ConsentSnapshot | null>(null);
  const current = ref<CurrentConsentText | null>(null);
  const loading = ref(false);
  const accepting = ref(false);
  const error = ref<ConsentError | null>(null);
  let sessionRevision = 0;
  let loadRequestId = 0;

  const hasCurrentConsent = computed(
    () =>
      accepted.value !== null &&
      current.value !== null &&
      accepted.value.version === current.value.version,
  );

  async function load(): Promise<void> {
    const token = auth.token;
    if (!token) {
      reset();
      return;
    }

    const revision = sessionRevision;
    const requestId = ++loadRequestId;
    accepted.value = null;
    current.value = null;
    loading.value = true;
    error.value = null;
    try {
      const state = await client.getConsent();
      if (
        revision !== sessionRevision ||
        requestId !== loadRequestId ||
        auth.token !== token
      ) {
        return;
      }
      accepted.value = state.accepted;
      current.value = state.current;
    } catch (cause) {
      if (
        revision !== sessionRevision ||
        requestId !== loadRequestId ||
        auth.token !== token
      ) {
        return;
      }
      if (cause instanceof WellnessAuthError) {
        await auth.signOut();
        reset();
        return;
      }
      console.error("[consent] failed to load consent:", cause);
      error.value = "load";
    } finally {
      if (
        revision === sessionRevision &&
        requestId === loadRequestId
      ) {
        loading.value = false;
      }
    }
  }

  async function acceptCurrent(): Promise<void> {
    if (!current.value) {
      console.error("[consent] cannot accept before current consent is loaded");
      error.value = "load";
      return;
    }

    const token = auth.token;
    if (!token) {
      await auth.signOut();
      reset();
      return;
    }

    const revision = sessionRevision;
    const version = current.value.version;
    accepting.value = true;
    error.value = null;
    try {
      await client.acceptConsent(version);
      if (revision !== sessionRevision || auth.token !== token) {
        return;
      }
      await load();
    } catch (cause) {
      if (revision !== sessionRevision || auth.token !== token) {
        return;
      }
      accepted.value = null;
      if (cause instanceof WellnessAuthError) {
        await auth.signOut();
        reset();
        return;
      }
      console.error("[consent] failed to accept consent:", cause);
      error.value = "accept";
    } finally {
      if (revision === sessionRevision) {
        accepting.value = false;
      }
    }
  }

  function reset(): void {
    sessionRevision += 1;
    loadRequestId += 1;
    accepted.value = null;
    current.value = null;
    loading.value = false;
    accepting.value = false;
    error.value = null;
  }

  return {
    accepted,
    current,
    loading,
    accepting,
    error,
    hasCurrentConsent,
    load,
    acceptCurrent,
    reset,
  };
});
