import type {
  RequestContext,
  RouteHandler,
  RuntimeDependencies,
} from "./context.js";
import {
  completeWebFlow,
  devLogin,
  getMe,
  pollDeviceFlow,
  startDeviceFlow,
  startWebFlow,
} from "./handlers/auth.js";
import {
  getLeaderboard,
  getPlayerState,
  listBadges,
  listMilestones,
} from "./handlers/gamification.js";
import {
  completePrompt,
  dismissPrompt,
  listPrompts,
  nextPrompt,
  submitPromptFeedback,
  unsupportedPromptTransport,
} from "./handlers/prompts.js";
import {
  beginCalendarConnect,
  completeCalendarConnect,
  createScheduleSource,
  deleteScheduleEvent,
  deleteScheduleSource,
  getScheduleSource,
  listScheduleEvents,
  listScheduleSources,
  pushScheduleEvents,
  syncScheduleSource,
  updateScheduleSource,
} from "./handlers/schedule.js";
import {
  follow,
  getFeed,
  getSocialProfile,
  listFollowers,
  listFollowing,
  unfollow,
  upsertSocialProfile,
} from "./handlers/social.js";
import {
  acceptConsent,
  createEquipment,
  createGoal,
  deleteEquipment,
  deleteGoal,
  deleteProfile,
  getConsent,
  getEquipment,
  getGoal,
  getProfile,
  listActivities,
  listEquipment,
  listEquipmentCatalog,
  listGaps,
  listGoals,
  revokeConsent,
  updateEquipment,
  updateGoal,
  upsertProfile,
} from "./handlers/wellness.js";
import { type Database } from "./lib/database.js";
import { getAllowedOrigins, applyCors, handlePreflight } from "./lib/cors.js";
import {
  ConfigurationError,
  getJwtConfiguration,
  isDevelopment,
} from "./lib/config.js";
import {
  methodNotAllowed,
  problem,
  unavailableConfiguration,
} from "./lib/http.js";
import { createJwtService, JwtValidationError } from "./lib/jwt.js";
import {
  hasCurrentConsent,
  isUuid,
  type ConsentGateState,
} from "./handlers/shared.js";

interface Route {
  readonly path: string;
  readonly methods: readonly string[];
  readonly auth: boolean;
  readonly consent: boolean;
  readonly developmentOnly?: boolean;
  readonly handler: RouteHandler;
}

function route(
  path: string,
  methods: readonly string[],
  auth: boolean,
  consent: boolean,
  handler: RouteHandler,
  developmentOnly = false,
): Route {
  return { path, methods, auth, consent, handler, developmentOnly };
}

const ROUTES: readonly Route[] = [
  route(
    "/v1/hello",
    ["GET"],
    false,
    false,
    async (context) =>
      new Response(
        JSON.stringify({
          service: "devngn.ai wellness",
          timestamp: context.now().toISOString(),
        }),
        { headers: { "Content-Type": "application/json; charset=utf-8" } },
      ),
  ),
  route("/v1/auth/dev/login", ["POST"], false, false, devLogin, true),
  route("/v1/auth/github/device", ["POST"], false, false, startDeviceFlow),
  route("/v1/auth/github/device/poll", ["POST"], false, false, pollDeviceFlow),
  route("/v1/auth/github/web/start", ["GET"], false, false, startWebFlow),
  route("/v1/auth/github/web/callback", ["GET"], false, false, completeWebFlow),
  route("/v1/auth/me", ["GET"], true, false, getMe),

  route("/v1/consent", ["GET"], true, false, getConsent),
  route("/v1/consent", ["POST"], true, false, acceptConsent),
  route("/v1/consent", ["DELETE"], true, false, revokeConsent),

  route("/v1/profile", ["GET"], true, true, getProfile),
  route("/v1/profile", ["PUT"], true, true, upsertProfile),
  route("/v1/profile", ["DELETE"], true, true, deleteProfile),

  route("/v1/goals", ["GET"], true, true, listGoals),
  route("/v1/goals", ["POST"], true, true, createGoal),
  route("/v1/goals/:id", ["GET"], true, true, getGoal),
  route("/v1/goals/:id", ["PUT"], true, true, updateGoal),
  route("/v1/goals/:id", ["DELETE"], true, true, deleteGoal),

  route("/v1/equipment/catalog", ["GET"], true, false, listEquipmentCatalog),
  route("/v1/equipment", ["GET"], true, true, listEquipment),
  route("/v1/equipment", ["POST"], true, true, createEquipment),
  route("/v1/equipment/:id", ["GET"], true, true, getEquipment),
  route("/v1/equipment/:id", ["PUT"], true, true, updateEquipment),
  route("/v1/equipment/:id", ["DELETE"], true, true, deleteEquipment),

  route("/v1/schedule/sources", ["GET"], true, true, listScheduleSources),
  route("/v1/schedule/sources", ["POST"], true, true, createScheduleSource),
  route("/v1/schedule/sources/:id", ["GET"], true, true, getScheduleSource),
  route(
    "/v1/schedule/sources/:id",
    ["PATCH"],
    true,
    true,
    updateScheduleSource,
  ),
  route(
    "/v1/schedule/sources/:id",
    ["DELETE"],
    true,
    true,
    deleteScheduleSource,
  ),
  route(
    "/v1/schedule/sources/:id/sync",
    ["POST"],
    true,
    true,
    syncScheduleSource,
  ),
  route("/v1/schedule/events", ["GET"], true, true, listScheduleEvents),
  route("/v1/schedule/events", ["POST"], true, true, pushScheduleEvents),
  route("/v1/schedule/events/:id", ["DELETE"], true, true, deleteScheduleEvent),
  route("/v1/schedule/connect/google", ["GET"], true, true, (context) =>
    beginCalendarConnect(context, "google"),
  ),
  route("/v1/schedule/connect/microsoft", ["GET"], true, true, (context) =>
    beginCalendarConnect(context, "microsoft"),
  ),
  route("/v1/schedule/callback/google", ["GET"], false, false, (context) =>
    completeCalendarConnect(context, "google"),
  ),
  route("/v1/schedule/callback/microsoft", ["GET"], false, false, (context) =>
    completeCalendarConnect(context, "microsoft"),
  ),

  route("/v1/gaps", ["GET"], true, true, listGaps),
  route("/v1/activities", ["GET"], true, false, listActivities),

  route("/v1/prompts", ["GET"], true, true, listPrompts),
  route("/v1/prompts/next", ["POST"], true, true, nextPrompt),
  route("/v1/prompts/:id/dismiss", ["POST"], true, true, dismissPrompt),
  route("/v1/prompts/:id/complete", ["POST"], true, true, completePrompt),
  route("/v1/prompts/:id/feedback", ["POST"], true, true, submitPromptFeedback),
  route("/v1/prompts/stream", ["GET"], true, true, unsupportedPromptTransport),
  route("/v1/prompts/ws", ["GET"], true, true, unsupportedPromptTransport),

  route("/v1/gamification/me", ["GET"], true, true, getPlayerState),
  route("/v1/gamification/badges", ["GET"], true, true, listBadges),
  route("/v1/gamification/milestones", ["GET"], true, true, listMilestones),
  route("/v1/gamification/leaderboard", ["GET"], true, true, getLeaderboard),

  route("/v1/social/profile", ["GET"], true, true, getSocialProfile),
  route("/v1/social/profile", ["PUT"], true, true, upsertSocialProfile),
  route("/v1/social/follow/:followeeId", ["POST"], true, true, follow),
  route("/v1/social/follow/:followeeId", ["DELETE"], true, true, unfollow),
  route("/v1/social/followers", ["GET"], true, true, listFollowers),
  route("/v1/social/following", ["GET"], true, true, listFollowing),
  route("/v1/social/feed", ["GET"], true, true, getFeed),
];

function normalPath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function matchRoute(
  template: string,
  pathname: string,
): Readonly<Record<string, string>> | undefined {
  const expected = template.split("/").filter((part) => part.length > 0);
  const actual = pathname.split("/").filter((part) => part.length > 0);
  if (expected.length !== actual.length) {
    return undefined;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const routePart = expected[index]!;
    const actualPart = actual[index]!;
    if (!routePart.startsWith(":")) {
      if (routePart !== actualPart) {
        return undefined;
      }
      continue;
    }
    const parameter = routePart.slice(1);
    if (
      (parameter === "id" || parameter === "followeeId") &&
      !isUuid(actualPart)
    ) {
      return undefined;
    }
    params[parameter] = actualPart;
  }
  return params;
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("Authorization");
  if (header === null) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/iu.exec(header);
  return match?.[1]?.trim();
}

function unauthorized(): Response {
  return problem(401, "Unauthorized", "Authentication is required.");
}

function consentResponse(state: ConsentGateState): Response {
  return state.status === "required"
    ? new Response(
        JSON.stringify({
          error: "consent_required",
          currentVersion: "1.0",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      )
    : new Response(
        JSON.stringify({
          error: "stale_consent",
          acceptedVersion: state.acceptedVersion,
          currentVersion: "1.0",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
}

function createRequestContext(
  request: Request,
  url: URL,
  params: Readonly<Record<string, string>>,
  dependencies: RuntimeDependencies,
  userId: string | null,
): RequestContext {
  let database: Database | undefined;
  return {
    request,
    url,
    params,
    env: dependencies.env,
    fetchImpl: dependencies.fetchImpl,
    now: dependencies.now ?? (() => new Date()),
    userId,
    database: () => {
      if (database === undefined) {
        database = dependencies.createDatabase();
      }
      return database;
    },
  };
}

export function createRouter(
  dependencies: RuntimeDependencies,
): (request: Request) => Promise<Response> {
  return (request) => dispatch(request, dependencies);
}

export async function dispatch(
  request: Request,
  dependencies: RuntimeDependencies,
): Promise<Response> {
  const allowedOrigins = getAllowedOrigins(dependencies.env);
  const preflight = handlePreflight(request, allowedOrigins);
  if (preflight !== null) {
    return preflight;
  }
  const url = new URL(request.url);
  const pathname = normalPath(url.pathname);
  const eligibleRoutes = ROUTES.filter(
    (candidate) =>
      !candidate.developmentOnly || isDevelopment(dependencies.env),
  );
  const matches = eligibleRoutes
    .map((candidate) => ({
      route: candidate,
      params: matchRoute(candidate.path, pathname),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        readonly route: Route;
        readonly params: Readonly<Record<string, string>>;
      } => candidate.params !== undefined,
    );

  if (matches.length === 0) {
    return applyCors(
      request,
      problem(404, "Not Found", `No handler for ${pathname}`),
      allowedOrigins,
    );
  }
  const matchingMethods = matches.flatMap(
    (candidate) => candidate.route.methods,
  );
  const selected = matches.find((candidate) =>
    candidate.route.methods.includes(request.method.toUpperCase()),
  );
  if (selected === undefined) {
    return applyCors(
      request,
      methodNotAllowed([...new Set(matchingMethods)]),
      allowedOrigins,
    );
  }

  let userId: string | null = null;
  if (selected.route.auth) {
    const token = bearerToken(request);
    if (token === undefined) {
      return applyCors(request, unauthorized(), allowedOrigins);
    }
    try {
      const payload = await createJwtService(
        getJwtConfiguration(dependencies.env),
        dependencies.now,
      ).verify(token);
      if (!isUuid(payload.sub)) {
        return applyCors(request, unauthorized(), allowedOrigins);
      }
      userId = payload.sub;
    } catch (error: unknown) {
      if (error instanceof ConfigurationError) {
        return applyCors(
          request,
          unavailableConfiguration(error.message),
          allowedOrigins,
        );
      }
      if (error instanceof JwtValidationError) {
        return applyCors(request, unauthorized(), allowedOrigins);
      }
      throw error;
    }
  }

  const context = createRequestContext(
    request,
    url,
    selected.params,
    dependencies,
    userId,
  );
  try {
    if (selected.route.consent) {
      if (userId === null) {
        return applyCors(request, unauthorized(), allowedOrigins);
      }
      const consent = await hasCurrentConsent(context.database(), userId);
      if (consent.status !== "current") {
        return applyCors(request, consentResponse(consent), allowedOrigins);
      }
    }
    return applyCors(
      request,
      await selected.route.handler(context),
      allowedOrigins,
    );
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      return applyCors(
        request,
        unavailableConfiguration(error.message),
        allowedOrigins,
      );
    }
    throw error;
  }
}
