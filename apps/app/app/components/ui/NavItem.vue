<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <NuxtLink
    :to="to"
    class="nav-item"
    :class="{ 'nav-item--collapsed': collapsed }"
    :aria-label="collapsed ? label : undefined"
    :title="collapsed ? label : undefined"
  >
    <span class="nav-item__icon" aria-hidden="true">{{ icon }}</span>
    <span v-if="!collapsed" class="nav-item__label">{{ label }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
defineProps<{
  to: string;
  icon: string;
  label: string;
  collapsed?: boolean;
}>();
</script>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.65rem;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
  border: 2px solid transparent;
  transition: background 0.08s ease, color 0.08s ease;
}
.nav-item:hover {
  background: var(--accent-3);
  color: var(--accent-ink);
}
.nav-item.router-link-active {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--ink);
  box-shadow: var(--shadow-sm);
}
.nav-item__icon {
  width: 1.2rem;
  text-align: center;
  flex: 0 0 auto;
}
.nav-item--collapsed {
  justify-content: center;
  padding: 0.5rem;
}
</style>
