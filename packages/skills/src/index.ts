import type { AIBit } from "@devngn/core";

export interface SkillSummary {
  id: string;
  name: string;
  vendorId: string | null;
  sourcePath: string;
  status: AIBit["status"];
}

export function summarizeSkills(aiBits: readonly AIBit[]): SkillSummary[] {
  return aiBits
    .filter((bit) => bit.kind === "skill")
    .map((bit) => ({
      id: bit.id,
      name: bit.name,
      vendorId: bit.vendorId,
      sourcePath: bit.sourcePath,
      status: bit.status,
    }));
}
