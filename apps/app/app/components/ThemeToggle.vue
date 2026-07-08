<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <BrutTooltip :text="label">
    <button
      type="button"
      class="brut-btn brut-btn--sm theme-toggle"
      :aria-label="label"
      @click="toggle"
    >
      <span aria-hidden="true">{{ glyph }}</span>
    </button>
  </BrutTooltip>
</template>

<script setup lang="ts">
const { choice, toggle, init } = useTheme();

onMounted(() => init());

const glyph = computed(() =>
  choice.value === "dark" ? "☾" : choice.value === "light" ? "☀" : "◐",
);
const label = computed(() => `Theme: ${choice.value}`);
</script>

<style scoped>
.theme-toggle {
  min-width: 2.4rem;
}
</style>
