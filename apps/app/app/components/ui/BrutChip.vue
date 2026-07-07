<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <span
    class="brut-chip"
    :class="color ? `brut-chip--${color}` : ''"
    v-bind="$attrs"
  >
    <span v-if="icon" aria-hidden="true">{{ icon }}</span>
    <slot />
    <button
      v-if="removable"
      type="button"
      class="brut-chip__remove"
      :aria-label="`Remove`"
      @click.stop="$emit('remove')"
    >
      ×
    </button>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  icon?: string;
  color?: "teal" | "purple" | "pink" | "blue";
  removable?: boolean;
}>();
defineEmits<{ remove: [] }>();
</script>

<style scoped>
.brut-chip__remove {
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 900;
  padding: 0 0 0 0.25rem;
  font-size: 0.9em;
  color: inherit;
  line-height: 1;
}
</style>
