import { AIRequestSchema } from "@devngn/ai";
import { AnalyticsEventSchema } from "@devngn/analytics";
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
