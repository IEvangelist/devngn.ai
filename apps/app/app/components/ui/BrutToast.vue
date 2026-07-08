<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <div
    class="brut-toast"
    :class="`brut-toast--${toast.type}`"
    role="alert"
    aria-live="assertive"
    aria-atomic="true"
  >
    <span class="brut-toast__icon" aria-hidden="true">{{ icons[toast.type] }}</span>
    <span class="brut-toast__msg">{{ toast.message }}</span>
    <button
      type="button"
      class="brut-toast__close brut-btn brut-btn--ghost brut-btn--sm"
      :aria-label="$t('common.dismiss')"
      @click="$emit('dismiss', toast.id)"
    >
      ✕
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Toast } from "~/composables/useToast";

defineProps<{ toast: Toast }>();
defineEmits<{ dismiss: [id: string] }>();

const icons: Record<Toast["type"], string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};
</script>

<style scoped>
.brut-toast {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  border: var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 500;
  background: var(--surface-bg);
  color: var(--text);
  max-width: 420px;
  width: 100%;
}
.brut-toast--success { border-left: 4px solid var(--success); }
.brut-toast--error   { border-left: 4px solid var(--danger);  }
.brut-toast--warning { border-left: 4px solid var(--accent-3);}
.brut-toast--info    { border-left: 4px solid var(--accent-6);}
.brut-toast__msg { flex: 1; word-break: break-word; }
.brut-toast__icon { flex: 0 0 auto; font-size: 1rem; }
.brut-toast__close { margin-left: auto; flex: 0 0 auto; }
</style>
