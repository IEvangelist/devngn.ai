import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  context,
  metrics,
  SpanStatusCode,
  trace,
  type Attributes,
  type Counter,
  type Histogram,
} from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { z } from "zod";

export const AnalyticsEventNameSchema = z.enum([
  "install.detected",
  "scan.started",
  "scan.completed",
  "finding.reported",
  "recommendation.actioned",
  "skill.eval.started",
  "skill.eval.completed",
  "ai.bootstrap.created",
  "ai.provider.detected",
  "ai.request.completed",
  "sync.completed",
  "update.checked",
  "extension.activated",
  "flow.started",
  "flow.completed",
  "flow.failed",
]);
export type AnalyticsEventName = z.infer<typeof AnalyticsEventNameSchema>;

export const AnalyticsSourceSchema = z.enum([
  "cli",
  "vscode",
  "site",
  "api",
  "apphost",
]);
export type AnalyticsSource = z.infer<typeof AnalyticsSourceSchema>;

export const AnalyticsPropertiesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .default({});
export type AnalyticsProperties = z.infer<typeof AnalyticsPropertiesSchema>;

export const AnalyticsEventSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.literal(1),
  name: AnalyticsEventNameSchema,
  source: AnalyticsSourceSchema,
  timestamp: z.string().datetime(),
  properties: AnalyticsPropertiesSchema,
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

export const DevngnFlowAreaSchema = z.enum([
  "telemetry",
  "workspace",
  "doctor",
  "vendors",
  "skills",
  "grounding",
  "comms",
  "patterns",
  "ai",
  "sync",
  "update",
  "extension",
]);
export type DevngnFlowArea = z.infer<typeof DevngnFlowAreaSchema>;

export const DevngnFlowNameSchema = z.enum([
  "telemetry.pipeline",
  "cli.command",
  "workspace.scan",
  "doctor.recommendations",
  "vendors.registry",
  "vendors.research",
  "skills.list",
  "skills.eval",
  "grounding.profile.generate",
  "grounding.profile.write",
  "comms.preferences.view",
  "comms.notification",
  "patterns.list",
  "patterns.trends",
  "patterns.recognize",
  "ai.providers.readiness",
  "ai.token_budget",
  "ai.bootstrap",
  "ai.request",
  "sync.prepare",
  "sync.completed",
  "update.check",
  "extension.activate",
  "token.dashboard.open",
]);
export type DevngnFlowName = z.infer<typeof DevngnFlowNameSchema>;

export const DevngnFlowStatusSchema = z.enum([
  "started",
  "success",
  "error",
  "cancelled",
  "skipped",
]);
export type DevngnFlowStatus = z.infer<typeof DevngnFlowStatusSchema>;

export const DevngnTelemetrySignalSchema = z.enum([
  "logs",
  "traces",
  "metrics",
]);
export type DevngnTelemetrySignal = z.infer<typeof DevngnTelemetrySignalSchema>;

export const DevngnFlowDefinitionSchema = z.object({
  name: DevngnFlowNameSchema,
  area: DevngnFlowAreaSchema,
  displayName: z.string(),
  description: z.string(),
  surfaces: z.array(AnalyticsSourceSchema).min(1),
  signals: z.array(DevngnTelemetrySignalSchema).min(1),
  keyMetrics: z.array(z.string()).min(1),
  keyAttributes: z.array(z.string()).default([]),
  privacy: z.string(),
});
export type DevngnFlowDefinition = z.infer<typeof DevngnFlowDefinitionSchema>;
type DevngnFlowDefinitionInput = z.input<typeof DevngnFlowDefinitionSchema>;

export const DevngnOtlpConfigSchema = z.object({
  endpoint: z.string().url().nullable(),
  protocol: z.literal("http/protobuf"),
  tracesEndpoint: z.string().url().nullable(),
  metricsEndpoint: z.string().url().nullable(),
  logsEndpoint: z.string().url().nullable(),
  headersConfigured: z.boolean(),
});
export type DevngnOtlpConfig = z.infer<typeof DevngnOtlpConfigSchema>;

export const DevngnTelemetryConfigSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  serviceName: z.string(),
  serviceNamespace: z.literal("devngn"),
  serviceVersion: z.string(),
  source: AnalyticsSourceSchema,
  environment: z.string(),
  resourceAttributes: AnalyticsPropertiesSchema,
  signals: z.array(DevngnTelemetrySignalSchema).min(1),
  otlp: DevngnOtlpConfigSchema,
  metrics: z.object({
    exportIntervalMs: z.number().int().positive(),
  }),
  instrumentations: z.array(z.string()),
});
export type DevngnTelemetryConfig = z.infer<typeof DevngnTelemetryConfigSchema>;

export interface CreateDevngnTelemetryConfigOptions {
  source: AnalyticsSource;
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  enabled?: boolean;
  env?: Record<string, string | undefined>;
}

export interface DevngnTelemetryRuntime {
  config: DevngnTelemetryConfig;
  started: boolean;
  shutdown: () => Promise<void>;
}

export interface RecordDevngnFlowInput {
  name: DevngnFlowName;
  source: AnalyticsSource;
  status?: DevngnFlowStatus;
  durationMs?: number;
  properties?: AnalyticsProperties;
  now?: Date;
}

export interface MeasureDevngnFlowInput<T> {
  name: DevngnFlowName;
  source: AnalyticsSource;
  properties?: AnalyticsProperties;
  resultProperties?: (result: T) => AnalyticsProperties;
  now?: () => Date;
}

const flowMetricNames = [
  "devngn.flow.events",
  "devngn.flow.duration",
  "devngn.flow.errors",
];

const importantFlows = [
  flow(
    "telemetry.pipeline",
    "telemetry",
    "Telemetry pipeline",
    "OpenTelemetry SDK startup, OTLP exporter readiness, and Aspire dashboard exposure.",
    ["cli", "api", "site", "apphost"],
    ["service.name", "service.version", "deployment.environment.name"],
  ),
  flow(
    "cli.command",
    "telemetry",
    "CLI command lifecycle",
    "Top-level CLI command success and failure so command health is visible across terminals.",
    ["cli"],
    ["command", "status"],
  ),
  flow(
    "workspace.scan",
    "workspace",
    "Workspace AI-bit scan",
    "Discovers host capabilities, PATH tools, vendors, AI-bits, findings, and recommendations.",
    ["cli", "vscode"],
    ["vendors", "aiBits", "findings", "recommendations"],
  ),
  flow(
    "doctor.recommendations",
    "doctor",
    "Doctor recommendations",
    "Turns findings into ranked cleanup, conflict, and drift recommendations.",
    ["cli", "vscode"],
    ["recommendations"],
  ),
  flow(
    "vendors.registry",
    "vendors",
    "Vendor registry read",
    "Loads bundled vendor and tool intelligence that powers scanning and research freshness.",
    ["cli", "site", "api"],
    ["vendors", "planned", "verified"],
  ),
  flow(
    "vendors.research",
    "vendors",
    "Vendor research workflow",
    "Generates /research SKILL prompts before productionizing vendor adapters.",
    ["cli", "site"],
    ["targets"],
  ),
  flow(
    "skills.list",
    "skills",
    "Skill inventory",
    "Summarizes discovered skill AI-bits and duplicate skill surfaces.",
    ["cli", "vscode"],
    ["skills"],
  ),
  flow(
    "skills.eval",
    "skills",
    "Skill evaluation",
    "Runs or prepares recognized eval tooling for skills, prompts, and model behavior.",
    ["cli", "api"],
    ["evalTool", "cases", "passed", "failed"],
  ),
  flow(
    "grounding.profile.generate",
    "grounding",
    "Grounding profile generation",
    "Builds the self-updating devngn manifest that grounds AI in local host capabilities.",
    ["cli", "vscode"],
    ["tools", "aiBits", "findings", "communicationChannels"],
  ),
  flow(
    "grounding.profile.write",
    "grounding",
    "Grounding profile write",
    "Persists private generated profile state to OS-native/XDG storage or an explicit export path.",
    ["cli"],
    ["storage", "explicitOutput"],
  ),
  flow(
    "comms.preferences.view",
    "comms",
    "Communication preference view",
    "Shows notification choices for long-running AI loops, research runs, evals, and ralphs.",
    ["cli", "vscode"],
    ["channels", "backends"],
  ),
  flow(
    "comms.notification",
    "comms",
    "Communication notification",
    "Tracks delivery attempts for local tray, email, SMS, MQTT/Zanzito, and playSMS notifications.",
    ["api", "apphost"],
    ["channel", "backend", "result"],
  ),
  flow(
    "patterns.list",
    "patterns",
    "Pattern database list",
    "Lists known AI ecosystem patterns and current adoption metadata.",
    ["cli", "site", "api"],
    ["patterns"],
  ),
  flow(
    "patterns.trends",
    "patterns",
    "Pattern trend summary",
    "Summarizes rising, stable, watch, and declining AI ecosystem pattern trends.",
    ["cli", "site", "api"],
    ["patterns", "rising", "watch"],
  ),
  flow(
    "patterns.recognize",
    "patterns",
    "Pattern recognition",
    "Recognizes known ecosystem patterns and determines which devngn experiences should light up.",
    ["cli", "vscode"],
    ["matches", "experienceTriggers"],
  ),
  flow(
    "ai.providers.readiness",
    "ai",
    "AI provider readiness",
    "Checks provider SDK packages, auth signals, and capability support.",
    ["cli", "vscode"],
    ["providers", "readyProviders"],
  ),
  flow(
    "ai.token_budget",
    "ai",
    "AI token budget",
    "Estimates input, output, reserve, and context-window budget before provider dispatch.",
    ["cli", "vscode"],
    ["estimatedInputTokens", "availableInputTokens", "withinBudget"],
  ),
  flow(
    "ai.bootstrap",
    "ai",
    "AI bootstrap request",
    "Creates a provider-aware, token-budgeted bootstrap request with grounding context.",
    ["cli", "api"],
    ["provider", "model", "estimatedInputTokens", "withinBudget"],
  ),
  flow(
    "ai.request",
    "ai",
    "AI provider request",
    "Tracks provider calls, capability gates, token usage, and SDK-reported completion status.",
    ["cli", "api", "vscode"],
    ["provider", "model", "inputTokens", "outputTokens", "capability"],
  ),
  flow(
    "sync.prepare",
    "sync",
    "Sync envelope prepare",
    "Builds redacted scan, preference, skill, and recommendation payloads before hosted sync.",
    ["cli", "vscode"],
    ["payloadKind", "aiBits", "findings"],
  ),
  flow(
    "sync.completed",
    "sync",
    "Hosted sync complete",
    "Measures completed hosted sync attempts and conflict-resolution outcomes.",
    ["cli", "api", "vscode"],
    ["payloadKind", "result", "conflicts"],
  ),
  flow(
    "update.check",
    "update",
    "Update check",
    "Checks client and registry freshness to keep devngn self-updating.",
    ["cli", "vscode"],
    ["clientVersion", "registryVendors"],
  ),
  flow(
    "extension.activate",
    "extension",
    "VS Code extension activation",
    "Measures extension startup, command registration, and initial UX readiness.",
    ["vscode"],
    ["activationKind"],
  ),
  flow(
    "token.dashboard.open",
    "extension",
    "Token dashboard open",
    "Measures token dashboard rendering, provider readiness, and workspace signal availability.",
    ["vscode"],
    ["providers", "aiBits", "findings", "withinBudget"],
  ),
] satisfies DevngnFlowDefinitionInput[];

const importantFlowDefinitions = z
  .array(DevngnFlowDefinitionSchema)
  .parse(importantFlows);

const sensitivePropertyPattern =
  /(secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer|path|file|env|prompt|completion|instruction)/i;

let flowInstruments:
  | {
      events: Counter;
      errors: Counter;
      duration: Histogram;
    }
  | undefined;

export function createAnalyticsEvent(
  name: AnalyticsEvent["name"],
  source: AnalyticsEvent["source"],
  properties: AnalyticsEvent["properties"] = {},
  now = new Date(),
): AnalyticsEvent {
  return AnalyticsEventSchema.parse({
    id: randomUUID(),
    schemaVersion: 1,
    name,
    source,
    timestamp: now.toISOString(),
    properties: redactAnalyticsProperties(properties),
  });
}

export function redactAnalyticsProperties(
  properties: AnalyticsEvent["properties"],
): AnalyticsEvent["properties"] {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) => !sensitivePropertyPattern.test(key),
    ),
  );
}

export function listImportantDevngnFlows(): DevngnFlowDefinition[] {
  return importantFlowDefinitions;
}

export function createDevngnTelemetryConfig(
  options: CreateDevngnTelemetryConfigOptions,
): DevngnTelemetryConfig {
  const env = options.env ?? process.env;
  const explicitEnabled = parseBoolean(env.DEVNGN_TELEMETRY_ENABLED);
  const disabled = parseBoolean(env.DEVNGN_TELEMETRY_DISABLED) === true;
  const configuredEndpoint = resolveOtlpEndpoint(env);
  const endpoint =
    configuredEndpoint ??
    (options.enabled === true || explicitEnabled === true
      ? "http://localhost:4318"
      : null);
  const hasAnyEndpoint =
    endpoint !== null ||
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT !== undefined ||
    env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT !== undefined ||
    env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT !== undefined;
  const enabled =
    options.enabled ?? (disabled ? false : (explicitEnabled ?? hasAnyEndpoint));
  const serviceName = options.serviceName ?? `devngn-${options.source}`;
  const serviceVersion = options.serviceVersion ?? "0.0.0";
  const environment =
    options.environment ?? env.OTEL_ENVIRONMENT ?? env.NODE_ENV ?? "local";
  const protocol = normalizeOtlpProtocol(env.OTEL_EXPORTER_OTLP_PROTOCOL);
  const exportIntervalMs = parsePositiveInteger(
    env.OTEL_METRIC_EXPORT_INTERVAL,
    5000,
    "OTEL_METRIC_EXPORT_INTERVAL",
  );
  const resourceAttributes = {
    "service.name": serviceName,
    "service.namespace": "devngn",
    "service.version": serviceVersion,
    "deployment.environment.name": environment,
    "devngn.source": options.source,
  };

  return DevngnTelemetryConfigSchema.parse({
    schemaVersion: 1,
    enabled,
    serviceName,
    serviceNamespace: "devngn",
    serviceVersion,
    source: options.source,
    environment,
    resourceAttributes,
    signals: ["logs", "traces", "metrics"],
    otlp: {
      endpoint,
      protocol,
      tracesEndpoint:
        env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        toSignalEndpoint(endpoint, "traces"),
      metricsEndpoint:
        env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
        toSignalEndpoint(endpoint, "metrics"),
      logsEndpoint:
        env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ??
        toSignalEndpoint(endpoint, "logs"),
      headersConfigured: env.OTEL_EXPORTER_OTLP_HEADERS !== undefined,
    },
    metrics: {
      exportIntervalMs,
    },
    instrumentations: ["http", "undici"],
  });
}

export function initializeDevngnTelemetry(
  options: CreateDevngnTelemetryConfigOptions,
): DevngnTelemetryRuntime {
  const config = createDevngnTelemetryConfig(options);
  const env = options.env ?? process.env;

  if (!config.enabled) {
    return {
      config,
      started: false,
      shutdown: async () => undefined,
    };
  }

  const headers = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  const sdk = new NodeSDK({
    resource: resourceFromAttributes(
      toOtelAttributes(config.resourceAttributes),
    ),
    serviceName: config.serviceName,
    traceExporter:
      config.otlp.tracesEndpoint === null
        ? undefined
        : new OTLPTraceExporter({
            url: config.otlp.tracesEndpoint,
            headers,
          }),
    metricReaders:
      config.otlp.metricsEndpoint === null
        ? undefined
        : [
            new PeriodicExportingMetricReader({
              exporter: new OTLPMetricExporter({
                url: config.otlp.metricsEndpoint,
                headers,
              }),
              exportIntervalMillis: config.metrics.exportIntervalMs,
            }),
          ],
    logRecordProcessors:
      config.otlp.logsEndpoint === null
        ? undefined
        : [
            new BatchLogRecordProcessor(
              new OTLPLogExporter({
                url: config.otlp.logsEndpoint,
                headers,
              }),
            ),
          ],
    instrumentations: [new HttpInstrumentation(), new UndiciInstrumentation()],
  });

  sdk.start();

  recordDevngnFlow({
    name: "telemetry.pipeline",
    source: config.source,
    properties: {
      logs: config.otlp.logsEndpoint !== null,
      traces: config.otlp.tracesEndpoint !== null,
      metrics: config.otlp.metricsEndpoint !== null,
      otlpEndpointConfigured: config.otlp.endpoint !== null,
    },
  });

  return {
    config,
    started: true,
    shutdown: () => sdk.shutdown(),
  };
}

export function createFlowAnalyticsEvent(
  input: RecordDevngnFlowInput,
): AnalyticsEvent {
  const normalized = normalizeFlowInput(input);
  const eventName =
    normalized.status === "started"
      ? "flow.started"
      : normalized.status === "error"
        ? "flow.failed"
        : "flow.completed";

  return createAnalyticsEvent(
    eventName,
    normalized.source,
    {
      flow: normalized.name,
      status: normalized.status,
      ...(normalized.durationMs === undefined
        ? {}
        : { durationMs: roundDuration(normalized.durationMs) }),
      ...normalized.properties,
    },
    normalized.now,
  );
}

export function recordDevngnFlow(input: RecordDevngnFlowInput): AnalyticsEvent {
  const normalized = normalizeFlowInput(input);
  const event = createFlowAnalyticsEvent(normalized);
  const attributes = createFlowAttributes(normalized, event);
  const span = trace.getTracer("devngn.analytics").startSpan(normalized.name, {
    attributes,
  });

  span.setStatus({
    code:
      normalized.status === "error" ? SpanStatusCode.ERROR : SpanStatusCode.OK,
  });
  span.addEvent(`devngn.flow.${normalized.status}`, attributes);
  emitFlowTelemetry(normalized, attributes);
  span.end();

  return event;
}

export async function measureDevngnFlow<T>(
  input: MeasureDevngnFlowInput<T>,
  operation: () => T | Promise<T>,
): Promise<T> {
  const flowName = DevngnFlowNameSchema.parse(input.name);
  const source = AnalyticsSourceSchema.parse(input.source);
  const baseProperties = AnalyticsPropertiesSchema.parse(
    input.properties ?? {},
  );
  const start = performance.now();
  const span = trace.getTracer("devngn.analytics").startSpan(flowName, {
    attributes: createFlowAttributes({
      name: flowName,
      source,
      status: "started",
      properties: baseProperties,
      now: input.now?.() ?? new Date(),
    }),
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      const durationMs = performance.now() - start;
      const properties = {
        ...baseProperties,
        ...(input.resultProperties?.(result) ?? {}),
      };
      const normalized = normalizeFlowInput({
        name: flowName,
        source,
        status: "success",
        durationMs,
        properties,
        now: input.now?.() ?? new Date(),
      });
      const event = createFlowAnalyticsEvent(normalized);
      const attributes = createFlowAttributes(normalized, event);

      span.setAttributes(attributes);
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent("devngn.flow.success", attributes);
      emitFlowTelemetry(normalized, attributes);

      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      const errorName = error instanceof Error ? error.name : "Error";
      const normalized = normalizeFlowInput({
        name: flowName,
        source,
        status: "error",
        durationMs,
        properties: {
          ...baseProperties,
          errorName,
        },
        now: input.now?.() ?? new Date(),
      });
      const event = createFlowAnalyticsEvent(normalized);
      const attributes = createFlowAttributes(normalized, event);

      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      span.setAttributes(attributes);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.addEvent("devngn.flow.error", attributes);
      emitFlowTelemetry(normalized, attributes);

      throw error;
    } finally {
      span.end();
    }
  });
}

function flow(
  name: DevngnFlowName,
  area: DevngnFlowArea,
  displayName: string,
  description: string,
  surfaces: AnalyticsSource[],
  keyAttributes: string[],
): DevngnFlowDefinitionInput {
  return {
    name,
    area,
    displayName,
    description,
    surfaces,
    signals: ["logs", "traces", "metrics"],
    keyMetrics: flowMetricNames,
    keyAttributes,
    privacy:
      "Only normalized counts, statuses, identifiers, and coarse metadata are allowed; raw prompts, completions, secrets, instruction contents, and local paths are redacted.",
  };
}

function normalizeFlowInput(input: RecordDevngnFlowInput): Required<
  Omit<RecordDevngnFlowInput, "durationMs">
> & {
  durationMs?: number;
} {
  return {
    name: DevngnFlowNameSchema.parse(input.name),
    source: AnalyticsSourceSchema.parse(input.source),
    status: DevngnFlowStatusSchema.parse(input.status ?? "success"),
    durationMs:
      input.durationMs === undefined
        ? undefined
        : z.number().nonnegative().parse(input.durationMs),
    properties: redactAnalyticsProperties(
      AnalyticsPropertiesSchema.parse(input.properties ?? {}),
    ),
    now: input.now ?? new Date(),
  };
}

function createFlowAttributes(
  input: ReturnType<typeof normalizeFlowInput>,
  event?: AnalyticsEvent,
): Attributes {
  const definition = importantFlowDefinitions.find(
    (flowDefinition) => flowDefinition.name === input.name,
  );
  const attributes: Attributes = {
    "devngn.flow.name": input.name,
    "devngn.flow.area": definition?.area ?? "telemetry",
    "devngn.flow.status": input.status,
    "devngn.source": input.source,
  };

  if (event !== undefined) {
    attributes["devngn.analytics.event_id"] = event.id;
  }

  if (input.durationMs !== undefined) {
    attributes["devngn.flow.duration_ms"] = roundDuration(input.durationMs);
  }

  return {
    ...attributes,
    ...toOtelAttributes(input.properties, "devngn.property"),
  };
}

function emitFlowTelemetry(
  input: ReturnType<typeof normalizeFlowInput>,
  attributes: Attributes,
): void {
  const instruments = getFlowInstruments();
  const logger = logs.getLogger("devngn.analytics");

  instruments.events.add(1, attributes);

  if (input.durationMs !== undefined) {
    instruments.duration.record(input.durationMs, attributes);
  }

  if (input.status === "error") {
    instruments.errors.add(1, attributes);
  }

  logger.emit({
    eventName: "devngn.flow",
    severityNumber:
      input.status === "error" ? SeverityNumber.ERROR : SeverityNumber.INFO,
    severityText: input.status === "error" ? "ERROR" : "INFO",
    body: `${input.name} ${input.status}`,
    attributes,
    context: context.active(),
  });
}

function getFlowInstruments(): {
  events: Counter;
  errors: Counter;
  duration: Histogram;
} {
  if (flowInstruments === undefined) {
    const meter = metrics.getMeter("devngn.analytics");
    flowInstruments = {
      events: meter.createCounter("devngn.flow.events", {
        description: "Count of devngn product flow events.",
        unit: "1",
      }),
      errors: meter.createCounter("devngn.flow.errors", {
        description: "Count of failed devngn product flows.",
        unit: "1",
      }),
      duration: meter.createHistogram("devngn.flow.duration", {
        description: "Duration of measured devngn product flows.",
        unit: "ms",
      }),
    };
  }

  return flowInstruments;
}

function toOtelAttributes(
  properties: AnalyticsProperties,
  prefix = "",
): Attributes {
  const attributes: Attributes = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === null) {
      continue;
    }

    const attributeKey = normalizeAttributeKey(
      prefix.length === 0 ? key : `${prefix}.${key}`,
    );
    attributes[attributeKey] = value;
  }

  return attributes;
}

function normalizeAttributeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function resolveOtlpEndpoint(
  env: Record<string, string | undefined>,
): string | null {
  const endpoint =
    env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    env.DEVNGN_OTEL_EXPORTER_OTLP_ENDPOINT ??
    env.ASPIRE_OTLP_ENDPOINT_URL ??
    env.ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL ??
    env.DOTNET_DASHBOARD_OTLP_ENDPOINT_URL ??
    null;

  if (endpoint === null) {
    return null;
  }

  return endpoint
    .replace("://+:", "://localhost:")
    .replace("://0.0.0.0:", "://localhost:");
}

function toSignalEndpoint(
  endpoint: string | null,
  signal: "traces" | "metrics" | "logs",
): string | null {
  if (endpoint === null) {
    return null;
  }

  const trimmed = endpoint.replace(/\/+$/, "");

  if (/\/v1\/(traces|metrics|logs)$/.test(trimmed)) {
    return trimmed.replace(/\/v1\/(traces|metrics|logs)$/, `/v1/${signal}`);
  }

  return `${trimmed}/v1/${signal}`;
}

function normalizeOtlpProtocol(protocol: string | undefined): "http/protobuf" {
  if (protocol === undefined || protocol === "http/protobuf") {
    return "http/protobuf";
  }

  throw new Error(
    `Unsupported OTEL_EXPORTER_OTLP_PROTOCOL "${protocol}". devngn currently uses OTLP HTTP/protobuf exporters.`,
  );
}

function parseOtlpHeaders(
  headerValue: string | undefined,
): Record<string, string> {
  if (headerValue === undefined || headerValue.trim().length === 0) {
    return {};
  }

  return Object.fromEntries(
    headerValue.split(",").map((entry) => {
      const [rawKey, ...rawValue] = entry.split("=");
      const key = rawKey?.trim();
      const value = rawValue.join("=").trim();

      if (key === undefined || key.length === 0 || value.length === 0) {
        throw new Error(
          "OTEL_EXPORTER_OTLP_HEADERS entries must use key=value pairs.",
        );
      }

      return [key, decodeURIComponent(value)] as const;
    }),
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (/^(1|true|yes|on)$/i.test(value)) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(value)) {
    return false;
  }

  throw new Error(`Expected boolean environment value, received "${value}".`);
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 1000) / 1000;
}
