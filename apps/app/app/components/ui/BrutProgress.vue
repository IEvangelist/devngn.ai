<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <div
    class="brut-progress"
    role="progressbar"
    :aria-valuenow="value"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-label="label"
  >
    <div
      class="brut-progress__fill"
      :class="color ? `brut-progress__fill--${color}` : ''"
      :style="{ width: `${percent}%` }"
    />
    <span v-if="showLabel" class="brut-progress__label" aria-hidden="true">
      {{ value }} / {{ max }}
    </span>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number;
    max?: number;
    label: string;
    showLabel?: boolean;
    color?: "teal" | "purple" | "pink" | "accent";
  }>(),
  { max: 100 },
);

const percent = computed(() =>
  Math.min(100, Math.max(0, Math.round((props.value / props.max) * 100))),
);
</script>

<style scoped>
.brut-progress {
  position: relative;
  height: 1.1rem;
  border: var(--border);
  background: var(--surface-bg);
  overflow: hidden;
}
.brut-progress__fill {
  height: 100%;
  background: repeating-linear-gradient(
    45deg,
    var(--accent),
    var(--accent) 8px,
    var(--accent-3) 8px,
    var(--accent-3) 16px
  );
  transition: width 0.4s ease;
}
.brut-progress__fill--teal {
  background: repeating-linear-gradient(
    45deg,
    var(--accent-2),
    var(--accent-2) 8px,
    var(--accent-3) 8px,
    var(--accent-3) 16px
  );
}
.brut-progress__fill--purple {
  background: repeating-linear-gradient(
    45deg,
    var(--accent-4),
    var(--accent-4) 8px,
    var(--accent-5) 8px,
    var(--accent-5) 16px
  );
}
.brut-progress__label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  mix-blend-mode: difference;
  color: #fff;
}
</style>
