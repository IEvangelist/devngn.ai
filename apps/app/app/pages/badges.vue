<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Wave 2: bound to /v1/gamification/badges via gamification store.
-->
<template>
  <section class="page">
    <PageHeader :title="$t('badges.title')" :intro="$t('badges.intro')" />

    <!-- Loading -->
    <div v-if="loadingBadges" class="state-msg" role="status" aria-live="polite">
      <span aria-hidden="true">⏳</span> {{ $t("badges.loading") }}
    </div>

    <!-- Error -->
    <div v-else-if="errorBadges" class="state-msg state-msg--error" role="alert">
      <span aria-hidden="true">⚠</span> {{ errorBadges }}
      <BrutButton size="sm" variant="ghost" @click="store.fetchBadges()">{{ $t("common.retry") }}</BrutButton>
    </div>

    <template v-else>
      <!-- Earned badges -->
      <h2 class="section-label">{{ $t("badges.earned") }} ({{ earnedBadges.length }})</h2>

      <p v-if="earnedBadges.length === 0" class="state-msg">{{ $t("badges.empty") }}</p>

      <div v-else class="badge-grid" role="list">
        <div
          v-for="badge in earnedBadges"
          :key="badge.key"
          class="badge-tile badge-tile--earned badge-tile--reveal"
          :data-category="badge.category"
          role="listitem"
          tabindex="0"
          :aria-label="`${badge.name}: ${badge.description}. ${$t('badges.earnedOn', { date: badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString() : '' })}`"
        >
          <span class="badge-tile__icon" aria-hidden="true">{{ badge.icon }}</span>
          <span class="badge-tile__name">{{ badge.name }}</span>
          <BrutChip color="teal" class="badge-tile__earned-chip">
            ✓ {{ badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString() : $t("badges.earned") }}
          </BrutChip>
          <span class="badge-tile__category brut-eyebrow">{{ badge.category }}</span>
        </div>
      </div>

      <!-- Locked / hidden badges -->
      <h2 class="section-label">{{ $t("badges.locked") }} ({{ lockedBadges.length }})</h2>

      <div v-if="lockedBadges.length > 0" class="badge-grid" role="list">
        <div
          v-for="badge in lockedBadges"
          :key="badge.key"
          class="badge-tile"
          :class="badge.isHidden ? 'badge-tile--hidden' : 'badge-tile--locked'"
          role="listitem"
          tabindex="0"
          :aria-label="badge.isHidden ? $t('badges.hiddenBadge') : `${badge.name}: ${badge.description}`"
        >
          <span class="badge-tile__icon" aria-hidden="true">
            {{ badge.isHidden ? "❓" : badge.icon }}
          </span>
          <span class="badge-tile__name">
            {{ badge.isHidden ? $t("badges.hiddenBadge") : badge.name }}
          </span>
          <span v-if="!badge.isHidden" class="badge-tile__category brut-eyebrow">
            {{ badge.category }}
          </span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
const store = useGamificationStore();
const { earnedBadges, lockedBadges, loadingBadges, errorBadges } = storeToRefs(store);

onMounted(() => store.fetchBadges());
</script>

<style scoped>
.section-label {
  margin: 1.5rem 0 0.85rem;
}
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
/* Category-tinted borders for earned badges */
.badge-tile--earned[data-category="streak"]    { border-color: var(--accent);   background: color-mix(in srgb, var(--accent) 10%, var(--surface-bg)); }
.badge-tile--earned[data-category="wellness"]  { border-color: var(--success);  background: color-mix(in srgb, var(--success) 10%, var(--surface-bg)); }
.badge-tile--earned[data-category="social"]    { border-color: var(--accent-5); background: color-mix(in srgb, var(--accent-5) 10%, var(--surface-bg)); }
.badge-tile--earned[data-category="milestone"] { border-color: var(--accent-3); background: color-mix(in srgb, var(--accent-3) 10%, var(--surface-bg)); }
.badge-tile--earned[data-category="special"]   { border-color: var(--accent-4); background: color-mix(in srgb, var(--accent-4) 10%, var(--surface-bg)); }
/* Locked badge: apply reduced opacity only to the icon so that text keeps
   full contrast (WCAG AA requires ≥4.5:1; child opacity cannot override parent). */
.badge-tile--locked { opacity: 1; }
.badge-tile--locked .badge-tile__icon { opacity: 0.55; }
.badge-tile--locked .badge-tile__name { color: var(--muted); }
.badge-tile--locked .badge-tile__category { display: none; }
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
.badge-tile__category {
  font-size: 0.6rem;
  color: var(--muted);
  letter-spacing: 0.06em;
}

/* Hidden badge name: opacity:0.5 on the parent tile makes text fail contrast.
   The parent aria-label provides the accessible name; the visual text is
   redundant and is hidden to pass WCAG AA color-contrast. */
.badge-tile--hidden .badge-tile__name { display: none; }

/* Animated reveal on earned badges */
@media (prefers-reduced-motion: no-preference) {
  .badge-tile--reveal {
    animation: badge-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
}
@keyframes badge-pop {
  from { transform: scale(0.8); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
</style>
