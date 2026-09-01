<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT
-->
<template>
  <span class="brand-wordmark" role="img" aria-label="devngn.ai">
    <span class="brand-wordmark__dev" aria-hidden="true">dev</span>
    <span class="brand-wordmark__ngn" aria-hidden="true">ngn</span>
    <span class="brand-wordmark__dot" aria-hidden="true">.</span>
    <span class="brand-wordmark__ai" aria-hidden="true">ai</span>
  </span>
</template>

<style scoped>
.brand-wordmark {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

.brand-wordmark__dev,
.brand-wordmark__dot {
  color: var(--ink);
}

.brand-wordmark__ngn {
  color: var(--brand-ngn);
}

.brand-wordmark__ai {
  color: var(--brand-ai);
}
</style>
