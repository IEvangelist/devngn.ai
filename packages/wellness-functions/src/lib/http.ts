export interface ProblemDetails {
  readonly type: "about:blank";
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
}

export type ValidationErrors = Readonly<Record<string, readonly string[]>>;

export function json(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function noContent(status = 204, headers?: HeadersInit): Response {
  return new Response(null, { status, headers });
}

export function problem(
  status: number,
  title: string,
  detail?: string,
  instance?: string,
): Response {
  const body: ProblemDetails = {
    type: "about:blank",
    title,
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(instance === undefined ? {} : { instance }),
  };
  return json(body, status, {
    "Content-Type": "application/problem+json; charset=utf-8",
  });
}

export function validationProblem(
  errors: ValidationErrors,
  status = 400,
): Response {
  return json(
    {
      type: "about:blank",
      title: "One or more validation errors occurred.",
      status,
      errors,
    },
    status,
    { "Content-Type": "application/problem+json; charset=utf-8" },
  );
}

export function methodNotAllowed(allow: readonly string[]): Response {
  return json(
    {
      type: "about:blank",
      title: "Method Not Allowed",
      status: 405,
    } satisfies ProblemDetails,
    405,
    {
      "Content-Type": "application/problem+json; charset=utf-8",
      Allow: allow.join(", "),
    },
  );
}

export function unavailableConfiguration(detail: string): Response {
  return problem(503, "Wellness API configuration error", detail);
}
