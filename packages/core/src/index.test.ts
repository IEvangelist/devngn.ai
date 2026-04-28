import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanWorkspace, type Finding, type VendorProfile } from "./index.js";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("scanWorkspace", () => {
  it("discovers workspace AI-bits from vendor patterns", async () => {
    const workspace = path.join(os.tmpdir(), `devngn-${randomUUID()}`);
    workspaces.push(workspace);
    mkdirSync(path.join(workspace, ".github"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".github", "copilot-instructions.md"),
      "# Copilot instructions",
    );

    const registry: VendorProfile[] = [
      {
        id: "github-copilot",
        name: "GitHub Copilot",
        products: ["GitHub Copilot"],
        category: "ai-vendor",
        commands: [],
        extensionIds: ["GitHub.copilot"],
        aiBitPatterns: [
          {
            kind: "instruction",
            scope: "workspace",
            path: [".github", "copilot-instructions.md"],
            name: "GitHub Copilot instructions",
            scanChildren: false,
          },
        ],
        research: {
          status: "planned",
          lastResearchedAt: null,
          sources: [],
          summary: "Research is pending.",
        },
      },
    ];

    const result = await scanWorkspace({
      workspace,
      registry,
      env: {},
      homeDirectory: workspace,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.summary.aiBits).toBe(1);
    expect(result.aiBits[0]?.name).toBe("GitHub Copilot instructions");
    expect(
      result.findings.some(
        (finding: Finding) => finding.id === "research:github-copilot",
      ),
    ).toBe(true);
  });
});
