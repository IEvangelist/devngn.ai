// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import { mount } from "@vue/test-utils";
import BrandWordmark from "~/components/BrandWordmark.vue";

describe("BrandWordmark", () => {
  it("renders the canonical full brand name", () => {
    const wrapper = mount(BrandWordmark);

    expect(wrapper.text()).toBe("devngn.ai");
    expect(wrapper.attributes("aria-label")).toBe("devngn.ai");
  });

  it("exposes the canonical color segments", () => {
    const wrapper = mount(BrandWordmark);

    expect(wrapper.find(".brand-wordmark__dev").text()).toBe("dev");
    expect(wrapper.find(".brand-wordmark__ngn").text()).toBe("ngn");
    expect(wrapper.find(".brand-wordmark__dot").text()).toBe(".");
    expect(wrapper.find(".brand-wordmark__ai").text()).toBe("ai");
  });
});
