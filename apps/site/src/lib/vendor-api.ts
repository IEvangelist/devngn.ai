import type { VendorApiAccess } from "@devngn/api";
import { authenticateVendorApiRequest } from "@devngn/api";

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

interface VendorApiGuardSuccess {
  access: VendorApiAccess;
  headers: Headers;
}

const rateLimitWindows = new Map<string, RateLimitWindow>();
const authFailureWindows = new Map<string, RateLimitWindow>();
const minuteMs = 60_000;
const maxRateLimitSubjects = 10_000;
const unauthenticatedFailuresPerMinute = 20;

export function guardVendorApiRequest(
  request: Request,
): VendorApiGuardSuccess | Response {
  const methodGuard = guardRequestShape(request);

  if (methodGuard !== null) {
    return methodGuard;
  }

  let auth;

  try {
    auth = authenticateVendorApiRequest(request, process.env);
  } catch (error) {
    console.error("Vendor API authentication configuration failed.", error);
    return vendorApiError(
      503,
      "vendor_api_misconfigured",
      "Vendor intelligence API access is not configured.",
      new Headers(),
    );
  }

  if (!auth.ok) {
    const failureLimit = consumeFixedWindow(
      authFailureWindows,
      `auth:${getClientIp(request)}`,
      unauthenticatedFailuresPerMinute,
    );
    const headers = createRateLimitHeaders(
      "unauthenticated",
      unauthenticatedFailuresPerMinute,
      failureLimit.remaining,
      failureLimit.resetAt,
    );

    if (!failureLimit.allowed) {
      headers.set("Retry-After", secondsUntil(failureLimit.resetAt).toString());
      return vendorApiError(
        429,
        "rate_limited",
        "Too many failed authentication attempts.",
        headers,
      );
    }

    if (auth.status === 401) {
      headers.set(
        "WWW-Authenticate",
        'Bearer realm="devngn-vendor-api", error="invalid_token"',
      );
    }

    return vendorApiError(auth.status, auth.code, auth.message, headers);
  }

  if (request.url.length > auth.access.rateLimit.maxUrlLength) {
    return vendorApiError(
      414,
      "uri_too_long",
      "The request URI is too long for this subscription level.",
      createRateLimitHeaders(
        auth.access.subscriptionLevel,
        auth.access.rateLimit.requestsPerMinute,
        auth.access.rateLimit.requestsPerMinute,
        Date.now() + minuteMs,
      ),
    );
  }

  const rateLimit = consumeFixedWindow(
    rateLimitWindows,
    `key:${auth.access.apiKeyHash}`,
    auth.access.rateLimit.requestsPerMinute,
  );
  const headers = createRateLimitHeaders(
    auth.access.subscriptionLevel,
    auth.access.rateLimit.requestsPerMinute,
    rateLimit.remaining,
    rateLimit.resetAt,
  );

  if (!rateLimit.allowed) {
    headers.set("Retry-After", secondsUntil(rateLimit.resetAt).toString());
    return vendorApiError(
      429,
      "rate_limited",
      "The subscription rate limit for this API key has been exceeded.",
      headers,
    );
  }

  pruneExpiredWindows(rateLimitWindows);
  pruneExpiredWindows(authFailureWindows);

  return {
    access: auth.access,
    headers,
  };
}

export function vendorApiJson(
  payload: unknown,
  headers: Headers,
  status = 200,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "private, max-age=60");
  responseHeaders.set("vary", "authorization, x-api-key");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    status,
    headers: responseHeaders,
  });
}

export function vendorApiError(
  status: number,
  code: string,
  message: string,
  headers: Headers,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(
    `${JSON.stringify(
      {
        error: {
          code,
          message,
        },
      },
      null,
      2,
    )}\n`,
    {
      status,
      headers: responseHeaders,
    },
  );
}

function guardRequestShape(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return vendorApiError(
      405,
      "method_not_allowed",
      "Vendor intelligence API endpoints only support GET.",
      new Headers({
        allow: "GET, HEAD",
      }),
    );
  }

  if (request.url.length > 4096) {
    return vendorApiError(
      414,
      "uri_too_long",
      "The request URI is too long.",
      new Headers(),
    );
  }

  const contentLength = request.headers.get("content-length");
  const transferEncoding = request.headers.get("transfer-encoding");

  if (
    transferEncoding !== null ||
    (contentLength !== null && Number.parseInt(contentLength, 10) > 0)
  ) {
    return vendorApiError(
      413,
      "request_body_not_allowed",
      "Vendor intelligence API GET requests do not accept a request body.",
      new Headers(),
    );
  }

  return null;
}

function consumeFixedWindow(
  windows: Map<string, RateLimitWindow>,
  subject: string,
  limit: number,
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const existing = windows.get(subject);
  const current =
    existing === undefined || existing.resetAt <= now
      ? { count: 0, resetAt: now + minuteMs }
      : existing;

  current.count += 1;
  windows.set(subject, current);

  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

function createRateLimitHeaders(
  plan: string,
  limit: number,
  remaining: number,
  resetAt: number,
): Headers {
  const resetSeconds = secondsUntil(resetAt);

  return new Headers({
    "x-ratelimit-plan": plan,
    "x-ratelimit-limit": limit.toString(),
    "x-ratelimit-remaining": remaining.toString(),
    "x-ratelimit-reset": Math.ceil(resetAt / 1000).toString(),
    "ratelimit-limit": limit.toString(),
    "ratelimit-remaining": remaining.toString(),
    "ratelimit-reset": resetSeconds.toString(),
  });
}

function pruneExpiredWindows(windows: Map<string, RateLimitWindow>): void {
  if (windows.size <= maxRateLimitSubjects) {
    return;
  }

  const now = Date.now();

  for (const [subject, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(subject);
    }
  }
}

function secondsUntil(timestamp: number): number {
  return Math.max(1, Math.ceil((timestamp - Date.now()) / 1000));
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor !== null && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "local"
  );
}
