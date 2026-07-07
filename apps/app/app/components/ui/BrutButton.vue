<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <component
    :is="tag"
    class="brut-btn"
    :class="[
      variant ? `brut-btn--${variant}` : '',
      size ? `brut-btn--${size}` : '',
      block ? 'brut-btn--block' : '',
    ]"
    :type="tag === 'button' ? type : undefined"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading"
    :aria-busy="loading"
    v-bind="$attrs"
  >
    <span v-if="loading" class="brut-btn__spinner" aria-hidden="true">⋯</span>
    <slot v-else />
  </component>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    tag?: string;
    type?: "button" | "submit" | "reset";
    variant?: "accent" | "ghost" | "danger";
    size?: "sm" | "lg";
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { tag: "button", type: "button" },
);
</script>

<style scoped>
.brut-btn__spinner {
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.brut-btn--danger {
  background: var(--danger);
  color: #fff;
}
.brut-btn--danger:hover {
  background: color-mix(in srgb, var(--danger) 80%, black);
}
.brut-btn--lg {
  padding: 0.8rem 1.4rem;
  font-size: 1.05rem;
}
</style>
