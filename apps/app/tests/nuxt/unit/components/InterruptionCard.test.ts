// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Component tests for InterruptionCard.
 *
 * Strategy: mount InterruptionCard with a real Pinia instance (populated with
 * a mock interruptions store state) and stubs for child components. A real
 * (but message-less) vue-i18n instance is installed so both the `$t` template
 * helper and the `useI18n()` composable resolve; its `missing` handler returns
 * the key, so assertions stay stable while the component's script-side
 * translation calls work.
 *
 * Child components (BrutButton, BrutChip) are stubbed so tests remain fast and
 * don't depend on those components' implementations.
 */

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import InterruptionCard from "~/components/InterruptionCard.vue";
import type { PromptResponse } from "@devngn/wellness-types";
import {
  mockPendingPrompt,
  mockCompletedPrompt,
  mockDismissedPrompt,
} from "../../fixtures/wellness";

// ── i18n instance ────────────────────────────────────────────────────────────
// A real vue-i18n instance so useI18n() resolves in <script setup>. The missing
// handler returns the key, keeping the existing key-based assertions valid.
const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: "en",
  missing: (_locale: string, key: string) => key,
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: {} },
  // Cast: the app augments vue-i18n's message schema to require all locales;
  // this test-only instance intentionally ships an empty message set and relies
  // on the `missing` handler returning the key.
} as never);

// ── stubs shared across mounts ───────────────────────────────────────────────
const stubs = {
  BrutButton: {
    template:
      '<button class="brut-btn-stub" v-bind="$attrs" @click="$emit(\'click\')"><slot/></button>',
    props: ["variant", "size", "loading"],
    emits: ["click"],
  },
  BrutChip: {
    template: '<span class="brut-chip-stub"><slot/></span>',
    props: ["color"],
  },
};

// ── mount helper ─────────────────────────────────────────────────────────────
function mountCard(
  prompt: PromptResponse,
  showHistory = false,
  storeOverrides?: Partial<ReturnType<typeof useInterruptionsStore>>,
) {
  setActivePinia(createPinia());
  const pinia = createPinia();

  // Pre-populate the interruptions store with the mocked prompt
  const store = useInterruptionsStore(pinia);
  store.prompts = [prompt as PromptResponse];
  if (storeOverrides) {
    Object.assign(store, storeOverrides);
  }

  return mount(InterruptionCard, {
    props: { prompt: prompt as PromptResponse, showHistory },
    global: {
      plugins: [pinia, i18n],
      stubs,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InterruptionCard — rendering", () => {
  it("renders the activity title", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    expect(wrapper.text()).toContain("Take a standing break");
  });

  it("renders the activity description", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    expect(wrapper.text()).toContain("Stand up and stretch for 2 minutes.");
  });

  it("uses the prompt's activityTitle as the front-face aria-label", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    expect(wrapper.find(".interruption-card").attributes("aria-label")).toBe(
      "Take a standing break",
    );
  });

  it("shows bodyArea chip", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    // BrutChip stub renders its slot; the bodyArea value should appear
    expect(wrapper.text()).toContain("Back");
  });

  it("does NOT show history meta by default (showHistory=false)", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse, false);
    expect(wrapper.find(".interruption-card__meta").exists()).toBe(false);
  });

  it("shows history meta when showHistory=true", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse, true);
    expect(wrapper.find(".interruption-card__meta").exists()).toBe(true);
  });

  it("renders the completed back face in glance view (showHistory=false)", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse, false);
    expect(wrapper.find(".ix-flip__back").exists()).toBe(true);
  });

  it("does NOT render the completed back face in history view", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse, true);
    expect(wrapper.find(".ix-flip__back").exists()).toBe(false);
  });
});

describe("InterruptionCard — status derivation", () => {
  it("derives status 'pending' when no timestamps are set", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    // First chip renders the status
    const chips = wrapper.findAll(".brut-chip-stub");
    expect(chips[0]!.text()).toBe("pending");
  });

  it("derives status 'completed' when completedAt is set", () => {
    const wrapper = mountCard(mockCompletedPrompt as PromptResponse);
    const chips = wrapper.findAll(".brut-chip-stub");
    expect(chips[0]!.text()).toBe("completed");
  });

  it("derives status 'dismissed' when dismissedAt is set", () => {
    const wrapper = mountCard(mockDismissedPrompt as PromptResponse);
    const chips = wrapper.findAll(".brut-chip-stub");
    expect(chips[0]!.text()).toBe("dismissed");
  });
});

describe("InterruptionCard — actionable footer visibility", () => {
  it("shows the action footer for pending prompts", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    expect(wrapper.find(".interruption-card__actions").exists()).toBe(true);
  });

  it("hides the action footer for completed prompts", () => {
    const wrapper = mountCard(mockCompletedPrompt as PromptResponse);
    expect(wrapper.find(".interruption-card__actions").exists()).toBe(false);
  });

  it("hides the action footer for dismissed prompts", () => {
    const wrapper = mountCard(mockDismissedPrompt as PromptResponse);
    expect(wrapper.find(".interruption-card__actions").exists()).toBe(false);
  });
});

describe("InterruptionCard — store interactions", () => {
  it("calls store.snooze() with 15 minutes when Snooze button is clicked", async () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    const store = useInterruptionsStore();
    const snoozeSpy = vi.spyOn(store, "snooze");

    // buttons order: Complete, Snooze, Dismiss (as per template)
    const snoozeBtn = wrapper.findAll(".brut-btn-stub")[1];
    await snoozeBtn!.trigger("click");

    expect(snoozeSpy).toHaveBeenCalledWith(mockPendingPrompt.id, 15);
  });

  it("history view completes in place immediately (no flip)", async () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse, true);
    const store = useInterruptionsStore();
    vi.spyOn(store, "complete").mockResolvedValue(undefined);

    await wrapper.findAll(".brut-btn-stub")[0]!.trigger("click"); // Complete
    await flushPromises();

    expect(store.complete).toHaveBeenCalledWith(mockPendingPrompt.id);
    // History view does not flip to the completed face.
    expect(wrapper.find(".ix-item").classes()).not.toContain("is-flipped");
  });

  it("glance view flips first, then persists completion after the hold", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountCard(mockPendingPrompt as PromptResponse, false);
      const store = useInterruptionsStore();
      vi.spyOn(store, "complete").mockResolvedValue(undefined);

      await wrapper.findAll(".brut-btn-stub")[0]!.trigger("click"); // Complete

      // The card flips to the completed face immediately...
      expect(wrapper.find(".ix-item").classes()).toContain("is-flipped");
      // ...but completion is deferred until the flip has been shown.
      expect(store.complete).not.toHaveBeenCalled();

      // Advance past the glance-mode hold; completion now persists.
      await vi.advanceTimersByTimeAsync(1200);
      expect(store.complete).toHaveBeenCalledWith(mockPendingPrompt.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores repeat Done clicks while a glance completion is in flight", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountCard(mockPendingPrompt as PromptResponse, false);
      const store = useInterruptionsStore();
      const completeSpy = vi
        .spyOn(store, "complete")
        .mockResolvedValue(undefined);

      const doneBtn = wrapper.findAll(".brut-btn-stub")[0]!;
      await doneBtn.trigger("click");
      await doneBtn.trigger("click");
      await doneBtn.trigger("click");

      await vi.advanceTimersByTimeAsync(1200);
      expect(completeSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("InterruptionCard — formatTime helper", () => {
  it("formats the deliveredAt timestamp for display", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    // formatTime returns a locale time string; just ensure something is rendered
    expect(wrapper.find(".interruption-card__time").exists()).toBe(true);
    expect(wrapper.find(".interruption-card__time").text()).toBeTruthy();
  });

  it("shows empty string for missing deliveredAt", () => {
    const promptWithoutTime = { ...mockPendingPrompt, deliveredAt: undefined };
    const wrapper = mountCard(promptWithoutTime as unknown as PromptResponse);
    expect(wrapper.find(".interruption-card__time").text()).toBe("");
  });
});
