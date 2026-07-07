<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  TODO(wave2): bind milestone list to /v1/gamification/milestones
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("milestones.title") }}</h1>

    <div class="milestones__list">
      <div
        v-for="milestone in milestones"
        :key="milestone.id"
        class="milestone-card brut-card"
        :class="{
          'milestone-card--done': !!milestone.completedAt,
          'milestone-card--hidden': !milestone.revealed,
        }"
        :aria-label="milestone.revealed ? milestone.title : $t('milestones.hidden')"
      >
        <div class="milestone-card__icon" aria-hidden="true">
          {{ milestone.revealed ? milestone.icon : "🔮" }}
        </div>
        <div class="milestone-card__body">
          <div class="milestone-card__header">
            <h3 class="milestone-card__title">
              {{ milestone.revealed ? milestone.title : $t("milestones.hidden") }}
            </h3>
            <BrutBadge color="accent">
              +{{ milestone.xpReward }} XP
            </BrutBadge>
          </div>
          <p v-if="milestone.revealed" class="milestone-card__desc">
            {{ milestone.description }}
          </p>
          <p v-else class="milestone-card__hint">{{ $t("milestones.unlockHint") }}</p>

          <div v-if="milestone.revealed && milestone.requiredCount" class="milestone-card__progress">
            <BrutProgress
              :value="milestone.currentCount ?? 0"
              :max="milestone.requiredCount"
              :label="`${milestone.title} progress`"
              show-label
            />
          </div>

          <BrutBadge v-if="milestone.completedAt" color="success" icon="✓">
            {{ new Date(milestone.completedAt).toLocaleDateString() }}
          </BrutBadge>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// TODO(wave2): Replace gamification store mock with real API calls to /v1/gamification/milestones
const { milestones } = storeToRefs(useGamificationStore());
</script>

<style scoped>
.milestones__list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}
.milestone-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}
.milestone-card--hidden {
  opacity: 0.55;
  background: var(--paper-2);
  filter: blur(0.25px);
}
.milestone-card--done {
  border-left: 4px solid var(--success);
}
.milestone-card__icon {
  font-size: 2.5rem;
  line-height: 1;
  flex: 0 0 auto;
  padding-top: 0.2rem;
}
.milestone-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.milestone-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.milestone-card__title { margin: 0; font-size: 1rem; }
.milestone-card__desc,
.milestone-card__hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.milestone-card__progress { max-width: 320px; }
</style>
