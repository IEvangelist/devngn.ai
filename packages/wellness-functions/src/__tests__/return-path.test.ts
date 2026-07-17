// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isSafeReturnPath } from "../handlers/shared.js";

const ORIGIN = "https://devngn.ai";

describe("isSafeReturnPath", () => {
  it.each([null, "", "/", "/settings", "/auth/callback?connected=github"])(
    "accepts same-origin relative path %s",
    (path) => {
      expect(isSafeReturnPath(path, ORIGIN)).toBe(true);
    },
  );

  it.each([
    "https://attacker.example/",
    "//attacker.example/",
    "/\\attacker.example/",
    "/\t/attacker.example/",
    "/\n/attacker.example/",
  ])("rejects redirect escape %j", (path) => {
    expect(isSafeReturnPath(path, ORIGIN)).toBe(false);
  });
});
