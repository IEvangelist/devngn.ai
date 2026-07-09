<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Wave 2: bound to /v1/gamification/leaderboard via gamification store.
  Schema notes:
    - rank is derived from array position (server returns sorted by XP desc)
    - LeaderboardEntry has no avatarUrl / login / streak fields
    - isCurrentUser is determined by comparing userId to auth.user.id
  Presented as a top-three podium plus a clean standings list rather than a
  flat data table, so momentum reads as a competition, not a spreadsheet.
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
      <!-- Podium: the top three -->
      <section class="lb-podium reveal reveal--0" :aria-label="$t('leaderboard.podiumLabel')">
        <span class="section-label lb-podium__label">{{ $t("leaderboard.podiumLabel") }}</span>
        <ol class="lb-podium__grid" :data-count="podium.length">
          <li
            v-for="(entry, idx) in podium"
            :key="entry.userId"
            class="podium-card"
            :class="[
              `is-place-${idx + 1}`,
              { 'podium-card--you': entry.userId === authUserId },
            ]"
            :aria-current="entry.userId === authUserId ? 'true' : undefined"
          >
            <span class="podium-card__medal" aria-hidden="true">{{ medals[idx] }}</span>
            <span class="podium-card__avatar" aria-hidden="true">
              {{ entry.displayName?.charAt(0)?.toUpperCase() ?? "?" }}
            </span>
            <span class="podium-card__name">
              {{ entry.displayName }}
              <BrutBadge v-if="entry.userId === authUserId" color="accent" size="sm">
                {{ $t("leaderboard.you") }}
              </BrutBadge>
            </span>
            <span class="podium-card__meta">
              <BrutChip :class="`tier-chip--${entry.rankTier.toLowerCase()}`">
                {{ entry.rankTier }}
              </BrutChip>
              <span class="podium-card__level">
                {{ $t("gamification.level", { level: Number(entry.level) }) }}
              </span>
            </span>
            <span class="podium-card__xp">
              <strong>{{ Number(entry.totalXp).toLocaleString() }}</strong>
              <span class="podium-card__xp-unit">{{ $t("leaderboard.xpColumn") }}</span>
            </span>
          </li>
        </ol>
      </section>

      <!-- Standings: everyone below the podium -->
      <section v-if="standings.length" class="lb-standings reveal reveal--1" :aria-label="$t('leaderboard.standingsLabel')">
        <span class="section-label">{{ $t("leaderboard.standingsLabel") }}</span>
        <ol class="lb-standings__list">
          <li
            v-for="(entry, idx) in standings"
            :key="entry.userId"
            class="lb-row"
            :class="{ 'lb-row--you': entry.userId === authUserId }"
            :style="{ '--i': idx }"
            :aria-current="entry.userId === authUserId ? 'true' : undefined"
          >
            <span class="lb-row__rank">#{{ idx + 4 }}</span>
            <span class="lb-row__avatar" aria-hidden="true">
              {{ entry.displayName?.charAt(0)?.toUpperCase() ?? "?" }}
            </span>
            <span class="lb-row__name">
              {{ entry.displayName }}
              <BrutBadge v-if="entry.userId === authUserId" color="accent" size="sm">
                {{ $t("leaderboard.you") }}
              </BrutBadge>
            </span>
            <BrutChip class="lb-row__tier" :class="`tier-chip--${entry.rankTier.toLowerCase()}`">
              {{ entry.rankTier }}
            </BrutChip>
            <span class="lb-row__level">
              {{ $t("gamification.level", { level: Number(entry.level) }) }}
            </span>
            <span class="lb-row__xp">
              <strong>{{ Number(entry.totalXp).toLocaleString() }}</strong>
              <span class="lb-row__xp-unit">{{ $t("leaderboard.xpColumn") }}</span>
            </span>
          </li>
        </ol>
      </section>
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

const medals = ["🥇", "🥈", "🥉"];
const podium = computed(() => entries.value.slice(0, 3));
const standings = computed(() => entries.value.slice(3));

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
.state-msg--error {
  color: var(--danger);
}

/* ── Podium ────────────────────────────────────────────────────────────────── */
.lb-podium {
  margin-top: 1.25rem;
}
.lb-podium__label {
  display: block;
  margin-bottom: 0.9rem;
}
.lb-podium__grid {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 0.9rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.podium-card {
  flex: 1 1 0;
  max-width: 15rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.1rem 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: center;
}
/* First place rises above the other two, like a real podium. */
.is-place-1 {
  order: 2;
  padding-top: 1.6rem;
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 18%, transparent);
}
.is-place-2 {
  order: 1;
}
.is-place-3 {
  order: 3;
}
.podium-card--you {
  border-color: color-mix(in srgb, var(--accent) 65%, var(--line));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.podium-card__medal {
  font-size: 1.9rem;
  line-height: 1;
}
.is-place-1 .podium-card__medal {
  font-size: 2.4rem;
}
.podium-card__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 1rem;
  color: var(--ink);
}
.is-place-1 .podium-card__avatar {
  width: 3rem;
  height: 3rem;
  font-size: 1.15rem;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.podium-card__name {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-weight: 700;
  font-size: 0.98rem;
  color: var(--ink);
  line-height: 1.25;
}
.podium-card__meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.podium-card__level {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted);
}
.podium-card__xp {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  margin-top: 0.15rem;
  font-family: var(--font-mono);
}
.podium-card__xp strong {
  font-size: 1.15rem;
  color: var(--ink);
}
.is-place-1 .podium-card__xp strong {
  font-size: 1.35rem;
  color: var(--accent);
}
.podium-card__xp-unit {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

/* ── Standings ─────────────────────────────────────────────────────────────── */
.lb-standings {
  margin-top: 1.75rem;
}
.lb-standings__list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.9rem 0 0;
  padding: 0;
  list-style: none;
}
.lb-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.18s ease;
}
.lb-row:hover {
  transform: translateX(2px);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
}
.lb-row--you {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.lb-row__rank {
  flex: 0 0 2.5rem;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--muted);
}
.lb-row__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 0.8rem;
  color: var(--ink);
}
.lb-row__name {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 700;
  color: var(--ink);
}
.lb-row__level {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--muted);
  flex: 0 0 auto;
}
.lb-row__xp {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  flex: 0 0 auto;
  font-family: var(--font-mono);
}
.lb-row__xp strong {
  color: var(--ink);
}
.lb-row__xp-unit {
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

/* Rank tier colour chips */
.tier-chip--bronze   { background: color-mix(in srgb, #cd7f32 20%, var(--surface)); }
.tier-chip--silver   { background: color-mix(in srgb, #c0c0c0 20%, var(--surface)); }
.tier-chip--gold     { background: color-mix(in srgb, #ffd700 20%, var(--surface)); }
.tier-chip--platinum { background: color-mix(in srgb, #e5e4e2 20%, var(--surface)); }
.tier-chip--diamond  { background: color-mix(in srgb, #b9f2ff 20%, var(--surface)); }
.tier-chip--legend   { background: color-mix(in srgb, var(--accent-5) 20%, var(--surface)); }

/* Narrow viewports: podium stacks in rank order, standings hide the level. */
@media (max-width: 640px) {
  .lb-podium__grid {
    flex-direction: column;
    align-items: stretch;
  }
  .podium-card {
    max-width: none;
    flex-direction: row;
    justify-content: flex-start;
    gap: 0.75rem;
    text-align: left;
    padding: 0.85rem 1rem;
  }
  .is-place-1,
  .is-place-2,
  .is-place-3 {
    order: initial;
    padding-top: 0.85rem;
  }
  .podium-card__name {
    justify-content: flex-start;
    flex: 1 1 auto;
  }
  .podium-card__meta {
    margin-left: auto;
  }
  .podium-card__xp {
    flex: 0 0 auto;
  }
  .lb-row__level {
    display: none;
  }
}

/* Staggered entrance for the standings rows, motion-gated. */
@media (prefers-reduced-motion: no-preference) {
  .lb-row {
    animation: app-reveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: min(calc(var(--i) * 45ms), 360ms);
  }
}
</style>
