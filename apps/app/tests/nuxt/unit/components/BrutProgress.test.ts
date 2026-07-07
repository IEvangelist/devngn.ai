// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Component tests for BrutProgress.
 *
 * Verifies the percent computation, ARIA attributes (role="progressbar",
 * aria-valuenow/min/max, aria-label), fill width style, and optional label.
 */

import { mount } from "@vue/test-utils";
import BrutProgress from "~/components/ui/BrutProgress.vue";

describe("BrutProgress — ARIA attributes", () => {
  it("has role='progressbar'", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 100, label: "Progress" },
    });
    expect(wrapper.attributes("role")).toBe("progressbar");
  });

  it("sets aria-valuenow to the value prop", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 75, max: 100, label: "Progress" },
    });
    expect(wrapper.attributes("aria-valuenow")).toBe("75");
  });

  it("sets aria-valuemin to 0", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 100, label: "Progress" },
    });
    expect(wrapper.attributes("aria-valuemin")).toBe("0");
  });

  it("sets aria-valuemax to the max prop", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 200, label: "Progress" },
    });
    expect(wrapper.attributes("aria-valuemax")).toBe("200");
  });

  it("sets aria-label to the label prop", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 100, label: "XP progress" },
    });
    expect(wrapper.attributes("aria-label")).toBe("XP progress");
  });

  it("defaults max to 100 when not provided", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, label: "Progress" },
    });
    expect(wrapper.attributes("aria-valuemax")).toBe("100");
  });
});

describe("BrutProgress — percent calculation and fill style", () => {
  it("fills the bar to the correct percentage (50/100 = 50%)", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 100, label: "Progress" },
    });
    const fill = wrapper.find(".brut-progress__fill");
    expect(fill.attributes("style")).toContain("width: 50%");
  });

  it("fills the bar correctly for non-100 max (25/200 = 12.5% → rounds to 13%)", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 25, max: 200, label: "Progress" },
    });
    const fill = wrapper.find(".brut-progress__fill");
    // Math.round(25/200*100) = Math.round(12.5) = 13
    expect(fill.attributes("style")).toContain("width: 13%");
  });

  it("caps at 100% when value exceeds max", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 150, max: 100, label: "Progress" },
    });
    const fill = wrapper.find(".brut-progress__fill");
    expect(fill.attributes("style")).toContain("width: 100%");
  });

  it("shows 0% when value is 0", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 0, max: 100, label: "Progress" },
    });
    const fill = wrapper.find(".brut-progress__fill");
    expect(fill.attributes("style")).toContain("width: 0%");
  });

  it("applies color class when color prop is provided", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 100, label: "Progress", color: "teal" },
    });
    const fill = wrapper.find(".brut-progress__fill");
    expect(fill.classes()).toContain("brut-progress__fill--teal");
  });
});

describe("BrutProgress — label display", () => {
  it("does NOT render the label span when showLabel is false (default)", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 100, label: "Progress" },
    });
    expect(wrapper.find(".brut-progress__label").exists()).toBe(false);
  });

  it("renders the label span when showLabel is true", () => {
    const wrapper = mount(BrutProgress, {
      props: { value: 50, max: 100, label: "Progress", showLabel: true },
    });
    const labelEl = wrapper.find(".brut-progress__label");
    expect(labelEl.exists()).toBe(true);
    expect(labelEl.text()).toContain("50");
    expect(labelEl.text()).toContain("100");
  });
});
