<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <!-- The daily hub. The signed-out sign-in gate lives in the layout (AuthGate),
       so this page only ever renders for an authenticated user. -->
  <section class="today">
    <!-- Player hero: who you are today + your standing, in a single glance.
         Replaces the old greeting + duplicate level line (the status bar
         already carries a compact level/XP/streak pill). -->
    <header class="today__hero reveal reveal--0">
      <div class="today__hello">
        <p class="today__date">{{ todayLabel }}</p>
        <h1 class="today__greeting">
          {{ greeting }}<template v-if="firstName">, <span class="today__name">{{ firstName }}</span></template>
        </h1>
        <p class="today__orient">{{ $t("today.orient") }}</p>
      </div>

      <!-- Player card: a level ring (real XP progress) plus two honest,
           non-duplicative stats. No fabricated gauges. -->
      <div class="player">
        <!-- Loading: shape-matched skeleton, not a spinner -->
        <template v-if="playerLoading">
          <div class="player__ring player__ring--skel" aria-hidden="true" />
          <div class="player__side">
            <div class="player__skel-line player__skel-line--wide" aria-hidden="true" />
            <div class="player__stats">
              <div class="player__skel-stat" aria-hidden="true" />
              <div class="player__skel-stat" aria-hidden="true" />
            </div>
          </div>
        </template>

        <!-- Ready -->
        <template v-else-if="player">
          <div class="player__ring" role="img" :aria-label="ringLabel">
            <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle class="ring__track" cx="60" cy="60" :r="RING_R" />
              <circle
                class="ring__value"
                cx="60"
                cy="60"
                :r="RING_R"
                :stroke-dasharray="RING_C"
                :stroke-dashoffset="ringOffset"
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div class="ring__center">
              <span class="ring__lvl-label">{{ $t("gamification.levelShort") }}</span>
              <span class="ring__lvl">{{ level }}</span>
              <span v-if="rankTier" class="ring__rank">{{ rankTier }}</span>
            </div>
          </div>

          <div class="player__side">
            <p class="player__tonext">
              {{ $t("gamification.xpToNext", { remaining: xpRemaining, level: level + 1 }) }}
            </p>
            <div class="player__stats">
              <div class="stat">
                <span class="stat__value">
                  <span
                    class="stat__flame"
                    :class="{ 'stat__flame--lit': currentStreak > 0 }"
                    aria-hidden="true"
                  >🔥</span>{{ currentStreak }}
                </span>
                <span class="stat__label">{{ $t("today.dayStreak") }}</span>
                <span v-if="longestStreak > 0" class="stat__note">
                  {{ $t("gamification.bestStreak", { days: longestStreak }) }}
                </span>
              </div>
              <div class="stat">
                <span class="stat__value">{{ totalXpDisplay }}</span>
                <span class="stat__label">{{ $t("today.totalXp") }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Not yet available: quiet and honest, never a fake number -->
        <template v-else>
          <p class="player__unavailable">{{ $t("today.statsUnavailable") }}</p>
        </template>
      </div>
    </header>

    <!-- Right now -->
    <section class="today__block reveal reveal--1" aria-labelledby="today-now-h">
      <h2 id="today-now-h" class="section-label">{{ $t("today.rightNow") }}</h2>

      <TransitionGroup v-if="activePrompts.length" tag="div" name="ix-leave" class="today__cards">
        <InterruptionCard
          v-for="prompt in activePrompts"
          :key="prompt.id"
          :prompt="prompt"
        />
      </TransitionGroup>

      <div v-else class="today__clear brut-card brut-card--flat">
        <span class="today__clear-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              d="M20 6 9 17l-5-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <div>
          <p class="today__clear-title">{{ $t("today.clearTitle") }}</p>
          <p class="today__clear-body">{{ $t("today.empty") }}</p>
        </div>
      </div>
    </section>

    <!-- Up next: a single-glance forecast teaser -->
    <section
      v-if="showNext"
      class="today__block reveal reveal--2"
      aria-labelledby="today-next-h"
    >
      <div class="today__block-head">
        <h2 id="today-next-h" class="section-label">{{ $t("forecast.upNext") }}</h2>
        <NuxtLink to="/interruptions" class="today__more">
          {{ $t("forecast.title") }}
          <span aria-hidden="true">&rarr;</span>
        </NuxtLink>
      </div>

      <!-- Loading -->
      <div v-if="forecast.loading && !forecast.loaded" class="today__next-skeleton" aria-hidden="true" />

      <!-- Next gap -->
      <div v-else-if="nextGap" class="today__next brut-card">
        <div class="today__next-when">
          <span class="today__next-rel">{{ relativeTo(nextGap.gap.startUtc) }}</span>
          <span class="today__next-clock">{{ clock(nextGap.gap.startUtc) }}</span>
          <BrutBadge size="sm">{{ $t("forecast.minutes", { n: Number(nextGap.gap.durationMinutes) }) }}</BrutBadge>
        </div>

        <div class="today__next-body">
          <template v-if="nextGap.isSurprise">
            <div class="today__next-tags">
              <BrutChip color="purple">{{ $t("forecast.surprise") }}</BrutChip>
            </div>
            <p class="today__next-title">{{ $t("forecast.surpriseTitle") }}</p>
            <p class="today__next-desc">{{ $t("forecast.surpriseSub") }}</p>
          </template>
          <template v-else-if="nextGap.activity">
            <div class="today__next-tags">
              <BrutChip color="teal">{{ nextGap.activity.bodyArea }}</BrutChip>
              <BrutBadge size="sm">{{ nextGap.activity.intensity }}</BrutBadge>
            </div>
            <p class="today__next-title">{{ nextGap.activity.title }}</p>
            <p class="today__next-desc">{{ nextGap.activity.description }}</p>
          </template>
          <template v-else>
            <p class="today__next-title">{{ $t("forecast.noFitTitle") }}</p>
            <p class="today__next-desc">{{ $t("forecast.noFitSub") }}</p>
          </template>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n();

const auth = useAuthStore();
const { isAuthenticated, user } = storeToRefs(auth);

const interruptions = useInterruptionsStore();
const { activePrompts } = storeToRefs(interruptions);
const gamification = useGamificationStore();
const forecast = useForecastStore();

// A ticking clock so the greeting and relative labels stay honest across a long
// session without a manual refresh.
const now = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  clockTimer = setInterval(() => (now.value = new Date()), 60_000);
  if (isAuthenticated.value) {
    if (!forecast.loaded) forecast.fetch();
    if (!gamification.playerState && !gamification.loadingPlayer) gamification.fetchPlayerState();
  }
  if (gamification.playerState) fillRing();
});
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
});
watch(isAuthenticated, (v) => {
  if (v) {
    if (!forecast.loaded) forecast.fetch();
    if (!gamification.playerState && !gamification.loadingPlayer) gamification.fetchPlayerState();
  }
});
// Fill the ring once real player data lands (it may arrive after mount).
watch(
  () => gamification.playerState,
  (v) => {
    if (v) fillRing();
  },
);

const greeting = computed((): string => {
  const h = now.value.getHours();
  if (h < 12) return t("today.greetMorning");
  if (h < 18) return t("today.greetAfternoon");
  return t("today.greetEvening");
});

// First name only, so the greeting reads like a person said it. Falls back to
// the GitHub login when no display name is set; empty when unknown.
const firstName = computed((): string => {
  const name = user.value?.displayName?.trim() || user.value?.login?.trim() || "";
  return name.split(/\s+/)[0] ?? "";
});

const todayLabel = computed((): string =>
  now.value.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }),
);

// ── Player state ──────────────────────────────────────────────────────────
// Every value below is a real field on PlayerStateResponse. Nothing is
// fabricated; if a field is absent we fall back to a neutral, honest default.
const player = computed(() => gamification.playerState);
const playerLoading = computed(
  (): boolean => gamification.loadingPlayer && !gamification.playerState,
);

const level = computed((): number => Number(player.value?.level ?? 1));
const xpInto = computed((): number => Number(player.value?.xpIntoLevel ?? 0));
const xpFor = computed((): number => Number(player.value?.xpForNextLevel ?? 100));
const xpRemaining = computed((): number => Math.max(0, xpFor.value - xpInto.value));
const xpPercent = computed((): number => {
  if (xpFor.value <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((xpInto.value / xpFor.value) * 100)));
});
const totalXpDisplay = computed((): string => Number(player.value?.totalXp ?? 0).toLocaleString());
const currentStreak = computed((): number => Number(player.value?.currentStreak ?? 0));
const longestStreak = computed((): number => Number(player.value?.longestStreak ?? 0));
const rankTier = computed((): string => String(player.value?.rankTier ?? ""));

const ringLabel = computed(
  (): string =>
    `${t("gamification.level", { level: level.value })}. ${t("gamification.xpToNext", {
      remaining: xpRemaining.value,
      level: level.value + 1,
    })}`,
);

// Level-progress ring: an honest arc of xpIntoLevel / xpForNextLevel that fills
// in on mount to draw the eye to real momentum. The fill is a plain CSS
// transition on stroke-dashoffset, disabled under reduced motion (snaps).
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;
const ringPct = ref(0);
const ringOffset = computed((): number => RING_C * (1 - ringPct.value / 100));
function fillRing(): void {
  requestAnimationFrame(() => {
    ringPct.value = xpPercent.value;
  });
}

const nextGap = computed(() => forecast.items[0]);
const showNext = computed(
  (): boolean => (forecast.loading && !forecast.loaded) || !!nextGap.value,
);

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Humane "in 25 min" / "in 2 h" / "in 1 d" relative label. */
function relativeTo(iso: string): string {
  const diffMs = new Date(iso).getTime() - now.value.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins <= 0) return t("forecast.now");
  if (mins < 60) return t("forecast.inMinutes", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("forecast.inHours", { n: hours });
  const days = Math.round(hours / 24);
  return t("forecast.inDays", { n: days });
}
</script>

<style scoped>
/* ── Daily hub layout ─────────────────────────────────────────────────────
 * A calm vertical rhythm: greeting, a quiet level line, then the two blocks
 * that carry the page (what needs you now, what is coming). */
.today {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  max-width: 44rem;
}

/* Hero: greeting beside a compact player card. An asymmetric split that
 * collapses to a clean stack on narrow widths. */
.today__hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1.5rem 2rem;
  align-items: center;
}

/* Greeting */
.today__date {
  margin: 0 0 0.5rem;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.today__greeting {
  margin: 0;
  font-size: clamp(1.7rem, 1.15rem + 1.7vw, 2.35rem);
  line-height: 1.08;
  letter-spacing: -0.02em;
}
.today__name {
  color: var(--accent-strong);
}
.today__orient {
  margin: 0.6rem 0 0;
  max-width: 42ch;
  color: var(--muted);
  font-size: 0.98rem;
  line-height: 1.55;
}

/* ── Player card ──────────────────────────────────────────────────────────
 * The gamified centerpiece: a real level ring plus two honest stats. It owns
 * the elevation on this page, so it is the one true card in the hero. */
.player {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.1rem 1.35rem;
  min-width: 17.5rem;
  border: var(--border);
  border-radius: var(--radius);
  background:
    radial-gradient(130% 150% at 100% 0%, var(--accent-tint) 0%, transparent 58%),
    var(--surface);
  box-shadow: var(--shadow-sm);
}

/* Level ring */
.player__ring {
  position: relative;
  flex: none;
  width: 6.5rem;
  height: 6.5rem;
}
.ring {
  display: block;
  width: 100%;
  height: 100%;
}
.ring__track {
  fill: none;
  stroke: var(--surface-2);
  stroke-width: 10;
}
.ring__value {
  fill: none;
  stroke: var(--accent);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}
.ring__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.05rem;
}
.ring__lvl-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.ring__lvl {
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 800;
  line-height: 1;
  color: var(--ink);
}
.ring__rank {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-strong);
}

/* Stats beside the ring, complementary to it, never a copy of the arc. */
.player__side {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-width: 0;
}
.player__tonext {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
}
.player__stats {
  display: flex;
  gap: 1.4rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.stat__value {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1;
  color: var(--ink);
}
.stat__flame {
  font-size: 0.95rem;
  filter: grayscale(1) opacity(0.5);
}
.stat__flame--lit {
  filter: none;
}
.stat__label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
}
.stat__note {
  font-size: 0.68rem;
  color: var(--muted);
  opacity: 0.85;
}

/* Player skeletons (shape-matched, per Section 4.5) */
.player__ring--skel {
  border-radius: 50%;
  background: var(--surface-2);
}
.player__skel-line,
.player__skel-stat {
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--surface-2), var(--line), var(--surface-2));
  background-size: 200% 100%;
  animation: today-shimmer 1.3s ease-in-out infinite;
}
.player__skel-line {
  height: 0.85rem;
  width: 8rem;
  margin-bottom: 0.7rem;
}
.player__skel-line--wide {
  width: 10rem;
}
.player__skel-stat {
  height: 2.2rem;
  width: 4.5rem;
}
.player__unavailable {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}

/* Motivated micro-motion: a live streak breathes; everything calms under
 * reduced-motion. */
@media (prefers-reduced-motion: no-preference) {
  .stat__flame--lit {
    animation: flame-pulse 2.4s ease-in-out infinite;
  }
}
@keyframes flame-pulse {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-1px) scale(1.08);
  }
}

/* Section blocks */
.today__block {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.today__block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
.today__more {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent-strong);
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  transition: gap 0.18s ease;
}
.today__more:hover {
  gap: 0.5rem;
  text-decoration: none;
}

.today__cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Completed / snoozed / dismissed cards ease out of the active list rather
 * than vanishing. The card that fades is already showing its completed face. */
.ix-leave-leave-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}
.ix-leave-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
.ix-leave-move {
  transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Composed "you're clear" state — calm, not a dead line. */
.today__clear {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent-tint) 55%, var(--surface)),
    var(--surface)
  );
  border-color: var(--accent-line);
}
.today__clear-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-sm);
  color: var(--accent-strong);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.today__clear-title {
  margin: 0;
  font-weight: 700;
  color: var(--ink);
}
.today__clear-body {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

/* Up-next teaser */
.today__next {
  display: grid;
  grid-template-columns: minmax(6.5rem, auto) 1fr;
  gap: 1.15rem;
  align-items: start;
}
.today__next-when {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: flex-start;
}
.today__next-rel {
  font-weight: 700;
  font-size: 0.95rem;
}
.today__next-clock {
  color: var(--muted);
  font-size: 0.82rem;
}
.today__next-tags {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.45rem;
}
.today__next-title {
  margin: 0;
  font-weight: 600;
}
.today__next-desc {
  margin: 0.3rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.today__next-skeleton {
  height: 5.5rem;
  border-radius: var(--radius);
  background: linear-gradient(90deg, var(--surface-2), var(--line), var(--surface-2));
  background-size: 200% 100%;
  animation: today-shimmer 1.3s ease-in-out infinite;
}
@keyframes today-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .today__next-skeleton { animation: none; }
  .ring__value { transition: none; }
  .player__skel-line,
  .player__skel-stat { animation: none; }
}

@media (max-width: 680px) {
  .today__hero {
    grid-template-columns: 1fr;
    align-items: start;
  }
  .player {
    min-width: 0;
    width: 100%;
  }
  .today__next { grid-template-columns: 1fr; gap: 0.6rem; }
}
</style>
