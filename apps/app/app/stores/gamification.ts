// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import type {
  BadgeResponse,
  LeaderboardEntry,
  MilestoneResponse,
  PlayerStateResponse,
} from "~/types/gamification";

export const useGamificationStore = defineStore("gamification", () => {
  const apiFetch = useApiFetch();

  const playerState = ref<PlayerStateResponse | null>(null);
  const badges = ref<BadgeResponse[]>([]);
  const milestones = ref<MilestoneResponse[]>([]);
  const leaderboard = ref<LeaderboardEntry[]>([]);

  const loadingPlayer = ref(false);
  const loadingBadges = ref(false);
  const loadingMilestones = ref(false);
  const loadingLeaderboard = ref(false);

  const errorPlayer = ref<string | null>(null);
  const errorBadges = ref<string | null>(null);
  const errorMilestones = ref<string | null>(null);
  const errorLeaderboard = ref<string | null>(null);

  const earnedBadges = computed(() => badges.value.filter((b: BadgeResponse) => b.earned));
  const lockedBadges = computed(() => badges.value.filter((b: BadgeResponse) => !b.earned));
  const completedMilestones = computed(() =>
    milestones.value.filter((m: MilestoneResponse) => m.achieved),
  );
  const xpPercent = computed(() => {
    if (!playerState.value) return 0;
    const into = Number(playerState.value.xpIntoLevel);
    const forNext = Number(playerState.value.xpForNextLevel);
    if (forNext <= 0) return 100;
    return Math.min(100, Math.round((into / forNext) * 100));
  });

  async function fetchPlayerState(): Promise<void> {
    loadingPlayer.value = true;
    errorPlayer.value = null;
    try {
      playerState.value = await apiFetch<PlayerStateResponse>("/v1/gamification/me");
    } catch (e) {
      errorPlayer.value = e instanceof Error ? e.message : "Failed to load player state.";
    } finally {
      loadingPlayer.value = false;
    }
  }

  async function fetchBadges(): Promise<void> {
    loadingBadges.value = true;
    errorBadges.value = null;
    try {
      badges.value = await apiFetch<BadgeResponse[]>("/v1/gamification/badges");
    } catch (e) {
      errorBadges.value = e instanceof Error ? e.message : "Failed to load badges.";
    } finally {
      loadingBadges.value = false;
    }
  }

  async function fetchMilestones(): Promise<void> {
    loadingMilestones.value = true;
    errorMilestones.value = null;
    try {
      milestones.value = await apiFetch<MilestoneResponse[]>("/v1/gamification/milestones");
    } catch (e) {
      errorMilestones.value = e instanceof Error ? e.message : "Failed to load milestones.";
    } finally {
      loadingMilestones.value = false;
    }
  }

  async function fetchLeaderboard(): Promise<void> {
    loadingLeaderboard.value = true;
    errorLeaderboard.value = null;
    try {
      leaderboard.value = await apiFetch<LeaderboardEntry[]>("/v1/gamification/leaderboard");
    } catch (e) {
      errorLeaderboard.value = e instanceof Error ? e.message : "Failed to load leaderboard.";
    } finally {
      loadingLeaderboard.value = false;
    }
  }

  async function fetchAll(): Promise<void> {
    await Promise.all([
      fetchPlayerState(),
      fetchBadges(),
      fetchMilestones(),
      fetchLeaderboard(),
    ]);
  }

  return {
    playerState,
    badges,
    milestones,
    leaderboard,
    loadingPlayer,
    loadingBadges,
    loadingMilestones,
    loadingLeaderboard,
    errorPlayer,
    errorBadges,
    errorMilestones,
    errorLeaderboard,
    earnedBadges,
    lockedBadges,
    completedMilestones,
    xpPercent,
    fetchPlayerState,
    fetchBadges,
    fetchMilestones,
    fetchLeaderboard,
    fetchAll,
  };
});
