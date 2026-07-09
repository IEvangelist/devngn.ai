<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT

  Styled, accessible dropdown built on reka-ui Select (roving focus, type-ahead,
  ARIA listbox semantics, click-outside + ESC to close). Replaces the native
  <select> so the control matches the app surface instead of the OS chrome.

    <BrutSelect v-model="value" :options="[{ value: 'a', label: 'Option A' }]" />
-->
<template>
  <SelectRoot
    :model-value="modelValue"
    @update:model-value="(v: unknown) => $emit('update:modelValue', v as T)"
  >
    <SelectTrigger
      :id="id"
      class="brut-sel"
      :aria-label="ariaLabel"
    >
      <SelectValue class="brut-sel__value" :placeholder="placeholder" />
      <SelectIcon class="brut-sel__icon" as-child>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="brut-sel__content"
        position="popper"
        :side-offset="6"
      >
        <SelectViewport class="brut-sel__viewport">
          <SelectItem
            v-for="opt in options"
            :key="String(opt.value)"
            :value="opt.value"
            class="brut-sel__item"
          >
            <SelectItemText>{{ opt.label }}</SelectItemText>
            <SelectItemIndicator class="brut-sel__check" aria-hidden="true">
              ✓
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<script setup lang="ts" generic="T extends string">
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from "reka-ui";

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

defineProps<{
  modelValue: T;
  options: SelectOption<T>[];
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}>();

defineEmits<{ "update:modelValue": [value: T] }>();
</script>

<style scoped>
/* Trigger mirrors .brut-input/.brut-select so form controls stay consistent. */
.brut-sel {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.7rem;
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--text);
  background: var(--surface-bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.brut-sel:hover {
  border-color: var(--accent-line);
}
.brut-sel:focus-visible,
.brut-sel[data-state="open"] {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-tint);
}
.brut-sel__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brut-sel__icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--muted);
  transition: transform 0.15s ease;
}
.brut-sel[data-state="open"] .brut-sel__icon {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .brut-sel,
  .brut-sel__icon { transition: none; }
}
</style>

<!--
  The popover renders through a Portal on <body>, outside this component's
  scoped-style boundary, so its surface styles must be global. Class names are
  namespaced (brut-sel__*) to avoid collisions.
-->
<style>
.brut-sel__content {
  z-index: 300;
  min-width: var(--reka-select-trigger-width);
  max-height: var(--reka-select-content-available-height);
  padding: 0.3rem;
  background: var(--surface);
  border: var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.brut-sel__viewport {
  max-height: inherit;
  overflow-y: auto;
}
.brut-sel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.9rem;
  color: var(--ink);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  outline: none;
}
.brut-sel__item[data-highlighted] {
  background: var(--surface-2);
}
.brut-sel__item[data-state="checked"] {
  color: var(--accent-strong);
  font-weight: 600;
}
.brut-sel__check {
  flex: 0 0 auto;
  color: var(--accent-strong);
}
.brut-sel__content[data-state="open"] {
  animation: sel-in 0.12s ease;
}
@keyframes sel-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .brut-sel__content[data-state="open"] { animation: none; }
}
</style>
