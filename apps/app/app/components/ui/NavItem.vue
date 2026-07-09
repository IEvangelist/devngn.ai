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
    <span class="nav-item__icon" aria-hidden="true"><AppIcon :name="icon" /></span>
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
  gap: 0.7rem;
  padding: 0.55rem 0.7rem;
  font-weight: 500;
  font-size: 0.95rem;
  color: var(--muted);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.nav-item:hover {
  background: var(--surface-2);
  color: var(--text);
}
.nav-item.router-link-active {
  background: var(--accent-tint);
  border-color: var(--accent-line);
  color: var(--accent-strong);
  font-weight: 600;
}
.nav-item.router-link-active .nav-item__icon {
  color: var(--accent-strong);
}
.nav-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  flex: 0 0 auto;
  font-size: 1.35rem;
}
.nav-item--collapsed {
  justify-content: center;
  padding: 0.55rem;
}
</style>
