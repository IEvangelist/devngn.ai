<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <span class="brut-avatar" :style="{ '--sz': size }" :title="alt" v-bind="$attrs">
    <img
      v-if="src"
      :src="src"
      :alt="alt"
      class="brut-avatar__img"
      loading="lazy"
      @error="imgErr = true"
    />
    <span v-else class="brut-avatar__initials" aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src?: string;
    alt: string;
    size?: string;
  }>(),
  { size: "2.25rem" },
);

const imgErr = ref(false);
const initials = computed(() =>
  props.alt
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join(""),
);
</script>

<style scoped>
.brut-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sz, 2.25rem);
  height: var(--sz, 2.25rem);
  border: var(--border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  flex: 0 0 auto;
  background: var(--accent-3);
}
.brut-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.brut-avatar__initials {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: calc(var(--sz, 2.25rem) * 0.4);
  color: var(--ink);
}
</style>
