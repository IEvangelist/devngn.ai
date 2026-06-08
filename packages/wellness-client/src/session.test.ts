// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isSessionUsable, type StoredSession } from "./session.js";

const base: StoredSession = {
  accessToken: "jwt",
  tokenType: "Bearer",
  expiresAt: "2026-01-01T00:00:00Z",
};

describe("isSessionUsable", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("is usable well before expiry", () => {
    expect(isSessionUsable(base, now - 60_000)).toBe(true);
  });

  it("is not usable after expiry", () => {
    expect(isSessionUsable(base, now + 1_000)).toBe(false);
  });

  it("is not usable within the skew window before expiry", () => {
    expect(isSessionUsable(base, now - 10_000, 30_000)).toBe(false);
  });

  it("treats an unparseable expiry as usable", () => {
    expect(isSessionUsable({ ...base, expiresAt: "not-a-date" }, now)).toBe(
      true,
    );
  });
});
