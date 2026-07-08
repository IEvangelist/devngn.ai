<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Wave 2: bound to /v1/gamification/leaderboard via gamification store.
  Schema notes:
    - rank is derived from array position (server returns sorted by XP desc)
    - LeaderboardEntry has no avatarUrl / login / streak fields
    - isCurrentUser is determined by comparing userId to auth.user.id
-->
<template>
  <section class="page">
    <PageHeader :title="$t('leaderboard.title')" :intro="$t('leaderboard.intro')" />

    <!-- Loading -->
    <div v-if="loadingLeaderboard" class="state-msg" role="status" aria-live="polite">
      <span aria-hidden="true">⏳</span> {{ $t("leaderboard.loading") }}
    </div>

    <!-- Error -->
    <div v-else-if="errorLeaderboard" class="state-msg state-msg--error" role="alert">
      <span aria-hidden="true">⚠</span> {{ errorLeaderboard }}
      <BrutButton size="sm" variant="ghost" @click="store.fetchLeaderboard()">{{ $t("common.retry") }}</BrutButton>
    </div>

    <!-- Sign-in prompt -->
    <p v-else-if="!isAuthenticated" class="state-msg">
      {{ $t("leaderboard.signIn") }}
    </p>

    <!-- Empty -->
    <p v-else-if="entries.length === 0" class="state-msg">{{ $t("leaderboard.empty") }}</p>

    <template v-else>
      <div class="leaderboard__table-wrap">
        <table class="leaderboard__table" aria-label="Developer leaderboard">
          <thead>
            <tr>
              <th scope="col" class="col-rank">{{ $t("leaderboard.rankColumn") }}</th>
              <th scope="col" class="col-player">{{ $t("leaderboard.playerColumn") }}</th>
              <th scope="col" class="col-level">{{ $t("gamification.levelShort") }}</th>
              <th scope="col" class="col-tier">{{ $t("leaderboard.tierColumn") }}</th>
              <th scope="col" class="col-xp">{{ $t("leaderboard.xpColumn") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(entry, idx) in entries"
              :key="entry.userId"
              class="lb-row"
              :class="{
                'lb-row--you': entry.userId === authUserId,
                'lb-row--top3': idx < 3,
              }"
              :aria-current="entry.userId === authUserId ? 'true' : undefined"
            >
              <td class="col-rank">
                <span class="rank-badge">
                  {{ idx < 3 ? ["🥇", "🥈", "🥉"][idx] : `#${idx + 1}` }}
                </span>
              </td>
              <td class="col-player">
                <div class="player-cell">
                  <span class="player-initial" aria-hidden="true">
                    {{ entry.displayName?.charAt(0)?.toUpperCase() ?? "?" }}
                  </span>
                  <span class="player-name">
                    {{ entry.displayName }}
                    <BrutBadge v-if="entry.userId === authUserId" color="accent" size="sm">
                      {{ $t("leaderboard.you") }}
                    </BrutBadge>
                  </span>
                </div>
              </td>
              <td class="col-level">
                <BrutChip>{{ $t("gamification.level", { level: Number(entry.level) }) }}</BrutChip>
              </td>
              <td class="col-tier">
                <BrutChip :class="`tier-chip--${entry.rankTier.toLowerCase()}`">
                  {{ entry.rankTier }}
                </BrutChip>
              </td>
              <td class="col-xp">
                <strong>{{ Number(entry.totalXp).toLocaleString() }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { LeaderboardEntry } from "~/types/gamification";

const store = useGamificationStore();
const { leaderboard, loadingLeaderboard, errorLeaderboard } = storeToRefs(store);
const auth = useAuthStore();
const { isAuthenticated } = storeToRefs(auth);

const authUserId = computed(() => auth.user?.id ?? "");
const entries = computed<LeaderboardEntry[]>(() => leaderboard.value);

onMounted(() => store.fetchLeaderboard());
</script>

<style scoped>
.state-msg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.9rem;
}
.state-msg--error { color: var(--danger); }

.leaderboard__table-wrap {
  overflow-x: auto;
  margin-top: 1rem;
  border: var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.leaderboard__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
}
.leaderboard__table th,
.leaderboard__table td {
  padding: 0.65rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.leaderboard__table thead tr {
  background: var(--paper-2);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.lb-row { background: var(--surface-bg); }
.lb-row:last-child td { border-bottom: none; }
.lb-row--you { background: color-mix(in srgb, var(--accent) 10%, var(--surface-bg)); }
.lb-row--top3 { font-weight: 700; }
.rank-badge { font-size: 1.2rem; }
.player-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
/* Avatar initial fallback */
.player-initial {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border: var(--border);
  background: var(--paper-2);
  font-weight: 900;
  font-size: 0.8rem;
  flex: 0 0 auto;
}
.player-name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 700;
}
.col-rank  { width: 3.5rem; }
.col-xp    { text-align: right; }

/* Rank tier colour chips */
.tier-chip--bronze   { background: color-mix(in srgb, #cd7f32 20%, var(--surface-bg)); }
.tier-chip--silver   { background: color-mix(in srgb, #c0c0c0 20%, var(--surface-bg)); }
.tier-chip--gold     { background: color-mix(in srgb, #ffd700 20%, var(--surface-bg)); }
.tier-chip--platinum { background: color-mix(in srgb, #e5e4e2 20%, var(--surface-bg)); }
.tier-chip--diamond  { background: color-mix(in srgb, #b9f2ff 20%, var(--surface-bg)); }
.tier-chip--legend   { background: color-mix(in srgb, var(--accent-5) 20%, var(--surface-bg)); }
</style>
