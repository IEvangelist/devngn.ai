// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type { ProfileResponse, UpsertProfileRequest } from "~/types/wellness";

/**
 * Personal profile store — backs the "personal setup" experience. The profile
 * is what teaches the interruption engine who you are (intensity you like, how
 * active you are, physical limitations), so it directly shapes every nudge.
 *
 * `GET /v1/profile` 404s until the user saves one; that's treated as "empty",
 * not an error.
 */
export const useProfileStore = defineStore("profile", () => {
  const apiFetch = useApiFetch();

  const profile = ref<ProfileResponse | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const loaded = ref(false);

  const hasProfile = computed(() => profile.value !== null);

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      // 404 (no profile yet) is surfaced by useApiFetch as a thrown error; we
      // treat that specific case as an empty profile rather than a failure.
      profile.value = await apiFetch<ProfileResponse>("/v1/profile");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("404")) {
        profile.value = null;
      } else {
        error.value = msg || "Failed to load your profile.";
      }
    } finally {
      loaded.value = true;
      loading.value = false;
    }
  }

  async function save(request: UpsertProfileRequest): Promise<boolean> {
    saving.value = true;
    error.value = null;
    try {
      profile.value = await apiFetch<ProfileResponse>("/v1/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to save your profile.";
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    profile,
    loading,
    saving,
    error,
    loaded,
    hasProfile,
    fetch,
    save,
  };
});
