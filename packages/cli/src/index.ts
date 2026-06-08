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
  getDefaultDevngnStoragePaths,
  renderManifestSummary,
  type CommunicationPreferences,
  type DevngnManifest,
} from "@devngn/grounding";
import {
  getPatternDatabase,
  listExperienceTriggers,
  recognizePatterns,
  summarizePatternTrends,
  type PatternMatch,
} from "@devngn/patterns";
import {
  createDevngnTelemetryConfig,
  initializeDevngnTelemetry,
  listImportantDevngnFlows,
  measureDevngnFlow,
  recordDevngnFlow,
  type AnalyticsProperties,
  type DevngnFlowName,
} from "@devngn/analytics";
import { listResearchTargets } from "@devngn/research";
import { summarizeSkills } from "@devngn/skills";
import { createSyncEnvelope } from "@devngn/sync";
import {
  getBundledRegistry,
  getResearchFreshnessSummary,
} from "@devngn/vendors";
import { WellnessClient } from "@devngn/wellness-client";
import { runWellnessDaemon, type DaemonLogger } from "./wellness/daemon.js";
import { createDefaultNotifier } from "./wellness/notifier.js";
import { runDeviceFlowLogin } from "./wellness/signIn.js";
import {
  createFileTokenSource,
  deleteSession,
  readSession,
  wellnessSessionPath,
  writeSession,
} from "./wellness/tokenStore.js";
import { resolveHostTimeZone } from "./wellness/util.js";

interface JsonOption {
  json?: boolean;
}

const program = new Command();
const telemetry = initializeDevngnTelemetry({
  source: "cli",
  serviceName: "devngn-cli",
  serviceVersion: "0.0.0",
});

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
    recordCliFlow("cli.command", {
      command: "scan",
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
    recordCliFlow("cli.command", {
      command: "status",
      aiBits: result.summary.aiBits,
      findings: result.summary.findings,
    });
    writeOutput(options, result.summary, () => summarizeScan(result));
  });

program
  .command("doctor")
  .description("Turn findings into ranked recommendations.")
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const result = await runScan();
    recordCliFlow("doctor.recommendations", {
      recommendations: result.recommendations.length,
    });
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
    recordCliFlow("vendors.registry", {
      vendors: payload.summary.total,
      planned: payload.summary.byStatus.planned ?? 0,
      verified: payload.summary.byStatus.verified ?? 0,
    });

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
    recordCliFlow("vendors.research", {
      targets: targets.length,
    });
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
    recordCliFlow("skills.list", {
      skills: skills.length,
    });
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
    recordCliFlow("grounding.profile.generate", {
      tools: manifest.grounding.path.installedTools.length,
      aiBits: manifest.grounding.aiBits.total,
      findings: manifest.grounding.findings.total,
      communicationChannels:
        manifest.communication.longRunningLoops.channels.length,
    });
    writeOutput(options, manifest, () => renderManifestSummary(manifest));
  });

profileCommand
  .command("write")
  .description("Write the current devngn manifest/profile to disk.")
  .option(
    "-o, --output <path>",
    "Output path for the profile manifest. Defaults to the OS-native devngn state directory.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption & { output?: string }) => {
    const manifest = await createCurrentManifest();
    const storagePaths = getDefaultDevngnStoragePaths({
      workspace: process.cwd(),
      homeDirectory: manifest.grounding.host.homeDirectory,
      platform: manifest.grounding.host.platform as NodeJS.Platform,
    });
    const outputPath =
      options.output === undefined
        ? storagePaths.profilePath
        : path.resolve(process.cwd(), options.output);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    recordCliFlow("grounding.profile.write", {
      explicitOutput: options.output !== undefined,
    });

    writeOutput(options, { outputPath, manifest }, () =>
      [
        `Wrote devngn grounding profile to ${outputPath}.`,
        options.output === undefined
          ? "Used OS-native state storage; pass --output to export elsewhere intentionally."
          : "Used explicit export path.",
      ].join("\n"),
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
    recordCliFlow("comms.preferences.view", {
      channels: manifest.communication.longRunningLoops.channels.length,
      backends: manifest.communication.backends.length,
    });
    writeOutput(options, manifest.communication, () =>
      renderCommunicationPreferences(manifest.communication),
    );
  });

const patternsCommand = program
  .command("patterns")
  .description("Explore known AI patterns, trends, and experience triggers.");

patternsCommand
  .command("list")
  .description("List widely adopted AI patterns known to devngn.")
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const database = getPatternDatabase();
    recordCliFlow("patterns.list", {
      patterns: database.patterns.length,
    });
    writeOutput(options, database, () =>
      [
        `devngn knows ${database.patterns.length} AI ecosystem patterns.`,
        ...database.patterns.map(
          (pattern) =>
            `- ${pattern.name} (${pattern.adoption}, ${pattern.trend.direction})`,
        ),
      ].join("\n"),
    );
  });

patternsCommand
  .command("trends")
  .description("Summarize AI pattern adoption and trend direction.")
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const summary = summarizePatternTrends();
    recordCliFlow("patterns.trends", {
      patterns: summary.total,
      rising: summary.rising.length,
      watch: summary.watch.length,
    });
    writeOutput(options, summary, () =>
      [
        `Tracked patterns: ${summary.total}`,
        `Rising: ${summary.rising.join(", ") || "none"}`,
        `Watch: ${summary.watch.join(", ") || "none"}`,
        `By adoption: ${renderCounts(summary.byAdoption)}`,
        `By trend: ${renderCounts(summary.byTrend)}`,
      ].join("\n"),
    );
  });

patternsCommand
  .command("recognize")
  .description(
    "Recognize AI patterns in the current workspace and show experiences to light up.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action(async (options: JsonOption) => {
    const scan = await runScan();
    const matches = await measureDevngnFlow(
      {
        name: "patterns.recognize",
        source: "cli",
        resultProperties: (recognizedMatches) => ({
          matches: recognizedMatches.length,
          experienceTriggers: listExperienceTriggers(recognizedMatches).length,
        }),
      },
      () => recognizePatterns(scan),
    );
    const payload = {
      matches,
      experienceTriggers: listExperienceTriggers(matches),
    };

    writeOutput(options, payload, () => renderPatternMatches(matches));
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
    recordCliFlow("ai.providers.readiness", {
      providers: readiness.length,
      readyProviders: readiness.filter(
        (provider) =>
          provider.configuredAuth && provider.missingSdkPackages.length === 0,
      ).length,
    });
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
      recordCliFlow("ai.token_budget", {
        estimatedInputTokens: budget.estimatedInputTokens,
        availableInputTokens: budget.availableInputTokens,
        withinBudget: budget.withinBudget,
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
      recordCliFlow("ai.bootstrap", {
        provider: request.providerId,
        model: request.model,
        estimatedInputTokens: request.tokenBudget.estimatedInputTokens,
        withinBudget: request.tokenBudget.withinBudget,
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

const telemetryCommand = program
  .command("telemetry")
  .description(
    "Inspect OpenTelemetry configuration and measured devngn flows.",
  );

telemetryCommand
  .command("config")
  .description(
    "Show the local OpenTelemetry and Aspire dashboard export config.",
  )
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const config = createDevngnTelemetryConfig({
      source: "cli",
      serviceName: "devngn-cli",
      serviceVersion: "0.0.0",
    });
    recordCliFlow("telemetry.pipeline", {
      enabled: config.enabled,
      logs: config.otlp.logsEndpoint !== null,
      traces: config.otlp.tracesEndpoint !== null,
      metrics: config.otlp.metricsEndpoint !== null,
    });
    writeOutput(options, config, () =>
      [
        `OpenTelemetry: ${config.enabled ? "enabled" : "disabled"}`,
        `Service: ${config.serviceName}`,
        `OTLP endpoint: ${config.otlp.endpoint ?? "not configured"}`,
        `Signals: ${config.signals.join(", ")}`,
        "Set OTEL_EXPORTER_OTLP_ENDPOINT to the Aspire dashboard OTLP endpoint to export logs, traces, and metrics.",
      ].join("\n"),
    );
  });

telemetryCommand
  .command("flows")
  .description("List the important dev engine flows measured by devngn.")
  .option("--json", "Print machine-readable JSON.")
  .action((options: JsonOption) => {
    const flows = listImportantDevngnFlows();
    recordCliFlow("telemetry.pipeline", {
      flows: flows.length,
    });
    writeOutput(options, flows, () =>
      [
        `devngn measures ${flows.length} important flows with OTel logs, traces, and metrics.`,
        ...flows.map((flow) => `- ${flow.name}: ${flow.displayName}`),
      ].join("\n"),
    );
  });

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
    recordCliFlow("sync.prepare", {
      payloadKind: envelope.scope,
      aiBits: result.aiBits.length,
      findings: result.findings.length,
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
    recordCliFlow("update.check", {
      clientVersion: payload.clientVersion,
      registryVendors: payload.registry.total,
    });
    writeOutput(
      options,
      payload,
      () =>
        `devngn ${payload.clientVersion}; registry vendors: ${payload.registry.total}.`,
    );
  });

const DEFAULT_WELLNESS_API_URL = "http://localhost:5000";

const wellnessCommand = program
  .command("wellness")
  .description(
    "Stream movement-break prompts and raise OS notifications when your schedule opens up.",
  );

wellnessCommand
  .command("login")
  .description("Sign in to the wellness service with the GitHub device flow.")
  .option("--api-url <url>", "Wellness API base URL.", DEFAULT_WELLNESS_API_URL)
  .action(async (options: { apiUrl: string }) => {
    const file = wellnessSessionPath(
      getDefaultDevngnStoragePaths({ workspace: process.cwd() }).stateDirectory,
    );
    const client = new WellnessClient({
      baseUrl: options.apiUrl,
      getToken: createFileTokenSource(file).getToken,
    });

    const session = await runDeviceFlowLogin(client, {
      log: {
        info: (line) => console.log(line),
        error: (line) => console.error(line),
      },
    });
    if (session === null) {
      recordCliFlow("cli.command", {
        command: "wellness login",
        signedIn: false,
      });
      process.exitCode = 1;
      return;
    }

    await writeSession(file, session);
    recordCliFlow("cli.command", { command: "wellness login", signedIn: true });
    console.log(
      `Signed in${session.login ? ` as ${session.login}` : ""}. Run \`devngn wellness daemon\` to start receiving movement breaks.`,
    );
  });

wellnessCommand
  .command("logout")
  .description("Sign out and delete the stored wellness session.")
  .action(async () => {
    const file = wellnessSessionPath(
      getDefaultDevngnStoragePaths({ workspace: process.cwd() }).stateDirectory,
    );
    await deleteSession(file);
    recordCliFlow("cli.command", { command: "wellness logout" });
    console.log("Signed out of the wellness service.");
  });

wellnessCommand
  .command("daemon")
  .description(
    "Subscribe to the prompt stream and raise OS notifications until interrupted.",
  )
  .option("--api-url <url>", "Wellness API base URL.", DEFAULT_WELLNESS_API_URL)
  .option(
    "--tz <iana>",
    "IANA time zone for gap windows. Defaults to the host zone.",
  )
  .option("--once", "Exit after the first prompt (useful for testing).")
  .action(async (options: { apiUrl: string; tz?: string; once?: boolean }) => {
    const file = wellnessSessionPath(
      getDefaultDevngnStoragePaths({ workspace: process.cwd() }).stateDirectory,
    );
    const session = await readSession(file);
    if (session === null) {
      console.error("Not signed in. Run `devngn wellness login` first.");
      process.exitCode = 1;
      return;
    }

    const client = new WellnessClient({
      baseUrl: options.apiUrl,
      getToken: createFileTokenSource(file).getToken,
    });
    const notifier = createDefaultNotifier();
    const timeZone = options.tz ?? resolveHostTimeZone();

    const controller = new AbortController();
    let interrupts = 0;
    const onInterrupt = (): void => {
      interrupts += 1;
      if (interrupts >= 2) {
        process.exit(130);
      }
      console.log(
        "\nStopping wellness daemon… (press Ctrl+C again to force quit)",
      );
      controller.abort();
    };
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onInterrupt);

    const log: DaemonLogger = {
      status: (status) => console.log(`[wellness] ${status}`),
      prompt: (message) => console.log(`[wellness] ${message.title}`),
      warn: (error) =>
        console.warn(
          `[wellness] ${error instanceof Error ? error.message : String(error)}`,
        ),
    };

    try {
      console.log(
        `Listening for movement breaks from ${options.apiUrl}${session.login ? ` as ${session.login}` : ""}. Press Ctrl+C to stop.`,
      );
      const result = await runWellnessDaemon({
        client,
        notifier,
        log,
        timeZone,
        signal: controller.signal,
        once: options.once,
      });
      recordCliFlow("cli.command", {
        command: "wellness daemon",
        reason: result.reason,
      });

      if (result.reason === "unauthorized") {
        console.error(
          "Wellness session is no longer valid. Run `devngn wellness login` again.",
        );
        process.exitCode = 1;
      } else if (result.reason === "forbidden") {
        console.error(
          "Wellness access is forbidden. Accept the latest consent in the devngn.ai app, then retry.",
        );
        process.exitCode = 1;
      }
    } finally {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onInterrupt);
    }
  });

program
  .parseAsync(process.argv)
  .then(async () => {
    await telemetry.shutdown();
  })
  .catch(async (error: unknown) => {
    recordCliFlow(
      "cli.command",
      {
        command: process.argv.slice(2).join(" ") || "unknown",
        errorName: error instanceof Error ? error.name : "Error",
      },
      "error",
    );
    await telemetry.shutdown();
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

async function runScan(): Promise<ScanResult> {
  return measureDevngnFlow(
    {
      name: "workspace.scan",
      source: "cli",
      resultProperties: (result) => ({
        vendors: result.summary.vendors,
        aiBits: result.summary.aiBits,
        findings: result.summary.findings,
        recommendations: result.recommendations.length,
      }),
    },
    () =>
      scanWorkspace({
        workspace: process.cwd(),
        registry: getBundledRegistry(),
      }),
  );
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

function recordCliFlow(
  name: DevngnFlowName,
  properties: AnalyticsProperties = {},
  status: "success" | "error" = "success",
): void {
  recordDevngnFlow({
    name,
    source: "cli",
    status,
    properties,
  });
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

function renderPatternMatches(matches: readonly PatternMatch[]): string {
  if (matches.length === 0) {
    return "No known AI patterns recognized in this workspace yet.";
  }

  return [
    `Recognized ${matches.length} AI patterns.`,
    `Light up: ${listExperienceTriggers(matches).join(", ")}`,
    "",
    ...matches.map((match) =>
      [
        `- ${match.name} (${Math.round(match.score * 100)}%, ${match.trend})`,
        `  Experiences: ${match.experienceTriggers.join(", ")}`,
        `  Guidance: ${match.guidance}`,
      ].join("\n"),
    ),
  ].join("\n");
}

function renderCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
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
