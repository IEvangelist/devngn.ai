import type { APIRoute } from "astro";
import { createDefaultCommunicationPreferences } from "@devngn/grounding";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        schemaVersion: 1,
        manifestVersion: "devngn.profile.v1",
        generatedAt: new Date().toISOString(),
        description:
          "Self-updating devngn grounding profile for AI provider context, user choices, host capabilities, PATH tools, and communication preferences.",
        communication: createDefaultCommunicationPreferences({
          platform: "cross-platform",
        }),
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
