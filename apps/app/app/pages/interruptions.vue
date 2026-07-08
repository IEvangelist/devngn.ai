<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <section class="page">
    <PageHeader :title="$t('interruptions.title')" :intro="$t('interruptions.intro')">
      <template #actions>
        <BrutBadge
          :color="streamStatus === 'open' ? 'success' : 'accent'"
          :icon="streamStatus === 'open' ? '●' : '○'"
        >
          {{ statusLabel }}
        </BrutBadge>
      </template>
    </PageHeader>

    <!-- Upcoming forecast -->
    <div class="reveal reveal--1">
      <ForecastList />
    </div>

    <!-- Live + history -->
    <section class="page__block reveal reveal--2" aria-labelledby="live-h">
      <h2 id="live-h" class="section-label">{{ $t("interruptions.liveTitle") }}</h2>

      <div v-if="prompts.length" class="interruptions__list">
        <InterruptionCard
          v-for="prompt in prompts"
          :key="prompt.id"
          :prompt="prompt"
          show-history
        />
      </div>

      <div v-else class="interruptions__empty brut-card brut-card--flat">
        <p class="interruptions__empty-title">{{ $t("interruptions.emptyTitle") }}</p>
        <p class="interruptions__empty-body">{{ $t("today.empty") }}</p>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n();
const interruptions = useInterruptionsStore();
const { prompts, streamStatus } = storeToRefs(interruptions);

const statusLabel = computed(() => {
  switch (streamStatus.value) {
    case "open": return t("common.ready");
    case "connecting": return t("common.connecting");
    case "reconnecting": return t("common.reconnecting");
    default: return t("common.offline");
  }
});
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  max-width: 44rem;
}
.page__block {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.interruptions__list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.interruptions__empty {
  padding: 1.15rem 1.25rem;
}
.interruptions__empty-title {
  margin: 0;
  font-weight: 700;
  color: var(--ink);
}
.interruptions__empty-body {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
