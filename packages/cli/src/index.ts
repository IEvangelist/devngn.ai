#!/usr/bin/env node
import { Command } from "commander";
import {
  scanWorkspace,
  summarizeScan,
  type Recommendation,
  type ScanResult,
} from "@devngn/core";
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
