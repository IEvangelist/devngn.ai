import type { APIRoute } from "astro";
import { listProviderManifests } from "@devngn/ai";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        providers: listProviderManifests(),
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
