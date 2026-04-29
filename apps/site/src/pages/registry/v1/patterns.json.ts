import type { APIRoute } from "astro";
import { getPatternDatabase, summarizePatternTrends } from "@devngn/patterns";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        ...getPatternDatabase(),
        trendSummary: summarizePatternTrends(),
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
