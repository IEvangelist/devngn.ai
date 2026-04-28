#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  AIProviderIdSchema,
  createBootstrapRequest,
  createTokenBudget,
  listProviderReadiness,
  type AIProviderReadiness,
} from "@devngn/ai";
import {
  scanWorkspace,
  summarizeScan,
  type Recommendation,
  type ScanResult,
} from "@devngn/core";
import {
  createDevngnManifest,
  renderManifestSummary,
  type CommunicationPreferences,
  type DevngnManifest,
} from "@devngn/grounding";
import { createAnalyticsEvent } from "@devngn/analytics";
import { listResearchTargets } from "@devngn/research";
import { summarizeSkills } from "@devngn/skills";
import { createSyncEnvelope } from "@devngn/sync";
import {
  getBundledRegistry,
  getResearchFreshnessSummary,
} from "@devngn/vendors";

interface JsonOption {
  json?: boolean;
}

const program = new Command();

program
  .name("devngn")
  .description("The dev engine for managing your AI-bits.")
  .version("0.0.0");

program
  .command("scan")
  .description("Scan the current workspace and host for AI-bits.")
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const result = await runScan();
    createAnalyticsEvent("scan.completed", "cli", {
      vendors: result.summary.vendors,
      aiBits: result.summary.aiBits,
      findings: result.summary.findings,
    });
    writeOutput(options, result, () => renderScan(result));
  });

program
  .command("status")
  .description("Show a compact AI-bits health summary.")
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const result = await runScan();
    writeOutput(options, result.summary, () => summarizeScan(result));
  });

program
  .command("doctor")
  .description("Turn findings into ranked recommendations.")
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const result = await runScan();
    writeOutput(options, result.recommendations, () =>
      renderRecommendations(result.recommendations),
    );
  });

program
  .command("vendors")
  .description("List known vendors and research freshness.")
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const registry = getBundledRegistry();
    const payload = {
      summary: getResearchFreshnessSummary(),
      vendors: registry.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        products: vendor.products,
        commands: vendor.commands,
        research: vendor.research,
      })),
    };

    writeOutput(options, payload, () =>
      [
        `devngn knows ${payload.summary.total} vendors/tools.`,
        ...payload.vendors.map(
          (vendor) =>
            `- ${vendor.name} (${vendor.id}) research: ${vendor.research.status}`,
        ),
      ].join("\n"),
    );
  });

const researchCommand = program
  .command("research")
  .description("Work with vendor /research SKILLs.");

researchCommand
  .command("vendors")
  .description("Print /research prompts for vendor adapter discovery.")
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const targets = listResearchTargets();
    writeOutput(options, targets, () =>
      targets
        .map((target) => `## ${target.vendorName}\n\n${target.prompt}`)
        .join("\n\n"),
    );
  });

const skillsCommand = program
  .command("skills")
  .description("Explore and evaluate skill AI-bits.");

skillsCommand
  .command("list")
  .description("List discovered skill AI-bits.")
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const result = await runScan();
    const skills = summarizeSkills(result.aiBits);
    writeOutput(options, skills, () =>
      skills.length === 0
        ? "No skill AI-bits found in this workspace yet."
        : skills
            .map((skill) => `- ${skill.name} (${skill.vendorId ?? "unknown"})`)
            .join("\n"),
    );
  });

const profileCommand = program
  .command("profile")
  .description("Create and manage the self-updating devngn grounding profile.");

profileCommand
  .command("show")
  .description("Show the current devngn manifest/profile for grounding AI.")
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const manifest = await createCurrentManifest();
    writeOutput(options, manifest, () => renderManifestSummary(manifest));
  });

profileCommand
  .command("write")
  .description("Write the current devngn manifest/profile to disk.")
  .option(
    "-o, --output <path>",
    "Output path for the profile manifest.",
    ".devngn/profile.json",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption & { output: string }) => {
    const manifest = await createCurrentManifest();
    const outputPath = path.resolve(process.cwd(), options.output);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    writeOutput(
      options,
      { outputPath, manifest },
      () => `Wrote devngn grounding profile to ${outputPath}.`,
    );
  });

profileCommand
  .command("comms")
  .description(
    "Show notification options for long-running AI loops and ralphs.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const manifest = await createCurrentManifest();
    writeOutput(options, manifest.communication, () =>
      renderCommunicationPreferences(manifest.communication),
    );
  });

const aiCommand = program
  .command("ai")
  .description("Bootstrap and consume managed AI providers.");

aiCommand
  .command("providers")
  .description("List AI SDK/provider readiness and capabilities.")
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const readiness = listProviderReadiness();
    writeOutput(options, readiness, () => renderProviderReadiness(readiness));
  });

aiCommand
  .command("budget")
  .description(
    "Estimate token usage for text before sending it to an AI provider.",
  )
  .requiredOption("--input <text>", "Input text to estimate.")
  .option("--context <tokens>", "Model context window.", parseInteger)
  .option("--output <tokens>", "Maximum output tokens.", parseInteger)
  .option("--reserve <tokens>", "Reserved safety tokens.", parseInteger)
  .option("--json", "Print machine-readable JSON.")
  .action(
    (
      options: JsonOption & {
        input: string;
        context?: number;
        output?: number;
        reserve?: number;
      },
    ) => {
      const budget = createTokenBudget({
        input: options.input,
        modelContextWindow: options.context,
        maxOutputTokens: options.output,
        reserveTokens: options.reserve,
      });

      writeOutput(options, budget, () =>
        [
          `Estimated input tokens: ${budget.estimatedInputTokens}`,
          `Available input tokens: ${budget.availableInputTokens}`,
          `Within budget: ${budget.withinBudget ? "yes" : "no"}`,
        ].join("\n"),
      );
    },
  );

aiCommand
  .command("bootstrap")
  .description("Create a token-aware bootstrap request from the current scan.")
  .option("--provider <id>", "AI provider id.", "openai")
  .option("--model <name>", "Provider model name.")
  .option("--context <tokens>", "Model context window.", parseInteger)
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      options: JsonOption & {
        provider: string;
        model?: string;
        context?: number;
      },
    ) => {
      const result = await runScan();
      const manifest = createDevngnManifest({ scan: result });
      const request = createBootstrapRequest(result, {
        providerId: AIProviderIdSchema.parse(options.provider),
        model: options.model,
        modelContextWindow: options.context,
        groundingContext: renderManifestSummary(manifest),
      });

      writeOutput(options, request, () =>
        [
          `Prepared ${request.providerId} bootstrap request for ${request.model}.`,
          `Estimated input tokens: ${request.tokenBudget.estimatedInputTokens}`,
          `Within budget: ${request.tokenBudget.withinBudget ? "yes" : "no"}`,
          "Provider invocation is adapter-gated so devngn only calls SDKs that are installed, authenticated, and capability-compatible.",
        ].join("\n"),
      );
    },
  );

program
  .command("sync")
  .description("Prepare a redacted scan summary for hosted sync.")
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const result = await runScan();
    const envelope = createSyncEnvelope("local-devngn-device", "scan-summary", {
      scannedAt: result.scannedAt,
      workspace: result.workspace,
      summary: result.summary,
      findings: result.findings.map((finding) => ({
        id: finding.id,
        severity: finding.severity,
        title: finding.title,
        vendorId: finding.vendorId,
        confidence: finding.confidence,
      })),
      aiBits: result.aiBits.map((bit) => ({
        id: bit.id,
        kind: bit.kind,
        name: bit.name,
        scope: bit.scope,
        status: bit.status,
        vendorId: bit.vendorId,
      })),
    });

    writeOutput(options, envelope, () =>
      [
        "Prepared a redacted sync envelope.",
        "Hosted transport is scaffolded but not connected to a production API yet.",
      ].join("\n"),
    );
  });

program
  .command("login")
  .description("Start hosted account sign-in.")
  .action(() => {
    console.log(
      "Hosted sign-in is scaffolded. Configure the production devngn.ai API before enabling login.",
    );
  });

program
  .command("update")
  .description("Check bundled registry and client update status.")
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const payload = {
      clientVersion: "0.0.0",
      registry: getResearchFreshnessSummary(),
    };
    writeOutput(
      options,
      payload,
      () =>
        `devngn ${payload.clientVersion}; registry vendors: ${payload.registry.total}.`,
    );
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function runScan(): Promise<ScanResult> {
  return scanWorkspace({
    workspace: process.cwd(),
    registry: getBundledRegistry(),
  });
}

async function createCurrentManifest(): Promise<DevngnManifest> {
  return createDevngnManifest({
    scan: await runScan(),
  });
}

function writeOutput<T>(
  options: JsonOption,
  payload: T,
  render: () => string,
): void {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(render());
}

function renderScan(result: ScanResult): string {
  const aiBits =
    result.aiBits.length === 0
      ? ["No AI-bits found in this workspace yet."]
      : result.aiBits.map(
          (bit) =>
            `- ${bit.kind}: ${bit.name} (${bit.relativePath ?? bit.scope})`,
        );

  const findings =
    result.findings.length === 0
      ? ["No findings."]
      : result.findings
          .slice(0, 10)
          .map(
            (finding) =>
              `- [${finding.severity}] ${finding.title}: ${finding.message}`,
          );

  return [
    summarizeScan(result),
    "",
    "AI-bits",
    ...aiBits,
    "",
    "Findings",
    ...findings,
  ].join("\n");
}

function renderRecommendations(
  recommendations: readonly Recommendation[],
): string {
  if (recommendations.length === 0) {
    return "No recommendations yet.";
  }

  return recommendations
    .map((recommendation) =>
      [
        `- ${recommendation.title}`,
        `  Risk: ${recommendation.risk}`,
        `  Action: ${recommendation.suggestedAction}`,
      ].join("\n"),
    )
    .join("\n");
}

function renderProviderReadiness(
  readiness: readonly AIProviderReadiness[],
): string {
  return [
    "AI provider readiness",
    ...readiness.map((provider) => {
      const sdk =
        provider.sdkPackages.length === 0
          ? "SDK: research required"
          : `SDK: ${provider.installedSdkPackages.length}/${provider.sdkPackages.length} installed`;

      return [
        `- ${provider.name} (${provider.providerId})`,
        `  ${sdk}; auth: ${provider.configuredAuth ? "configured" : "not configured"}`,
        `  Capabilities: ${provider.capabilities.join(", ")}`,
      ].join("\n");
    }),
  ].join("\n");
}

function renderCommunicationPreferences(
  preferences: CommunicationPreferences,
): string {
  const channels = preferences.longRunningLoops.channels.map(
    (channel) =>
      `- ${channel.kind}: ${channel.enabled ? "enabled" : "disabled"}`,
  );
  const backends = preferences.backends.map(
    (backend) =>
      `- ${backend.name}${backend.appHostPath === null ? "" : ` (${backend.appHostPath})`}`,
  );

  return [
    preferences.longRunningLoops.label,
    `Notify after: ${preferences.longRunningLoops.notifyAfterSeconds}s`,
    `Repeat: ${preferences.longRunningLoops.repeatEverySeconds ?? "off"}s`,
    "",
    "Channels",
    ...channels,
    "",
    "Backends",
    ...backends,
  ].join("\n");
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received "${value}".`);
  }

  return parsed;
}
