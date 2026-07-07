<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <section>
    <p class="brut-eyebrow">{{ $t("app.name") }}</p>
    <h1>{{ $t("interruptions.title") }}</h1>

    <div class="stream-status">
      <BrutBadge
        :color="streamStatus === 'open' ? 'success' : 'accent'"
        :icon="streamStatus === 'open' ? '●' : '○'"
      >
        {{ statusLabel }}
      </BrutBadge>
    </div>

    <div v-if="prompts.length" class="interruptions__list">
      <InterruptionCard
        v-for="prompt in prompts"
        :key="prompt.id"
        :prompt="prompt"
        show-history
      />
    </div>
    <BrutPanel v-else class="interruptions__empty">
      <p>{{ $t("today.empty") }}</p>
    </BrutPanel>
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
.stream-status { margin-bottom: 1rem; }
.interruptions__list { display: flex; flex-direction: column; gap: 1rem; }
.interruptions__empty { text-align: center; color: var(--muted); }
</style>
