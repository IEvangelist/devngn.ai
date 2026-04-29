import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listExperienceTriggers,
  recognizePatterns,
  summarizePatternTrends,
} from "./index.js";
import type { ScanResult } from "@devngn/core";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("patterns", () => {
  it("recognizes known workspace AI patterns", () => {
    const workspace = path.join(os.tmpdir(), `devngn-patterns-${randomUUID()}`);
    workspaces.push(workspace);
    mkdirSync(path.join(workspace, ".github"), { recursive: true });
    writeFileSync(path.join(workspace, "AGENTS.md"), "# Agent instructions");
    writeFileSync(
      path.join(workspace, ".github", "copilot-instructions.md"),
      "# Copilot instructions",
    );

    const matches = recognizePatterns(createScan(workspace));

    expect(matches.map((match) => match.patternId)).toContain("agents-md");
    expect(matches.map((match) => match.patternId)).toContain(
      "github-copilot-instructions",
    );
    expect(listExperienceTriggers(matches)).toContain("provider-bootstrap");
  });

  it("summarizes pattern trends", () => {
    const summary = summarizePatternTrends();

    expect(summary.total).toBeGreaterThan(0);
    expect(summary.rising).toContain("agents-md");
  });
});

function createScan(workspace: string): ScanResult {
  return {
    scannedAt: "2026-01-01T00:00:00.000Z",
    workspace,
    host: {
      osType: "Windows_NT",
      platform: "win32",
      release: "10.0.0",
      architecture: "x64",
      cpuCount: 8,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      homeDirectory: "C:\\Users\\dev",
      shell: "pwsh",
      pathEntries: [],
      detectedPackageManagers: [],
    },
    tools: [],
    aiBits: [],
    findings: [],
    recommendations: [],
    summary: {
      vendors: 0,
      installedTools: 0,
      aiBits: 0,
      findings: 0,
    },
  };
}
