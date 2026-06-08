import type { APIRoute } from "astro";
import { wellnessOpenApiDocument } from "@devngn/wellness-types";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(wellnessOpenApiDocument, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
