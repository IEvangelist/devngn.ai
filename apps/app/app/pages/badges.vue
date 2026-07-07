<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  TODO(wave2): bind badge grid to /v1/gamification/badges
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("badges.title") }}</h1>

    <!-- Earned badges -->
    <h2 class="section-heading">{{ $t("badges.earned") }} ({{ earnedBadges.length }})</h2>
    <div class="badge-grid">
      <div
        v-for="badge in earnedBadges"
        :key="badge.id"
        class="badge-tile badge-tile--earned"
        :style="{ '--badge-color': badge.color }"
        :title="badge.name"
        tabindex="0"
        role="img"
        :aria-label="`${badge.name}: ${badge.description}`"
      >
        <span class="badge-tile__icon" aria-hidden="true">{{ badge.icon }}</span>
        <span class="badge-tile__name">{{ badge.name }}</span>
        <BrutChip color="teal" class="badge-tile__earned-chip">
          ✓ {{ badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString() : $t("badges.earned") }}
        </BrutChip>
      </div>
    </div>

    <!-- Locked / in-progress badges -->
    <h2 class="section-heading">{{ $t("badges.locked") }} ({{ lockedBadges.length }})</h2>
    <div class="badge-grid">
      <div
        v-for="badge in lockedBadges"
        :key="badge.id"
        class="badge-tile"
        :class="badge.hidden ? 'badge-tile--hidden' : 'badge-tile--locked'"
        :title="badge.hidden ? $t('badges.hidden') : badge.name"
        tabindex="0"
        role="img"
        :aria-label="badge.hidden ? $t('badges.hidden') : `${badge.name}: ${badge.description}`"
      >
        <span class="badge-tile__icon" aria-hidden="true">
          {{ badge.hidden ? "❓" : badge.icon }}
        </span>
        <span class="badge-tile__name">{{ badge.hidden ? $t("badges.hidden") : badge.name }}</span>

        <div v-if="!badge.hidden && badge.maxProgress" class="badge-tile__progress">
          <BrutProgress
            :value="badge.progress ?? 0"
            :max="badge.maxProgress"
            :label="`${badge.name} progress`"
          />
          <span class="brut-eyebrow">{{ badge.progress ?? 0 }} / {{ badge.maxProgress }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// TODO(wave2): Replace gamification store mock with real API calls to /v1/gamification/badges
const { earnedBadges, lockedBadges } = storeToRefs(useGamificationStore());
</script>

<style scoped>
.section-heading {
  font-size: 1rem;
  margin: 1.5rem 0 0.75rem;
  color: var(--muted);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}
.badge-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1rem 0.75rem;
  border: var(--border);
  background: var(--surface-bg);
  box-shadow: var(--shadow-sm);
  text-align: center;
  cursor: default;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.badge-tile:hover,
.badge-tile:focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: var(--shadow);
}
.badge-tile--earned {
  background: color-mix(in srgb, var(--badge-color, var(--accent)) 12%, var(--surface-bg));
  border-color: var(--badge-color, var(--accent));
}
.badge-tile--locked { opacity: 0.65; }
.badge-tile--hidden {
  background: var(--paper-2);
  opacity: 0.5;
  filter: blur(0.5px);
}
.badge-tile__icon {
  font-size: 2.5rem;
  line-height: 1;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.12));
}
.badge-tile__name {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text);
}
.badge-tile__earned-chip { font-size: 0.65rem; }
.badge-tile__progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-top: 0.25rem;
}
</style>
