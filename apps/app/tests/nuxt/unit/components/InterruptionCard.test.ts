// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Component tests for InterruptionCard.
 *
 * Strategy: mount InterruptionCard with a real Pinia instance (populated with
 * a mock interruptions store state) and stubs for child components + i18n.
 * This keeps the test focused on the card's own logic without booting the full
 * Nuxt layout or making real network calls.
 *
 * Child components (BrutButton, BrutChip) are stubbed so tests remain fast and
 * don't depend on those components' implementations.
 */

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import InterruptionCard from "~/components/InterruptionCard.vue";
import type { PromptResponse } from "@devngn/wellness-types";
import {
  mockPendingPrompt,
  mockCompletedPrompt,
  mockDismissedPrompt,
} from "../../fixtures/wellness";

// ── i18n stub ────────────────────────────────────────────────────────────────
// Provide a minimal $t function so template string interpolation works.
const i18nPlugin = {
  install(app: import("vue").App) {
    app.config.globalProperties.$t = (key: string) => key;
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
      plugins: [pinia, i18nPlugin],
      stubs: {
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
      },
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

  it("uses the prompt's activityTitle as the article aria-label", () => {
    const wrapper = mountCard(mockPendingPrompt as PromptResponse);
    expect(wrapper.attributes("aria-label")).toBe("Take a standing break");
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
    setActivePinia(createPinia());
    const pinia = createPinia();
    const store = useInterruptionsStore(pinia);
    store.prompts = [mockPendingPrompt as PromptResponse];

    const snoozeSpy = vi.spyOn(store, "snooze");

    const wrapper = mount(InterruptionCard, {
      props: { prompt: mockPendingPrompt as PromptResponse },
      global: {
        plugins: [pinia, i18nPlugin],
        stubs: {
          BrutButton: {
            template:
              '<button class="brut-btn-stub" v-bind="$attrs" @click="$emit(\'click\')"><slot/></button>',
            props: ["variant", "size", "loading"],
            emits: ["click"],
          },
          BrutChip: { template: "<span><slot/></span>", props: ["color"] },
        },
      },
    });

    // The Snooze button renders after Complete button — it contains the snoozeCta key
    const buttons = wrapper.findAll(".brut-btn-stub");
    // buttons order: Complete, Snooze, Dismiss (as per template)
    const snoozeBtn = buttons[1];
    await snoozeBtn!.trigger("click");

    expect(snoozeSpy).toHaveBeenCalledWith(mockPendingPrompt.id, 15);
  });

  it("calls store.complete() when Complete button is clicked", async () => {
    setActivePinia(createPinia());
    const pinia = createPinia();
    const store = useInterruptionsStore(pinia);
    store.prompts = [mockPendingPrompt as PromptResponse];

    vi.spyOn(store, "complete").mockResolvedValue(undefined);

    const wrapper = mount(InterruptionCard, {
      props: { prompt: mockPendingPrompt as PromptResponse },
      global: {
        plugins: [pinia, i18nPlugin],
        stubs: {
          BrutButton: {
            template:
              '<button class="brut-btn-stub" v-bind="$attrs" @click="$emit(\'click\')"><slot/></button>',
            props: ["variant", "size", "loading"],
            emits: ["click"],
          },
          BrutChip: { template: "<span><slot/></span>", props: ["color"] },
        },
      },
    });

    const buttons = wrapper.findAll(".brut-btn-stub");
    await buttons[0]!.trigger("click"); // Complete button

    expect(store.complete).toHaveBeenCalledWith(mockPendingPrompt.id);
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
