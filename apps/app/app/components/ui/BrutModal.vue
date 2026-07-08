<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT

  Accessible modal dialog built on reka-ui (the headless layer shadcn-vue uses).
  reka-ui provides the hard parts for free: focus trap, focus return, scroll
  lock, ESC handling and correct ARIA wiring. The look is 100% the app's own
  calm design tokens, so this stays visually consistent with the rest of the UI.

  The public API is unchanged from the previous hand-rolled version
  (`open`, `title`, `closeOnBackdrop`, `close` emit, default + `footer` slots)
  so every existing consumer keeps working.
-->
<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="modal-backdrop" />
      <DialogContent
        class="modal-box brut-panel"
        @escape-key-down="onEscapeKeyDown"
        @interact-outside="onInteractOutside"
      >
        <header class="modal-header">
          <DialogTitle class="modal-title">{{ title }}</DialogTitle>
          <DialogClose
            class="brut-btn brut-btn--ghost brut-btn--sm modal-close"
            :aria-label="$t('common.cancel')"
          >
            ✕
          </DialogClose>
        </header>

        <!-- reka-ui requires a description for a11y; render it visibly when
             provided, otherwise a visually-hidden fallback keeps screen readers
             happy without a console warning. -->
        <DialogDescription :class="description ? 'modal-desc' : 'visually-hidden'">
          {{ description ?? title }}
        </DialogDescription>

        <div class="modal-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    closeOnBackdrop?: boolean;
  }>(),
  { closeOnBackdrop: true },
);

const emit = defineEmits<{ close: [] }>();

function onOpenChange(value: boolean): void {
  if (!value) emit("close");
}

function onEscapeKeyDown(): void {
  // Default behaviour (close) is desired; reka-ui emits update:open(false).
}

function onInteractOutside(event: Event): void {
  if (!props.closeOnBackdrop) event.preventDefault();
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(22 19 13 / 0.55);
  backdrop-filter: blur(2px);
  z-index: 200;
}

.modal-box {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 2rem));
  max-height: min(88vh, 720px);
  overflow-y: auto;
  z-index: 210;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.modal-title {
  margin: 0;
  font-size: 1.2rem;
}
.modal-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.modal-close {
  flex: 0 0 auto;
}
.modal-body {
  min-height: 0;
}
.modal-footer {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

/* Entrance / exit — reka-ui toggles data-state and waits for the animation
 * before unmounting, so exit animations play. Global reduced-motion rules in
 * retro.css collapse these to ~0ms. */
.modal-backdrop[data-state="open"] {
  animation: modal-fade-in 0.15s ease;
}
.modal-backdrop[data-state="closed"] {
  animation: modal-fade-out 0.12s ease;
}
.modal-box[data-state="open"] {
  animation: modal-pop-in 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-box[data-state="closed"] {
  animation: modal-pop-out 0.12s ease;
}

@keyframes modal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes modal-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes modal-pop-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes modal-pop-out {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
}
</style>
