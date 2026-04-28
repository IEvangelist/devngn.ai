import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ScanResult } from "@devngn/core";

export const GpuDeviceSchema = z.object({
  name: z.string(),
  vendor: z.string().nullable(),
  driverVersion: z.string().nullable(),
  memoryBytes: z.number().int().nonnegative().nullable(),
  source: z.enum([
    "windows-cim",
    "macos-system-profiler",
    "linux-lspci",
    "provided",
  ]),
});
export type GpuDevice = z.infer<typeof GpuDeviceSchema>;

export const PathToolSchema = z.object({
  name: z.string(),
  path: z.string(),
  directory: z.string(),
  extension: z.string().nullable(),
});
export type PathTool = z.infer<typeof PathToolSchema>;

export const UserIdentitySchema = z.object({
  preferredName: z.string().nullable(),
  username: z.string().nullable(),
  email: z.string().email().nullable(),
  source: z.enum(["manual", "environment", "git", "os", "unknown"]),
});
export type UserIdentity = z.infer<typeof UserIdentitySchema>;

export const UserChoiceBindingSchema = z.object({
  choiceId: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  source: z.string(),
  relatedFindingIds: z.array(z.string()).default([]),
});
export type UserChoiceBinding = z.infer<typeof UserChoiceBindingSchema>;

export const NotificationChannelSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local-tray"),
    enabled: z.boolean(),
    platform: z.enum(["win32", "darwin", "linux", "cross-platform"]),
    urgency: z.enum(["low", "normal", "critical"]),
  }),
  z.object({
    kind: z.literal("email"),
    enabled: z.boolean(),
    to: z.string().email().nullable(),
    from: z.string().email().nullable(),
    provider: z.enum(["smtp", "hosted-devngn", "aspire-apphost"]),
  }),
  z.object({
    kind: z.literal("sms"),
    enabled: z.boolean(),
    phoneNumber: z.string().nullable(),
    provider: z.enum(["hosted-devngn", "mqtt-zanzito", "playsms"]),
  }),
  z.object({
    kind: z.literal("mqtt"),
    enabled: z.boolean(),
    brokerUrl: z.string().nullable(),
    topic: z.string(),
  }),
  z.object({
    kind: z.literal("playsms"),
    enabled: z.boolean(),
    baseUrl: z.string().url().nullable(),
    senderId: z.string().nullable(),
  }),
]);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const LongRunningLoopPolicySchema = z.object({
  enabled: z.boolean(),
  label: z.string(),
  loopKinds: z.array(z.enum(["ai-loop", "ralph", "eval", "research"])),
  notifyAfterSeconds: z.number().int().positive(),
  repeatEverySeconds: z.number().int().positive().nullable(),
  channels: z.array(NotificationChannelSchema),
});
export type LongRunningLoopPolicy = z.infer<typeof LongRunningLoopPolicySchema>;

export const CommunicationBackendSchema = z.object({
  kind: z.enum(["local-os", "hosted-devngn", "aspire-apphost"]),
  name: z.string(),
  appHostPath: z.string().nullable(),
  resources: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      containerContext: z.string().nullable(),
    }),
  ),
});
export type CommunicationBackend = z.infer<typeof CommunicationBackendSchema>;

export const CommunicationPreferencesSchema = z.object({
  longRunningLoops: LongRunningLoopPolicySchema,
  backends: z.array(CommunicationBackendSchema),
});
export type CommunicationPreferences = z.infer<
  typeof CommunicationPreferencesSchema
>;

export const DevngnManifestSchema = z.object({
  schemaVersion: z.literal(1),
  manifestVersion: z.literal("devngn.profile.v1"),
  generatedAt: z.string().datetime(),
  workspace: z.string(),
  user: z.object({
    identity: UserIdentitySchema,
    choices: z.array(UserChoiceBindingSchema),
  }),
  grounding: z.object({
    host: z.object({
      osType: z.string(),
      platform: z.string(),
      release: z.string(),
      architecture: z.string(),
      shell: z.string().nullable(),
      homeDirectory: z.string(),
    }),
    hardware: z.object({
      cpu: z.object({
        model: z.string().nullable(),
        cores: z.number().int().nonnegative(),
        logicalProcessors: z.number().int().nonnegative(),
        speedMHz: z.number().int().nonnegative().nullable(),
      }),
      memory: z.object({
        totalBytes: z.number().int().nonnegative(),
      }),
      gpus: z.array(GpuDeviceSchema),
    }),
    path: z.object({
      entries: z.array(z.string()),
      installedTools: z.array(PathToolSchema),
      truncated: z.boolean(),
    }),
    devTools: z.object({
      detectedPackageManagers: z.array(z.string()),
      knownInstalledTools: z.array(z.string()),
    }),
    aiBits: z.object({
      total: z.number().int().nonnegative(),
      byKind: z.record(z.string(), z.number().int().nonnegative()),
    }),
    findings: z.object({
      total: z.number().int().nonnegative(),
      bySeverity: z.record(z.string(), z.number().int().nonnegative()),
    }),
    warnings: z.array(z.string()),
  }),
  communication: CommunicationPreferencesSchema,
});
export type DevngnManifest = z.infer<typeof DevngnManifestSchema>;

export interface CreateDevngnManifestOptions {
  scan: ScanResult;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  identity?: Partial<UserIdentity>;
  maxPathTools?: number;
  gpuDevices?: readonly GpuDevice[];
}

interface DiscoveryResult<T> {
  values: T[];
  warnings: string[];
  truncated?: boolean;
}

export function createDevngnManifest(
  options: CreateDevngnManifestOptions,
): DevngnManifest {
  const env = options.env ?? process.env;
  const pathTools = discoverPathTools({
    env,
    platform: options.scan.host.platform as NodeJS.Platform,
    pathEntries: options.scan.host.pathEntries,
    maxTools: options.maxPathTools ?? 500,
  });
  const gpus =
    options.gpuDevices === undefined
      ? discoverGpuDevices(options.scan.host.platform as NodeJS.Platform)
      : {
          values: options.gpuDevices.map((gpu) =>
            GpuDeviceSchema.parse({ ...gpu, source: gpu.source ?? "provided" }),
          ),
          warnings: [],
        };
  const identity = resolveIdentity(env, options.identity);

  return DevngnManifestSchema.parse({
    schemaVersion: 1,
    manifestVersion: "devngn.profile.v1",
    generatedAt: (options.now ?? new Date()).toISOString(),
    workspace: options.scan.workspace,
    user: {
      identity,
      choices: createUserChoiceBindings(identity, options.scan),
    },
    grounding: {
      host: {
        osType: options.scan.host.osType,
        platform: options.scan.host.platform,
        release: options.scan.host.release,
        architecture: options.scan.host.architecture,
        shell: options.scan.host.shell,
        homeDirectory: options.scan.host.homeDirectory,
      },
      hardware: {
        cpu: {
          model: os.cpus()[0]?.model ?? null,
          cores: physicalCoreEstimate(),
          logicalProcessors: options.scan.host.cpuCount,
          speedMHz: os.cpus()[0]?.speed ?? null,
        },
        memory: {
          totalBytes: options.scan.host.totalMemoryBytes,
        },
        gpus: gpus.values,
      },
      path: {
        entries: options.scan.host.pathEntries,
        installedTools: pathTools.values,
        truncated: pathTools.truncated ?? false,
      },
      devTools: {
        detectedPackageManagers: options.scan.host.detectedPackageManagers,
        knownInstalledTools: options.scan.tools
          .filter((tool) => tool.status === "installed")
          .map((tool) => tool.command),
      },
      aiBits: {
        total: options.scan.aiBits.length,
        byKind: countBy(options.scan.aiBits.map((bit) => bit.kind)),
      },
      findings: {
        total: options.scan.findings.length,
        bySeverity: countBy(
          options.scan.findings.map((finding) => finding.severity),
        ),
      },
      warnings: [...pathTools.warnings, ...gpus.warnings],
    },
    communication: createDefaultCommunicationPreferences({
      env,
      platform: options.scan.host.platform as NodeJS.Platform,
      identity,
    }),
  });
}

export function createDefaultCommunicationPreferences(
  options: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform | "cross-platform";
    identity?: UserIdentity;
  } = {},
): CommunicationPreferences {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const identity = options.identity ?? resolveIdentity(env);

  return CommunicationPreferencesSchema.parse({
    longRunningLoops: {
      enabled: true,
      label: "Keep me posted on long-running AI loops and ralphs",
      loopKinds: ["ai-loop", "ralph", "eval", "research"],
      notifyAfterSeconds: 300,
      repeatEverySeconds: 900,
      channels: [
        {
          kind: "local-tray",
          enabled: true,
          platform:
            platform === "win32" ||
            platform === "darwin" ||
            platform === "linux"
              ? platform
              : "cross-platform",
          urgency: "normal",
        },
        {
          kind: "email",
          enabled: false,
          to: identity.email,
          from: null,
          provider: "aspire-apphost",
        },
        {
          kind: "sms",
          enabled: false,
          phoneNumber: env.DEVNGN_SMS_PHONE ?? null,
          provider: "mqtt-zanzito",
        },
        {
          kind: "mqtt",
          enabled: false,
          brokerUrl: env.DEVNGN_MQTT_BROKER_URL ?? null,
          topic: env.DEVNGN_MQTT_TOPIC ?? "devngn/notifications",
        },
        {
          kind: "playsms",
          enabled: false,
          baseUrl: env.DEVNGN_PLAYSMS_URL ?? null,
          senderId: env.DEVNGN_PLAYSMS_SENDER ?? null,
        },
      ],
    },
    backends: [
      {
        kind: "local-os",
        name: "Local OS tray notifications",
        appHostPath: null,
        resources: [],
      },
      {
        kind: "aspire-apphost",
        name: "devngn communications AppHost",
        appHostPath: "apps/comms-apphost/apphost.ts",
        resources: [
          {
            name: "mqtt-sms-gateway",
            purpose: "DIY SMS Gateway with MQTT and Zanzito-compatible topics.",
            containerContext: "apps/comms-apphost/containers/mqtt-sms-gateway",
          },
          {
            name: "playsms",
            purpose: "playSMS-style portal for SMS gateway experimentation.",
            containerContext: "apps/comms-apphost/containers/playsms",
          },
        ],
      },
    ],
  });
}

export function renderManifestSummary(manifest: DevngnManifest): string {
  return [
    `devngn profile ${manifest.manifestVersion}`,
    `Workspace: ${manifest.workspace}`,
    `User: ${manifest.user.identity.preferredName ?? manifest.user.identity.username ?? "unknown"}${manifest.user.identity.email === null ? "" : ` <${manifest.user.identity.email}>`}`,
    `Host: ${manifest.grounding.host.osType} ${manifest.grounding.host.release} (${manifest.grounding.host.architecture})`,
    `CPU: ${manifest.grounding.hardware.cpu.model ?? "unknown"}; logical processors: ${manifest.grounding.hardware.cpu.logicalProcessors}`,
    `Memory: ${formatBytes(manifest.grounding.hardware.memory.totalBytes)}`,
    `GPU: ${manifest.grounding.hardware.gpus.length === 0 ? "none detected" : manifest.grounding.hardware.gpus.map((gpu) => gpu.name).join(", ")}`,
    `PATH tools: ${manifest.grounding.path.installedTools.length}${manifest.grounding.path.truncated ? "+" : ""}`,
    `AI-bits: ${manifest.grounding.aiBits.total}; findings: ${manifest.grounding.findings.total}`,
    `Long-running loop notifications: ${manifest.communication.longRunningLoops.enabled ? "enabled" : "disabled"}`,
  ].join("\n");
}

function resolveIdentity(
  env: NodeJS.ProcessEnv,
  identity: Partial<UserIdentity> = {},
): UserIdentity {
  const gitName = readGitConfig("user.name");
  const gitEmail = readGitConfig("user.email");
  const preferredName =
    identity.preferredName ??
    env.DEVNGN_PREFERRED_NAME ??
    env.GIT_AUTHOR_NAME ??
    gitName ??
    null;
  const username =
    identity.username ??
    env.DEVNGN_USERNAME ??
    env.USERNAME ??
    env.USER ??
    null;
  const email = normalizeEmail(
    identity.email ??
      env.DEVNGN_EMAIL ??
      env.GIT_AUTHOR_EMAIL ??
      gitEmail ??
      null,
  );

  return UserIdentitySchema.parse({
    preferredName,
    username,
    email,
    source:
      identity.source ??
      (identity.preferredName !== undefined ||
      identity.username !== undefined ||
      identity.email !== undefined
        ? "manual"
        : env.DEVNGN_PREFERRED_NAME !== undefined ||
            env.DEVNGN_EMAIL !== undefined
          ? "environment"
          : gitName !== null || gitEmail !== null
            ? "git"
            : username !== null
              ? "os"
              : "unknown"),
  });
}

function createUserChoiceBindings(
  identity: UserIdentity,
  scan: ScanResult,
): UserChoiceBinding[] {
  const relatedFindingIds = scan.findings
    .filter((finding) => finding.id.startsWith("research:"))
    .map((finding) => finding.id);

  return [
    {
      choiceId: "identity.preferredName",
      label: "Preferred name",
      value: identity.preferredName,
      source: identity.source,
      relatedFindingIds: [],
    },
    {
      choiceId: "identity.username",
      label: "Username",
      value: identity.username,
      source: identity.source,
      relatedFindingIds: [],
    },
    {
      choiceId: "identity.email",
      label: "Email",
      value: identity.email,
      source: identity.source,
      relatedFindingIds: [],
    },
    {
      choiceId: "vendorResearch.reviewRequired",
      label: "Vendor research required before production adapter use",
      value: String(relatedFindingIds.length > 0),
      source: "scan-findings",
      relatedFindingIds,
    },
  ].map((binding) => UserChoiceBindingSchema.parse(binding));
}

function discoverPathTools(options: {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  pathEntries: readonly string[];
  maxTools: number;
}): DiscoveryResult<PathTool> {
  const tools = new Map<string, PathTool>();
  const warnings: string[] = [];
  const executableExtensions = pathExtensions(options.env, options.platform);

  for (const directory of options.pathEntries) {
    if (tools.size >= options.maxTools) {
      break;
    }

    try {
      for (const entry of readdirSync(directory)) {
        if (tools.size >= options.maxTools) {
          break;
        }

        const fullPath = path.join(directory, entry);
        const state = statSync(fullPath);

        if (!state.isFile()) {
          continue;
        }

        const extension = path.extname(entry);
        const isExecutable =
          options.platform === "win32"
            ? executableExtensions.has(extension.toUpperCase())
            : (state.mode & 0o111) !== 0;

        if (!isExecutable) {
          continue;
        }

        const name =
          extension === "" ? entry : entry.slice(0, -extension.length);
        const key = name.toLocaleLowerCase();

        if (!tools.has(key)) {
          tools.set(
            key,
            PathToolSchema.parse({
              name,
              path: fullPath,
              directory,
              extension: extension === "" ? null : extension,
            }),
          );
        }
      }
    } catch (error) {
      warnings.push(
        `Unable to inspect PATH directory ${directory}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    values: [...tools.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    warnings,
    truncated: tools.size >= options.maxTools,
  };
}

function discoverGpuDevices(
  platform: NodeJS.Platform,
): DiscoveryResult<GpuDevice> {
  switch (platform) {
    case "win32":
      return discoverWindowsGpus();
    case "darwin":
      return discoverMacGpus();
    case "linux":
      return discoverLinuxGpus();
    default:
      return {
        values: [],
        warnings: [`GPU discovery is not implemented for ${platform}.`],
      };
  }
}

function discoverWindowsGpus(): DiscoveryResult<GpuDevice> {
  const command = [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress",
  ];
  const output = readCommand("powershell.exe", command);

  if (output === null || output.trim() === "") {
    return {
      values: [],
      warnings: ["Windows GPU discovery returned no data."],
    };
  }

  try {
    const parsed = JSON.parse(output) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];

    return {
      values: rows.map((row) => {
        const record = row as Record<string, unknown>;
        return GpuDeviceSchema.parse({
          name: String(record.Name ?? "Unknown GPU"),
          vendor: inferGpuVendor(String(record.Name ?? "")),
          driverVersion:
            record.DriverVersion === undefined || record.DriverVersion === null
              ? null
              : String(record.DriverVersion),
          memoryBytes:
            typeof record.AdapterRAM === "number" && record.AdapterRAM > 0
              ? record.AdapterRAM
              : null,
          source: "windows-cim",
        });
      }),
      warnings: [],
    };
  } catch (error) {
    return {
      values: [],
      warnings: [
        `Unable to parse Windows GPU discovery output: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function discoverMacGpus(): DiscoveryResult<GpuDevice> {
  const output = readCommand("system_profiler", ["SPDisplaysDataType"]);

  if (output === null) {
    return {
      values: [],
      warnings: ["macOS GPU discovery requires system_profiler."],
    };
  }

  const names = [...output.matchAll(/Chipset Model:\s*(.+)/g)].map((match) =>
    match[1].trim(),
  );

  return {
    values: names.map((name) =>
      GpuDeviceSchema.parse({
        name,
        vendor: inferGpuVendor(name),
        driverVersion: null,
        memoryBytes: null,
        source: "macos-system-profiler",
      }),
    ),
    warnings:
      names.length === 0 ? ["macOS GPU discovery found no displays."] : [],
  };
}

function discoverLinuxGpus(): DiscoveryResult<GpuDevice> {
  const output = readCommand("lspci", []);

  if (output === null) {
    return { values: [], warnings: ["Linux GPU discovery requires lspci."] };
  }

  const names = output
    .split(/\r?\n/)
    .filter((line) => /vga|3d controller|display/i.test(line));

  return {
    values: names.map((name) =>
      GpuDeviceSchema.parse({
        name,
        vendor: inferGpuVendor(name),
        driverVersion: null,
        memoryBytes: null,
        source: "linux-lspci",
      }),
    ),
    warnings:
      names.length === 0
        ? ["Linux GPU discovery found no display controllers."]
        : [],
  };
}

function pathExtensions(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Set<string> {
  if (platform !== "win32") {
    return new Set([""]);
  }

  return new Set(
    (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD;.PS1")
      .split(";")
      .filter(Boolean)
      .map((extension) => extension.toUpperCase()),
  );
}

function readGitConfig(key: string): string | null {
  return readCommand("git", ["config", "--global", key])?.trim() || null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }

  const result = z.string().email().safeParse(value.trim());
  return result.success ? result.data : null;
}

function readCommand(command: string, args: readonly string[]): string | null {
  try {
    return execFileSync(command, [...args], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
  } catch {
    return null;
  }
}

function physicalCoreEstimate(): number {
  const logical = os.cpus().length;
  return logical <= 1 ? logical : Math.max(1, Math.round(logical / 2));
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

function inferGpuVendor(name: string): string | null {
  if (/nvidia/i.test(name)) {
    return "NVIDIA";
  }

  if (/amd|radeon|advanced micro devices/i.test(name)) {
    return "AMD";
  }

  if (/intel/i.test(name)) {
    return "Intel";
  }

  if (/apple/i.test(name)) {
    return "Apple";
  }

  return null;
}

function formatBytes(bytes: number): string {
  const gibibytes = bytes / 1024 / 1024 / 1024;
  return `${gibibytes.toFixed(1)} GiB`;
}
