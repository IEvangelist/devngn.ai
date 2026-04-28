import type { VendorProfile } from "@devngn/core";

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

export function getBundledRegistry(): VendorProfile[] {
  return bundledVendorRegistry;
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
