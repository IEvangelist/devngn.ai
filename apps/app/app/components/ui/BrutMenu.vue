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
      <DropdownMenuContent class="brut-menu" :align="align" :side-offset="6">
        <DropdownMenuLabel v-if="label" class="brut-menu__label">
          {{ label }}
        </DropdownMenuLabel>
        <template v-for="item in items" :key="item.key">
          <DropdownMenuSeparator v-if="item.separatorBefore" class="brut-menu__sep" />
          <DropdownMenuItem
            class="brut-menu__item"
            :class="{ 'brut-menu__item--danger': item.danger }"
            :disabled="item.disabled"
            @select="item.onSelect"
          >
            <span v-if="item.icon" class="brut-menu__icon" aria-hidden="true"><AppIcon :name="item.icon" /></span>
            <span class="brut-menu__text">{{ item.label }}</span>
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

<!--
  NOTE: reka-ui renders DropdownMenuContent through a Portal, so the popover
  lands OUTSIDE this component's scoped-style boundary and never receives the
  data-v attribute. Scoped rules silently don't apply (transparent background,
  no border, no shadow — the menu blends into whatever sits behind it). These
  styles therefore live in a plain, non-scoped block and are namespaced with
  `brut-menu` to avoid leaking.
-->
<style>
.brut-menu {
  z-index: 300;
  min-width: 11rem;
  padding: 0.3rem;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
}
.brut-menu__label {
  padding: 0.35rem 0.55rem 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-transform: uppercase;
}
.brut-menu__sep {
  height: 1px;
  margin: 0.3rem 0;
  background: var(--line);
}
.brut-menu__item {
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
.brut-menu__item[data-highlighted] {
  background: var(--surface-2);
}
.brut-menu__item[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
.brut-menu__item--danger {
  color: var(--danger);
}
.brut-menu__item--danger[data-highlighted] {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.brut-menu__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  font-size: 1.05rem;
  flex: 0 0 auto;
}
.brut-menu[data-state="open"] {
  animation: brut-menu-in 0.12s ease;
}
@keyframes brut-menu-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .brut-menu[data-state="open"] {
    animation: none;
  }
}
</style>
