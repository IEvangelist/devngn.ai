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
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
}
.brut-badge--accent  { background: var(--accent-tint); color: var(--accent-strong); border-color: var(--accent-line); }
.brut-badge--teal    { background: color-mix(in srgb, var(--accent-2) 12%, var(--surface)); color: var(--accent-2); border-color: color-mix(in srgb, var(--accent-2) 30%, transparent); }
.brut-badge--purple  { background: color-mix(in srgb, var(--accent-4) 12%, var(--surface)); color: var(--accent-4); border-color: color-mix(in srgb, var(--accent-4) 30%, transparent); }
.brut-badge--pink    { background: color-mix(in srgb, var(--accent-5) 12%, var(--surface)); color: var(--accent-5); border-color: color-mix(in srgb, var(--accent-5) 30%, transparent); }
.brut-badge--blue    { background: color-mix(in srgb, var(--accent-6) 12%, var(--surface)); color: var(--accent-6); border-color: color-mix(in srgb, var(--accent-6) 30%, transparent); }
.brut-badge--success { background: color-mix(in srgb, var(--success) 14%, var(--surface)); color: var(--success); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
.brut-badge--danger  { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
.brut-badge--sm { font-size: 0.68rem; padding: 0.08rem 0.4rem; }
.brut-badge--lg { font-size: 0.85rem; padding: 0.28rem 0.7rem; }
.brut-badge__icon { line-height: 1; }
</style>
