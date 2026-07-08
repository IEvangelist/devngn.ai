// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type {
  ActivityResponse,
  ForecastItem,
  GapResponse,
  GoalCategory,
  GoalResponse,
} from "~/types/wellness";

/** How far ahead the forecast looks, in hours. */
const FORECAST_HORIZON_HOURS = 48;

/**
 * Interruption forecast store — the "what's coming" view. It pulls your upcoming
 * free-time gaps, the public activity catalog, your profile, and your goals,
 * then previews the activity the engine will most likely deliver into each gap
 * using the client-side matcher mirror. Some upcoming slots are intentionally
 * kept a surprise so the nudge still feels like a gift.
 *
 * All of this is derived read-only data — nothing here mutates server state.
 */
export const useForecastStore = defineStore("forecast", () => {
  const apiFetch = useApiFetch();
  const profileStore = useProfileStore();
  const equipmentStore = useEquipmentStore();

  const gaps = ref<GapResponse[]>([]);
  const catalog = ref<ActivityResponse[]>([]);
  const goalCategories = ref<GoalCategory[]>([]);

  const loading = ref(false);
  const error = ref<string | null>(null);
  const loaded = ref(false);

  const items = computed<ForecastItem[]>(() => {
    const tags = equipmentStore.tags;
    const ctx = {
      preferredIntensity: profileStore.profile?.preferredIntensity ?? null,
      fitnessBaseline: profileStore.profile?.fitnessBaseline ?? null,
      goalCategories: goalCategories.value,
    };

    return gaps.value.map((gap, index): ForecastItem => {
      const surprise = isSurpriseGap(gap.startUtc, index);
      const activity = surprise
        ? null
        : predictActivity(Number(gap.durationMinutes) * 60, catalog.value, tags, ctx);
      return { gap, activity, isSurprise: surprise };
    });
  });

  const hasGaps = computed(() => gaps.value.length > 0);

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;

    const now = new Date();
    const to = new Date(now.getTime() + FORECAST_HORIZON_HOURS * 60 * 60 * 1000);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const gapsQuery =
      `/v1/gaps?from=${encodeURIComponent(now.toISOString())}` +
      `&to=${encodeURIComponent(to.toISOString())}` +
      `&tz=${encodeURIComponent(tz)}`;

    try {
      // Ensure the scoring inputs are present, then fetch the forecast sources.
      const ensures: Promise<unknown>[] = [];
      if (!profileStore.loaded) ensures.push(profileStore.fetch());
      if (!equipmentStore.loaded) ensures.push(equipmentStore.fetch());
      await Promise.all(ensures);

      const [gapsResult, catalogResult, goalsResult] = await Promise.all([
        apiFetch<GapResponse[]>(gapsQuery),
        apiFetch<ActivityResponse[]>("/v1/activities"),
        apiFetch<GoalResponse[]>("/v1/goals").catch(() => [] as GoalResponse[]),
      ]);

      gaps.value = gapsResult ?? [];
      catalog.value = catalogResult ?? [];
      goalCategories.value = Array.from(
        new Set((goalsResult ?? []).map((g) => g.category).filter(Boolean) as GoalCategory[]),
      );
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load your forecast.";
    } finally {
      loaded.value = true;
      loading.value = false;
    }
  }

  return {
    gaps,
    catalog,
    goalCategories,
    loading,
    error,
    loaded,
    items,
    hasGaps,
    fetch,
  };
});
