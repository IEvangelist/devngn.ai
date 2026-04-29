import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ScanResult } from "@devngn/core";

export const PatternCategorySchema = z.enum([
  "agent-instructions",
  "custom-instructions",
  "skills",
  "rules",
  "prompts",
  "memory",
  "mcp",
  "evals",
  "model-preferences",
  "provider-runtime",
  "grounding",
  "notifications",
  "workspace-policy",
]);
export type PatternCategory = z.infer<typeof PatternCategorySchema>;

export const AdoptionLevelSchema = z.enum([
  "emerging",
  "growing",
  "widespread",
  "legacy",
]);
export type AdoptionLevel = z.infer<typeof AdoptionLevelSchema>;

export const TrendDirectionSchema = z.enum([
  "rising",
  "stable",
  "declining",
  "watch",
]);
export type TrendDirection = z.infer<typeof TrendDirectionSchema>;

export const ExperienceTriggerSchema = z.enum([
  "inventory",
  "drift-detection",
  "conflict-detection",
  "skills-explorer",
  "eval-runner",
  "token-dashboard",
  "provider-bootstrap",
  "grounding-profile",
  "comms",
  "cleanup-suggestions",
  "mcp-explorer",
  "research",
  "docs",
]);
export type ExperienceTrigger = z.infer<typeof ExperienceTriggerSchema>;

export const PatternSignalSchema = z.object({
  kind: z.enum([
    "workspace-file",
    "workspace-directory",
    "package-json-field",
    "ai-bit-kind",
    "ai-bit-name-contains",
    "vendor-id",
    "tool-command",
    "finding-id-prefix",
  ]),
  value: z.string().min(1),
  weight: z.number().positive().default(1),
  description: z.string().optional(),
});
export type PatternSignal = z.infer<typeof PatternSignalSchema>;

export const PatternSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
});
export type PatternSource = z.infer<typeof PatternSourceSchema>;

export const PatternTrendSchema = z.object({
  direction: TrendDirectionSchema,
  adoptionScore: z.number().min(0).max(100),
  velocity: z.number().min(-100).max(100),
  confidence: z.number().min(0).max(1),
  lastReviewedAt: z.string().datetime(),
  reviewCadenceDays: z.number().int().positive(),
  evidence: z.array(z.string()),
});
export type PatternTrend = z.infer<typeof PatternTrendSchema>;

export const AIPatternSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  summary: z.string(),
  category: PatternCategorySchema,
  adoption: AdoptionLevelSchema,
  trend: PatternTrendSchema,
  tags: z.array(z.string()).default([]),
  vendors: z.array(z.string()).default([]),
  signals: z.array(PatternSignalSchema).min(1),
  experienceTriggers: z.array(ExperienceTriggerSchema).min(1),
  guidance: z.string(),
  sources: z.array(PatternSourceSchema).default([]),
});
export type AIPattern = z.infer<typeof AIPatternSchema>;
type AIPatternInput = z.input<typeof AIPatternSchema>;

export const PatternDatabaseSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  patterns: z.array(AIPatternSchema),
});
export type PatternDatabase = z.infer<typeof PatternDatabaseSchema>;

export const PatternMatchSchema = z.object({
  patternId: z.string(),
  name: z.string(),
  category: PatternCategorySchema,
  adoption: AdoptionLevelSchema,
  trend: TrendDirectionSchema,
  score: z.number().min(0).max(1),
  experienceTriggers: z.array(ExperienceTriggerSchema),
  guidance: z.string(),
  matches: z.array(
    z.object({
      signal: PatternSignalSchema,
      locations: z.array(z.string()).default([]),
      aiBitIds: z.array(z.string()).default([]),
      toolCommands: z.array(z.string()).default([]),
      findingIds: z.array(z.string()).default([]),
    }),
  ),
});
export type PatternMatch = z.infer<typeof PatternMatchSchema>;

export const PatternTrendSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byAdoption: z.record(z.string(), z.number().int().nonnegative()),
  byTrend: z.record(z.string(), z.number().int().nonnegative()),
  rising: z.array(z.string()),
  watch: z.array(z.string()),
});
export type PatternTrendSummary = z.infer<typeof PatternTrendSummarySchema>;

const reviewedAt = "2026-04-29T00:00:00.000Z";

const patterns = [
  {
    id: "agents-md",
    name: "AGENTS.md workspace agent instructions",
    summary:
      "A root AGENTS.md file gives coding agents durable workspace guidance.",
    category: "agent-instructions",
    adoption: "widespread",
    trend: {
      direction: "rising",
      adoptionScore: 86,
      velocity: 34,
      confidence: 0.82,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 30,
      evidence: [
        "Common across coding-agent CLIs and hosted agent workflows.",
        "Works without vendor-specific folders and is easy for repositories to review.",
      ],
    },
    tags: ["instructions", "workspace", "agents"],
    vendors: ["openai-codex"],
    signals: [
      {
        kind: "workspace-file",
        value: "AGENTS.md",
        description: "Root agent instructions file.",
      },
      {
        kind: "ai-bit-name-contains",
        value: "agent instructions",
        weight: 0.6,
      },
    ],
    experienceTriggers: [
      "inventory",
      "provider-bootstrap",
      "grounding-profile",
      "docs",
      "cleanup-suggestions",
    ],
    guidance:
      "Prefer reading and preserving AGENTS.md before creating vendor-specific instruction files.",
    sources: [
      { title: "OpenAI Codex", url: "https://github.com/openai/codex" },
    ],
  },
  {
    id: "github-copilot-instructions",
    name: "GitHub Copilot custom instructions and prompts",
    summary:
      "GitHub Copilot supports repository instructions and reusable prompt files under .github.",
    category: "custom-instructions",
    adoption: "widespread",
    trend: {
      direction: "stable",
      adoptionScore: 82,
      velocity: 12,
      confidence: 0.86,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 30,
      evidence: [
        "Documented by GitHub Copilot and visible in many repositories.",
        "Maps cleanly to devngn instruction and prompt AI-bits.",
      ],
    },
    tags: ["copilot", "instructions", "prompts"],
    vendors: ["github-copilot"],
    signals: [
      { kind: "workspace-file", value: ".github/copilot-instructions.md" },
      { kind: "workspace-directory", value: ".github/instructions" },
      { kind: "workspace-directory", value: ".github/prompts" },
      { kind: "vendor-id", value: "github-copilot", weight: 0.4 },
    ],
    experienceTriggers: [
      "inventory",
      "conflict-detection",
      "provider-bootstrap",
      "docs",
    ],
    guidance:
      "Light up Copilot-aware instruction management and check for conflicts with other workspace guidance.",
    sources: [
      { title: "GitHub Copilot docs", url: "https://docs.github.com/copilot" },
    ],
  },
  {
    id: "claude-memory-and-commands",
    name: "Claude Code memory and command files",
    summary:
      "Claude Code commonly uses CLAUDE.md plus .claude settings or command folders.",
    category: "memory",
    adoption: "growing",
    trend: {
      direction: "rising",
      adoptionScore: 74,
      velocity: 29,
      confidence: 0.78,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 21,
      evidence: [
        "Claude Code has a fast-moving local developer workflow.",
        "Memory and command files affect agent behavior strongly.",
      ],
    },
    tags: ["claude", "memory", "commands"],
    vendors: ["anthropic-claude-code"],
    signals: [
      { kind: "workspace-file", value: "CLAUDE.md" },
      { kind: "workspace-file", value: ".claude/settings.json" },
      { kind: "workspace-directory", value: ".claude/commands" },
      { kind: "vendor-id", value: "anthropic-claude-code", weight: 0.4 },
    ],
    experienceTriggers: [
      "inventory",
      "skills-explorer",
      "provider-bootstrap",
      "research",
    ],
    guidance:
      "Recognize Claude memory separately from generic instructions and surface commands in the skills explorer.",
    sources: [
      {
        title: "Claude Code docs",
        url: "https://docs.anthropic.com/claude-code",
      },
    ],
  },
  {
    id: "cursor-rules",
    name: "Cursor rules",
    summary:
      "Cursor rules are a widely adopted project-level way to shape editor AI behavior.",
    category: "rules",
    adoption: "widespread",
    trend: {
      direction: "stable",
      adoptionScore: 80,
      velocity: 16,
      confidence: 0.8,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 30,
      evidence: [
        ".cursor/rules and legacy .cursorrules are commonly found in AI-enabled repositories.",
      ],
    },
    tags: ["cursor", "rules", "editor"],
    vendors: ["cursor"],
    signals: [
      { kind: "workspace-directory", value: ".cursor/rules" },
      { kind: "workspace-file", value: ".cursorrules" },
      { kind: "vendor-id", value: "cursor", weight: 0.4 },
    ],
    experienceTriggers: [
      "inventory",
      "conflict-detection",
      "cleanup-suggestions",
      "docs",
    ],
    guidance:
      "Treat Cursor rules as managed AI-bits and detect overlap with Copilot, AGENTS.md, and Claude guidance.",
    sources: [{ title: "Cursor docs", url: "https://docs.cursor.com" }],
  },
  {
    id: "windsurf-rules",
    name: "Windsurf rules",
    summary:
      "Windsurf/Codeium-style rule folders customize AI behavior in editor workflows.",
    category: "rules",
    adoption: "growing",
    trend: {
      direction: "rising",
      adoptionScore: 64,
      velocity: 24,
      confidence: 0.7,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 21,
      evidence: [
        "Windsurf rules are increasingly present in AI-editor workspaces.",
      ],
    },
    tags: ["windsurf", "codeium", "rules"],
    vendors: ["windsurf-codeium"],
    signals: [
      { kind: "workspace-directory", value: ".windsurf/rules" },
      { kind: "vendor-id", value: "windsurf-codeium", weight: 0.4 },
    ],
    experienceTriggers: ["inventory", "conflict-detection", "research"],
    guidance:
      "Surface Windsurf rules alongside other rule systems and watch for duplicate guidance.",
    sources: [{ title: "Windsurf docs", url: "https://docs.windsurf.com" }],
  },
  {
    id: "mcp-config",
    name: "Model Context Protocol configuration",
    summary:
      "MCP server config files describe external tools and context sources available to AI clients.",
    category: "mcp",
    adoption: "growing",
    trend: {
      direction: "rising",
      adoptionScore: 72,
      velocity: 39,
      confidence: 0.78,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 14,
      evidence: [
        "MCP is increasingly used across agent CLIs, editors, and workflow tools.",
        "MCP config directly changes which tools an AI can call.",
      ],
    },
    tags: ["mcp", "tools", "context"],
    vendors: ["anthropic-claude-code", "cline-roo", "continue"],
    signals: [
      { kind: "workspace-file", value: ".mcp.json" },
      { kind: "workspace-file", value: "mcp.json" },
      { kind: "workspace-file", value: ".vscode/mcp.json" },
      { kind: "ai-bit-kind", value: "mcp-config", weight: 0.8 },
    ],
    experienceTriggers: [
      "inventory",
      "mcp-explorer",
      "grounding-profile",
      "conflict-detection",
    ],
    guidance:
      "Light up an MCP explorer and include available tools in the grounding profile after redaction.",
    sources: [
      {
        title: "Model Context Protocol",
        url: "https://modelcontextprotocol.io",
      },
    ],
  },
  {
    id: "promptfoo-evals",
    name: "Promptfoo evals",
    summary:
      "promptfoo configuration indicates a project is evaluating prompts, skills, or model behavior.",
    category: "evals",
    adoption: "growing",
    trend: {
      direction: "rising",
      adoptionScore: 61,
      velocity: 22,
      confidence: 0.73,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 30,
      evidence: [
        "promptfoo is a popular OSS eval framework for prompts and model outputs.",
      ],
    },
    tags: ["evals", "promptfoo", "quality"],
    vendors: [],
    signals: [
      { kind: "workspace-file", value: "promptfooconfig.yaml" },
      { kind: "workspace-file", value: "promptfooconfig.yml" },
      { kind: "workspace-file", value: "promptfooconfig.json" },
      { kind: "workspace-file", value: "promptfoo.config.js" },
      { kind: "ai-bit-kind", value: "eval", weight: 0.8 },
    ],
    experienceTriggers: ["eval-runner", "inventory", "docs"],
    guidance:
      "Light up eval workflows and suggest skill/prompt coverage for detected AI-bits.",
    sources: [{ title: "promptfoo", url: "https://www.promptfoo.dev" }],
  },
  {
    id: "continue-assistant-config",
    name: "Continue assistant configuration",
    summary:
      "Continue config files capture model preferences, rules, and assistant behavior.",
    category: "model-preferences",
    adoption: "growing",
    trend: {
      direction: "stable",
      adoptionScore: 58,
      velocity: 11,
      confidence: 0.72,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 30,
      evidence: [
        "Continue is a common open-source AI editor extension with explicit model and rule config.",
      ],
    },
    tags: ["continue", "models", "config"],
    vendors: ["continue"],
    signals: [
      { kind: "workspace-file", value: ".continue/config.json" },
      { kind: "workspace-directory", value: ".continue/rules" },
      { kind: "vendor-id", value: "continue", weight: 0.4 },
    ],
    experienceTriggers: [
      "inventory",
      "provider-bootstrap",
      "conflict-detection",
      "token-dashboard",
    ],
    guidance:
      "Use Continue config to infer model preferences and flag conflicts with devngn provider settings.",
    sources: [{ title: "Continue docs", url: "https://docs.continue.dev" }],
  },
  {
    id: "roo-cline-rules-and-modes",
    name: "Cline/Roo rules and modes",
    summary:
      "Cline and Roo-style files define local agent rules, modes, and workflow constraints.",
    category: "rules",
    adoption: "growing",
    trend: {
      direction: "rising",
      adoptionScore: 66,
      velocity: 26,
      confidence: 0.76,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 21,
      evidence: [
        "Cline/Roo workflows often include explicit rule and mode files.",
      ],
    },
    tags: ["cline", "roo", "rules", "modes"],
    vendors: ["cline-roo"],
    signals: [
      { kind: "workspace-file", value: ".clinerules" },
      { kind: "workspace-directory", value: ".roo/rules" },
      { kind: "workspace-file", value: ".roomodes" },
      { kind: "vendor-id", value: "cline-roo", weight: 0.4 },
    ],
    experienceTriggers: ["inventory", "conflict-detection", "skills-explorer"],
    guidance:
      "Group Cline/Roo rules and modes together so users can reason about agent behavior.",
    sources: [{ title: "Cline docs", url: "https://docs.cline.bot" }],
  },
  {
    id: "devngn-workspace-policy",
    name: "devngn workspace policy",
    summary:
      "Shareable devngn policy should use package.json#devngn or root devngn.config.* instead of private dotfolders.",
    category: "workspace-policy",
    adoption: "emerging",
    trend: {
      direction: "watch",
      adoptionScore: 20,
      velocity: 12,
      confidence: 0.9,
      lastReviewedAt: reviewedAt,
      reviewCadenceDays: 14,
      evidence: [
        "Product convention: devngn-owned private state uses OS-native storage; workspace policy should be explicit and reviewable.",
      ],
    },
    tags: ["devngn", "policy", "workspace"],
    vendors: [],
    signals: [
      { kind: "package-json-field", value: "devngn" },
      { kind: "workspace-file", value: "devngn.config.json" },
      { kind: "workspace-file", value: "devngn.config.ts" },
      { kind: "workspace-file", value: "devngn.config.mjs" },
    ],
    experienceTriggers: [
      "grounding-profile",
      "cleanup-suggestions",
      "docs",
      "research",
    ],
    guidance:
      "Treat explicit workspace policy as team-owned guidance and keep generated/private state in OS-native locations.",
    sources: [{ title: "devngn.ai", url: "https://devngn.ai" }],
  },
] satisfies AIPatternInput[];

export function getPatternDatabase(
  now = new Date("2026-04-29T00:00:00.000Z"),
): PatternDatabase {
  return PatternDatabaseSchema.parse({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    patterns,
  });
}

export function summarizePatternTrends(
  database = getPatternDatabase(),
): PatternTrendSummary {
  return PatternTrendSummarySchema.parse({
    total: database.patterns.length,
    byAdoption: countBy(database.patterns.map((pattern) => pattern.adoption)),
    byTrend: countBy(
      database.patterns.map((pattern) => pattern.trend.direction),
    ),
    rising: database.patterns
      .filter((pattern) => pattern.trend.direction === "rising")
      .map((pattern) => pattern.id),
    watch: database.patterns
      .filter((pattern) => pattern.trend.direction === "watch")
      .map((pattern) => pattern.id),
  });
}

export function recognizePatterns(
  scan: ScanResult,
  database = getPatternDatabase(),
): PatternMatch[] {
  return database.patterns
    .map((pattern) => recognizePattern(pattern, scan))
    .filter((match): match is PatternMatch => match !== null)
    .sort(
      (left, right) =>
        right.score - left.score || left.name.localeCompare(right.name),
    );
}

export function listExperienceTriggers(
  matches: readonly PatternMatch[],
): ExperienceTrigger[] {
  const triggers = new Set<ExperienceTrigger>();

  for (const match of matches) {
    for (const trigger of match.experienceTriggers) {
      triggers.add(trigger);
    }
  }

  return [...triggers].sort();
}

function recognizePattern(
  pattern: AIPattern,
  scan: ScanResult,
): PatternMatch | null {
  const matches = pattern.signals
    .map((signal) => matchSignal(signal, scan))
    .filter(
      (match): match is PatternMatch["matches"][number] => match !== null,
    );
  const matchedWeight = matches.reduce(
    (total, match) => total + match.signal.weight,
    0,
  );
  const totalWeight = pattern.signals.reduce(
    (total, signal) => total + signal.weight,
    0,
  );

  if (matchedWeight === 0 || totalWeight === 0) {
    return null;
  }

  return PatternMatchSchema.parse({
    patternId: pattern.id,
    name: pattern.name,
    category: pattern.category,
    adoption: pattern.adoption,
    trend: pattern.trend.direction,
    score: Math.min(1, Number((matchedWeight / totalWeight).toFixed(3))),
    experienceTriggers: pattern.experienceTriggers,
    guidance: pattern.guidance,
    matches,
  });
}

function matchSignal(
  signal: PatternSignal,
  scan: ScanResult,
): PatternMatch["matches"][number] | null {
  switch (signal.kind) {
    case "workspace-file":
      return matchWorkspacePath(signal, scan, "file");
    case "workspace-directory":
      return matchWorkspacePath(signal, scan, "directory");
    case "package-json-field":
      return matchPackageJsonField(signal, scan);
    case "ai-bit-kind": {
      const aiBits = scan.aiBits.filter((bit) => bit.kind === signal.value);
      return aiBits.length === 0
        ? null
        : {
            signal,
            aiBitIds: aiBits.map((bit) => bit.id),
            locations: aiBits.map((bit) => bit.relativePath ?? bit.sourcePath),
            toolCommands: [],
            findingIds: [],
          };
    }
    case "ai-bit-name-contains": {
      const aiBits = scan.aiBits.filter((bit) =>
        bit.name.toLocaleLowerCase().includes(signal.value.toLocaleLowerCase()),
      );
      return aiBits.length === 0
        ? null
        : {
            signal,
            aiBitIds: aiBits.map((bit) => bit.id),
            locations: aiBits.map((bit) => bit.relativePath ?? bit.sourcePath),
            toolCommands: [],
            findingIds: [],
          };
    }
    case "vendor-id": {
      const aiBits = scan.aiBits.filter((bit) => bit.vendorId === signal.value);
      const tools = scan.tools.filter((tool) => tool.vendorId === signal.value);
      return aiBits.length === 0 && tools.length === 0
        ? null
        : {
            signal,
            aiBitIds: aiBits.map((bit) => bit.id),
            locations: aiBits.map((bit) => bit.relativePath ?? bit.sourcePath),
            toolCommands: tools.map((tool) => tool.command),
            findingIds: [],
          };
    }
    case "tool-command": {
      const tools = scan.tools.filter((tool) => tool.command === signal.value);
      return tools.length === 0
        ? null
        : {
            signal,
            aiBitIds: [],
            locations: [],
            toolCommands: tools.map((tool) => tool.command),
            findingIds: [],
          };
    }
    case "finding-id-prefix": {
      const findings = scan.findings.filter((finding) =>
        finding.id.startsWith(signal.value),
      );
      return findings.length === 0
        ? null
        : {
            signal,
            aiBitIds: [],
            locations: [],
            toolCommands: [],
            findingIds: findings.map((finding) => finding.id),
          };
    }
  }
}

function matchWorkspacePath(
  signal: PatternSignal,
  scan: ScanResult,
  expectedKind: "file" | "directory",
): PatternMatch["matches"][number] | null {
  const targetPath = path.resolve(scan.workspace, signal.value);

  if (!existsSync(targetPath)) {
    return null;
  }

  const state = statSync(targetPath);
  const exists = expectedKind === "file" ? state.isFile() : state.isDirectory();

  if (!exists) {
    return null;
  }

  return {
    signal,
    locations: [signal.value],
    aiBitIds: scan.aiBits
      .filter(
        (bit) =>
          bit.relativePath === signal.value || bit.sourcePath === targetPath,
      )
      .map((bit) => bit.id),
    toolCommands: [],
    findingIds: [],
  };
}

function matchPackageJsonField(
  signal: PatternSignal,
  scan: ScanResult,
): PatternMatch["matches"][number] | null {
  const packageJsonPath = path.resolve(scan.workspace, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const parsed = readPackageJson(packageJsonPath);
  return hasDottedField(parsed, signal.value)
    ? {
        signal,
        locations: [`package.json#${signal.value}`],
        aiBitIds: [],
        toolCommands: [],
        findingIds: [],
      }
    : null;
}

function readPackageJson(packageJsonPath: string): Record<string, unknown> {
  const content = readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(content) as unknown;

  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`${packageJsonPath} must contain a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function hasDottedField(
  record: Record<string, unknown>,
  dottedField: string,
): boolean {
  let current: unknown = record;

  for (const segment of dottedField.split(".")) {
    if (
      current === null ||
      typeof current !== "object" ||
      !(segment in current)
    ) {
      return false;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return true;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}
