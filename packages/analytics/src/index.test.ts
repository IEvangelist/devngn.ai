import { describe, expect, it } from "vitest";
import {
  createDevngnTelemetryConfig,
  createFlowAnalyticsEvent,
  listImportantDevngnFlows,
  redactAnalyticsProperties,
} from "./index.js";

describe("analytics telemetry", () => {
  it("redacts sensitive analytics properties", () => {
    expect(
      redactAnalyticsProperties({
        aiBits: 3,
        prompt: "do not send",
        tokenCount: 10,
        workspacePath: "C:\\Users\\dev\\repo",
      }),
    ).toEqual({
      aiBits: 3,
      tokenCount: 10,
    });
  });

  it("creates Aspire dashboard-friendly OTLP signal endpoints", () => {
    const config = createDevngnTelemetryConfig({
      source: "api",
      serviceName: "devngn-api",
      env: {
        DOTNET_DASHBOARD_OTLP_ENDPOINT_URL: "http://+:18889",
      },
    });

    expect(config.enabled).toBe(true);
    expect(config.otlp.endpoint).toBe("http://localhost:18889");
    expect(config.otlp.tracesEndpoint).toBe("http://localhost:18889/v1/traces");
    expect(config.otlp.metricsEndpoint).toBe(
      "http://localhost:18889/v1/metrics",
    );
    expect(config.otlp.logsEndpoint).toBe("http://localhost:18889/v1/logs");
  });

  it("lists important dev engine flows for logs, traces, and metrics", () => {
    const flows = listImportantDevngnFlows();
    const flowNames = flows.map((flow) => flow.name);
    const expectedSignals: Array<"logs" | "traces" | "metrics"> = [
      "logs",
      "traces",
      "metrics",
    ];

    expect(flowNames).toContain("workspace.scan");
    expect(flowNames).toContain("ai.token_budget");
    expect(flowNames).toContain("patterns.recognize");
    expect(flowNames).toContain("sync.prepare");
    expect(
      flows.every((flow) =>
        expectedSignals.every((signal) => flow.signals.includes(signal)),
      ),
    ).toBe(true);
  });

  it("creates redacted flow analytics events", () => {
    const event = createFlowAnalyticsEvent({
      name: "ai.bootstrap",
      source: "cli",
      status: "success",
      durationMs: 12.34567,
      properties: {
        provider: "openai",
        prompt: "do not send",
      },
      now: new Date("2026-04-29T00:00:00.000Z"),
    });

    expect(event.name).toBe("flow.completed");
    expect(event.properties).toEqual({
      flow: "ai.bootstrap",
      status: "success",
      durationMs: 12.346,
      provider: "openai",
    });
  });
});
