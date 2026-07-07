<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  TODO(wave2): bind leaderboard to /v1/gamification/leaderboard
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("leaderboard.title") }}</h1>

    <div class="leaderboard__table-wrap">
      <table class="leaderboard__table" aria-label="Developer leaderboard">
        <thead>
          <tr>
            <th scope="col" class="col-rank">{{ $t("leaderboard.rankColumn") }}</th>
            <th scope="col" class="col-player">{{ $t("leaderboard.playerColumn") }}</th>
            <th scope="col" class="col-level">Lvl</th>
            <th scope="col" class="col-streak">🔥</th>
            <th scope="col" class="col-xp">{{ $t("leaderboard.xpColumn") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in leaderboard"
            :key="entry.userId"
            class="lb-row"
            :class="{
              'lb-row--you': entry.isCurrentUser,
              'lb-row--top3': entry.rank <= 3,
            }"
          >
            <td class="col-rank">
              <span class="rank-badge" :class="`rank-badge--${entry.rank}`">
                {{ entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}` }}
              </span>
            </td>
            <td class="col-player">
              <div class="player-cell">
                <BrutAvatar :src="entry.avatarUrl" :alt="entry.displayName" size="1.8rem" />
                <span class="player-name">
                  {{ entry.login }}
                  <BrutBadge v-if="entry.isCurrentUser" color="accent" size="sm">
                    {{ $t("leaderboard.you") }}
                  </BrutBadge>
                </span>
              </div>
            </td>
            <td class="col-level">
              <BrutChip>{{ $t("gamification.level", { level: entry.level }) }}</BrutChip>
            </td>
            <td class="col-streak">{{ entry.streak }}d</td>
            <td class="col-xp">
              <strong>{{ entry.xp.toLocaleString() }}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="brut-eyebrow leaderboard__note">
      <!-- TODO(wave2): bind to /v1/gamification/leaderboard -->
      Preview data — live rankings available in Wave 2
    </p>
  </section>
</template>

<script setup lang="ts">
// TODO(wave2): Replace mock data with real API call to /v1/gamification/leaderboard
const { leaderboard } = storeToRefs(useGamificationStore());
</script>

<style scoped>
.leaderboard__table-wrap {
  overflow-x: auto;
  margin-top: 1rem;
  border: var(--border);
  box-shadow: var(--shadow);
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
  border-bottom: 2px solid var(--ink);
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
.player-name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 700;
}
.col-rank { width: 3.5rem; }
.col-xp { text-align: right; }
.leaderboard__note {
  margin-top: 0.75rem;
  color: var(--muted);
}
</style>
