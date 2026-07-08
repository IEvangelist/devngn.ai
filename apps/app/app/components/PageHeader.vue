<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Calm, consistent page header: a display title with an optional orientation
  line, and an optional actions slot pinned to the right.
-->
<template>
  <header class="page-head reveal reveal--0">
    <div class="page-head__text">
      <h1 class="page-head__title">{{ title }}</h1>
      <p v-if="intro" class="page-head__intro">{{ intro }}</p>
    </div>
    <div v-if="$slots.actions" class="page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  intro?: string;
}>();
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.75rem;
}
.page-head__title {
  margin: 0;
  font-size: clamp(1.5rem, 1.2rem + 1vw, 1.95rem);
  line-height: 1.12;
  letter-spacing: -0.02em;
}
.page-head__intro {
  margin: 0.5rem 0 0;
  max-width: 52ch;
  color: var(--muted);
  font-size: 0.96rem;
  line-height: 1.55;
}
.page-head__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.35rem;
}
</style>
