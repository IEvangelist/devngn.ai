// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Component tests for BrutButton.
 *
 * Tests the rendered output, prop variants, disabled/loading states,
 * and ARIA attributes.  Uses @vue/test-utils mount() directly since
 * BrutButton has no async setup or Nuxt-specific composables.
 */

import { mount } from "@vue/test-utils";
import BrutButton from "~/components/ui/BrutButton.vue";

describe("BrutButton — rendering", () => {
  it("renders slot content", () => {
    const wrapper = mount(BrutButton, { slots: { default: "Click me" } });
    expect(wrapper.text()).toBe("Click me");
  });

  it("renders as a <button> by default", () => {
    const wrapper = mount(BrutButton, { slots: { default: "Go" } });
    expect(wrapper.element.tagName).toBe("BUTTON");
  });

  it("renders as an <a> tag when tag='a'", () => {
    const wrapper = mount(BrutButton, {
      props: { tag: "a" },
      slots: { default: "Link" },
    });
    expect(wrapper.element.tagName).toBe("A");
  });

  it("applies the brut-btn base class", () => {
    const wrapper = mount(BrutButton, { slots: { default: "x" } });
    expect(wrapper.classes()).toContain("brut-btn");
  });

  it("applies variant class when variant prop is set", () => {
    const wrapper = mount(BrutButton, {
      props: { variant: "accent" },
      slots: { default: "x" },
    });
    expect(wrapper.classes()).toContain("brut-btn--accent");
  });

  it("applies size class when size prop is set", () => {
    const wrapper = mount(BrutButton, {
      props: { size: "sm" },
      slots: { default: "x" },
    });
    expect(wrapper.classes()).toContain("brut-btn--sm");
  });

  it("applies block class when block prop is true", () => {
    const wrapper = mount(BrutButton, {
      props: { block: true },
      slots: { default: "x" },
    });
    expect(wrapper.classes()).toContain("brut-btn--block");
  });
});

describe("BrutButton — disabled state", () => {
  it("sets disabled attribute when disabled prop is true", () => {
    const wrapper = mount(BrutButton, {
      props: { disabled: true },
      slots: { default: "x" },
    });
    expect(wrapper.attributes("disabled")).toBeDefined();
  });

  it("sets aria-disabled when disabled", () => {
    const wrapper = mount(BrutButton, {
      props: { disabled: true },
      slots: { default: "x" },
    });
    expect(wrapper.attributes("aria-disabled")).toBe("true");
  });

  it("sets aria-disabled to false when NOT disabled", () => {
    const wrapper = mount(BrutButton, {
      props: { disabled: false },
      slots: { default: "x" },
    });
    expect(wrapper.attributes("aria-disabled")).toBe("false");
  });
});

describe("BrutButton — loading state", () => {
  it("shows spinner and hides slot when loading is true", () => {
    const wrapper = mount(BrutButton, {
      props: { loading: true },
      slots: { default: "Submit" },
    });
    expect(wrapper.find(".brut-btn__spinner").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Submit");
  });

  it("sets aria-busy when loading", () => {
    const wrapper = mount(BrutButton, {
      props: { loading: true },
      slots: { default: "x" },
    });
    expect(wrapper.attributes("aria-busy")).toBe("true");
  });

  it("aria-busy is false when NOT loading", () => {
    const wrapper = mount(BrutButton, {
      props: { loading: false },
      slots: { default: "x" },
    });
    expect(wrapper.attributes("aria-busy")).toBe("false");
  });

  it("is disabled when loading (prevents double-submit)", () => {
    const wrapper = mount(BrutButton, {
      props: { loading: true },
      slots: { default: "x" },
    });
    expect(wrapper.attributes("disabled")).toBeDefined();
  });
});

describe("BrutButton — type attribute", () => {
  it("sets type='button' by default on <button> elements", () => {
    const wrapper = mount(BrutButton, { slots: { default: "x" } });
    expect(wrapper.attributes("type")).toBe("button");
  });

  it("respects explicit type='submit'", () => {
    const wrapper = mount(BrutButton, {
      props: { type: "submit" },
      slots: { default: "x" },
    });
    expect(wrapper.attributes("type")).toBe("submit");
  });

  it("does NOT set type attribute on non-button elements", () => {
    const wrapper = mount(BrutButton, {
      props: { tag: "a" },
      slots: { default: "Link" },
    });
    expect(wrapper.attributes("type")).toBeUndefined();
  });
});
