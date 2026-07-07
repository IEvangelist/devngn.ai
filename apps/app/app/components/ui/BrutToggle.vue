<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <button
    type="button"
    role="switch"
    class="brut-toggle"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="brut-toggle__knob" />
    <span class="visually-hidden">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  label: string;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>
