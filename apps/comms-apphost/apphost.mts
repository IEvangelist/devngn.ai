// SPDX-License-Identifier: MIT
// Aspire TypeScript AppHost for optional devngn notification backends.
//
// Run `pnpm --filter @devngn/comms-apphost restore` after a fresh checkout so
// Aspire regenerates `.aspire/modules/` for your machine, then
// `pnpm --filter @devngn/comms-apphost start` to launch the dashboard together
// with the MQTT SMS gateway and PlaySMS notification containers.

import { createBuilder } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();
const otlpEndpoint = getContainerOtlpEndpoint();

builder
  .addDockerfile("mqtt-sms-gateway", "./containers/mqtt-sms-gateway", {
    dockerfilePath: "Dockerfile",
  })
  .withEndpoint({
    targetPort: 1883,
    scheme: "tcp",
    name: "mqtt",
    env: "MQTT_PORT",
    isExternal: false,
  })
  .withEnvironment("OTEL_SERVICE_NAME", "devngn-mqtt-sms-gateway")
  .withEnvironment("OTEL_EXPORTER_OTLP_ENDPOINT", otlpEndpoint)
  .withEnvironment("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
  .withEnvironment("OTEL_LOGS_EXPORTER", "otlp")
  .withEnvironment("OTEL_TRACES_EXPORTER", "otlp")
  .withEnvironment("OTEL_METRICS_EXPORTER", "otlp")
  .withEnvironment("OTEL_METRIC_EXPORT_INTERVAL", "5000")
  .withEnvironment(
    "OTEL_RESOURCE_ATTRIBUTES",
    toResourceAttributes("devngn-mqtt-sms-gateway", "notification-gateway"),
  );

builder
  .addDockerfile("playsms", "./containers/playsms", {
    dockerfilePath: "Dockerfile",
  })
  .withHttpEndpoint({
    targetPort: 80,
    name: "http",
  })
  .withEnvironment("OTEL_SERVICE_NAME", "devngn-playsms")
  .withEnvironment("OTEL_EXPORTER_OTLP_ENDPOINT", otlpEndpoint)
  .withEnvironment("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
  .withEnvironment("OTEL_LOGS_EXPORTER", "otlp")
  .withEnvironment("OTEL_TRACES_EXPORTER", "otlp")
  .withEnvironment("OTEL_METRICS_EXPORTER", "otlp")
  .withEnvironment("OTEL_METRIC_EXPORT_INTERVAL", "5000")
  .withEnvironment(
    "OTEL_RESOURCE_ATTRIBUTES",
    toResourceAttributes("devngn-playsms", "notification-portal"),
  );

await builder.build().run();

function getContainerOtlpEndpoint(): string {
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    process.env.DEVNGN_OTEL_EXPORTER_OTLP_ENDPOINT ??
    process.env.ASPIRE_OTLP_ENDPOINT_URL ??
    process.env.ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL ??
    process.env.DOTNET_DASHBOARD_OTLP_ENDPOINT_URL ??
    "http://host.docker.internal:4318";

  return endpoint
    .replace("://+:", "://host.docker.internal:")
    .replace("://localhost:", "://host.docker.internal:")
    .replace("://127.0.0.1:", "://host.docker.internal:")
    .replace("://0.0.0.0:", "://host.docker.internal:");
}

function toResourceAttributes(
  serviceName: string,
  resourceKind: string,
): string {
  return [
    "service.namespace=devngn",
    `service.name=${serviceName}`,
    "service.version=0.0.0",
    "deployment.environment.name=local",
    `devngn.resource.kind=${resourceKind}`,
  ].join(",");
}
