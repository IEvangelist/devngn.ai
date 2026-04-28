import { randomUUID } from "node:crypto";
import { z } from "zod";

export const SyncEnvelopeSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.literal(1),
  deviceId: z.string().min(1),
  createdAt: z.string().datetime(),
  scope: z.enum([
    "scan-summary",
    "preferences",
    "skills-metadata",
    "recommendations",
  ]),
  redactionVersion: z.literal(1),
  payload: z.unknown(),
});
export type SyncEnvelope = z.infer<typeof SyncEnvelopeSchema>;

export function createSyncEnvelope(
  deviceId: string,
  scope: SyncEnvelope["scope"],
  payload: unknown,
  now = new Date(),
): SyncEnvelope {
  return SyncEnvelopeSchema.parse({
    id: randomUUID(),
    schemaVersion: 1,
    deviceId,
    createdAt: now.toISOString(),
    scope,
    redactionVersion: 1,
    payload,
  });
}
