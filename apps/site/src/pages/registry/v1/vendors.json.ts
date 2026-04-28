import type { APIRoute } from "astro";
import {
  getBundledRegistry,
  getResearchFreshnessSummary,
} from "@devngn/vendors";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        slogan: "Manage your AI-bits",
        research: getResearchFreshnessSummary(),
        vendors: getBundledRegistry(),
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
