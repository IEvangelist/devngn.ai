<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
  Shows an in-app banner when a new PWA service-worker version is ready to activate.
-->
<template>
  <Transition name="pwa-prompt">
    <div v-if="showPrompt" class="pwa-update-bar" role="status" aria-live="polite">
      <span class="pwa-update-bar__msg">{{ $t("pwa.updateAvailable") }}</span>
      <BrutButton size="sm" variant="accent" @click="reload">
        {{ $t("pwa.reload") }}
      </BrutButton>
      <BrutButton size="sm" variant="ghost" @click="showPrompt = false">
        {{ $t("common.dismiss") }}
      </BrutButton>
    </div>
  </Transition>
</template>

<script setup lang="ts">
// usePWA is auto-imported from @vite-pwa/nuxt
const pwa = usePWA();

const showPrompt = ref(false);

watch(() => pwa?.needRefresh, (val) => {
  if (val) showPrompt.value = true;
});

async function reload(): Promise<void> {
  showPrompt.value = false;
  await pwa?.updateServiceWorker(true);
}
</script>

<style scoped>
.pwa-update-bar {
  position: fixed;
  bottom: 5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border: var(--border);
  background: var(--surface-bg);
  box-shadow: var(--shadow);
  z-index: 250;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
}
.pwa-prompt-enter-active,
.pwa-prompt-leave-active {
  transition: all 0.2s ease;
}
.pwa-prompt-enter-from,
.pwa-prompt-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(1rem);
}
</style>
