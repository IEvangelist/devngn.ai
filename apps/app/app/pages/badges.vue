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
      <!-- Collection progress -->
      <div v-if="totalCount > 0" class="collection-summary reveal reveal--0">
        <div class="collection-summary__head">
          <span class="section-label">{{ $t("badges.collectionLabel") }}</span>
          <span class="collection-summary__count">
            {{ $t("badges.progress", { done: earnedBadges.length, total: totalCount }) }}
          </span>
        </div>
        <div
          class="collection-meter"
          role="progressbar"
          :aria-valuenow="earnedBadges.length"
          aria-valuemin="0"
          :aria-valuemax="totalCount"
          :aria-label="$t('badges.progress', { done: earnedBadges.length, total: totalCount })"
        >
          <span class="collection-meter__fill" :style="{ width: `${progressPct}%` }" />
        </div>
      </div>

      <!-- Earned badges -->
      <h2 class="section-label">{{ $t("badges.earned") }} ({{ earnedBadges.length }})</h2>

      <p v-if="earnedBadges.length === 0" class="state-msg">{{ $t("badges.empty") }}</p>

      <ul v-else class="badge-grid" role="list">
        <li
          v-for="(badge, idx) in earnedBadges"
          :key="badge.key"
          class="badge-tile badge-tile--earned"
          :data-category="badge.category"
          :style="{ '--i': idx }"
          role="listitem"
          tabindex="0"
          :aria-label="`${badge.name}: ${badge.description}. ${$t('badges.earnedOn', { date: badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString() : '' })}`"
        >
          <span class="badge-medallion" aria-hidden="true">{{ badge.icon }}</span>
          <span class="badge-tile__name">{{ badge.name }}</span>
          <span class="badge-tile__earned">
            <AppIcon name="check-circle" class="badge-tile__earned-icon" />
            {{ badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString() : $t("badges.earned") }}
          </span>
          <span class="badge-tile__cat brut-eyebrow">{{ badge.category }}</span>
        </li>
      </ul>

      <!-- Locked / hidden badges -->
      <template v-if="lockedBadges.length > 0">
        <h2 class="section-label">{{ $t("badges.locked") }} ({{ lockedBadges.length }})</h2>

        <ul class="badge-grid" role="list">
          <li
            v-for="badge in lockedBadges"
            :key="badge.key"
            class="badge-tile"
            :class="badge.isHidden ? 'badge-tile--hidden' : 'badge-tile--locked'"
            :data-category="badge.category"
            role="listitem"
            tabindex="0"
            :aria-label="badge.isHidden ? $t('badges.hiddenBadge') : `${badge.name}: ${badge.description}`"
          >
            <span class="badge-medallion" aria-hidden="true">
              <AppIcon v-if="badge.isHidden" name="lock" />
              <template v-else>{{ badge.icon }}</template>
            </span>
            <span class="badge-tile__name">
              {{ badge.isHidden ? $t("badges.hiddenBadge") : badge.name }}
            </span>
            <span v-if="!badge.isHidden" class="badge-tile__cat brut-eyebrow">
              {{ badge.category }}
            </span>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
const store = useGamificationStore();
const { earnedBadges, lockedBadges, loadingBadges, errorBadges } = storeToRefs(store);

const totalCount = computed(() => earnedBadges.value.length + lockedBadges.value.length);
const progressPct = computed(() =>
  totalCount.value === 0
    ? 0
    : Math.round((earnedBadges.value.length / totalCount.value) * 100),
);

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

/* ── Collection progress ──────────────────────────────────────────────────── */
.collection-summary {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 1.25rem 0 0.35rem;
}
.collection-summary__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.collection-summary .section-label { margin: 0; }
.collection-summary__count {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}
.collection-meter {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.collection-meter__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--success),
    color-mix(in srgb, var(--success) 78%, var(--accent))
  );
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Badge grid ───────────────────────────────────────────────────────────── */
.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.85rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Category accent, resolved once and reused by the medallion + earned border. */
.badge-tile { --cat: var(--accent-3); }
.badge-tile[data-category="streak"]    { --cat: var(--accent);   }
.badge-tile[data-category="wellness"]  { --cat: var(--success);  }
.badge-tile[data-category="social"]    { --cat: var(--accent-5); }
.badge-tile[data-category="milestone"] { --cat: var(--accent-3); }
.badge-tile[data-category="special"]   { --cat: var(--accent-4); }

.badge-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.1rem 0.85rem;
  text-align: center;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.badge-tile:hover,
.badge-tile:focus-visible {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  outline: none;
}
.badge-tile:focus-visible { border-color: var(--accent); }
.badge-tile--earned {
  border-color: color-mix(in srgb, var(--cat) 30%, var(--line));
}

/* Medallion holds the badge glyph. */
.badge-medallion {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  font-size: 1.7rem;
  line-height: 1;
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.badge-tile--earned .badge-medallion {
  background: color-mix(in srgb, var(--cat) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--cat) 40%, var(--line));
}
.badge-tile--locked .badge-medallion {
  filter: grayscale(1);
  opacity: 0.55;
}
.badge-tile--hidden .badge-medallion {
  border-style: dashed;
  color: var(--muted);
  font-size: 1.35rem;
}

.badge-tile__name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.25;
  color: var(--ink);
}
.badge-tile--locked .badge-tile__name,
.badge-tile--hidden .badge-tile__name { color: var(--muted); }

.badge-tile__earned {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--success);
}
.badge-tile__earned-icon { font-size: 0.85rem; }

.badge-tile__cat {
  font-size: 0.6rem;
  color: var(--muted);
  letter-spacing: 0.08em;
}

/* Staggered reveal on earned tiles, motion-gated (mirrors sibling pages). */
@media (prefers-reduced-motion: no-preference) {
  .badge-tile--earned {
    animation: app-reveal 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: min(calc(var(--i, 0) * 45ms), 400ms);
  }
}
</style>
