<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <BrutTooltip :text="label">
    <button
      type="button"
      class="brut-btn brut-btn--ghost theme-toggle"
      :aria-label="label"
      @click="toggle"
    >
      <span class="theme-toggle__glyph" aria-hidden="true">{{ glyph }}</span>
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.3rem;
  padding: 0.35rem;
  color: var(--muted);
}
.theme-toggle:hover {
  color: var(--ink);
}
.theme-toggle__glyph {
  font-size: 1.15rem;
  line-height: 1;
}
</style>
