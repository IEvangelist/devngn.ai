// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  CURRENT_CONSENT_TEXT,
  CURRENT_CONSENT_VERSION,
  DEFAULT_ALLOWED_ORIGINS,
  DEVNGN_PRODUCTION_ORIGIN,
  DeviceFlowStore,
  FakeClock,
  OAuthStateStore,
  ReferenceJwtService,
  type HttpMethod,
  corsHeaders,
  emptyResponse,
  handlePreflight,
  jsonResponse,
  loadOpenApiRouteMethods,
  problemJson,
  validationProblemJson,
  withCors,
} from "./support/referenceApi.js";

type RouteMode = "always" | "development-only" | "unsupported";

interface RouteContract {
  readonly template: string;
  readonly methods: readonly HttpMethod[];
  readonly auth: boolean;
  readonly consent: boolean;
  readonly mode: RouteMode;
}

interface UserRecord {
  readonly id: string;
  readonly githubId: number;
  readonly login: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
}

interface ProfileRecord {
  readonly id: string;
  readonly updatedAt: string;
  readonly fitnessBaseline: string;
  readonly preferredIntensity: string;
  readonly ageRange?: string;
  readonly heightCm?: number;
  readonly weightKg?: number;
  readonly limitations?: string;
  readonly timeOfDayPreference?: string;
}

interface GoalRecord {
  readonly id: string;
  readonly userId: string;
  title: string;
  description?: string;
  category: string;
  targetMetric?: string;
  startDate: string;
  endDate?: string;
  readonly createdAt: string;
  updatedAt: string;
}

interface EquipmentRecord {
  readonly id: string;
  readonly userId: string;
  readonly tag: string;
  displayName: string;
  notes?: string;
  readonly createdAt: string;
}

interface PromptRecord {
  readonly id: string;
  readonly userId: string;
  readonly activityId: string;
  readonly activityTitle: string;
  readonly durationSeconds: number;
  readonly deliveredVia: "Vscode" | "Cli" | "Web" | "App";
  readonly deliveredAt: string;
  dismissedAt?: string;
  completedAt?: string;
  feedbackRating?: number;
}

type DeviceOutcome =
  | { readonly kind: "pending"; readonly retryAfterSeconds: number }
  | { readonly kind: "slowDown"; readonly retryAfterSeconds: number }
  | {
      readonly kind: "failed";
      readonly error: string;
      readonly description?: string;
      readonly status: number;
    }
  | { readonly kind: "success"; readonly user: UserRecord };

export const routeContracts: readonly RouteContract[] = [
  {
    template: "/v1/auth/dev/login",
    methods: ["POST"],
    auth: false,
    consent: false,
    mode: "development-only",
  },
  {
    template: "/v1/hello",
    methods: ["GET"],
    auth: false,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/equipment/catalog",
    methods: ["GET"],
    auth: true,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/auth/github/device",
    methods: ["POST"],
    auth: false,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/auth/github/device/poll",
    methods: ["POST"],
    auth: false,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/auth/github/web/start",
    methods: ["GET"],
    auth: false,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/auth/github/web/callback",
    methods: ["GET"],
    auth: false,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/auth/me",
    methods: ["GET"],
    auth: true,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/consent",
    methods: ["DELETE", "GET", "POST"],
    auth: true,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/profile",
    methods: ["DELETE", "GET", "PUT"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/goals",
    methods: ["GET", "POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/goals/{id}",
    methods: ["DELETE", "GET", "PUT"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/equipment",
    methods: ["GET", "POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/equipment/{id}",
    methods: ["DELETE", "GET", "PUT"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/sources",
    methods: ["GET", "POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/sources/{id}",
    methods: ["DELETE", "GET", "PATCH"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/sources/{id}/sync",
    methods: ["POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/events",
    methods: ["GET", "POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/events/{id}",
    methods: ["DELETE"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/connect/google",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/connect/microsoft",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/schedule/callback/google",
    methods: ["GET"],
    auth: false,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/schedule/callback/microsoft",
    methods: ["GET"],
    auth: false,
    consent: false,
    mode: "always",
  },
  {
    template: "/v1/gaps",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/activities",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/prompts",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/prompts/next",
    methods: ["POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/prompts/{id}/dismiss",
    methods: ["POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/prompts/{id}/complete",
    methods: ["POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/prompts/{id}/feedback",
    methods: ["POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/prompts/stream",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "unsupported",
  },
  {
    template: "/v1/prompts/ws",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "unsupported",
  },
  {
    template: "/v1/gamification/me",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/gamification/badges",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/gamification/milestones",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/gamification/leaderboard",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/social/profile",
    methods: ["GET", "PUT"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/social/follow/{followeeId}",
    methods: ["DELETE", "POST"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/social/followers",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/social/following",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
  {
    template: "/v1/social/feed",
    methods: ["GET"],
    auth: true,
    consent: true,
    mode: "always",
  },
] as const;

export function createReferenceApp(
  environment: "development" | "production" = "production",
) {
  const clock = new FakeClock("2026-07-10T15:00:00.000Z");
  const jwt = new ReferenceJwtService(
    {
      issuer: "devngn.ai",
      audience: "wellness",
      signingKey: Buffer.from(
        "0123456789abcdef0123456789abcdef",
        "utf8",
      ).toString("base64"),
      keyId: "kid-1",
      accessTokenLifetimeMinutes: 60,
    },
    clock,
  );
  const oauthStateStore = new OAuthStateStore(clock);
  const deviceFlowStore = new DeviceFlowStore(clock);

  const users = new Map<
    string,
    {
      user: UserRecord;
      consentVersion?: string;
      consentAcceptedAt?: string;
      profile?: ProfileRecord;
      goals: GoalRecord[];
      equipment: EquipmentRecord[];
      prompts: PromptRecord[];
      promptQueue: Array<{
        id: string;
        activityId: string;
        activityTitle: string;
        durationSeconds: number;
      }>;
    }
  >();
  const deviceOutcomes = new Map<string, DeviceOutcome[]>();
  let webCallbackUser: UserRecord | undefined;
  let identity = 0;

  const nextId = (prefix: string): string => {
    identity += 1;
    return `${prefix}-${identity.toString().padStart(4, "0")}`;
  };

  const createUser = (withConsent = true): UserRecord => {
    const index = users.size + 1;
    const user: UserRecord = {
      id: `00000000-0000-0000-0000-${index.toString().padStart(12, "0")}`,
      githubId: 4_000 + index,
      login: `octodev-${index}`,
      displayName: `Octo Dev ${index}`,
      avatarUrl: `https://avatars.example.com/${index}.png`,
    };

    users.set(user.id, {
      user,
      consentVersion: withConsent ? CURRENT_CONSENT_VERSION : undefined,
      consentAcceptedAt: withConsent ? clock.now().toISOString() : undefined,
      goals: [],
      equipment: [],
      prompts: [],
      promptQueue: [],
    });
    if (webCallbackUser === undefined) {
      webCallbackUser = user;
    }
    return user;
  };

  const setConsentVersion = (userId: string, version?: string): void => {
    const state = users.get(userId);
    if (state === undefined) {
      return;
    }
    state.consentVersion = version;
    state.consentAcceptedAt =
      version === undefined ? undefined : clock.now().toISOString();
  };

  const queuePrompt = (
    userId: string,
    prompt: {
      id?: string;
      activityId?: string;
      activityTitle: string;
      durationSeconds: number;
    },
  ): void => {
    const state = requireUserState(userId);
    state.promptQueue.push({
      id: prompt.id ?? nextId("prompt"),
      activityId: prompt.activityId ?? nextId("activity"),
      activityTitle: prompt.activityTitle,
      durationSeconds: prompt.durationSeconds,
    });
  };

  const seedDeviceOutcomes = (
    handle: string,
    outcomes: readonly DeviceOutcome[],
  ): void => {
    deviceOutcomes.set(handle, [...outcomes]);
  };

  const compiledRoutes = routeContracts.map((route) => compileRoute(route));

  const dispatch = async (
    request: Request,
    currentUser?: UserRecord,
  ): Promise<Response> => {
    const preflight = handlePreflight(request, DEFAULT_ALLOWED_ORIGINS);
    if (preflight !== null) {
      return preflight;
    }

    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const matched = compiledRoutes.find((candidate) =>
      candidate.pattern.test(url.pathname),
    );

    if (matched === undefined) {
      return withCors(emptyResponse(404), origin, DEFAULT_ALLOWED_ORIGINS);
    }

    const route = matched.contract;
    if (
      route.mode === "development-only" &&
      environment !== "development"
    ) {
      return withCors(emptyResponse(404), origin, DEFAULT_ALLOWED_ORIGINS);
    }
    if (!route.methods.includes(request.method as HttpMethod)) {
      return withCors(emptyResponse(405), origin, DEFAULT_ALLOWED_ORIGINS);
    }
    if (route.auth && currentUser === undefined) {
      return withCors(emptyResponse(401), origin, DEFAULT_ALLOWED_ORIGINS);
    }
    if (route.consent && currentUser !== undefined) {
      const state = requireUserState(currentUser.id);
      if (state.consentVersion === undefined) {
        return withCors(
          jsonResponse(
            {
              error: "consent_required",
              currentVersion: CURRENT_CONSENT_VERSION,
            },
            403,
          ),
          origin,
          DEFAULT_ALLOWED_ORIGINS,
        );
      }
      if (state.consentVersion !== CURRENT_CONSENT_VERSION) {
        return withCors(
          jsonResponse(
            {
              error: "stale_consent",
              acceptedVersion: state.consentVersion,
              currentVersion: CURRENT_CONSENT_VERSION,
            },
            403,
          ),
          origin,
          DEFAULT_ALLOWED_ORIGINS,
        );
      }
    }
    if (route.mode === "unsupported") {
      return withCors(
        problemJson(
          501,
          "Not Implemented",
          `${route.template} is intentionally unsupported on Netlify Functions.`,
        ),
        origin,
        DEFAULT_ALLOWED_ORIGINS,
      );
    }

    const response = await handleRoute(
      route.template,
      matched.extract(url.pathname),
      request,
      currentUser,
    );
    return withCors(response, origin, DEFAULT_ALLOWED_ORIGINS);
  };

  const handleRoute = async (
    template: string,
    params: Record<string, string>,
    request: Request,
    currentUser?: UserRecord,
  ): Promise<Response> => {
    switch (template) {
      case "/v1/hello":
        return jsonResponse({
          service: "devngn.ai wellness",
          timestamp: clock.now().toISOString(),
        });

      case "/v1/auth/dev/login":
        return jsonResponse(issueAccessToken(currentUser ?? createUser()));

      case "/v1/auth/me":
        return jsonResponse(toAuthenticatedUser(currentUser));

      case "/v1/auth/github/device": {
        const handle = deviceFlowStore.create("hidden-device-code", 900, 5);
        if (!deviceOutcomes.has(handle)) {
          deviceOutcomes.set(handle, []);
        }
        return jsonResponse({
          sessionId: handle,
          userCode: "ABCD-EFGH",
          verificationUri: "https://github.com/login/device",
          expiresInSeconds: 900,
          intervalSeconds: 5,
        });
      }

      case "/v1/auth/github/device/poll": {
        const body = await readJsonObject(request);
        const sessionId = readOptionalString(body, "sessionId");
        if (sessionId === undefined || sessionId.trim().length === 0) {
          return jsonResponse(
            {
              error: "invalid_request",
              description: "sessionId is required.",
            },
            400,
          );
        }

        const session = deviceFlowStore.beginPoll(sessionId);
        if (session === null) {
          return jsonResponse(
            {
              error: "expired_token",
              description: "Unknown or expired device flow session.",
            },
            410,
          );
        }
        if (session.tooSoon) {
          return jsonResponse(
            {
              error: "slow_down",
              description: `Wait at least ${session.intervalSeconds}s between polls.`,
            },
            429,
            { "Retry-After": String(session.intervalSeconds) },
          );
        }

        const queued = deviceOutcomes.get(sessionId);
        const outcome = queued?.shift();
        if (outcome === undefined) {
          return jsonResponse(
            { error: "authorization_pending" },
            202,
            { "Retry-After": String(session.intervalSeconds) },
          );
        }

        switch (outcome.kind) {
          case "pending":
            return jsonResponse(
              { error: "authorization_pending" },
              202,
              { "Retry-After": String(outcome.retryAfterSeconds) },
            );
          case "slowDown":
            deviceFlowStore.increaseInterval(sessionId, outcome.retryAfterSeconds);
            return jsonResponse(
              { error: "slow_down" },
              429,
              { "Retry-After": String(outcome.retryAfterSeconds) },
            );
          case "failed":
            deviceFlowStore.remove(sessionId);
            return jsonResponse(
              {
                error: outcome.error,
                ...(outcome.description === undefined
                  ? {}
                  : { description: outcome.description }),
              },
              outcome.status,
            );
          case "success":
            deviceFlowStore.remove(sessionId);
            return jsonResponse(issueAccessToken(outcome.user));
        }
      }

      case "/v1/auth/github/web/start": {
        const returnPath = new URL(request.url).searchParams.get("returnPath");
        if (
          returnPath !== null &&
          returnPath.length > 0 &&
          !returnPath.startsWith("/") &&
          returnPath !== ""
        ) {
          return jsonResponse(
            {
              error: "invalid_return_path",
              description:
                "returnPath must be a relative path beginning with '/' and contain no scheme or '//'.",
            },
            400,
          );
        }
        if (!new URL(request.url).searchParams.has("returnPath") && !isSafeEmpty(returnPath)) {
          return jsonResponse(
            {
              error: "invalid_return_path",
              description:
                "returnPath must be a relative path beginning with '/' and contain no scheme or '//'.",
            },
            400,
          );
        }
        if (
          returnPath !== null &&
          returnPath.length > 0 &&
          (returnPath.startsWith("//") || returnPath.includes("://"))
        ) {
          return jsonResponse(
            {
              error: "invalid_return_path",
              description:
                "returnPath must be a relative path beginning with '/' and contain no scheme or '//'.",
            },
            400,
          );
        }

        const state = oauthStateStore.create(
          returnPath === null || returnPath.length === 0 ? undefined : returnPath,
        );
        const authorizeUrl = new URL(
          "https://github.com/login/oauth/authorize",
        );
        authorizeUrl.searchParams.set("client_id", "client-id");
        authorizeUrl.searchParams.set(
          "redirect_uri",
          "https://api.devngn.ai/v1/auth/github/web/callback",
        );
        authorizeUrl.searchParams.set("scope", "read:user");
        authorizeUrl.searchParams.set("state", state.state);
        authorizeUrl.searchParams.set("code_challenge", state.codeChallenge);
        authorizeUrl.searchParams.set("code_challenge_method", "S256");
        authorizeUrl.searchParams.set("allow_signup", "true");

        return emptyResponse(302, { Location: authorizeUrl.toString() });
      }

      case "/v1/auth/github/web/callback": {
        const search = new URL(request.url).searchParams;
        const error = search.get("error");
        const errorDescription = search.get("error_description");
        if (error !== null && error.length > 0) {
          return jsonResponse(
            {
              error,
              ...(errorDescription === null
                ? {}
                : { description: errorDescription }),
            },
            400,
          );
        }

        const code = search.get("code");
        const stateId = search.get("state");
        if (code === null || stateId === null || code.length === 0 || stateId.length === 0) {
          return jsonResponse(
            {
              error: "invalid_request",
              description: "code and state are required.",
            },
            400,
          );
        }

        const state = oauthStateStore.take(stateId);
        if (state === null) {
          return jsonResponse(
            {
              error: "invalid_state",
              description: "Unknown, expired, or replayed state.",
            },
            400,
          );
        }

        const accessToken = issueAccessToken(webCallbackUser ?? createUser());
        if (state.returnPath === undefined || state.returnPath.length === 0) {
          return jsonResponse(accessToken);
        }

        const redirect = new URL(`https://devngn.ai${state.returnPath}`);
        redirect.hash =
          `access_token=${encodeURIComponent(accessToken.accessToken)}` +
          `&token_type=${encodeURIComponent(accessToken.tokenType)}` +
          `&expires_at=${encodeURIComponent(
            String(
              Math.floor(Date.parse(accessToken.expiresAt) / 1_000),
            ),
          )}`;
        return emptyResponse(302, { Location: redirect.toString() });
      }

      case "/v1/consent":
        return handleConsent(request, currentUser);

      case "/v1/profile":
        return handleProfile(request, currentUser);

      case "/v1/goals":
        return handleGoals(request, currentUser);

      case "/v1/goals/{id}":
        return handleGoalById(request, currentUser, params.id ?? "");

      case "/v1/equipment/catalog":
        return jsonResponse([
          {
            tag: "mat",
            displayName: "Yoga mat",
            category: "Mat",
            description: "Low-impact floor work.",
            recommendedWeeklySessions: null,
            minSessionMinutes: null,
          },
          {
            tag: "under-desk-treadmill",
            displayName: "Under-desk treadmill",
            category: "Cardio",
            description: "Walking while working.",
            recommendedWeeklySessions: 3,
            minSessionMinutes: 30,
          },
        ]);

      case "/v1/equipment":
        return handleEquipment(request, currentUser);

      case "/v1/equipment/{id}":
        return handleEquipmentById(request, currentUser, params.id ?? "");

      case "/v1/prompts":
        return jsonResponse(
          [...requireUserState(currentUser?.id ?? "").prompts].sort((left, right) =>
            right.deliveredAt.localeCompare(left.deliveredAt),
          ),
        );

      case "/v1/prompts/next":
        return handleNextPrompt(request, currentUser);

      case "/v1/prompts/{id}/dismiss":
        return handlePromptMutation(currentUser, params.id ?? "", (prompt) => {
          prompt.dismissedAt ??= clock.now().toISOString();
        });

      case "/v1/prompts/{id}/complete":
        return handlePromptMutation(currentUser, params.id ?? "", (prompt) => {
          prompt.completedAt ??= clock.now().toISOString();
        });

      case "/v1/prompts/{id}/feedback":
        return handlePromptFeedback(request, currentUser, params.id ?? "");

      default:
        return request.method === "DELETE"
          ? emptyResponse(204)
          : jsonResponse({ route: template });
    }
  };

  const handleConsent = async (
    request: Request,
    currentUser?: UserRecord,
  ): Promise<Response> => {
    const state = requireUserState(currentUser?.id ?? "");
    if (request.method === "GET") {
      return jsonResponse({
        accepted:
          state.consentVersion === undefined || state.consentAcceptedAt === undefined
            ? null
            : {
                version: state.consentVersion,
                text: CURRENT_CONSENT_TEXT,
                acceptedAt: state.consentAcceptedAt,
              },
        current: {
          version: CURRENT_CONSENT_VERSION,
          text: CURRENT_CONSENT_TEXT,
        },
      });
    }

    if (request.method === "POST") {
      const body = await readJsonObject(request);
      const version = readOptionalString(body, "version");
      if (version !== CURRENT_CONSENT_VERSION) {
        return validationProblemJson({
          version: [
            "Unknown consent version. Use GET /v1/consent to discover the current version.",
          ],
        });
      }

      const acceptedAt =
        state.consentVersion === CURRENT_CONSENT_VERSION &&
        state.consentAcceptedAt !== undefined
          ? state.consentAcceptedAt
          : clock.now().toISOString();
      state.consentVersion = CURRENT_CONSENT_VERSION;
      state.consentAcceptedAt = acceptedAt;
      return jsonResponse({
        version: CURRENT_CONSENT_VERSION,
        text: CURRENT_CONSENT_TEXT,
        acceptedAt,
      });
    }

    state.consentVersion = undefined;
    state.consentAcceptedAt = undefined;
    state.profile = undefined;
    state.goals = [];
    state.equipment = [];
    return emptyResponse(204);
  };

  const handleProfile = async (
    request: Request,
    currentUser?: UserRecord,
  ): Promise<Response> => {
    const state = requireUserState(currentUser?.id ?? "");
    if (request.method === "GET") {
      return state.profile === undefined
        ? emptyResponse(404)
        : jsonResponse(state.profile);
    }

    if (request.method === "DELETE") {
      if (state.profile === undefined) {
        return emptyResponse(404);
      }
      state.profile = undefined;
      return emptyResponse(204);
    }

    const body = await readJsonObject(request);
    const fitnessBaseline = readOptionalString(body, "fitnessBaseline");
    const preferredIntensity = readOptionalString(body, "preferredIntensity");
    const heightCm = readOptionalNumber(body, "heightCm");

    if (
      fitnessBaseline === undefined ||
      preferredIntensity === undefined ||
      heightCm !== undefined && heightCm > 500
    ) {
      return validationProblemJson({
        ...(fitnessBaseline === undefined
          ? { fitnessBaseline: ["The FitnessBaseline field is required."] }
          : {}),
        ...(preferredIntensity === undefined
          ? { preferredIntensity: ["The PreferredIntensity field is required."] }
          : {}),
        ...(heightCm !== undefined && heightCm > 500
          ? { heightCm: ["HeightCm must be less than or equal to 500."] }
          : {}),
      });
    }

    state.profile = {
      id: state.profile?.id ?? nextId("profile"),
      updatedAt: clock.now().toISOString(),
      fitnessBaseline,
      preferredIntensity,
      ageRange: readOptionalString(body, "ageRange"),
      heightCm,
      weightKg: readOptionalNumber(body, "weightKg"),
      limitations: readOptionalString(body, "limitations"),
      timeOfDayPreference: readOptionalString(body, "timeOfDayPreference"),
    };
    return jsonResponse(state.profile);
  };

  const handleGoals = async (
    request: Request,
    currentUser?: UserRecord,
  ): Promise<Response> => {
    const state = requireUserState(currentUser?.id ?? "");
    if (request.method === "GET") {
      return jsonResponse(state.goals);
    }

    const body = await readJsonObject(request);
    const title = readOptionalString(body, "title");
    const category = readOptionalString(body, "category");
    const startDate = readOptionalString(body, "startDate");
    const endDate = readOptionalString(body, "endDate");

    if (
      title === undefined ||
      title.trim().length === 0 ||
      category === undefined ||
      startDate === undefined
    ) {
      return validationProblemJson({
        ...(title === undefined || title.trim().length === 0
          ? { title: ["The Title field is required."] }
          : {}),
        ...(category === undefined
          ? { category: ["The Category field is required."] }
          : {}),
        ...(startDate === undefined
          ? { startDate: ["The StartDate field is required."] }
          : {}),
      });
    }
    if (endDate !== undefined && endDate < startDate) {
      return validationProblemJson({
        endDate: ["EndDate must be on or after StartDate."],
      });
    }

    const goal: GoalRecord = {
      id: nextId("goal"),
      userId: state.user.id,
      title: title.trim(),
      description: readOptionalString(body, "description"),
      category,
      targetMetric: readOptionalString(body, "targetMetric"),
      startDate,
      endDate,
      createdAt: clock.now().toISOString(),
      updatedAt: clock.now().toISOString(),
    };
    state.goals.push(goal);
    return jsonResponse(goal, 201, { Location: `/v1/goals/${goal.id}` });
  };

  const handleGoalById = async (
    request: Request,
    currentUser: UserRecord | undefined,
    id: string,
  ): Promise<Response> => {
    const state = requireUserState(currentUser?.id ?? "");
    const goal = state.goals.find((item) => item.id === id);
    if (goal === undefined) {
      return emptyResponse(404);
    }

    if (request.method === "GET") {
      return jsonResponse(goal);
    }
    if (request.method === "DELETE") {
      state.goals = state.goals.filter((item) => item.id !== id);
      return emptyResponse(204);
    }

    const body = await readJsonObject(request);
    const title = readOptionalString(body, "title");
    const category = readOptionalString(body, "category");
    const startDate = readOptionalString(body, "startDate");
    const endDate = readOptionalString(body, "endDate");

    if (
      title === undefined ||
      title.trim().length === 0 ||
      category === undefined ||
      startDate === undefined
    ) {
      return validationProblemJson({
        ...(title === undefined || title.trim().length === 0
          ? { title: ["The Title field is required."] }
          : {}),
        ...(category === undefined
          ? { category: ["The Category field is required."] }
          : {}),
        ...(startDate === undefined
          ? { startDate: ["The StartDate field is required."] }
          : {}),
      });
    }
    if (endDate !== undefined && endDate < startDate) {
      return validationProblemJson({
        endDate: ["EndDate must be on or after StartDate."],
      });
    }

    goal.title = title.trim();
    goal.description = readOptionalString(body, "description");
    goal.category = category;
    goal.targetMetric = readOptionalString(body, "targetMetric");
    goal.startDate = startDate;
    goal.endDate = endDate;
    goal.updatedAt = clock.now().toISOString();
    return jsonResponse(goal);
  };

  const handleEquipment = async (
    request: Request,
    currentUser?: UserRecord,
  ): Promise<Response> => {
    const state = requireUserState(currentUser?.id ?? "");
    if (request.method === "GET") {
      return jsonResponse(state.equipment);
    }

    const body = await readJsonObject(request);
    const tag = readOptionalString(body, "tag");
    const displayName = readOptionalString(body, "displayName");
    if (
      tag === undefined ||
      !/^[a-z0-9-]+$/.test(tag) ||
      displayName === undefined ||
      displayName.trim().length === 0
    ) {
      return validationProblemJson({
        ...(tag === undefined || !/^[a-z0-9-]+$/.test(tag)
          ? {
              tag: [
                "Tag must contain only lowercase letters, digits, and hyphens.",
              ],
            }
          : {}),
        ...(displayName === undefined || displayName.trim().length === 0
          ? { displayName: ["The DisplayName field is required."] }
          : {}),
      });
    }

    if (state.equipment.some((item) => item.tag === tag)) {
      return jsonResponse(
        {
          error: "duplicate_tag",
          message: `Equipment tag '${tag}' is already registered for this user.`,
        },
        409,
      );
    }

    const created: EquipmentRecord = {
      id: nextId("equipment"),
      userId: state.user.id,
      tag,
      displayName: displayName.trim(),
      notes: readOptionalString(body, "notes"),
      createdAt: clock.now().toISOString(),
    };
    state.equipment.push(created);
    return jsonResponse(created, 201, { Location: `/v1/equipment/${created.id}` });
  };

  const handleEquipmentById = async (
    request: Request,
    currentUser: UserRecord | undefined,
    id: string,
  ): Promise<Response> => {
    const state = requireUserState(currentUser?.id ?? "");
    const equipment = state.equipment.find((item) => item.id === id);
    if (equipment === undefined) {
      return emptyResponse(404);
    }

    if (request.method === "GET") {
      return jsonResponse(equipment);
    }
    if (request.method === "DELETE") {
      state.equipment = state.equipment.filter((item) => item.id !== id);
      return emptyResponse(204);
    }

    const body = await readJsonObject(request);
    const displayName = readOptionalString(body, "displayName");
    if (displayName === undefined || displayName.trim().length === 0) {
      return validationProblemJson({
        displayName: ["The DisplayName field is required."],
      });
    }

    equipment.displayName = displayName.trim();
    equipment.notes = readOptionalString(body, "notes");
    return jsonResponse(equipment);
  };

  const handleNextPrompt = async (
    request: Request,
    currentUser?: UserRecord,
  ): Promise<Response> => {
    const search = new URL(request.url).searchParams;
    const rawTimeZone = search.get("tz") ?? "UTC";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: rawTimeZone });
    } catch {
      return validationProblemJson({
        tz: [`Unknown time zone '${rawTimeZone}'.`],
      });
    }

    const rawChannel = search.get("channel") ?? "web";
    const deliveredVia = mapChannel(rawChannel);
    if (deliveredVia === undefined) {
      return validationProblemJson({
        channel: [`Unknown delivery channel '${rawChannel}'.`],
      });
    }

    const state = requireUserState(currentUser?.id ?? "");
    const next = state.promptQueue.shift();
    if (next === undefined) {
      return emptyResponse(204);
    }

    const prompt: PromptRecord = {
      id: next.id,
      userId: state.user.id,
      activityId: next.activityId,
      activityTitle: next.activityTitle,
      durationSeconds: next.durationSeconds,
      deliveredVia,
      deliveredAt: clock.now().toISOString(),
    };
    state.prompts.push(prompt);
    return jsonResponse(prompt);
  };

  const handlePromptMutation = (
    currentUser: UserRecord | undefined,
    id: string,
    mutate: (prompt: PromptRecord) => void,
  ): Response => {
    const state = requireUserState(currentUser?.id ?? "");
    const prompt = state.prompts.find((item) => item.id === id);
    if (prompt === undefined) {
      return emptyResponse(404);
    }

    mutate(prompt);
    return jsonResponse(prompt);
  };

  const handlePromptFeedback = async (
    request: Request,
    currentUser: UserRecord | undefined,
    id: string,
  ): Promise<Response> => {
    const state = requireUserState(currentUser?.id ?? "");
    const prompt = state.prompts.find((item) => item.id === id);
    if (prompt === undefined) {
      return emptyResponse(404);
    }

    const body = await readJsonObject(request);
    const rating = readOptionalNumber(body, "rating");
    if (rating === undefined || rating < 1 || rating > 5) {
      return validationProblemJson({
        rating: ["Rating must be between 1 and 5."],
      });
    }

    prompt.feedbackRating = rating;
    return jsonResponse(prompt);
  };

  const issueAccessToken = (user: UserRecord) => {
    const issued = jwt.issue({
      sub: user.id,
      githubId: user.githubId,
      login: user.login,
      name: user.displayName,
    });
    return {
      accessToken: issued.accessToken,
      tokenType: issued.tokenType,
      expiresAt: issued.expiresAt,
      user: toAuthenticatedUser(user),
    };
  };

  const toAuthenticatedUser = (user: UserRecord | undefined) => ({
    id: user?.id,
    githubId: user?.githubId,
    login: user?.login,
    displayName: user?.displayName ?? null,
    avatarUrl: user?.avatarUrl ?? null,
  });

  const requireUserState = (userId: string) => {
    const state = users.get(userId);
    if (state === undefined) {
      throw new Error(`Unknown user: ${userId}`);
    }
    return state;
  };

  return {
    clock,
    createUser,
    dispatch,
    queuePrompt,
    routeContracts,
    seedDeviceOutcomes,
    setConsentVersion,
    setWebCallbackUser(user: UserRecord): void {
      webCallbackUser = user;
    },
  };
}

function compileRoute(contract: RouteContract) {
  const paramNames = [...contract.template.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1] ?? "",
  );
  const pattern = new RegExp(
    `^${contract.template.replace(/\{[^}]+\}/g, "([^/]+)")}$`,
  );

  return {
    contract,
    pattern,
    extract(pathname: string): Record<string, string> {
      const matches = pattern.exec(pathname);
      if (matches === null) {
        return {};
      }

      return Object.fromEntries(
        paramNames.map((name, index) => [name, matches[index + 1] ?? ""]),
      );
    },
  };
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const value = (await request.json()) as unknown;
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function mapChannel(
  value: string,
): "Vscode" | "Cli" | "Web" | "App" | undefined {
  switch (value.toLowerCase()) {
    case "vscode":
      return "Vscode";
    case "cli":
      return "Cli";
    case "web":
      return "Web";
    case "app":
      return "App";
    default:
      return undefined;
  }
}

function isSafeEmpty(value: string | null): boolean {
  return value === null || value.length === 0 || value.startsWith("/");
}

describe("route parity against OpenAPI", () => {
  it("covers every committed path/method pair, including explicit transport exceptions", () => {
    const openApiRoutes = loadOpenApiRouteMethods();
    const coveredRoutes = new Map(
      routeContracts.map((route) => [route.template, [...route.methods].sort()]),
    );

    expect([...coveredRoutes.entries()].sort()).toEqual(
      [...openApiRoutes.entries()].sort(),
    );

    expect(
      routeContracts.find((route) => route.template === "/v1/prompts/stream")
        ?.mode,
    ).toBe("unsupported");
    expect(
      routeContracts.find((route) => route.template === "/v1/prompts/ws")?.mode,
    ).toBe("unsupported");
  });
});

describe("router + protected resource behavior", () => {
  it("returns 200 JSON for GET /v1/hello and reflects an allowed origin exactly", async () => {
    const app = createReferenceApp();
    const response = await app.dispatch(
      new Request("https://api.devngn.ai/v1/hello", {
        headers: { Origin: DEVNGN_PRODUCTION_ORIGIN },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      DEVNGN_PRODUCTION_ORIGIN,
    );
    await expect(response.json()).resolves.toMatchObject({
      service: "devngn.ai wellness",
    });
  });

  it("returns 404 for an unknown path and 405 for a wrong method", async () => {
    const app = createReferenceApp();

    await expect(
      app.dispatch(new Request("https://api.devngn.ai/v1/unknown")),
    ).resolves.toHaveProperty("status", 404);
    await expect(
      app.dispatch(
        new Request("https://api.devngn.ai/v1/hello", { method: "POST" }),
      ),
    ).resolves.toHaveProperty("status", 405);
  });

  it("enforces auth and exact-origin preflight for protected routes", async () => {
    const app = createReferenceApp();

    await expect(
      app.dispatch(new Request("https://api.devngn.ai/v1/profile")),
    ).resolves.toHaveProperty("status", 401);

    const preflight = await app.dispatch(
      new Request("https://api.devngn.ai/v1/profile", {
        method: "OPTIONS",
        headers: { Origin: DEFAULT_ALLOWED_ORIGINS[0] },
      }),
    );
    expect(preflight.status).toBe(204);

    const denied = await app.dispatch(
      new Request("https://api.devngn.ai/v1/profile", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example.com" },
      }),
    );
    expect(denied.status).toBe(403);
    expect(corsHeaders("https://evil.example.com")).toBeNull();
  });

  it("returns the typed consent gate payload for missing or stale consent", async () => {
    const app = createReferenceApp();
    const missingConsentUser = app.createUser(false);
    const staleConsentUser = app.createUser(true);
    app.setConsentVersion(staleConsentUser.id, "0.9");

    const missing = await app.dispatch(
      new Request("https://api.devngn.ai/v1/profile"),
      missingConsentUser,
    );
    expect(missing.status).toBe(403);
    await expect(missing.json()).resolves.toMatchObject({
      error: "consent_required",
      currentVersion: CURRENT_CONSENT_VERSION,
    });

    const stale = await app.dispatch(
      new Request("https://api.devngn.ai/v1/profile"),
      staleConsentUser,
    );
    expect(stale.status).toBe(403);
    await expect(stale.json()).resolves.toMatchObject({
      error: "stale_consent",
      acceptedVersion: "0.9",
      currentVersion: CURRENT_CONSENT_VERSION,
    });
  });

  it("keeps goals scoped to the authenticated user", async () => {
    const app = createReferenceApp();
    const alice = app.createUser();
    const bob = app.createUser();

    const created = await app.dispatch(
      new Request("https://api.devngn.ai/v1/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "10 mobility breaks/day",
          category: "Mobility",
          startDate: "2026-07-10",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      alice,
    );
    expect(created.status).toBe(201);
    const goal = (await created.json()) as { id: string };

    await expect(
      app.dispatch(
        new Request(`https://api.devngn.ai/v1/goals/${goal.id}`),
        bob,
      ),
    ).resolves.toHaveProperty("status", 404);
  });
});

describe("representative CRUD + idempotency", () => {
  it("accepts consent with canonical text and preserves AcceptedAt on a replay", async () => {
    const app = createReferenceApp();
    const user = app.createUser(false);

    const first = await app.dispatch(
      new Request("https://api.devngn.ai/v1/consent", {
        method: "POST",
        body: JSON.stringify({ version: CURRENT_CONSENT_VERSION, text: "lie" }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    const firstBody = await first.json();
    expect(firstBody).toMatchObject({
      version: CURRENT_CONSENT_VERSION,
      text: CURRENT_CONSENT_TEXT,
    });

    app.clock.advanceMinutes(5);

    const second = await app.dispatch(
      new Request("https://api.devngn.ai/v1/consent", {
        method: "POST",
        body: JSON.stringify({ version: CURRENT_CONSENT_VERSION }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    const secondBody = await second.json();

    expect(secondBody).toMatchObject({
      version: CURRENT_CONSENT_VERSION,
      text: CURRENT_CONSENT_TEXT,
      acceptedAt: (firstBody as { acceptedAt: string }).acceptedAt,
    });
  });

  it("revoking consent cascades profile, goals, and equipment", async () => {
    const app = createReferenceApp();
    const user = app.createUser(true);

    await app.dispatch(
      new Request("https://api.devngn.ai/v1/profile", {
        method: "PUT",
        body: JSON.stringify({
          fitnessBaseline: "Moderate",
          preferredIntensity: "Low",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    await app.dispatch(
      new Request("https://api.devngn.ai/v1/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Stretch",
          category: "Mobility",
          startDate: "2026-07-10",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    await app.dispatch(
      new Request("https://api.devngn.ai/v1/equipment", {
        method: "POST",
        body: JSON.stringify({ tag: "mat", displayName: "Yoga mat" }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );

    await expect(
      app.dispatch(
        new Request("https://api.devngn.ai/v1/consent", { method: "DELETE" }),
        user,
      ),
    ).resolves.toHaveProperty("status", 204);

    await expect(
      app.dispatch(new Request("https://api.devngn.ai/v1/profile"), user),
    ).resolves.toHaveProperty("status", 403);
    await expect(
      app.dispatch(new Request("https://api.devngn.ai/v1/goals"), user),
    ).resolves.toHaveProperty("status", 403);
    await expect(
      app.dispatch(new Request("https://api.devngn.ai/v1/equipment"), user),
    ).resolves.toHaveProperty("status", 403);
  });

  it("round-trips goals and preserves stable equipment tags", async () => {
    const app = createReferenceApp();
    const user = app.createUser();

    const createdGoal = await app.dispatch(
      new Request("https://api.devngn.ai/v1/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "10 mobility breaks/day",
          description: "Posture + neck",
          category: "Mobility",
          targetMetric: "10/day",
          startDate: "2026-07-10",
          endDate: "2026-12-31",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    const goal = (await createdGoal.json()) as { id: string };

    const updatedGoal = await app.dispatch(
      new Request(`https://api.devngn.ai/v1/goals/${goal.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: "12 mobility breaks/day",
          category: "Mobility",
          startDate: "2026-07-10",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    const updatedGoalBody = await updatedGoal.json();
    expect(updatedGoalBody).toMatchObject({
      title: "12 mobility breaks/day",
    });
    expect(updatedGoalBody).not.toHaveProperty("endDate");

    const createdEquipment = await app.dispatch(
      new Request("https://api.devngn.ai/v1/equipment", {
        method: "POST",
        body: JSON.stringify({
          tag: "bands-light",
          displayName: "Light resistance bands",
          notes: "Set of 3",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    const equipment = (await createdEquipment.json()) as { id: string; tag: string };

    const renamedEquipment = await app.dispatch(
      new Request(`https://api.devngn.ai/v1/equipment/${equipment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          displayName: "Light bands (renamed)",
          notes: "Updated",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    await expect(renamedEquipment.json()).resolves.toMatchObject({
      tag: "bands-light",
      displayName: "Light bands (renamed)",
    });

    const duplicateTag = await app.dispatch(
      new Request("https://api.devngn.ai/v1/equipment", {
        method: "POST",
        body: JSON.stringify({
          tag: "bands-light",
          displayName: "Duplicate",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    expect(duplicateTag.status).toBe(409);
  });
});

describe("prompt polling transport", () => {
  it("returns 204 when no prompt is queued and 200 with channel-specific payload when one is available", async () => {
    const app = createReferenceApp();
    const user = app.createUser();

    await expect(
      app.dispatch(
        new Request("https://api.devngn.ai/v1/prompts/next?channel=web&tz=UTC", {
          method: "POST",
        }),
        user,
      ),
    ).resolves.toHaveProperty("status", 204);

    app.queuePrompt(user.id, {
      activityTitle: "Neck rolls",
      durationSeconds: 20,
    });

    const delivered = await app.dispatch(
      new Request(
        "https://api.devngn.ai/v1/prompts/next?channel=vscode&tz=America/Chicago",
        { method: "POST" },
      ),
      user,
    );

    expect(delivered.status).toBe(200);
    await expect(delivered.json()).resolves.toMatchObject({
      activityTitle: "Neck rolls",
      deliveredVia: "Vscode",
    });
  });

  it("makes dismiss + complete idempotent and validates feedback ratings", async () => {
    const app = createReferenceApp();
    const user = app.createUser();
    app.queuePrompt(user.id, {
      id: "prompt-1",
      activityId: "activity-1",
      activityTitle: "Stretch",
      durationSeconds: 30,
    });

    await app.dispatch(
      new Request("https://api.devngn.ai/v1/prompts/next?tz=UTC", {
        method: "POST",
      }),
      user,
    );

    const firstDismiss = await app.dispatch(
      new Request("https://api.devngn.ai/v1/prompts/prompt-1/dismiss", {
        method: "POST",
      }),
      user,
    );
    const firstDismissBody = await firstDismiss.json();

    app.clock.advanceMinutes(10);

    const secondDismiss = await app.dispatch(
      new Request("https://api.devngn.ai/v1/prompts/prompt-1/dismiss", {
        method: "POST",
      }),
      user,
    );
    await expect(secondDismiss.json()).resolves.toMatchObject({
      dismissedAt: (firstDismissBody as { dismissedAt: string }).dismissedAt,
    });

    const complete = await app.dispatch(
      new Request("https://api.devngn.ai/v1/prompts/prompt-1/complete", {
        method: "POST",
      }),
      user,
    );
    await expect(complete.json()).resolves.toMatchObject({
      completedAt: expect.any(String),
    });

    const invalidFeedback = await app.dispatch(
      new Request("https://api.devngn.ai/v1/prompts/prompt-1/feedback", {
        method: "POST",
        body: JSON.stringify({ rating: 6 }),
        headers: { "Content-Type": "application/json" },
      }),
      user,
    );
    expect(invalidFeedback.status).toBe(400);
  });

  it("returns explicit unsupported responses for stream and websocket transports", async () => {
    const app = createReferenceApp();
    const user = app.createUser();

    const stream = await app.dispatch(
      new Request("https://api.devngn.ai/v1/prompts/stream?channel=cli&tz=UTC"),
      user,
    );
    expect(stream.status).toBe(501);
    await expect(stream.json()).resolves.toMatchObject({
      title: "Not Implemented",
      status: 501,
    });

    const socket = await app.dispatch(
      new Request("https://api.devngn.ai/v1/prompts/ws?channel=cli&tz=UTC"),
      user,
    );
    expect(socket.status).toBe(501);
  });
});

describe("GitHub device + web OAuth state routes", () => {
  it("persists device-flow handles, throttles early polls, and mints JWTs on success", async () => {
    const app = createReferenceApp();
    const user = app.createUser();
    app.setWebCallbackUser(user);

    const started = await app.dispatch(
      new Request("https://api.devngn.ai/v1/auth/github/device", {
        method: "POST",
      }),
    );
    const body = (await started.json()) as { sessionId: string };
    expect(body.sessionId).toContain("device-");

    app.seedDeviceOutcomes(body.sessionId, [
      { kind: "pending", retryAfterSeconds: 5 },
      { kind: "slowDown", retryAfterSeconds: 10 },
      { kind: "success", user },
    ]);

    const pending = await app.dispatch(
      new Request("https://api.devngn.ai/v1/auth/github/device/poll", {
        method: "POST",
        body: JSON.stringify({ sessionId: body.sessionId }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(pending.status).toBe(202);
    expect(pending.headers.get("Retry-After")).toBe("5");

    const tooSoon = await app.dispatch(
      new Request("https://api.devngn.ai/v1/auth/github/device/poll", {
        method: "POST",
        body: JSON.stringify({ sessionId: body.sessionId }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(tooSoon.status).toBe(429);

    app.clock.advanceSeconds(5);
    const slowDown = await app.dispatch(
      new Request("https://api.devngn.ai/v1/auth/github/device/poll", {
        method: "POST",
        body: JSON.stringify({ sessionId: body.sessionId }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(slowDown.status).toBe(429);
    expect(slowDown.headers.get("Retry-After")).toBe("10");

    app.clock.advanceSeconds(10);
    const success = await app.dispatch(
      new Request("https://api.devngn.ai/v1/auth/github/device/poll", {
        method: "POST",
        body: JSON.stringify({ sessionId: body.sessionId }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({
      tokenType: "Bearer",
      user: { id: user.id, login: user.login },
    });
  });

  it("binds web OAuth state one-shot and redirects successful callbacks with a token fragment", async () => {
    const app = createReferenceApp();
    const user = app.createUser();
    app.setWebCallbackUser(user);

    const started = await app.dispatch(
      new Request(
        "https://api.devngn.ai/v1/auth/github/web/start?returnPath=%2Fauth%2Fcallback",
      ),
    );
    const location = started.headers.get("Location");
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location ?? "");
    const state = redirectUrl.searchParams.get("state");
    const challenge = redirectUrl.searchParams.get("code_challenge");
    expect(state).toBeTruthy();
    expect(challenge).toBeTruthy();

    const callback = await app.dispatch(
      new Request(
        `https://api.devngn.ai/v1/auth/github/web/callback?code=gh-code&state=${encodeURIComponent(
          state ?? "",
        )}`,
      ),
    );
    expect(callback.status).toBe(302);
    const callbackLocation = callback.headers.get("Location") ?? "";
    expect(callbackLocation).toContain("/auth/callback#access_token=");

    const replay = await app.dispatch(
      new Request(
        `https://api.devngn.ai/v1/auth/github/web/callback?code=gh-code&state=${encodeURIComponent(
          state ?? "",
        )}`,
      ),
    );
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({
      error: "invalid_state",
    });
  });
});
