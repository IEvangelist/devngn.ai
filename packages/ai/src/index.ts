import { createRequire } from "node:module";
import { z } from "zod";
import type { ScanResult } from "@devngn/core";

const require = createRequire(import.meta.url);

export const AIProviderIdSchema = z.enum([
  "openai",
  "github-copilot",
  "anthropic-claude",
  "google-gemini",
  "local-openai-compatible",
]);
export type AIProviderId = z.infer<typeof AIProviderIdSchema>;

export const AICapabilitySchema = z.enum([
  "chat",
  "streaming",
  "tool-calling",
  "structured-output",
  "embeddings",
  "files",
  "model-list",
  "token-usage",
  "token-counting",
  "evals",
]);
export type AICapability = z.infer<typeof AICapabilitySchema>;

export const TokenBudgetSchema = z.object({
  modelContextWindow: z.number().int().positive(),
  estimatedInputTokens: z.number().int().nonnegative(),
  maxOutputTokens: z.number().int().nonnegative(),
  reserveTokens: z.number().int().nonnegative(),
  availableInputTokens: z.number().int().nonnegative(),
  withinBudget: z.boolean(),
  warningThreshold: z.number().min(0).max(1),
});
export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

export const TokenUsageSchema = z.object({
  providerId: AIProviderIdSchema,
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  source: z.enum(["estimated", "provider-reported"]),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const AIMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
});
export type AIMessage = z.infer<typeof AIMessageSchema>;

export const AIRequestSchema = z.object({
  providerId: AIProviderIdSchema,
  model: z.string(),
  purpose: z.enum([
    "bootstrap",
    "scan-summary",
    "recommendation",
    "skill-eval",
    "research",
  ]),
  messages: z.array(AIMessageSchema).min(1),
  tokenBudget: TokenBudgetSchema,
  requiredCapabilities: z.array(AICapabilitySchema),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AIRequest = z.infer<typeof AIRequestSchema>;

export const AIResponseSchema = z.object({
  providerId: AIProviderIdSchema,
  model: z.string(),
  content: z.string(),
  tokenUsage: TokenUsageSchema,
  raw: z.unknown().optional(),
});
export type AIResponse = z.infer<typeof AIResponseSchema>;

export const AIProviderManifestSchema = z.object({
  id: AIProviderIdSchema,
  name: z.string(),
  vendorId: z.string(),
  defaultModel: z.string(),
  sdkPackages: z.array(z.string()),
  auth: z.object({
    envVars: z.array(z.string()),
    notes: z.string(),
  }),
  docsUrl: z.string().url().optional(),
  capabilities: z.array(AICapabilitySchema),
  sdkStatus: z.enum([
    "available",
    "optional",
    "research-required",
    "unavailable",
  ]),
  notes: z.string(),
});
export type AIProviderManifest = z.infer<typeof AIProviderManifestSchema>;

export interface AIProviderReadiness {
  providerId: AIProviderId;
  name: string;
  sdkStatus: AIProviderManifest["sdkStatus"];
  sdkPackages: string[];
  installedSdkPackages: string[];
  missingSdkPackages: string[];
  configuredAuth: boolean;
  capabilities: AICapability[];
  notes: string;
}

export interface AIProviderAdapter {
  readonly manifest: AIProviderManifest;
  invoke(request: AIRequest): Promise<AIResponse>;
  countTokens?(
    messages: readonly AIMessage[],
    model: string,
  ): Promise<TokenUsage>;
  listModels?(): Promise<string[]>;
}

export const providerManifests = [
  {
    id: "openai",
    name: "OpenAI",
    vendorId: "openai-codex",
    defaultModel: "gpt-4.1-mini",
    sdkPackages: ["openai"],
    auth: {
      envVars: ["OPENAI_API_KEY"],
      notes: "Use the official OpenAI SDK when it is installed and configured.",
    },
    docsUrl: "https://platform.openai.com/docs/libraries",
    capabilities: [
      "chat",
      "streaming",
      "tool-calling",
      "structured-output",
      "embeddings",
      "files",
      "model-list",
      "token-usage",
    ],
    sdkStatus: "optional",
    notes:
      "Adapter should use the official SDK when available and fall back to an OpenAI-compatible transport only when explicitly configured.",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    vendorId: "github-copilot",
    defaultModel: "copilot-default",
    sdkPackages: [],
    auth: {
      envVars: ["GITHUB_TOKEN", "GH_TOKEN"],
      notes:
        "Copilot access is primarily mediated through GitHub, IDE, and CLI surfaces; run vendor research before enabling direct inference.",
    },
    docsUrl: "https://docs.github.com/copilot",
    capabilities: ["chat", "streaming", "tool-calling", "token-usage"],
    sdkStatus: "research-required",
    notes:
      "No stable public Copilot SDK is assumed. devngn should discover available GitHub/Copilot capabilities from gh, IDE APIs, and official SDKs if GitHub exposes them.",
  },
  {
    id: "anthropic-claude",
    name: "Anthropic Claude",
    vendorId: "anthropic-claude-code",
    defaultModel: "claude-sonnet-4-5",
    sdkPackages: ["@anthropic-ai/sdk"],
    auth: {
      envVars: ["ANTHROPIC_API_KEY"],
      notes:
        "Use the official Anthropic SDK when it is installed and configured.",
    },
    docsUrl: "https://docs.anthropic.com",
    capabilities: [
      "chat",
      "streaming",
      "tool-calling",
      "structured-output",
      "files",
      "model-list",
      "token-usage",
      "token-counting",
    ],
    sdkStatus: "optional",
    notes:
      "Adapter should prefer SDK-reported token counting and usage when available.",
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    vendorId: "google-gemini",
    defaultModel: "gemini-2.5-flash",
    sdkPackages: ["@google/genai"],
    auth: {
      envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      notes: "Use the Google Gen AI SDK when it is installed and configured.",
    },
    docsUrl: "https://ai.google.dev/gemini-api/docs/sdks",
    capabilities: [
      "chat",
      "streaming",
      "tool-calling",
      "structured-output",
      "files",
      "token-usage",
      "token-counting",
    ],
    sdkStatus: "optional",
    notes:
      "Adapter should use model-specific token counting when the SDK exposes it.",
  },
  {
    id: "local-openai-compatible",
    name: "Local OpenAI-compatible endpoint",
    vendorId: "openai-codex",
    defaultModel: "local-model",
    sdkPackages: ["openai"],
    auth: {
      envVars: ["OPENAI_BASE_URL", "DEVNGN_OPENAI_BASE_URL"],
      notes:
        "Use an explicitly configured OpenAI-compatible base URL for local or self-hosted models.",
    },
    capabilities: ["chat", "streaming", "tool-calling", "token-usage"],
    sdkStatus: "optional",
    notes:
      "Treat capability support as endpoint-specific and verify it during bootstrap.",
  },
] satisfies AIProviderManifest[];

export function listProviderManifests(): AIProviderManifest[] {
  return providerManifests.map((manifest) =>
    AIProviderManifestSchema.parse(manifest),
  );
}

export function listProviderReadiness(
  env: NodeJS.ProcessEnv = process.env,
): AIProviderReadiness[] {
  return listProviderManifests().map((manifest) => {
    const installedSdkPackages = manifest.sdkPackages.filter((packageName) =>
      canResolvePackage(packageName),
    );

    return {
      providerId: manifest.id,
      name: manifest.name,
      sdkStatus: manifest.sdkStatus,
      sdkPackages: manifest.sdkPackages,
      installedSdkPackages,
      missingSdkPackages: manifest.sdkPackages.filter(
        (packageName) => !installedSdkPackages.includes(packageName),
      ),
      configuredAuth: manifest.auth.envVars.some((envVar) =>
        Boolean(env[envVar]),
      ),
      capabilities: manifest.capabilities,
      notes: manifest.notes,
    };
  });
}

export function estimateTokenCount(
  input: string | readonly AIMessage[],
): number {
  const text =
    typeof input === "string"
      ? input
      : input.map((message) => message.content).join("\n");

  if (text.trim().length === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.length / 4));
}

export function createTokenBudget(options: {
  input: string | readonly AIMessage[];
  modelContextWindow?: number;
  maxOutputTokens?: number;
  reserveTokens?: number;
  warningThreshold?: number;
}): TokenBudget {
  const modelContextWindow = options.modelContextWindow ?? 128_000;
  const maxOutputTokens = options.maxOutputTokens ?? 4_096;
  const reserveTokens = options.reserveTokens ?? 1_024;
  const warningThreshold = options.warningThreshold ?? 0.85;
  const estimatedInputTokens = estimateTokenCount(options.input);
  const availableInputTokens = Math.max(
    0,
    modelContextWindow - maxOutputTokens - reserveTokens,
  );

  return TokenBudgetSchema.parse({
    modelContextWindow,
    estimatedInputTokens,
    maxOutputTokens,
    reserveTokens,
    availableInputTokens,
    withinBudget: estimatedInputTokens <= availableInputTokens,
    warningThreshold,
  });
}

export function createBootstrapRequest(
  scan: ScanResult,
  options: {
    providerId?: AIProviderId;
    model?: string;
    modelContextWindow?: number;
    groundingContext?: string;
  } = {},
): AIRequest {
  const providerId = options.providerId ?? "openai";
  const manifest = listProviderManifests().find(
    (candidate) => candidate.id === providerId,
  );

  if (manifest === undefined) {
    throw new Error(`Unknown AI provider: ${providerId}`);
  }

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "You are devngn, the dev engine. Help the user manage AI-bits with vendor-aware, token-aware recommendations.",
    },
    {
      role: "user",
      content: [
        "Bootstrap devngn against this workspace scan.",
        `Workspace: ${scan.workspace}`,
        `Vendors known: ${scan.summary.vendors}`,
        `Installed known tools: ${scan.summary.installedTools}`,
        `AI-bits found: ${scan.summary.aiBits}`,
        `Findings: ${scan.summary.findings}`,
        options.groundingContext === undefined
          ? ""
          : `Grounding manifest summary:\n${options.groundingContext}`,
        "",
        "Summarize the AI-bits inventory, call out drift/conflict risks, and recommend the next safe actions.",
      ].join("\n"),
    },
  ];

  return AIRequestSchema.parse({
    providerId,
    model: options.model ?? manifest.defaultModel,
    purpose: "bootstrap",
    messages,
    tokenBudget: createTokenBudget({
      input: messages,
      modelContextWindow: options.modelContextWindow,
    }),
    requiredCapabilities: ["chat", "token-usage"],
    metadata: {
      workspace: scan.workspace,
      aiBits: scan.summary.aiBits,
      findings: scan.summary.findings,
    },
  });
}

function canResolvePackage(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}
