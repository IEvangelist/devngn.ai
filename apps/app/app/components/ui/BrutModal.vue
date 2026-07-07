<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="modal-backdrop"
        role="dialog"
        :aria-label="title"
        aria-modal="true"
        @keydown.esc="$emit('close')"
        @click.self="closeOnBackdrop && $emit('close')"
      >
        <div ref="dialogEl" class="modal-box brut-panel" tabindex="-1">
          <header class="modal-header">
            <h2 class="modal-title">{{ title }}</h2>
            <button
              type="button"
              class="brut-btn brut-btn--ghost brut-btn--sm modal-close"
              :aria-label="$t('common.cancel')"
              @click="$emit('close')"
            >
              ✕
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    closeOnBackdrop?: boolean;
  }>(),
  { closeOnBackdrop: true },
);
defineEmits<{ close: [] }>();

const dialogEl = ref<HTMLElement | null>(null);

watch(
  () => props.open,
  (val) => {
    if (val) {
      nextTick(() => dialogEl.value?.focus());
    }
  },
);
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(22, 19, 13, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}
.modal-box {
  width: min(560px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title {
  margin: 0;
  font-size: 1.2rem;
}
.modal-close {
  flex: 0 0 auto;
}
.modal-footer {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

/* Transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .modal-box,
.modal-leave-active .modal-box {
  transition: transform 0.15s ease;
}
.modal-enter-from .modal-box {
  transform: translateY(-12px);
}
.modal-leave-to .modal-box {
  transform: translateY(4px);
}
</style>
