import { z } from "zod";
import type { AIBitPattern, VendorProfile } from "@devngn/core";

export const VendorIntelligenceAccessTierSchema = z.enum([
  "public",
  "subscriber",
]);
export type VendorIntelligenceAccessTier = z.infer<
  typeof VendorIntelligenceAccessTierSchema
>;

export const VendorRepositorySchema = z.object({
  host: z.enum(["github", "gitlab", "bitbucket", "other"]),
  owner: z.string().nullable(),
  name: z.string(),
  url: z.string().url(),
  role: z.enum(["source", "sdk", "examples", "docs", "community"]),
  license: z.string().nullable(),
});
export type VendorRepository = z.infer<typeof VendorRepositorySchema>;

export const VendorSiteSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  kind: z.enum([
    "homepage",
    "docs",
    "pricing",
    "blog",
    "status",
    "marketplace",
    "community",
    "repository",
  ]),
});
export type VendorSite = z.infer<typeof VendorSiteSchema>;

export const VendorCompanySchema = z.object({
  name: z.string(),
  legalName: z.string().nullable(),
  homepageUrl: z.string().url().nullable(),
  parentCompany: z.string().nullable(),
});
export type VendorCompany = z.infer<typeof VendorCompanySchema>;

export const VendorStandardSchema = z.object({
  name: z.string(),
  summary: z.string(),
  status: z.enum(["current", "planned", "stale", "research-required"]),
  appliesTo: z.array(z.string()).default([]),
  detailsUrl: z.string().url().nullable(),
});
export type VendorStandard = z.infer<typeof VendorStandardSchema>;

export const VendorFileLocationSchema = z.object({
  path: z.string(),
  scope: z.enum(["user", "workspace", "device", "system"]),
  kind: z.string(),
  name: z.string(),
  description: z.string(),
  scanChildren: z.boolean(),
  source: z.enum([
    "bundled-registry",
    "vendor-docs",
    "community",
    "research-required",
  ]),
  confidence: z.number().min(0).max(1),
});
export type VendorFileLocation = z.infer<typeof VendorFileLocationSchema>;

export const VendorFolderStructureSchema = z.object({
  root: z.string(),
  scope: z.enum(["user", "workspace", "device", "system"]),
  description: z.string(),
  children: z.array(z.string()).default([]),
});
export type VendorFolderStructure = z.infer<typeof VendorFolderStructureSchema>;

export const VendorCommonToolSchema = z.object({
  name: z.string(),
  type: z.enum(["cli", "editor-extension", "sdk", "mcp-server", "dev-tool"]),
  command: z.string().nullable(),
  packageNames: z.array(z.string()).default([]),
  extensionIds: z.array(z.string()).default([]),
  docsUrl: z.string().url().nullable(),
  openSource: z.boolean().nullable(),
});
export type VendorCommonTool = z.infer<typeof VendorCommonToolSchema>;

export const VendorIntelligenceSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  slug: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  name: z.string(),
  category: z.enum(["ai-vendor", "ai-editor", "ai-cli", "dev-tool"]),
  company: VendorCompanySchema,
  products: z.array(z.string()).default([]),
  openSource: z.object({
    isOpenSource: z.boolean(),
    license: z.string().nullable(),
  }),
  repositories: z.array(VendorRepositorySchema).default([]),
  sites: z.array(VendorSiteSchema).default([]),
  standards: z.array(VendorStandardSchema).default([]),
  fileLocations: z.array(VendorFileLocationSchema).default([]),
  folderStructures: z.array(VendorFolderStructureSchema).default([]),
  commonTools: z.array(VendorCommonToolSchema).default([]),
  cliCommands: z.array(z.string()).default([]),
  editorExtensions: z.array(z.string()).default([]),
  vendorSpecificDetails: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  ),
  accessTier: VendorIntelligenceAccessTierSchema,
  research: z.object({
    status: z.enum(["planned", "in_progress", "current", "stale"]),
    lastResearchedAt: z.string().datetime().nullable(),
    sources: z.array(z.string()).default([]),
    summary: z.string(),
  }),
  updatedAt: z.string().datetime(),
});
export type VendorIntelligence = z.infer<typeof VendorIntelligenceSchema>;

export const VendorIntelligenceDatabaseSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  accessTier: VendorIntelligenceAccessTierSchema,
  vendors: z.array(VendorIntelligenceSchema),
});
export type VendorIntelligenceDatabase = z.infer<
  typeof VendorIntelligenceDatabaseSchema
>;

type VendorIntelligenceMetadata = {
  aliases: string[];
  company: VendorCompany;
  openSource: VendorIntelligence["openSource"];
  repositories?: VendorRepository[];
  sites?: VendorSite[];
  standards?: VendorStandard[];
  vendorSpecificDetails?: VendorIntelligence["vendorSpecificDetails"];
};

const plannedResearch = (summary: string): VendorProfile["research"] => ({
  status: "planned",
  lastResearchedAt: null,
  sources: [],
  summary,
});

export const bundledVendorRegistry: VendorProfile[] = [
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    products: ["GitHub Copilot", "GitHub Copilot Chat", "GitHub Copilot CLI"],
    category: "ai-vendor",
    commands: ["gh"],
    extensionIds: ["GitHub.copilot", "GitHub.copilot-chat"],
    docsUrl: "https://docs.github.com/copilot",
    logoRef: "vendor:github-copilot",
    research: plannedResearch(
      "Run /research to confirm Copilot instruction, prompt, and custom instruction patterns.",
    ),
    aiBitPatterns: [
      {
        kind: "instruction",
        scope: "workspace",
        path: [".github", "copilot-instructions.md"],
        name: "GitHub Copilot instructions",
        description: "Workspace custom instructions for GitHub Copilot.",
        scanChildren: false,
      },
      {
        kind: "instruction",
        scope: "workspace",
        path: [".github", "instructions"],
        name: "GitHub Copilot instruction files",
        description: "Folder containing GitHub Copilot instruction files.",
        scanChildren: true,
      },
      {
        kind: "prompt",
        scope: "workspace",
        path: [".github", "prompts"],
        name: "GitHub Copilot prompt files",
        description: "Folder containing reusable Copilot prompt files.",
        scanChildren: true,
      },
    ],
  },
  {
    id: "anthropic-claude-code",
    name: "Claude Code",
    products: ["Claude Code"],
    category: "ai-cli",
    commands: ["claude"],
    extensionIds: [],
    docsUrl: "https://docs.anthropic.com/claude-code",
    logoRef: "vendor:anthropic",
    research: plannedResearch(
      "Run /research to confirm Claude Code memory, command, settings, and skill folder conventions.",
    ),
    aiBitPatterns: [
      {
        kind: "instruction",
        scope: "workspace",
        path: ["CLAUDE.md"],
        name: "Claude Code project memory",
        description: "Workspace/project guidance read by Claude Code.",
        scanChildren: false,
      },
      {
        kind: "cli-config",
        scope: "workspace",
        path: [".claude", "settings.json"],
        name: "Claude Code workspace settings",
        scanChildren: false,
      },
      {
        kind: "skill",
        scope: "workspace",
        path: [".claude", "commands"],
        name: "Claude Code commands",
        scanChildren: true,
      },
    ],
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex-style tooling",
    products: ["OpenAI Codex CLI"],
    category: "ai-cli",
    commands: ["codex"],
    extensionIds: [],
    docsUrl: "https://github.com/openai/codex",
    logoRef: "vendor:openai",
    research: plannedResearch(
      "Run /research to confirm Codex CLI instruction and workspace metadata conventions.",
    ),
    aiBitPatterns: [
      {
        kind: "instruction",
        scope: "workspace",
        path: ["AGENTS.md"],
        name: "Agent instructions",
        description: "Workspace instructions for Codex-style coding agents.",
        scanChildren: false,
      },
    ],
  },
  {
    id: "google-gemini",
    name: "Google Gemini tooling",
    products: ["Gemini CLI", "Gemini Code Assist"],
    category: "ai-vendor",
    commands: ["gemini"],
    extensionIds: [],
    docsUrl: "https://ai.google.dev",
    logoRef: "vendor:google-gemini",
    research: plannedResearch(
      "Run /research to confirm Gemini instruction files, CLI config, and editor extension conventions.",
    ),
    aiBitPatterns: [
      {
        kind: "instruction",
        scope: "workspace",
        path: ["GEMINI.md"],
        name: "Gemini instructions",
        scanChildren: false,
      },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    products: ["Cursor"],
    category: "ai-editor",
    commands: ["cursor"],
    extensionIds: [],
    docsUrl: "https://docs.cursor.com",
    logoRef: "vendor:cursor",
    research: plannedResearch(
      "Run /research to confirm Cursor rules, memories, and project metadata patterns.",
    ),
    aiBitPatterns: [
      {
        kind: "rule",
        scope: "workspace",
        path: [".cursor", "rules"],
        name: "Cursor rules",
        scanChildren: true,
      },
      {
        kind: "instruction",
        scope: "workspace",
        path: [".cursorrules"],
        name: "Legacy Cursor rules",
        scanChildren: false,
      },
    ],
  },
  {
    id: "windsurf-codeium",
    name: "Windsurf and Codeium",
    products: ["Windsurf", "Codeium"],
    category: "ai-editor",
    commands: ["windsurf"],
    extensionIds: ["Codeium.codeium"],
    docsUrl: "https://docs.windsurf.com",
    logoRef: "vendor:windsurf",
    research: plannedResearch(
      "Run /research to confirm Windsurf and Codeium rule, memory, and extension storage patterns.",
    ),
    aiBitPatterns: [
      {
        kind: "rule",
        scope: "workspace",
        path: [".windsurf", "rules"],
        name: "Windsurf rules",
        scanChildren: true,
      },
    ],
  },
  {
    id: "continue",
    name: "Continue",
    products: ["Continue"],
    category: "ai-editor",
    commands: ["continue"],
    extensionIds: ["Continue.continue"],
    docsUrl: "https://docs.continue.dev",
    logoRef: "vendor:continue",
    research: plannedResearch(
      "Run /research to confirm Continue config, rules, assistants, model preferences, and workspace overrides.",
    ),
    aiBitPatterns: [
      {
        kind: "cli-config",
        scope: "workspace",
        path: [".continue", "config.json"],
        name: "Continue workspace config",
        scanChildren: false,
      },
      {
        kind: "rule",
        scope: "workspace",
        path: [".continue", "rules"],
        name: "Continue rules",
        scanChildren: true,
      },
    ],
  },
  {
    id: "cline-roo",
    name: "Cline and Roo Code-style tools",
    products: ["Cline", "Roo Code"],
    category: "ai-editor",
    commands: [],
    extensionIds: ["saoudrizwan.claude-dev", "RooVeterinaryInc.roo-cline"],
    docsUrl: "https://docs.cline.bot",
    logoRef: "vendor:cline-roo",
    research: plannedResearch(
      "Run /research to confirm Cline/Roo rules, modes, MCP settings, and workspace/user precedence.",
    ),
    aiBitPatterns: [
      {
        kind: "instruction",
        scope: "workspace",
        path: [".clinerules"],
        name: "Cline rules",
        scanChildren: false,
      },
      {
        kind: "rule",
        scope: "workspace",
        path: [".roo", "rules"],
        name: "Roo rules",
        scanChildren: true,
      },
      {
        kind: "model-preference",
        scope: "workspace",
        path: [".roomodes"],
        name: "Roo modes",
        scanChildren: false,
      },
    ],
  },
  {
    id: "aider",
    name: "Aider",
    products: ["Aider"],
    category: "ai-cli",
    commands: ["aider"],
    extensionIds: [],
    docsUrl: "https://aider.chat",
    logoRef: "vendor:aider",
    research: plannedResearch(
      "Run /research to confirm Aider config, conventions, ignore files, and model preference locations.",
    ),
    aiBitPatterns: [
      {
        kind: "cli-config",
        scope: "workspace",
        path: [".aider.conf.yml"],
        name: "Aider config",
        scanChildren: false,
      },
      {
        kind: "instruction",
        scope: "workspace",
        path: ["CONVENTIONS.md"],
        name: "Aider conventions",
        scanChildren: false,
      },
    ],
  },
  {
    id: "amazon-q",
    name: "Amazon Q Developer",
    products: ["Amazon Q Developer"],
    category: "ai-vendor",
    commands: ["q"],
    extensionIds: ["AmazonWebServices.amazon-q-vscode"],
    docsUrl: "https://docs.aws.amazon.com/amazonq",
    logoRef: "vendor:amazon-q",
    research: plannedResearch(
      "Run /research to confirm Amazon Q Developer CLI, IDE, and workspace customization patterns.",
    ),
    aiBitPatterns: [
      {
        kind: "rule",
        scope: "workspace",
        path: [".amazonq", "rules"],
        name: "Amazon Q rules",
        scanChildren: true,
      },
    ],
  },
  {
    id: "jetbrains-ai",
    name: "JetBrains AI and Junie",
    products: ["JetBrains AI", "Junie"],
    category: "ai-editor",
    commands: [],
    extensionIds: [],
    docsUrl: "https://www.jetbrains.com/ai",
    logoRef: "vendor:jetbrains",
    research: plannedResearch(
      "Run /research to confirm JetBrains AI and Junie project guidance, settings, and generated metadata.",
    ),
    aiBitPatterns: [
      {
        kind: "instruction",
        scope: "workspace",
        path: [".junie", "guidelines.md"],
        name: "Junie guidelines",
        scanChildren: false,
      },
    ],
  },
  {
    id: "zed-ai",
    name: "Zed AI",
    products: ["Zed AI"],
    category: "ai-editor",
    commands: ["zed"],
    extensionIds: [],
    docsUrl: "https://zed.dev/docs/ai",
    logoRef: "vendor:zed",
    research: plannedResearch(
      "Run /research to confirm Zed AI assistant, rules, prompts, and project settings patterns.",
    ),
    aiBitPatterns: [
      {
        kind: "cli-config",
        scope: "workspace",
        path: [".zed", "settings.json"],
        name: "Zed workspace settings",
        scanChildren: false,
      },
    ],
  },
  {
    id: "tabnine",
    name: "Tabnine",
    products: ["Tabnine"],
    category: "ai-vendor",
    commands: ["tabnine"],
    extensionIds: ["TabNine.tabnine-vscode"],
    docsUrl: "https://docs.tabnine.com",
    logoRef: "vendor:tabnine",
    research: plannedResearch(
      "Run /research to confirm Tabnine workspace, policy, and personalization metadata patterns.",
    ),
    aiBitPatterns: [
      {
        kind: "cli-config",
        scope: "workspace",
        path: [".tabnine"],
        name: "Tabnine workspace metadata",
        scanChildren: false,
      },
    ],
  },
  {
    id: "git",
    name: "Git",
    products: ["Git"],
    category: "dev-tool",
    commands: ["git"],
    extensionIds: [],
    docsUrl: "https://git-scm.com/docs",
    logoRef: "vendor:git",
    research: plannedResearch(
      "Run /research to model git-specific preferences such as branch naming habits and aliases.",
    ),
    aiBitPatterns: [
      {
        kind: "cli-config",
        scope: "workspace",
        path: [".git", "config"],
        name: "Git workspace config",
        scanChildren: false,
      },
    ],
  },
  {
    id: "github-cli",
    name: "GitHub CLI",
    products: ["GitHub CLI"],
    category: "dev-tool",
    commands: ["gh"],
    extensionIds: [],
    docsUrl: "https://cli.github.com/manual",
    logoRef: "vendor:github-cli",
    research: plannedResearch(
      "Run /research to model gh extensions, aliases, auth state, and branch/pull request workflow preferences.",
    ),
    aiBitPatterns: [],
  },
];

const vendorIntelligenceMetadata: Partial<
  Record<string, VendorIntelligenceMetadata>
> = {
  "github-copilot": {
    aliases: ["github", "copilot", "github-copilot"],
    company: company(
      "GitHub",
      "GitHub, Inc.",
      "https://github.com",
      "Microsoft",
    ),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site("GitHub Copilot", "https://github.com/features/copilot", "homepage"),
      site("GitHub Copilot docs", "https://docs.github.com/copilot", "docs"),
      site(
        "GitHub Copilot pricing",
        "https://github.com/features/copilot/plans",
        "pricing",
      ),
    ],
    standards: [
      standard(
        "Copilot repository instructions",
        "Repository instructions and prompt files are common Copilot customization surfaces.",
        "research-required",
        [
          ".github/copilot-instructions.md",
          ".github/instructions",
          ".github/prompts",
        ],
        "https://docs.github.com/copilot",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "VS Code and GitHub-hosted developer workflows",
      supportsReusablePrompts: true,
      managedByDevngnAs: "instructions,prompts,provider-runtime",
    },
  },
  "anthropic-claude-code": {
    aliases: ["anthropic", "claude", "claude-code"],
    company: company(
      "Anthropic",
      "Anthropic, PBC",
      "https://anthropic.com",
      null,
    ),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site("Anthropic", "https://anthropic.com", "homepage"),
      site(
        "Claude Code docs",
        "https://docs.anthropic.com/claude-code",
        "docs",
      ),
      site("Anthropic pricing", "https://www.anthropic.com/pricing", "pricing"),
    ],
    standards: [
      standard(
        "Claude Code memory files",
        "Claude Code workflows commonly use CLAUDE.md and .claude folders for project memory, settings, and commands.",
        "research-required",
        ["CLAUDE.md", ".claude/settings.json", ".claude/commands"],
        "https://docs.anthropic.com/claude-code",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "agent CLI",
      memoryFile: "CLAUDE.md",
      commandFolder: ".claude/commands",
      managedByDevngnAs: "memory,commands,provider-runtime",
    },
  },
  "openai-codex": {
    aliases: ["openai", "codex", "opencode", "opecode", "agents-md"],
    company: company("OpenAI", "OpenAI, L.L.C.", "https://openai.com", null),
    openSource: { isOpenSource: true, license: "Apache-2.0" },
    repositories: [
      repo(
        "github",
        "openai",
        "codex",
        "https://github.com/openai/codex",
        "source",
        "Apache-2.0",
      ),
    ],
    sites: [
      site("OpenAI", "https://openai.com", "homepage"),
      site("OpenAI API docs", "https://platform.openai.com/docs", "docs"),
      site("OpenAI Codex", "https://github.com/openai/codex", "repository"),
    ],
    standards: [
      standard(
        "AGENTS.md",
        "A root AGENTS.md file is a portable workspace instruction surface for coding agents.",
        "research-required",
        ["AGENTS.md"],
        "https://github.com/openai/codex",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "coding agent CLI",
      instructionFile: "AGENTS.md",
      managedByDevngnAs: "agent-instructions,provider-runtime",
    },
  },
  "google-gemini": {
    aliases: ["google", "gemini", "gemini-cli", "gemini-code-assist"],
    company: company("Google", "Google LLC", "https://google.com", "Alphabet"),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site("Google AI for Developers", "https://ai.google.dev", "homepage"),
      site("Gemini API docs", "https://ai.google.dev/gemini-api/docs", "docs"),
    ],
    standards: [
      standard(
        "Gemini workspace instructions",
        "Gemini developer tooling can be modeled through workspace instruction files and CLI config discovered by vendor research.",
        "research-required",
        ["GEMINI.md"],
        "https://ai.google.dev",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "AI provider and coding assistant tooling",
      instructionFile: "GEMINI.md",
      managedByDevngnAs: "instructions,provider-runtime",
    },
  },
  cursor: {
    aliases: ["cursor", "cursor-editor"],
    company: company("Cursor", "Anysphere, Inc.", "https://cursor.com", null),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site("Cursor", "https://cursor.com", "homepage"),
      site("Cursor docs", "https://docs.cursor.com", "docs"),
    ],
    standards: [
      standard(
        "Cursor rules",
        "Cursor project rules are commonly represented by .cursor/rules and legacy .cursorrules files.",
        "research-required",
        [".cursor/rules", ".cursorrules"],
        "https://docs.cursor.com",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "AI editor",
      ruleFolder: ".cursor/rules",
      legacyRuleFile: ".cursorrules",
      managedByDevngnAs: "rules,conflicts,cleanup",
    },
  },
  "windsurf-codeium": {
    aliases: ["windsurf", "codeium", "windsurf-codeium"],
    company: company("Windsurf", "Codeium, Inc.", "https://windsurf.com", null),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site("Windsurf", "https://windsurf.com", "homepage"),
      site("Windsurf docs", "https://docs.windsurf.com", "docs"),
    ],
    standards: [
      standard(
        "Windsurf rules",
        "Windsurf and Codeium-style rule folders customize editor AI behavior.",
        "research-required",
        [".windsurf/rules"],
        "https://docs.windsurf.com",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "AI editor",
      ruleFolder: ".windsurf/rules",
      managedByDevngnAs: "rules,conflicts,research",
    },
  },
  continue: {
    aliases: ["continue", "continue-dev"],
    company: company("Continue", null, "https://continue.dev", null),
    openSource: { isOpenSource: true, license: "Apache-2.0" },
    repositories: [
      repo(
        "github",
        "continuedev",
        "continue",
        "https://github.com/continuedev/continue",
        "source",
        "Apache-2.0",
      ),
    ],
    sites: [
      site("Continue", "https://continue.dev", "homepage"),
      site("Continue docs", "https://docs.continue.dev", "docs"),
      site(
        "Continue repository",
        "https://github.com/continuedev/continue",
        "repository",
      ),
    ],
    standards: [
      standard(
        "Continue config and rules",
        "Continue configuration captures model preferences, assistant behavior, and project rules.",
        "research-required",
        [".continue/config.json", ".continue/rules"],
        "https://docs.continue.dev",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "open-source AI editor extension",
      configFile: ".continue/config.json",
      ruleFolder: ".continue/rules",
      managedByDevngnAs: "model-preferences,rules,provider-runtime",
    },
  },
  "cline-roo": {
    aliases: ["cline", "roo", "roo-code", "cline-roo"],
    company: company(
      "Cline/Roo ecosystem",
      null,
      "https://docs.cline.bot",
      null,
    ),
    openSource: { isOpenSource: true, license: "Apache-2.0" },
    sites: [
      site("Cline docs", "https://docs.cline.bot", "docs"),
      site("Roo Code", "https://roocode.com", "homepage"),
    ],
    standards: [
      standard(
        "Cline/Roo rules and modes",
        "Cline and Roo-style tools use local rule and mode files to constrain agent behavior.",
        "research-required",
        [".clinerules", ".roo/rules", ".roomodes"],
        "https://docs.cline.bot",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "agentic editor extensions",
      rules: ".clinerules,.roo/rules",
      modesFile: ".roomodes",
      managedByDevngnAs: "rules,modes,skills",
    },
  },
  aider: {
    aliases: ["aider"],
    company: company("Aider", null, "https://aider.chat", null),
    openSource: { isOpenSource: true, license: "Apache-2.0" },
    repositories: [
      repo(
        "github",
        "Aider-AI",
        "aider",
        "https://github.com/Aider-AI/aider",
        "source",
        "Apache-2.0",
      ),
    ],
    sites: [
      site("Aider", "https://aider.chat", "homepage"),
      site("Aider docs", "https://aider.chat/docs", "docs"),
      site(
        "Aider repository",
        "https://github.com/Aider-AI/aider",
        "repository",
      ),
    ],
    standards: [
      standard(
        "Aider config and conventions",
        "Aider projects commonly expose CLI config and convention files that guide coding behavior.",
        "research-required",
        [".aider.conf.yml", "CONVENTIONS.md"],
        "https://aider.chat/docs",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "agent CLI",
      configFile: ".aider.conf.yml",
      conventionFile: "CONVENTIONS.md",
      managedByDevngnAs: "cli-config,instructions",
    },
  },
  "amazon-q": {
    aliases: ["amazon", "aws", "amazon-q", "q-developer"],
    company: company(
      "Amazon Web Services",
      "Amazon Web Services, Inc.",
      "https://aws.amazon.com",
      "Amazon",
    ),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site(
        "Amazon Q Developer",
        "https://aws.amazon.com/q/developer",
        "homepage",
      ),
      site("Amazon Q docs", "https://docs.aws.amazon.com/amazonq", "docs"),
    ],
    standards: [
      standard(
        "Amazon Q rules",
        "Amazon Q Developer workspace customization can be modeled as rule and IDE configuration surfaces.",
        "research-required",
        [".amazonq/rules"],
        "https://docs.aws.amazon.com/amazonq",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "AI coding assistant and CLI",
      ruleFolder: ".amazonq/rules",
      managedByDevngnAs: "rules,provider-runtime",
    },
  },
  "jetbrains-ai": {
    aliases: ["jetbrains", "junie", "jetbrains-ai"],
    company: company(
      "JetBrains",
      "JetBrains s.r.o.",
      "https://www.jetbrains.com",
      null,
    ),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site("JetBrains AI", "https://www.jetbrains.com/ai", "homepage"),
      site(
        "JetBrains AI docs",
        "https://www.jetbrains.com/help/ai-assistant",
        "docs",
      ),
    ],
    standards: [
      standard(
        "Junie guidelines",
        "JetBrains AI and Junie project guidance can be represented by project guideline files.",
        "research-required",
        [".junie/guidelines.md"],
        "https://www.jetbrains.com/ai",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "IDE assistant",
      guidelineFile: ".junie/guidelines.md",
      managedByDevngnAs: "instructions,ide-state",
    },
  },
  "zed-ai": {
    aliases: ["zed", "zed-ai"],
    company: company("Zed", "Zed Industries, Inc.", "https://zed.dev", null),
    openSource: { isOpenSource: true, license: "GPL-3.0-or-later" },
    repositories: [
      repo(
        "github",
        "zed-industries",
        "zed",
        "https://github.com/zed-industries/zed",
        "source",
        "GPL-3.0-or-later",
      ),
    ],
    sites: [
      site("Zed", "https://zed.dev", "homepage"),
      site("Zed AI docs", "https://zed.dev/docs/ai", "docs"),
      site(
        "Zed repository",
        "https://github.com/zed-industries/zed",
        "repository",
      ),
    ],
    standards: [
      standard(
        "Zed workspace settings",
        "Zed AI behavior can be shaped by workspace settings and assistant configuration.",
        "research-required",
        [".zed/settings.json"],
        "https://zed.dev/docs/ai",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "AI editor",
      settingsFile: ".zed/settings.json",
      managedByDevngnAs: "cli-config,model-preferences",
    },
  },
  tabnine: {
    aliases: ["tabnine"],
    company: company("Tabnine", null, "https://www.tabnine.com", null),
    openSource: { isOpenSource: false, license: null },
    sites: [
      site("Tabnine", "https://www.tabnine.com", "homepage"),
      site("Tabnine docs", "https://docs.tabnine.com", "docs"),
    ],
    standards: [
      standard(
        "Tabnine workspace metadata",
        "Tabnine workspace policy and personalization metadata should be researched before mutation.",
        "research-required",
        [".tabnine"],
        "https://docs.tabnine.com",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "AI coding assistant",
      workspaceMetadata: ".tabnine",
      managedByDevngnAs: "workspace-policy,extension-state",
    },
  },
  git: {
    aliases: ["git"],
    company: company("Git", null, "https://git-scm.com", null),
    openSource: { isOpenSource: true, license: "GPL-2.0-only" },
    sites: [
      site("Git", "https://git-scm.com", "homepage"),
      site("Git docs", "https://git-scm.com/docs", "docs"),
    ],
    standards: [
      standard(
        "Git config preferences",
        "devngn can model git aliases, branch naming preferences, and workflow conventions as AI-usable tool guidance.",
        "research-required",
        [".git/config"],
        "https://git-scm.com/docs",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "developer tool",
      workspaceConfig: ".git/config",
      managedByDevngnAs: "tool-preferences,path-aware-instructions",
    },
  },
  "github-cli": {
    aliases: ["gh", "github-cli"],
    company: company(
      "GitHub",
      "GitHub, Inc.",
      "https://github.com",
      "Microsoft",
    ),
    openSource: { isOpenSource: true, license: "MIT" },
    repositories: [
      repo(
        "github",
        "cli",
        "cli",
        "https://github.com/cli/cli",
        "source",
        "MIT",
      ),
    ],
    sites: [
      site("GitHub CLI", "https://cli.github.com", "homepage"),
      site("GitHub CLI manual", "https://cli.github.com/manual", "docs"),
      site("GitHub CLI repository", "https://github.com/cli/cli", "repository"),
    ],
    standards: [
      standard(
        "GitHub CLI workflow preferences",
        "gh extensions, aliases, auth state, and branch/pull request preferences are useful AI-grounding details.",
        "research-required",
        ["gh aliases", "gh extensions"],
        "https://cli.github.com/manual",
      ),
    ],
    vendorSpecificDetails: {
      primarySurface: "developer CLI",
      command: "gh",
      managedByDevngnAs: "tool-preferences,path-aware-instructions",
    },
  },
};

export function getBundledRegistry(): VendorProfile[] {
  return bundledVendorRegistry;
}

export function getVendorIntelligenceDatabase(
  now = new Date(),
): VendorIntelligenceDatabase {
  return VendorIntelligenceDatabaseSchema.parse({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    accessTier: "subscriber",
    vendors: bundledVendorRegistry.map((vendor) =>
      createVendorIntelligence(vendor, now),
    ),
  });
}

export function listVendorIntelligence(now = new Date()): VendorIntelligence[] {
  return getVendorIntelligenceDatabase(now).vendors;
}

export function getVendorIntelligenceByIdOrAlias(
  idOrAlias: string,
  now = new Date(),
): VendorIntelligence | null {
  const normalized = normalizeVendorIdentifier(idOrAlias);

  return (
    listVendorIntelligence(now).find(
      (vendor) =>
        vendor.slug === normalized ||
        vendor.id === normalized ||
        vendor.aliases.some(
          (alias) => normalizeVendorIdentifier(alias) === normalized,
        ),
    ) ?? null
  );
}

export function getResearchFreshnessSummary() {
  const totals = new Map<string, number>();

  for (const vendor of bundledVendorRegistry) {
    totals.set(
      vendor.research.status,
      (totals.get(vendor.research.status) ?? 0) + 1,
    );
  }

  return {
    total: bundledVendorRegistry.length,
    byStatus: Object.fromEntries(totals),
  };
}

function createVendorIntelligence(
  vendor: VendorProfile,
  now: Date,
): VendorIntelligence {
  const metadata = vendorIntelligenceMetadata[vendor.id];
  const confidence = researchConfidence(vendor.research.status);
  const fileLocations = vendor.aiBitPatterns.map((pattern) =>
    createFileLocation(pattern, vendor, confidence),
  );
  const folderStructures = vendor.aiBitPatterns
    .filter((pattern) => pattern.scanChildren || pattern.path.length > 1)
    .map((pattern) => createFolderStructure(pattern));

  return VendorIntelligenceSchema.parse({
    schemaVersion: 1,
    id: vendor.id,
    slug: normalizeVendorIdentifier(vendor.id),
    aliases: [
      normalizeVendorIdentifier(vendor.id),
      ...vendor.products.map(normalizeVendorIdentifier),
      ...(metadata?.aliases ?? []),
    ],
    name: vendor.name,
    category: vendor.category,
    company:
      metadata?.company ??
      company(vendor.name, null, vendor.docsUrl ?? null, null),
    products: vendor.products,
    openSource: metadata?.openSource ?? {
      isOpenSource: false,
      license: null,
    },
    repositories: metadata?.repositories ?? [],
    sites: [
      ...(metadata?.sites ?? []),
      ...(vendor.docsUrl === undefined
        ? []
        : [site(`${vendor.name} docs`, vendor.docsUrl, "docs")]),
    ],
    standards: metadata?.standards ?? [
      standard(
        `${vendor.name} research`,
        vendor.research.summary,
        "research-required",
        vendor.aiBitPatterns.map((pattern) => pattern.path.join("/")),
        vendor.docsUrl ?? null,
      ),
    ],
    fileLocations,
    folderStructures,
    commonTools: [
      ...vendor.commands.map((command) => createCliTool(vendor, command)),
      ...vendor.extensionIds.map((extensionId) =>
        createExtensionTool(vendor, extensionId),
      ),
    ],
    cliCommands: vendor.commands,
    editorExtensions: vendor.extensionIds,
    vendorSpecificDetails: metadata?.vendorSpecificDetails ?? {
      primarySurface: vendor.category,
      managedByDevngnAs: vendor.aiBitPatterns
        .map((pattern) => pattern.kind)
        .join(","),
    },
    accessTier: "subscriber",
    research: vendor.research,
    updatedAt: now.toISOString(),
  });
}

function createFileLocation(
  pattern: AIBitPattern,
  vendor: VendorProfile,
  confidence: number,
): VendorFileLocation {
  return VendorFileLocationSchema.parse({
    path: pattern.path.join("/"),
    scope: pattern.scope,
    kind: pattern.kind,
    name: pattern.name ?? `${vendor.name} ${pattern.kind}`,
    description:
      pattern.description ??
      `${vendor.name} ${pattern.kind} location discovered from bundled research metadata.`,
    scanChildren: pattern.scanChildren,
    source:
      vendor.research.status === "current"
        ? "vendor-docs"
        : "research-required",
    confidence,
  });
}

function createFolderStructure(pattern: AIBitPattern): VendorFolderStructure {
  const root = pattern.scanChildren
    ? pattern.path.join("/")
    : pattern.path.slice(0, -1).join("/");

  return VendorFolderStructureSchema.parse({
    root,
    scope: pattern.scope,
    description:
      pattern.description ??
      `Folder structure containing ${pattern.kind} AI-bits.`,
    children: pattern.scanChildren ? ["**/*"] : [pattern.path.at(-1) ?? ""],
  });
}

function createCliTool(
  vendor: VendorProfile,
  command: string,
): VendorCommonTool {
  return VendorCommonToolSchema.parse({
    name: `${vendor.name} CLI`,
    type: vendor.category === "dev-tool" ? "dev-tool" : "cli",
    command,
    packageNames: [],
    extensionIds: [],
    docsUrl: vendor.docsUrl ?? null,
    openSource: null,
  });
}

function createExtensionTool(
  vendor: VendorProfile,
  extensionId: string,
): VendorCommonTool {
  return VendorCommonToolSchema.parse({
    name: `${vendor.name} extension`,
    type: "editor-extension",
    command: null,
    packageNames: [],
    extensionIds: [extensionId],
    docsUrl: vendor.docsUrl ?? null,
    openSource: null,
  });
}

function company(
  name: string,
  legalName: string | null,
  homepageUrl: string | null,
  parentCompany: string | null,
): VendorCompany {
  return VendorCompanySchema.parse({
    name,
    legalName,
    homepageUrl,
    parentCompany,
  });
}

function repo(
  host: VendorRepository["host"],
  owner: string | null,
  name: string,
  url: string,
  role: VendorRepository["role"],
  license: string | null,
): VendorRepository {
  return VendorRepositorySchema.parse({
    host,
    owner,
    name,
    url,
    role,
    license,
  });
}

function site(
  title: string,
  url: string,
  kind: VendorSite["kind"],
): VendorSite {
  return VendorSiteSchema.parse({ title, url, kind });
}

function standard(
  name: string,
  summary: string,
  status: VendorStandard["status"],
  appliesTo: string[],
  detailsUrl: string | null,
): VendorStandard {
  return VendorStandardSchema.parse({
    name,
    summary,
    status,
    appliesTo,
    detailsUrl,
  });
}

function normalizeVendorIdentifier(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function researchConfidence(
  status: VendorProfile["research"]["status"],
): number {
  switch (status) {
    case "current":
      return 0.92;
    case "in_progress":
      return 0.68;
    case "stale":
      return 0.45;
    case "planned":
      return 0.35;
  }
}
