// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import {
  buildAuthCallbackReturnPath,
  hasValidAuthCallbackNonce,
  parseAuthCallbackFragment,
} from "../../../../app/utils/authCallback";

describe("auth callback helpers", () => {
  it("parses successful OAuth fragments", () => {
    const result = parseAuthCallbackFragment(
      "#access_token=jwt-token&token_type=Bearer&expires_at=1783479459",
    );

    expect(result).toEqual({
      kind: "success",
      accessToken: "jwt-token",
      tokenType: "Bearer",
      expiresAt: "1783479459",
    });
  });

  it("parses provider error fragments", () => {
    const result = parseAuthCallbackFragment(
      "#error=access_denied&error_description=User%20cancelled",
    );

    expect(result).toEqual({
      kind: "error",
      error: "access_denied",
      errorDescription: "User cancelled",
    });
  });

  it("rejects callback searches without the stored nonce", () => {
    expect(hasValidAuthCallbackNonce("?n=expected", "expected")).toBe(true);
    expect(hasValidAuthCallbackNonce("?n=unexpected", "expected")).toBe(false);
    expect(hasValidAuthCallbackNonce("?n=expected", null)).toBe(false);
  });

  it("builds the relative callback return path with an encoded nonce", () => {
    expect(buildAuthCallbackReturnPath("nonce value")).toBe(
      "/auth/callback?n=nonce%20value",
    );
  });
});
