import { getBundledRegistry } from "@devngn/vendors";

export interface ResearchSkillPrompt {
  vendorId: string;
  vendorName: string;
  prompt: string;
}

export function listResearchTargets(): ResearchSkillPrompt[] {
  return getBundledRegistry().map((vendor) => ({
    vendorId: vendor.id,
    vendorName: vendor.name,
    prompt: createResearchSkillPrompt(vendor.id, vendor.name),
  }));
}

export function createResearchSkillPrompt(
  vendorId: string,
  vendorName: string,
): string {
  return [
    `/research ${vendorName}`,
    "",
    "Find the vendor's current AI tooling patterns for devngn.ai.",
    "Return structured data for:",
    "- User, workspace, project, extension, and CLI folder structures.",
    "- Expected file names, glob patterns, file types, and metadata schemas.",
    "- Instruction, skill, prompt, rule, memory, model preference, MCP, and eval locations.",
    "- Precedence rules between user, workspace, project, and tool-specific scopes.",
    "- Commands, version checks, extension IDs, update channels, and package managers.",
    "- Official or supported SDKs, authentication mechanisms, token accounting APIs, context limits, model listing, streaming, tool-calling, structured output, file, embedding, and eval capabilities.",
    "- Any limits or terms that affect whether devngn can bootstrap against and consume this provider directly.",
    "- Logo/icon/product naming references that are safe to link or display.",
    "- Source URLs, last researched date, confidence, and open questions.",
    "",
    `Vendor ID: ${vendorId}`,
  ].join("\n");
}
