<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <span
    class="brut-badge"
    :class="[color ? `brut-badge--${color}` : '', size ? `brut-badge--${size}` : '']"
    role="status"
    v-bind="$attrs"
  >
    <span v-if="icon" class="brut-badge__icon" aria-hidden="true">{{ icon }}</span>
    <slot />
  </span>
</template>

<script setup lang="ts">
defineProps<{
  icon?: string;
  color?: "accent" | "teal" | "purple" | "pink" | "blue" | "success" | "danger";
  size?: "sm" | "lg";
}>();
</script>

<style scoped>
.brut-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 2px solid var(--ink);
  background: var(--surface-bg);
  color: var(--text);
}
.brut-badge--accent { background: var(--accent); color: var(--accent-ink); }
.brut-badge--teal { background: var(--accent-2); color: #05201c; }
.brut-badge--purple { background: var(--accent-4); color: #fff; }
.brut-badge--pink { background: var(--accent-5); color: #2a0313; }
.brut-badge--blue { background: var(--accent-6); color: #fff; }
.brut-badge--success { background: var(--success); color: #023121; }
.brut-badge--danger { background: var(--danger); color: #3b0000; }
.brut-badge--sm { font-size: 0.65rem; padding: 0.08rem 0.35rem; }
.brut-badge--lg { font-size: 0.9rem; padding: 0.3rem 0.7rem; }
.brut-badge__icon { line-height: 1; }
</style>
