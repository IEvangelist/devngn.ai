import { describe, expect, it } from "vitest";
import {
  authenticateVendorApiRequest,
  getVendorApiRateLimitPolicy,
} from "./index.js";

describe("vendor API auth", () => {
  it("requires API keys for vendor intelligence", () => {
    const result = authenticateVendorApiRequest(
      new Request("https://devngn.ai/api/vendors"),
      {},
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.status).toBe(503);
    }
  });

  it("authenticates configured API keys with subscription rate limits", () => {
    const result = authenticateVendorApiRequest(
      new Request("https://devngn.ai/api/vendors", {
        headers: {
          "x-api-key": "local-key",
        },
      }),
      {
        DEVNGN_VENDOR_API_KEYS: "local-key:team:acct_123",
      },
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.access.accountId).toBe("acct_123");
      expect(result.access.subscriptionLevel).toBe("team");
      expect(result.access.rateLimit.requestsPerMinute).toBe(600);
    }
  });

  it("exposes per-subscription rate limit policies", () => {
    expect(getVendorApiRateLimitPolicy("trial").requestsPerMinute).toBeLessThan(
      getVendorApiRateLimitPolicy("enterprise").requestsPerMinute,
    );
  });
});
