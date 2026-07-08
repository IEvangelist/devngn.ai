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
  padding: 0.5rem 0.7rem;
  font-weight: 500;
  font-size: 0.92rem;
  color: var(--muted);
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease, color 0.15s ease;
}
.nav-item:hover {
  background: var(--surface-2);
  color: var(--text);
}
.nav-item.router-link-active {
  background: var(--accent-tint);
  color: var(--accent-strong);
  font-weight: 600;
}
.nav-item.router-link-active .nav-item__icon {
  color: var(--accent-strong);
}
.nav-item__icon {
  width: 1.2rem;
  text-align: center;
  flex: 0 0 auto;
  font-size: 1rem;
}
.nav-item--collapsed {
  justify-content: center;
  padding: 0.5rem;
}
</style>
