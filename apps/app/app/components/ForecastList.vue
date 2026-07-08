<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Interruption forecast: your upcoming free-time gaps with the activity the
  engine is most likely to deliver into each. Some slots are kept a surprise.
-->
<template>
  <section class="forecast">
    <header class="forecast__head">
      <div>
        <h2 class="forecast__title">{{ $t("forecast.title") }}</h2>
        <p class="forecast__intro">{{ $t("forecast.intro") }}</p>
      </div>
      <BrutButton
        v-if="!forecastStore.loading"
        size="sm"
        variant="ghost"
        :aria-label="$t('forecast.refresh')"
        @click="refresh"
      >
        ↻ {{ $t("forecast.refresh") }}
      </BrutButton>
    </header>

    <!-- Loading -->
    <div v-if="forecastStore.loading && !forecastStore.loaded" class="forecast__list" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="forecast-skeleton" />
    </div>

    <!-- Error -->
    <BrutPanel v-else-if="forecastStore.error" class="forecast__state">
      <p>{{ forecastStore.error }}</p>
      <BrutButton size="sm" @click="refresh">{{ $t("common.retry") }}</BrutButton>
    </BrutPanel>

    <!-- Empty -->
    <BrutPanel v-else-if="!forecastStore.hasGaps" class="forecast__state">
      <p>{{ $t("forecast.empty") }}</p>
    </BrutPanel>

    <!-- Forecast -->
    <ul v-else class="forecast__list">
      <li
        v-for="(item, i) in forecastStore.items"
        :key="item.gap.startUtc"
        class="forecast-card brut-card"
        :class="{ 'forecast-card--surprise': item.isSurprise, 'forecast-card--next': i === 0 }"
      >
        <div class="forecast-card__when">
          <span class="forecast-card__rel">{{ relativeTo(item.gap.startUtc) }}</span>
          <span class="forecast-card__clock">{{ clock(item.gap.startUtc) }}</span>
          <BrutBadge size="sm">{{ $t("forecast.minutes", { n: Number(item.gap.durationMinutes) }) }}</BrutBadge>
        </div>

        <div class="forecast-card__body">
          <template v-if="i === 0">
            <span class="forecast-card__next-flag brut-eyebrow">{{ $t("forecast.upNext") }}</span>
          </template>

          <template v-if="item.isSurprise">
            <div class="surprise">
              <span class="surprise__icon" aria-hidden="true">🎁</span>
              <div>
                <p class="surprise__title">{{ $t("forecast.surpriseTitle") }}</p>
                <p class="surprise__sub">{{ $t("forecast.surpriseSub") }}</p>
              </div>
            </div>
          </template>

          <template v-else-if="item.activity">
            <div class="pick">
              <div class="pick__tags">
                <BrutChip color="teal">{{ item.activity.bodyArea }}</BrutChip>
                <BrutBadge size="sm">{{ item.activity.intensity }}</BrutBadge>
                <BrutBadge size="sm">{{ seconds(item.activity.durationSeconds) }}</BrutBadge>
              </div>
              <h3 class="pick__title">{{ item.activity.title }}</h3>
              <p class="pick__desc">{{ item.activity.description }}</p>
            </div>
          </template>

          <template v-else>
            <div class="nofit">
              <p class="nofit__title">{{ $t("forecast.noFitTitle") }}</p>
              <p class="nofit__sub">{{ $t("forecast.noFitSub") }}</p>
            </div>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { isAuthenticated } = storeToRefs(useAuthStore());
const forecastStore = useForecastStore();

function refresh(): void {
  if (isAuthenticated.value) forecastStore.fetch();
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function seconds(value: number | string): string {
  return `${Number(value)}s`;
}

/** Humane "in 25 min" / "in 2 h" / "tomorrow" relative label. */
function relativeTo(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (mins <= 0) return t("forecast.now");
  if (mins < 60) return t("forecast.inMinutes", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("forecast.inHours", { n: hours });
  const days = Math.round(hours / 24);
  return t("forecast.inDays", { n: days });
}

onMounted(() => {
  if (isAuthenticated.value && !forecastStore.loaded) forecastStore.fetch();
});
watch(isAuthenticated, (v) => {
  if (v && !forecastStore.loaded) forecastStore.fetch();
});
</script>

<style scoped>
.forecast { margin-top: 2rem; }
.forecast__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.forecast__title { margin: 0; font-size: 1.15rem; }
.forecast__intro {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
  max-width: 60ch;
}
.forecast__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.forecast__state { text-align: center; color: var(--muted); display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
.forecast-card {
  display: grid;
  grid-template-columns: minmax(6.5rem, auto) 1fr;
  gap: 1rem;
  align-items: start;
}
.forecast-card--next { border-color: var(--accent-line); box-shadow: 0 0 0 1px var(--accent-line) inset; }
.forecast-card--surprise { background: var(--accent-tint); }
.forecast-card__when {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: flex-start;
}
.forecast-card__rel { font-weight: 700; font-size: 0.95rem; }
.forecast-card__clock { color: var(--muted); font-size: 0.82rem; }
.forecast-card__next-flag { display: block; color: var(--accent-strong); margin-bottom: 0.4rem; }
.pick__tags { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.45rem; }
.pick__title { margin: 0; font-size: 1rem; }
.pick__desc { margin: 0.3rem 0 0; color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
.surprise { display: flex; align-items: center; gap: 0.85rem; }
.surprise__icon { font-size: 1.75rem; line-height: 1; }
.surprise__title { margin: 0; font-weight: 700; }
.surprise__sub { margin: 0.15rem 0 0; color: var(--muted); font-size: 0.88rem; }
.nofit__title { margin: 0; font-weight: 600; }
.nofit__sub { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.88rem; }
.forecast-skeleton {
  height: 5.5rem;
  border-radius: var(--radius);
  background: linear-gradient(90deg, var(--surface-2), var(--line), var(--surface-2));
  background-size: 200% 100%;
  animation: shimmer 1.3s ease-in-out infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .forecast-skeleton { animation: none; }
}
@media (max-width: 640px) {
  .forecast-card { grid-template-columns: 1fr; gap: 0.6rem; }
}
</style>
