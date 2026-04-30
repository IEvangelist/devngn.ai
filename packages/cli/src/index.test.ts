import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("devngn CLI bin", () => {
  it("runs scan through the local devngn command wrapper", async () => {
    const workspace = path.join(os.tmpdir(), `devngn-cli-${randomUUID()}`);
    workspaces.push(workspace);
    mkdirSync(workspace, { recursive: true });

    const packageRoot = path.resolve(import.meta.dirname, "..");
    const binPath = path.join(packageRoot, "bin", "devngn.mjs");
    const { stdout } = await execFileAsync(
      process.execPath,
      [binPath, "scan", "--json"],
      {
        cwd: workspace,
        env: {
          ...process.env,
          DEVNGN_TELEMETRY_DISABLED: "true",
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const payload = JSON.parse(stdout) as {
      workspace: string;
      summary: { vendors: number; findings: number };
    };

    expect(payload.workspace).toBe(path.resolve(workspace));
    expect(payload.summary.vendors).toBeGreaterThan(0);
    expect(payload.summary.findings).toBeGreaterThan(0);
  });
});
