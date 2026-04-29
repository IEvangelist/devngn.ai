import { afterEach, describe, expect, it } from "vitest";
import { guardVendorApiRequest } from "./vendor-api";

const originalVendorApiKeys = process.env.DEVNGN_VENDOR_API_KEYS;

afterEach(() => {
  if (originalVendorApiKeys === undefined) {
    delete process.env.DEVNGN_VENDOR_API_KEYS;
    return;
  }

  process.env.DEVNGN_VENDOR_API_KEYS = originalVendorApiKeys;
});

describe("vendor API guard", () => {
  it("enforces API-key access", () => {
    process.env.DEVNGN_VENDOR_API_KEYS = "guard-key:trial:test";

    const result = guardVendorApiRequest(
      new Request("https://devngn.ai/api/vendors"),
    );

    expect(result).toBeInstanceOf(Response);

    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
  });

  it("enforces per-subscription rate limits", () => {
    process.env.DEVNGN_VENDOR_API_KEYS = "rate-key:trial:test";
    const request = () =>
      new Request("https://devngn.ai/api/vendors", {
        headers: {
          "x-api-key": "rate-key",
        },
      });

    for (let index = 0; index < 30; index += 1) {
      expect(guardVendorApiRequest(request())).not.toBeInstanceOf(Response);
    }

    const limited = guardVendorApiRequest(request());

    expect(limited).toBeInstanceOf(Response);

    if (limited instanceof Response) {
      expect(limited.status).toBe(429);
      expect(limited.headers.get("x-ratelimit-plan")).toBe("trial");
    }
  });

  it("rejects request bodies on GET endpoints", () => {
    const result = guardVendorApiRequest(
      new Request("https://devngn.ai/api/vendors", {
        headers: {
          "content-length": "1",
        },
      }),
    );

    expect(result).toBeInstanceOf(Response);

    if (result instanceof Response) {
      expect(result.status).toBe(413);
    }
  });
});
