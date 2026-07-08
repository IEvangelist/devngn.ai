<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Wave 2: bound to /v1/gamification/milestones via gamification store.
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
      <BrutButton size="sm" variant="ghost" @click="store.fetchMilestones()">{{ $t("common.retry") }}</BrutButton>
    </div>

    <!-- Empty -->
    <p v-else-if="milestones.length === 0" class="state-msg">{{ $t("milestones.empty") }}</p>

    <div v-else class="milestones__list">
      <div
        v-for="milestone in milestones"
        :key="milestone.key"
        role="article"
        class="milestone-card brut-card"
        :class="{
          'milestone-card--done': milestone.achieved,
          'milestone-card--hidden': milestone.isHidden && !milestone.achieved,
        }"
        :aria-label="milestone.isHidden && !milestone.achieved ? $t('milestones.hidden') : milestone.name"
      >
        <div class="milestone-card__icon" aria-hidden="true">
          {{ milestone.isHidden && !milestone.achieved ? "🔮" : "◈" }}
        </div>
        <div class="milestone-card__body">
          <div class="milestone-card__header">
            <h3 class="milestone-card__title">
              {{ milestone.isHidden && !milestone.achieved ? $t("milestones.hidden") : milestone.name }}
            </h3>
            <BrutChip v-if="milestone.achieved" color="teal">✓</BrutChip>
          </div>

          <p v-if="!(milestone.isHidden && !milestone.achieved)" class="milestone-card__desc">
            {{ milestone.description }}
          </p>
          <p v-else class="milestone-card__hint">{{ $t("milestones.unlockHint") }}</p>

          <BrutBadge v-if="milestone.achieved && milestone.achievedAt" color="success" icon="✓">
            {{ $t("milestones.achievedOn", { date: new Date(milestone.achievedAt).toLocaleDateString() }) }}
          </BrutBadge>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const store = useGamificationStore();
const { milestones, loadingMilestones, errorMilestones } = storeToRefs(store);

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
.state-msg--error { color: var(--danger); }

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
</style>
