import { randomUUID } from "node:crypto";
import { z } from "zod";

export const AnalyticsEventSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.literal(1),
  name: z.enum([
    "install.detected",
    "scan.started",
    "scan.completed",
    "finding.reported",
    "recommendation.actioned",
    "skill.eval.started",
    "skill.eval.completed",
    "ai.bootstrap.created",
    "ai.provider.detected",
    "ai.request.completed",
    "sync.completed",
    "update.checked",
    "extension.activated",
  ]),
  source: z.enum(["cli", "vscode", "site", "api"]),
  timestamp: z.string().datetime(),
  properties: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

const sensitivePropertyPattern =
  /(secret|token|key|password|path|file|env|prompt|completion|instruction)/i;

export function createAnalyticsEvent(
  name: AnalyticsEvent["name"],
  source: AnalyticsEvent["source"],
  properties: AnalyticsEvent["properties"] = {},
  now = new Date(),
): AnalyticsEvent {
  return AnalyticsEventSchema.parse({
    id: randomUUID(),
    schemaVersion: 1,
    name,
    source,
    timestamp: now.toISOString(),
    properties: redactAnalyticsProperties(properties),
  });
}

export function redactAnalyticsProperties(
  properties: AnalyticsEvent["properties"],
): AnalyticsEvent["properties"] {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) => !sensitivePropertyPattern.test(key),
    ),
  );
}
