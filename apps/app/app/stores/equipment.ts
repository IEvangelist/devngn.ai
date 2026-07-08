// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type {
  CreateEquipmentRequest,
  EquipmentResponse,
  UpdateEquipmentRequest,
} from "~/types/wellness";

/**
 * Equipment store — the gear you have on hand (a chair, a resistance band, a
 * pull-up bar). Each item's `tag` is the matching key: the engine only ever
 * suggests an activity whose required equipment tags are a subset of yours, so
 * registering equipment literally unlocks more (and better-fitting) nudges.
 */
export const useEquipmentStore = defineStore("equipment", () => {
  const apiFetch = useApiFetch();

  const items = ref<EquipmentResponse[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const loaded = ref(false);

  /** Lower-cased tag set — the exact shape the matcher compares against. */
  const tags = computed(() => items.value.map((e) => e.tag));

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      items.value = await apiFetch<EquipmentResponse[]>("/v1/equipment");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load your equipment.";
    } finally {
      loaded.value = true;
      loading.value = false;
    }
  }

  async function create(request: CreateEquipmentRequest): Promise<boolean> {
    saving.value = true;
    error.value = null;
    try {
      const created = await apiFetch<EquipmentResponse>("/v1/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      items.value = [...items.value, created];
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to add equipment.";
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, request: UpdateEquipmentRequest): Promise<boolean> {
    saving.value = true;
    error.value = null;
    try {
      const updated = await apiFetch<EquipmentResponse>(`/v1/equipment/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      items.value = items.value.map((e) => (e.id === id ? updated : e));
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to update equipment.";
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function remove(id: string): Promise<boolean> {
    error.value = null;
    try {
      await apiFetch<void>(`/v1/equipment/${id}`, { method: "DELETE" });
      items.value = items.value.filter((e) => e.id !== id);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to remove equipment.";
      return false;
    }
  }

  return {
    items,
    loading,
    saving,
    error,
    loaded,
    tags,
    fetch,
    create,
    update,
    remove,
  };
});
