import { readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

export const ScopeSchema = z.enum(["user", "workspace", "device", "system"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const AIBitKindSchema = z.enum([
  "instruction",
  "skill",
  "prompt",
  "rule",
  "memory",
  "mcp-config",
  "model-preference",
  "eval",
  "vendor-folder",
  "extension-state",
  "cli-config",
  "recommendation",
]);
export type AIBitKind = z.infer<typeof AIBitKindSchema>;

export const AIBitStatusSchema = z.enum([
  "active",
  "stale",
  "duplicate",
  "orphaned",
  "conflict",
  "unknown",
]);
export type AIBitStatus = z.infer<typeof AIBitStatusSchema>;

export const AIBitPatternSchema = z.object({
  kind: AIBitKindSchema,
  scope: ScopeSchema,
  path: z.array(z.string()).min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  scanChildren: z.boolean().default(false),
});
export type AIBitPattern = z.infer<typeof AIBitPatternSchema>;

export const VendorResearchStatusSchema = z.object({
  status: z.enum(["planned", "in_progress", "current", "stale"]),
  lastResearchedAt: z.string().datetime().nullable(),
  sources: z.array(z.string()).default([]),
  summary: z.string(),
});
export type VendorResearchStatus = z.infer<typeof VendorResearchStatusSchema>;

export const VendorProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  products: z.array(z.string()).default([]),
  category: z.enum(["ai-vendor", "ai-editor", "ai-cli", "dev-tool"]),
  commands: z.array(z.string()).default([]),
  extensionIds: z.array(z.string()).default([]),
  docsUrl: z.string().url().optional(),
  logoRef: z.string().optional(),
  aiBitPatterns: z.array(AIBitPatternSchema).default([]),
  research: VendorResearchStatusSchema,
});
export type VendorProfile = z.infer<typeof VendorProfileSchema>;

export const AIBitSchema = z.object({
  id: z.string().min(1),
  kind: AIBitKindSchema,
  name: z.string().min(1),
  scope: ScopeSchema,
  status: AIBitStatusSchema,
  sourcePath: z.string(),
  relativePath: z.string().nullable(),
  vendorId: z.string().nullable(),
  toolId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AIBit = z.infer<typeof AIBitSchema>;

export const ToolInstallSchema = z.object({
  command: z.string().min(1),
  vendorId: z.string(),
  productName: z.string(),
  resolvedPath: z.string().nullable(),
  status: z.enum(["installed", "missing"]),
  version: z.string().nullable(),
  packageSource: z.string().nullable(),
  updateSource: z.string().nullable(),
});
export type ToolInstall = z.infer<typeof ToolInstallSchema>;

export const HostProfileSchema = z.object({
  osType: z.string(),
  platform: z.string(),
  release: z.string(),
  architecture: z.string(),
  cpuCount: z.number().int().nonnegative(),
  totalMemoryBytes: z.number().int().nonnegative(),
  homeDirectory: z.string(),
  shell: z.string().nullable(),
  pathEntries: z.array(z.string()),
  detectedPackageManagers: z.array(z.string()),
});
export type HostProfile = z.infer<typeof HostProfileSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  title: z.string(),
  message: z.string(),
  affectedAIBitIds: z.array(z.string()).default([]),
  vendorId: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
});
export type Finding = z.infer<typeof FindingSchema>;

export const RecommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  rationale: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  findingIds: z.array(z.string()),
  suggestedAction: z.string(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const ScanResultSchema = z.object({
  scannedAt: z.string().datetime(),
  workspace: z.string(),
  host: HostProfileSchema,
  tools: z.array(ToolInstallSchema),
  aiBits: z.array(AIBitSchema),
  findings: z.array(FindingSchema),
  recommendations: z.array(RecommendationSchema),
  summary: z.object({
    vendors: z.number().int().nonnegative(),
    installedTools: z.number().int().nonnegative(),
    aiBits: z.number().int().nonnegative(),
    findings: z.number().int().nonnegative(),
  }),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export interface ScanWorkspaceOptions {
  workspace: string;
  registry: readonly VendorProfile[];
  now?: Date;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}

interface PathState {
  exists: boolean;
  kind: "file" | "directory" | "other" | null;
  error: string | null;
}

export async function scanWorkspace(
  options: ScanWorkspaceOptions,
): Promise<ScanResult> {
  const registry = options.registry.map((vendor) =>
    VendorProfileSchema.parse(vendor),
  );
  const host = createHostProfile(options);
  const tools = detectTools(registry, host.pathEntries, options);
  const { aiBits, probeFindings } = discoverAIBits(
    registry,
    host,
    options.workspace,
  );
  const findings = [
    ...probeFindings,
    ...createResearchFindings(registry),
    ...createDuplicateFindings(aiBits),
  ];
  const recommendations = createRecommendations(findings);

  return ScanResultSchema.parse({
    scannedAt: (options.now ?? new Date()).toISOString(),
    workspace: path.resolve(options.workspace),
    host,
    tools,
    aiBits,
    findings,
    recommendations,
    summary: {
      vendors: registry.length,
      installedTools: tools.filter((tool) => tool.status === "installed")
        .length,
      aiBits: aiBits.length,
      findings: findings.length,
    },
  });
}

export function summarizeScan(result: ScanResult): string {
  return [
    `devngn found ${result.summary.aiBits} AI-bits across ${result.summary.vendors} known vendors.`,
    `${result.summary.installedTools} known tools are installed and ${result.summary.findings} findings need attention.`,
  ].join(" ");
}

function createHostProfile(options: ScanWorkspaceOptions): HostProfile {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? os.homedir();
  const pathEntries = splitPath(env);
  const packageManagers = [
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "dotnet",
    "brew",
    "winget",
    "choco",
  ].filter(
    (command) => findExecutable(command, pathEntries, platform, env) !== null,
  );

  return HostProfileSchema.parse({
    osType: os.type(),
    platform,
    release: os.release(),
    architecture: os.arch(),
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    homeDirectory,
    shell: env.SHELL ?? env.ComSpec ?? null,
    pathEntries,
    detectedPackageManagers: packageManagers,
  });
}

function splitPath(env: NodeJS.ProcessEnv): string[] {
  const value = env.Path ?? env.PATH ?? "";
  return value
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectTools(
  registry: readonly VendorProfile[],
  pathEntries: readonly string[],
  options: ScanWorkspaceOptions,
): ToolInstall[] {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  return registry.flatMap((vendor) =>
    vendor.commands.map((command) => {
      const resolvedPath = findExecutable(command, pathEntries, platform, env);

      return ToolInstallSchema.parse({
        command,
        vendorId: vendor.id,
        productName: vendor.products[0] ?? vendor.name,
        resolvedPath,
        status: resolvedPath === null ? "missing" : "installed",
        version: null,
        packageSource: null,
        updateSource: vendor.docsUrl ?? null,
      });
    }),
  );
}

function findExecutable(
  command: string,
  pathEntries: readonly string[],
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string | null {
  const extensions = executableExtensions(command, platform, env);

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      const state = readPathState(candidate);

      if (state.exists && state.kind === "file") {
        return candidate;
      }
    }
  }

  return null;
}

function executableExtensions(
  command: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (path.extname(command) !== "") {
    return [""];
  }

  if (platform !== "win32") {
    return [""];
  }

  const pathExt = env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD;.PS1";
  return pathExt.split(";").filter(Boolean);
}

function discoverAIBits(
  registry: readonly VendorProfile[],
  host: HostProfile,
  workspace: string,
): { aiBits: AIBit[]; probeFindings: Finding[] } {
  const aiBits: AIBit[] = [];
  const probeFindings: Finding[] = [];

  for (const vendor of registry) {
    for (const pattern of vendor.aiBitPatterns) {
      const basePath =
        pattern.scope === "user" ? host.homeDirectory : workspace;
      const targetPath = path.join(basePath, ...pattern.path);
      const state = readPathState(targetPath);

      if (state.error !== null) {
        probeFindings.push(
          FindingSchema.parse({
            id: `probe:${slug(vendor.id)}:${slug(pattern.path.join("-"))}`,
            severity: "warning",
            title: `Could not inspect ${vendor.name} AI-bit path`,
            message: state.error,
            affectedAIBitIds: [],
            vendorId: vendor.id,
            confidence: 0.8,
          }),
        );
        continue;
      }

      if (!state.exists) {
        continue;
      }

      if (pattern.scanChildren && state.kind === "directory") {
        const children = readDirectoryChildren(targetPath);

        if (children.error !== null) {
          probeFindings.push(
            FindingSchema.parse({
              id: `probe:${slug(vendor.id)}:${slug(pattern.path.join("-"))}:children`,
              severity: "warning",
              title: `Could not inspect ${vendor.name} AI-bit folder`,
              message: children.error,
              affectedAIBitIds: [],
              vendorId: vendor.id,
              confidence: 0.8,
            }),
          );
          continue;
        }

        for (const childPath of children.paths) {
          aiBits.push(
            createAIBit(
              vendor,
              pattern,
              childPath,
              workspace,
              path.basename(childPath),
            ),
          );
        }

        continue;
      }

      aiBits.push(
        createAIBit(
          vendor,
          pattern,
          targetPath,
          workspace,
          pattern.name ?? path.basename(targetPath),
        ),
      );
    }
  }

  return { aiBits, probeFindings };
}

function createAIBit(
  vendor: VendorProfile,
  pattern: AIBitPattern,
  sourcePath: string,
  workspace: string,
  name: string,
): AIBit {
  const resolvedWorkspace = path.resolve(workspace);
  const resolvedSource = path.resolve(sourcePath);
  const relativePath = resolvedSource.startsWith(resolvedWorkspace)
    ? path.relative(resolvedWorkspace, resolvedSource)
    : null;

  return AIBitSchema.parse({
    id: `${slug(vendor.id)}:${pattern.scope}:${pattern.kind}:${slug(relativePath ?? resolvedSource)}`,
    kind: pattern.kind,
    name,
    scope: pattern.scope,
    status: "active",
    sourcePath: resolvedSource,
    relativePath,
    vendorId: vendor.id,
    toolId: vendor.commands[0] ?? null,
    metadata: {
      vendorName: vendor.name,
      patternPath: pattern.path.join("/"),
      description: pattern.description ?? null,
    },
  });
}

function readPathState(targetPath: string): PathState {
  try {
    const stats = statSync(targetPath);

    if (stats.isFile()) {
      return { exists: true, kind: "file", error: null };
    }

    if (stats.isDirectory()) {
      return { exists: true, kind: "directory", error: null };
    }

    return { exists: true, kind: "other", error: null };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { exists: false, kind: null, error: null };
    }

    return {
      exists: false,
      kind: null,
      error: `Unable to inspect ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function readDirectoryChildren(targetPath: string): {
  paths: string[];
  error: string | null;
} {
  try {
    return {
      paths: readdirSync(targetPath).map((entry) =>
        path.join(targetPath, entry),
      ),
      error: null,
    };
  } catch (error) {
    return {
      paths: [],
      error: `Unable to read ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function createResearchFindings(registry: readonly VendorProfile[]): Finding[] {
  return registry
    .filter((vendor) => vendor.research.status !== "current")
    .map((vendor) =>
      FindingSchema.parse({
        id: `research:${slug(vendor.id)}`,
        severity: vendor.research.status === "stale" ? "warning" : "info",
        title: `${vendor.name} research is ${vendor.research.status}`,
        message: vendor.research.summary,
        affectedAIBitIds: [],
        vendorId: vendor.id,
        confidence: 1,
      }),
    );
}

function createDuplicateFindings(aiBits: AIBit[]): Finding[] {
  const groups = new Map<string, AIBit[]>();

  for (const bit of aiBits) {
    const key = `${bit.scope}:${bit.kind}:${bit.name.toLocaleLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), bit]);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) =>
      FindingSchema.parse({
        id: `duplicate:${slug(group[0].scope)}:${slug(group[0].kind)}:${slug(group[0].name)}`,
        severity: "warning",
        title: `Duplicate ${group[0].kind} AI-bit`,
        message: `${group.length} ${group[0].kind} AI-bits share the name "${group[0].name}".`,
        affectedAIBitIds: group.map((bit) => bit.id),
        vendorId: group[0].vendorId,
        confidence: 0.9,
      }),
    );
}

function createRecommendations(findings: readonly Finding[]): Recommendation[] {
  return findings.map((finding) =>
    RecommendationSchema.parse({
      id: `recommendation:${finding.id}`,
      title: `Review ${finding.title}`,
      rationale: finding.message,
      risk:
        finding.severity === "error"
          ? "high"
          : finding.severity === "warning"
            ? "medium"
            : "low",
      findingIds: [finding.id],
      suggestedAction: finding.id.startsWith("research:")
        ? "Run the vendor /research SKILL before treating this adapter as production-ready."
        : "Review the affected AI-bits and apply cleanup only after previewing the change.",
    }),
  );
}

function slug(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
