<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <article class="brut-card" :class="flat ? 'brut-card--flat' : ''" v-bind="$attrs">
    <slot />
  </article>
</template>

<script setup lang="ts">
defineProps<{ flat?: boolean }>();
</script>
