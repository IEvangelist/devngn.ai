import { describe, expect, it } from "vitest";
import {
  getVendorIntelligenceByIdOrAlias,
  getVendorIntelligenceDatabase,
} from "./index.js";

describe("vendor intelligence", () => {
  it("builds subscriber vendor intelligence from the bundled registry", () => {
    const database = getVendorIntelligenceDatabase(
      new Date("2026-04-29T00:00:00.000Z"),
    );

    expect(database.accessTier).toBe("subscriber");
    expect(database.vendors.length).toBeGreaterThan(0);
    expect(database.vendors[0]).toHaveProperty("fileLocations");
    expect(database.vendors[0]).toHaveProperty("standards");
  });

  it("resolves high-value aliases for REST detail routes", () => {
    expect(getVendorIntelligenceByIdOrAlias("anthropic")?.id).toBe(
      "anthropic-claude-code",
    );
    expect(getVendorIntelligenceByIdOrAlias("openai")?.id).toBe("openai-codex");
    expect(getVendorIntelligenceByIdOrAlias("opecode")?.id).toBe(
      "openai-codex",
    );
  });
});
