<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT

  Accessible dropdown menu built on reka-ui (roving focus, type-ahead, ARIA
  menu semantics, click-outside + ESC to close). Pass the trigger via the
  `trigger` slot and the actions via the `items` prop:

    <BrutMenu :items="[{ key: 'out', label: 'Sign out', danger: true, onSelect: signOut }]">
      <template #trigger><button>…</button></template>
    </BrutMenu>
-->
<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu" :align="align" :side-offset="6">
        <DropdownMenuLabel v-if="label" class="menu__label">
          {{ label }}
        </DropdownMenuLabel>
        <template v-for="item in items" :key="item.key">
          <DropdownMenuSeparator v-if="item.separatorBefore" class="menu__sep" />
          <DropdownMenuItem
            class="menu__item"
            :class="{ 'menu__item--danger': item.danger }"
            :disabled="item.disabled"
            @select="item.onSelect"
          >
            <span v-if="item.icon" class="menu__icon" aria-hidden="true">{{ item.icon }}</span>
            <span class="menu__text">{{ item.label }}</span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "reka-ui";

export interface MenuItem {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

withDefaults(
  defineProps<{
    items: MenuItem[];
    label?: string;
    align?: "start" | "center" | "end";
  }>(),
  { align: "end" },
);
</script>

<style scoped>
.menu {
  z-index: 300;
  min-width: 11rem;
  padding: 0.3rem;
  background: var(--surface);
  border: var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
}
.menu__label {
  padding: 0.35rem 0.55rem 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-transform: uppercase;
}
.menu__sep {
  height: 1px;
  margin: 0.3rem 0;
  background: var(--line);
}
.menu__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.88rem;
  color: var(--ink);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  outline: none;
}
.menu__item[data-highlighted] {
  background: var(--surface-2);
}
.menu__item[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
.menu__item--danger {
  color: var(--danger);
}
.menu__item--danger[data-highlighted] {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.menu__icon {
  width: 1.1rem;
  text-align: center;
  flex: 0 0 auto;
}
.menu[data-state="open"] {
  animation: menu-in 0.12s ease;
}
@keyframes menu-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
