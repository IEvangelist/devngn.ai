<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Wave 2: bound to /v1/gamification/milestones via gamification store.
  Presented as a vertical progress journey: a spine that fills through the
  milestones you have reached, marks the one you are working toward, and keeps
  future moments in view.
-->
<template>
  <section class="page">
    <PageHeader :title="$t('milestones.title')" :intro="$t('milestones.intro')" />

    <!-- Loading -->
    <div v-if="loadingMilestones" class="state-msg" role="status" aria-live="polite">
      <span aria-hidden="true">⏳</span> {{ $t("milestones.loading") }}
    </div>

    <!-- Error -->
    <div v-else-if="errorMilestones" class="state-msg state-msg--error" role="alert">
      <span aria-hidden="true">⚠</span> {{ errorMilestones }}
      <BrutButton size="sm" variant="ghost" @click="store.fetchMilestones()">
        {{ $t("common.retry") }}
      </BrutButton>
    </div>

    <!-- Empty -->
    <p v-else-if="milestones.length === 0" class="state-msg">{{ $t("milestones.empty") }}</p>

    <template v-else>
      <!-- Progress summary -->
      <div class="journey-summary reveal reveal--0">
        <div class="journey-summary__head">
          <span class="section-label">{{ $t("milestones.journeyLabel") }}</span>
          <span class="journey-summary__count">
            {{ $t("milestones.progress", { done: doneCount, total: totalCount }) }}
          </span>
        </div>
        <div
          class="journey-meter"
          role="progressbar"
          :aria-valuenow="doneCount"
          aria-valuemin="0"
          :aria-valuemax="totalCount"
          :aria-label="$t('milestones.progress', { done: doneCount, total: totalCount })"
        >
          <span class="journey-meter__fill" :style="{ width: `${progressPct}%` }" />
        </div>
      </div>

      <!-- Journey timeline -->
      <ol class="timeline">
        <li
          v-for="(milestone, i) in orderedMilestones"
          :key="milestone.key"
          class="tl-item"
          :class="{
            'is-done': milestone.achieved,
            'is-next': milestone.key === nextKey,
            'is-hidden': milestone.isHidden && !milestone.achieved,
            'is-first': i === 0,
            'is-last': i === orderedMilestones.length - 1,
          }"
          :style="{ '--i': i }"
        >
          <div class="tl-rail" aria-hidden="true">
            <span class="tl-node">
              <svg
                v-if="milestone.achieved"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                aria-hidden="true"
              >
                <path
                  d="M20 6 9 17l-5-5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span v-else-if="milestone.isHidden" class="tl-node__glyph">?</span>
            </span>
          </div>

          <article
            class="tl-card brut-card"
            :aria-label="
              milestone.isHidden && !milestone.achieved
                ? $t('milestones.hidden')
                : milestone.name
            "
          >
            <div class="tl-card__head">
              <h3 class="tl-card__title">
                {{
                  milestone.isHidden && !milestone.achieved
                    ? $t("milestones.hidden")
                    : milestone.name
                }}
              </h3>
              <span v-if="milestone.achieved" class="tl-chip tl-chip--done">
                {{ $t("milestones.reached") }}
              </span>
              <span v-else-if="milestone.key === nextKey" class="tl-chip tl-chip--next">
                {{ $t("milestones.upNext") }}
              </span>
            </div>

            <p v-if="!(milestone.isHidden && !milestone.achieved)" class="tl-card__desc">
              {{ milestone.description }}
            </p>
            <p v-else class="tl-card__desc tl-card__desc--hint">
              {{ $t("milestones.unlockHint") }}
            </p>

            <p v-if="milestone.achieved && milestone.achievedAt" class="tl-card__date">
              {{ $t("milestones.achievedOn", { date: new Date(milestone.achievedAt).toLocaleDateString() }) }}
            </p>
          </article>
        </li>
      </ol>
    </template>
  </section>
</template>

<script setup lang="ts">
const store = useGamificationStore();
const { milestones, loadingMilestones, errorMilestones } = storeToRefs(store);

const doneCount = computed(
  () => milestones.value.filter((m) => m.achieved).length,
);
const totalCount = computed(() => milestones.value.length);
const progressPct = computed(() =>
  totalCount.value === 0
    ? 0
    : Math.round((doneCount.value / totalCount.value) * 100),
);
// The first milestone still to reach: the one the journey is pointing at.
const nextKey = computed(
  () => milestones.value.find((m) => !m.achieved)?.key ?? null,
);

// Milestones arrive in catalog order, so reached and unreached moments are
// interleaved. Reorder into a coherent climb: moments already reached first (in
// the order they happened), then everything still ahead in catalog order. This
// keeps the spine filling continuously up to the "up next" node instead of
// lighting scattered rows.
const orderedMilestones = computed(() =>
  milestones.value
    .map((m, index) => ({ m, index }))
    .sort((a, b) => {
      const aAhead = a.m.achieved ? 0 : 1;
      const bAhead = b.m.achieved ? 0 : 1;
      if (aAhead !== bAhead) return aAhead - bAhead;
      if (aAhead === 0) {
        const at = a.m.achievedAt ? Date.parse(a.m.achievedAt) : 0;
        const bt = b.m.achievedAt ? Date.parse(b.m.achievedAt) : 0;
        if (at !== bt) return at - bt;
      }
      return a.index - b.index;
    })
    .map((x) => x.m),
);

onMounted(() => store.fetchMilestones());
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

/* ── Progress summary ─────────────────────────────────────────────────────── */
.journey-summary {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 1.25rem 0 0.35rem;
}
.journey-summary__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.journey-summary__count {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}
.journey-meter {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.journey-meter__fill {
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

/* ── Timeline ─────────────────────────────────────────────────────────────── */
.timeline {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
}
.tl-item {
  display: grid;
  grid-template-columns: 44px 1fr;
  column-gap: 0.5rem;
  padding-bottom: 0.9rem;
}

/* Rail: node plus the vertical connector that forms the spine. */
.tl-rail {
  position: relative;
  display: flex;
  justify-content: center;
}
.tl-rail::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  background: var(--line);
}
/* Trim the spine so it starts and ends at the node centre (27px from top). */
.tl-item.is-first .tl-rail::before {
  top: 27px;
}
.tl-item.is-last .tl-rail::before {
  bottom: calc(100% - 27px);
}
/* Reached rows colour their spine segment: progress made visible. */
.tl-item.is-done .tl-rail::before {
  background: var(--success);
}

.tl-node {
  position: relative;
  z-index: 1;
  margin-top: 14px;
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 2px solid var(--line);
  color: var(--muted);
}
.tl-item.is-done .tl-node {
  background: var(--success);
  border-color: var(--success);
  color: #fff;
}
.tl-item.is-next .tl-node {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
}
.tl-node__glyph {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.85rem;
  line-height: 1;
}

/* Card */
.tl-card {
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.tl-item.is-done .tl-card {
  border-color: color-mix(in srgb, var(--success) 35%, var(--line));
}
.tl-item.is-next .tl-card {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.tl-item.is-hidden .tl-card {
  border-style: dashed;
  background: var(--surface-2);
}
.tl-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.tl-card__title {
  margin: 0;
  font-size: 1rem;
  line-height: 1.25;
}
.tl-card__desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.tl-card__desc--hint {
  font-style: italic;
}
.tl-card__date {
  margin: 0.1rem 0 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--success);
}

/* Status chips */
.tl-chip {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.16rem 0.5rem;
  border-radius: 999px;
  white-space: nowrap;
}
.tl-chip--done {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
}
.tl-chip--next {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

/* ── Motion: staggered reveal + a gentle pulse on the next milestone ───────── */
@media (prefers-reduced-motion: no-preference) {
  .tl-item {
    animation: app-reveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: min(calc(var(--i, 0) * 55ms), 440ms);
  }
  .tl-item.is-next .tl-node {
    animation: tl-pulse 2.4s ease-in-out infinite;
  }
}
@keyframes tl-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
  }
  50% {
    box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent) 6%, transparent);
  }
}
</style>
