<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Toast host — mount once at the app root (inside default.vue).
-->
<template>
  <div class="toast-host" role="status" aria-live="polite" aria-label="Notifications">
    <TransitionGroup name="toast-list" tag="div" class="toast-stack">
      <BrutToast
        v-for="t in toasts"
        :key="t.id"
        :toast="t"
        @dismiss="dismiss"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
const { toasts, dismiss } = useToast();
</script>

<style scoped>
.toast-host {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
}
.toast-stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.toast-stack > * {
  pointer-events: all;
}

/* TransitionGroup animations */
.toast-list-enter-active { transition: all 0.2s ease; }
.toast-list-leave-active { transition: all 0.18s ease; }
.toast-list-enter-from  { transform: translateX(60px); opacity: 0; }
.toast-list-leave-to    { transform: translateX(60px); opacity: 0; }
.toast-list-move        { transition: transform 0.2s ease; }
</style>
