<!--
  Copyright (c) 2026-Present David Pine. All rights reserved.
  Licensed under the MIT License. SPDX-License-Identifier: MIT

  Accessible tooltip built on reka-ui. Shows on hover AND keyboard focus, is
  announced to assistive tech, and respects pointer vs. keyboard interaction.
  Wrap any single focusable trigger:

    <BrutTooltip :text="label"><button ...>◐</button></BrutTooltip>
-->
<template>
  <TooltipProvider :delay-duration="delay">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="tooltip" :side="side" :side-offset="6">
          {{ text }}
          <TooltipArrow class="tooltip__arrow" :width="10" :height="5" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup lang="ts">
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from "reka-ui";

withDefaults(
  defineProps<{
    text: string;
    side?: "top" | "right" | "bottom" | "left";
    delay?: number;
  }>(),
  { side: "top", delay: 320 },
);
</script>

<style scoped>
.tooltip {
  z-index: 320;
  max-width: 16rem;
  padding: 0.3rem 0.55rem;
  font-family: var(--font-body);
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.35;
  color: var(--paper);
  background: var(--ink);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  user-select: none;
}
.tooltip__arrow {
  fill: var(--ink);
}
.tooltip[data-state="delayed-open"] {
  animation: tooltip-in 0.12s ease;
}
@keyframes tooltip-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
</style>
