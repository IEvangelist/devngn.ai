<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT

  Destructive-action confirmation built on reka-ui AlertDialog. Unlike a plain
  modal, an alert dialog traps focus on the confirm/cancel actions and does not
  dismiss on an outside click, so a user can't lose data by mis-clicking. Styled
  entirely with the app's calm tokens.
-->
<template>
  <AlertDialogRoot :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="confirm-backdrop" />
      <AlertDialogContent class="confirm-box brut-panel">
        <AlertDialogTitle class="confirm-title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="description" class="confirm-desc">
          {{ description }}
        </AlertDialogDescription>
        <div class="confirm-actions">
          <AlertDialogCancel class="brut-btn brut-btn--sm" @click="emit('cancel')">
            {{ cancelLabel ?? $t("common.cancel") }}
          </AlertDialogCancel>
          <AlertDialogAction
            class="brut-btn brut-btn--sm"
            :class="danger ? 'brut-btn--danger' : 'brut-btn--accent'"
            @click="emit('confirm')"
          >
            {{ confirmLabel ?? $t("common.confirm") }}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<script setup lang="ts">
import {
  AlertDialogRoot,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "reka-ui";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }>(),
  { danger: false },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();
</script>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(22 19 13 / 0.55);
  backdrop-filter: blur(2px);
  z-index: 220;
}
.confirm-box {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, calc(100vw - 2rem));
  z-index: 230;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: var(--shadow-lg);
}
.confirm-title {
  margin: 0;
  font-size: 1.1rem;
}
.confirm-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.confirm-backdrop[data-state="open"] {
  animation: confirm-fade-in 0.14s ease;
}
.confirm-backdrop[data-state="closed"] {
  animation: confirm-fade-out 0.1s ease;
}
.confirm-box[data-state="open"] {
  animation: confirm-pop-in 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}
.confirm-box[data-state="closed"] {
  animation: confirm-pop-out 0.1s ease;
}
@keyframes confirm-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes confirm-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes confirm-pop-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes confirm-pop-out {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
}
</style>
