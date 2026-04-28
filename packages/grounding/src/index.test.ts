import { describe, expect, it } from "vitest";
import { createDevngnManifest } from "./index.js";
import type { ScanResult } from "@devngn/core";

describe("createDevngnManifest", () => {
  it("grounds a scan with user choices and communication defaults", () => {
    const scan: ScanResult = {
      scannedAt: "2026-01-01T00:00:00.000Z",
      workspace: "D:\\GitHub\\devngn.ai",
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
        detectedPackageManagers: ["pnpm"],
      },
      tools: [
        {
          command: "git",
          vendorId: "git",
          productName: "Git",
          resolvedPath: "C:\\Tools\\git.exe",
          status: "installed",
          version: null,
          packageSource: null,
          updateSource: null,
        },
      ],
      aiBits: [],
      findings: [],
      recommendations: [],
      summary: {
        vendors: 1,
        installedTools: 1,
        aiBits: 0,
        findings: 0,
      },
    };

    const manifest = createDevngnManifest({
      scan,
      env: {
        DEVNGN_PREFERRED_NAME: "Dev",
        DEVNGN_EMAIL: "dev@example.com",
      },
      now: new Date("2026-01-01T00:00:00.000Z"),
      gpuDevices: [
        {
          name: "NVIDIA Test GPU",
          vendor: "NVIDIA",
          driverVersion: "1.0",
          memoryBytes: null,
          source: "provided",
        },
      ],
    });

    expect(manifest.user.identity.preferredName).toBe("Dev");
    expect(manifest.grounding.hardware.gpus[0]?.name).toBe("NVIDIA Test GPU");
    expect(manifest.communication.longRunningLoops.loopKinds).toContain(
      "ralph",
    );
  });
});
