import { createHash, timingSafeEqual } from "node:crypto";
import { AIRequestSchema } from "@devngn/ai";
import {
  AnalyticsEventSchema,
  DevngnFlowDefinitionSchema,
  DevngnTelemetryConfigSchema,
  createDevngnTelemetryConfig,
  listImportantDevngnFlows,
} from "@devngn/analytics";
import { DevngnManifestSchema } from "@devngn/grounding";
import { PatternDatabaseSchema } from "@devngn/patterns";
import { SyncEnvelopeSchema } from "@devngn/sync";
import {
  VendorIntelligenceDatabaseSchema,
  VendorIntelligenceSchema,
} from "@devngn/vendors";
import { z } from "zod";

export const VendorApiSubscriptionLevelSchema = z.enum([
  "trial",
  "pro",
  "team",
  "enterprise",
]);
export type VendorApiSubscriptionLevel = z.infer<
  typeof VendorApiSubscriptionLevelSchema
>;

export const VendorApiRateLimitPolicySchema = z.object({
  subscriptionLevel: VendorApiSubscriptionLevelSchema,
  requestsPerMinute: z.number().int().positive(),
  burst: z.number().int().positive(),
  maxUrlLength: z.number().int().positive(),
  maxRequestBodyBytes: z.number().int().nonnegative(),
});
export type VendorApiRateLimitPolicy = z.infer<
  typeof VendorApiRateLimitPolicySchema
>;

export const VendorApiAccessSchema = z.object({
  accountId: z.string().min(1),
  subscriptionLevel: VendorApiSubscriptionLevelSchema,
  apiKeyHash: z.string().min(1),
  rateLimit: VendorApiRateLimitPolicySchema,
});
export type VendorApiAccess = z.infer<typeof VendorApiAccessSchema>;

export const VendorApiAuthResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    access: VendorApiAccessSchema,
  }),
  z.object({
    ok: z.literal(false),
    status: z.union([z.literal(401), z.literal(403), z.literal(503)]),
    code: z.string(),
    message: z.string(),
  }),
]);
export type VendorApiAuthResult = z.infer<typeof VendorApiAuthResultSchema>;

type VendorApiKeyRecord = {
  keyHash: string;
  subscriptionLevel: VendorApiSubscriptionLevel;
  accountId: string;
};

const vendorApiRateLimitPolicies = {
  trial: {
    subscriptionLevel: "trial",
    requestsPerMinute: 30,
    burst: 10,
    maxUrlLength: 2048,
    maxRequestBodyBytes: 0,
  },
  pro: {
    subscriptionLevel: "pro",
    requestsPerMinute: 120,
    burst: 30,
    maxUrlLength: 2048,
    maxRequestBodyBytes: 0,
  },
  team: {
    subscriptionLevel: "team",
    requestsPerMinute: 600,
    burst: 120,
    maxUrlLength: 2048,
    maxRequestBodyBytes: 0,
  },
  enterprise: {
    subscriptionLevel: "enterprise",
    requestsPerMinute: 3000,
    burst: 500,
    maxUrlLength: 4096,
    maxRequestBodyBytes: 0,
  },
} satisfies Record<VendorApiSubscriptionLevel, VendorApiRateLimitPolicy>;

export function health() {
  return {
    service: "devngn-api",
    status: "ok",
    slogan: "Manage your AI-bits",
    telemetry: {
      signals: ["logs", "traces", "metrics"],
      standard: "OpenTelemetry",
    },
  };
}

export function validateAnalyticsEvent(input: unknown) {
  return AnalyticsEventSchema.parse(input);
}

export function getVendorApiRateLimitPolicy(
  subscriptionLevel: VendorApiSubscriptionLevel,
): VendorApiRateLimitPolicy {
  return VendorApiRateLimitPolicySchema.parse(
    vendorApiRateLimitPolicies[subscriptionLevel],
  );
}

export function authenticateVendorApiRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): VendorApiAuthResult {
  const records = parseVendorApiKeyRecords(env);

  if (records.length === 0) {
    return VendorApiAuthResultSchema.parse({
      ok: false,
      status: 503,
      code: "vendor_api_not_configured",
      message: "Vendor intelligence API access is not configured.",
    });
  }

  const apiKey = extractApiKey(request);

  if (apiKey === null) {
    return VendorApiAuthResultSchema.parse({
      ok: false,
      status: 401,
      code: "api_key_required",
      message: "Provide an API key with the x-api-key header or Bearer token.",
    });
  }

  const apiKeyHash = hashApiKey(apiKey);
  const record = records.find((candidate) =>
    timingSafeHashEqual(candidate.keyHash, apiKeyHash),
  );

  if (record === undefined) {
    return VendorApiAuthResultSchema.parse({
      ok: false,
      status: 403,
      code: "api_key_forbidden",
      message: "The API key is not authorized for vendor intelligence.",
    });
  }

  return VendorApiAuthResultSchema.parse({
    ok: true,
    access: {
      accountId: record.accountId,
      subscriptionLevel: record.subscriptionLevel,
      apiKeyHash,
      rateLimit: getVendorApiRateLimitPolicy(record.subscriptionLevel),
    },
  });
}

export function telemetryOverview() {
  return {
    config: createDevngnTelemetryConfig({
      source: "api",
      serviceName: "devngn-api",
    }),
    importantFlows: listImportantDevngnFlows(),
  };
}

export function validateTelemetryConfig(input: unknown) {
  return DevngnTelemetryConfigSchema.parse(input);
}

export function validateDevngnFlowDefinition(input: unknown) {
  return DevngnFlowDefinitionSchema.parse(input);
}

export function validateSyncEnvelope(input: unknown) {
  return SyncEnvelopeSchema.parse(input);
}

export function validateAIRequest(input: unknown) {
  return AIRequestSchema.parse(input);
}

export function validateDevngnManifest(input: unknown) {
  return DevngnManifestSchema.parse(input);
}

export function validatePatternDatabase(input: unknown) {
  return PatternDatabaseSchema.parse(input);
}

export function validateVendorIntelligence(input: unknown) {
  return VendorIntelligenceSchema.parse(input);
}

export function validateVendorIntelligenceDatabase(input: unknown) {
  return VendorIntelligenceDatabaseSchema.parse(input);
}

function parseVendorApiKeyRecords(
  env: Record<string, string | undefined>,
): VendorApiKeyRecord[] {
  const records: VendorApiKeyRecord[] = [];
  const defaultKey = env.DEVNGN_VENDOR_API_KEY;

  if (defaultKey !== undefined && defaultKey.trim().length > 0) {
    const subscriptionLevel = VendorApiSubscriptionLevelSchema.parse(
      env.DEVNGN_VENDOR_API_PLAN ?? "trial",
    );
    records.push({
      keyHash: hashApiKey(defaultKey),
      subscriptionLevel,
      accountId: env.DEVNGN_VENDOR_API_ACCOUNT_ID ?? "default",
    });
  }

  const rawCatalog = env.DEVNGN_VENDOR_API_KEYS;

  if (rawCatalog === undefined || rawCatalog.trim().length === 0) {
    return records;
  }

  for (const rawEntry of rawCatalog.split(",")) {
    const entry = rawEntry.trim();

    if (entry.length === 0) {
      continue;
    }

    const [key, rawPlan = "trial", rawAccountId] = entry.split(":");

    if (key === undefined || key.trim().length === 0) {
      throw new Error("DEVNGN_VENDOR_API_KEYS entries must start with a key.");
    }

    const subscriptionLevel = VendorApiSubscriptionLevelSchema.parse(rawPlan);
    records.push({
      keyHash: hashApiKey(key),
      subscriptionLevel,
      accountId:
        rawAccountId?.trim() ?? `${subscriptionLevel}-${records.length + 1}`,
    });
  }

  return records;
}

function extractApiKey(request: Request): string | null {
  const headerKey = request.headers.get("x-api-key");

  if (headerKey !== null && headerKey.trim().length > 0) {
    return headerKey.trim();
  }

  const authorization = request.headers.get("authorization");

  if (authorization === null) {
    return null;
  }

  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization.trim());

  return bearerMatch?.[1]?.trim() || null;
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function timingSafeHashEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
