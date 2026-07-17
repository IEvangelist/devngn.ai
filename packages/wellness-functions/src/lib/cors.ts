import type { RuntimeEnv } from "./config.js";

const BASE_ALLOWED_ORIGINS = [
  "https://devngn.ai",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
] as const;

/** Default exact-origin allow-list, exported for direct unit testing. */
export const ALLOWED_ORIGINS = new Set<string>(BASE_ALLOWED_ORIGINS);

export function getAllowedOrigins(env?: RuntimeEnv): ReadonlySet<string> {
  if (env === undefined) {
    return ALLOWED_ORIGINS;
  }

  const configured = env.ALLOWED_ORIGINS ?? env.WELLNESS_ALLOWED_ORIGINS;
  if (configured === undefined || configured.trim().length === 0) {
    return ALLOWED_ORIGINS;
  }

  const origins = new Set<string>(BASE_ALLOWED_ORIGINS);
  for (const origin of configured.split(",")) {
    const exact = origin.trim();
    // Authenticated APIs must never reflect a wildcard origin.
    if (exact.length > 0 && exact !== "*") {
      origins.add(exact);
    }
  }
  return origins;
}

export function corsHeaders(
  origin: string | null,
  allowedOrigins: ReadonlySet<string> = ALLOWED_ORIGINS,
): Record<string, string> | null {
  if (origin === null || !allowedOrigins.has(origin)) {
    return null;
  }
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function handlePreflight(
  request: Request,
  allowedOrigins: ReadonlySet<string> = ALLOWED_ORIGINS,
): Response | null {
  if (request.method !== "OPTIONS") {
    return null;
  }
  const headers = corsHeaders(request.headers.get("Origin"), allowedOrigins);
  if (headers === null) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Idempotency-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function applyCors(
  request: Request,
  response: Response,
  allowedOrigins: ReadonlySet<string>,
): Response {
  const headers = corsHeaders(request.headers.get("Origin"), allowedOrigins);
  if (headers === null) {
    return response;
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set(
    "Access-Control-Allow-Origin",
    headers["Access-Control-Allow-Origin"]!,
  );
  responseHeaders.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
