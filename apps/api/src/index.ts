import { AIRequestSchema } from "@devngn/ai";
import { AnalyticsEventSchema } from "@devngn/analytics";
import { DevngnManifestSchema } from "@devngn/grounding";
import { PatternDatabaseSchema } from "@devngn/patterns";
import { SyncEnvelopeSchema } from "@devngn/sync";

export function health() {
  return {
    service: "devngn-api",
    status: "ok",
    slogan: "Manage your AI-bits",
  };
}

export function validateAnalyticsEvent(input: unknown) {
  return AnalyticsEventSchema.parse(input);
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
