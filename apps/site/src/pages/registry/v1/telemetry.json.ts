import type { APIRoute } from "astro";
import {
  createDevngnTelemetryConfig,
  listImportantDevngnFlows,
} from "@devngn/analytics";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        schemaVersion: 1,
        standard: "OpenTelemetry",
        signals: ["logs", "traces", "metrics"],
        config: createDevngnTelemetryConfig({
          source: "site",
          serviceName: "devngn-site",
          enabled: false,
        }),
        importantFlows: listImportantDevngnFlows(),
      },
      null,
      2,
    ),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
