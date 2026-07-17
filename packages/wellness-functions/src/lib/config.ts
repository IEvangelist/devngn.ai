export type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export class ConfigurationError extends Error {
  readonly variable: string;

  constructor(variable: string, detail?: string) {
    super(
      detail === undefined
        ? `Required runtime configuration '${variable}' is not configured.`
        : `Runtime configuration '${variable}' is invalid: ${detail}`,
    );
    this.name = "ConfigurationError";
    this.variable = variable;
  }
}

export interface JwtConfiguration {
  readonly secret: string;
  readonly secretEncoding: "base64" | "utf8";
  readonly issuer: string;
  readonly audience: string;
  readonly lifetimeSeconds: number;
  readonly keyId: string;
  readonly clockSkewSeconds?: number;
}

export interface GitHubDeviceConfiguration {
  readonly clientId: string;
  readonly deviceCodeEndpoint: string;
  readonly accessTokenEndpoint: string;
  readonly userEndpoint: string;
}

export interface GitHubWebConfiguration {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly authorizeEndpoint: string;
  readonly accessTokenEndpoint: string;
  readonly userEndpoint: string;
}

export interface CalendarProviderConfiguration {
  readonly provider: "google" | "microsoft";
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly tenantId?: string;
  readonly scope: string;
}

function configured(
  env: RuntimeEnv,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function requireConfigured(
  env: RuntimeEnv,
  names: readonly string[],
  displayName = names[0]!,
): string {
  const value = configured(env, names);
  if (value === undefined) {
    throw new ConfigurationError(displayName);
  }
  return value;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  max: number,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  if (!/^\d+$/u.test(value.trim())) {
    throw new ConfigurationError(
      name,
      `expected an integer between 1 and ${max}`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ConfigurationError(
      name,
      `expected an integer between 1 and ${max}`,
    );
  }
  return parsed;
}

function isBase64Key(value: string): boolean {
  try {
    const decoded = atob(value);
    return decoded.length >= 32;
  } catch (error: unknown) {
    if (error instanceof DOMException) {
      return false;
    }
    throw error;
  }
}

export function getJwtConfiguration(env: RuntimeEnv): JwtConfiguration {
  const secret = requireConfigured(
    env,
    ["JWT_SECRET", "WELLNESS_JWT_SECRET"],
    "JWT_SECRET",
  );
  const base64Key = isBase64Key(secret);
  const strict =
    !isDevelopment(env) &&
    env.WELLNESS_API_STRICT_CONFIG_VALIDATION !== "false";
  if (strict && !base64Key) {
    throw new ConfigurationError(
      "JWT_SECRET",
      "must be a base64-encoded key containing at least 32 bytes",
    );
  }
  return {
    secret,
    secretEncoding: base64Key ? "base64" : "utf8",
    issuer: requireConfigured(
      env,
      ["JWT_ISSUER", "WELLNESS_JWT_ISSUER"],
      "JWT_ISSUER",
    ),
    audience: requireConfigured(
      env,
      ["JWT_AUDIENCE", "WELLNESS_JWT_AUDIENCE"],
      "JWT_AUDIENCE",
    ),
    lifetimeSeconds: parsePositiveInteger(
      configured(env, [
        "JWT_ACCESS_TOKEN_LIFETIME_SECONDS",
        "WELLNESS_JWT_ACCESS_TOKEN_LIFETIME_SECONDS",
      ]),
      60 * 60,
      "JWT_ACCESS_TOKEN_LIFETIME_SECONDS",
      24 * 60 * 60,
    ),
    keyId: configured(env, ["JWT_KEY_ID", "WELLNESS_JWT_KEY_ID"]) ?? "v1",
    clockSkewSeconds: 60,
  };
}

export function getGitHubDeviceConfiguration(
  env: RuntimeEnv,
): GitHubDeviceConfiguration {
  return {
    clientId: requireConfigured(
      env,
      ["GITHUB_DEVICE_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_ID"],
      "GITHUB_DEVICE_OAUTH_CLIENT_ID",
    ),
    deviceCodeEndpoint:
      configured(env, ["GITHUB_DEVICE_CODE_ENDPOINT"]) ??
      "https://github.com/login/device/code",
    accessTokenEndpoint:
      configured(env, ["GITHUB_ACCESS_TOKEN_ENDPOINT"]) ??
      "https://github.com/login/oauth/access_token",
    userEndpoint:
      configured(env, ["GITHUB_USER_ENDPOINT"]) ??
      "https://api.github.com/user",
  };
}

export function getGitHubWebConfiguration(
  env: RuntimeEnv,
): GitHubWebConfiguration {
  return {
    clientId: requireConfigured(
      env,
      ["GITHUB_OAUTH_CLIENT_ID"],
      "GITHUB_OAUTH_CLIENT_ID",
    ),
    clientSecret: requireConfigured(
      env,
      ["GITHUB_OAUTH_CLIENT_SECRET"],
      "GITHUB_OAUTH_CLIENT_SECRET",
    ),
    authorizeEndpoint:
      configured(env, ["GITHUB_AUTHORIZE_ENDPOINT"]) ??
      "https://github.com/login/oauth/authorize",
    accessTokenEndpoint:
      configured(env, ["GITHUB_ACCESS_TOKEN_ENDPOINT"]) ??
      "https://github.com/login/oauth/access_token",
    userEndpoint:
      configured(env, ["GITHUB_USER_ENDPOINT"]) ??
      "https://api.github.com/user",
  };
}

function optionalProviderValue(
  env: RuntimeEnv,
  names: readonly string[],
): string | undefined {
  return configured(env, names);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return false;
    }
    throw error;
  }
}

export function getCalendarProviderConfiguration(
  env: RuntimeEnv,
  provider: "google" | "microsoft",
): CalendarProviderConfiguration | null {
  const prefix =
    provider === "google" ? "GOOGLE_CALENDAR" : "MICROSOFT_CALENDAR";
  const clientId = optionalProviderValue(env, [
    `${prefix}_CLIENT_ID`,
    `${provider.toUpperCase()}_CLIENT_ID`,
  ]);
  const clientSecret = optionalProviderValue(env, [
    `${prefix}_CLIENT_SECRET`,
    `${provider.toUpperCase()}_CLIENT_SECRET`,
  ]);
  const redirectUri = optionalProviderValue(env, [
    `${prefix}_REDIRECT_URI`,
    `${provider.toUpperCase()}_REDIRECT_URI`,
  ]);

  if (
    clientId === undefined &&
    clientSecret === undefined &&
    redirectUri === undefined
  ) {
    return null;
  }
  if (
    clientId === undefined ||
    clientSecret === undefined ||
    redirectUri === undefined
  ) {
    throw new ConfigurationError(
      `${prefix}_CLIENT_ID/${prefix}_CLIENT_SECRET/${prefix}_REDIRECT_URI`,
      "all provider credentials and redirect URI must be configured together",
    );
  }
  if (!isHttpUrl(redirectUri)) {
    throw new ConfigurationError(
      `${prefix}_REDIRECT_URI`,
      "must be an absolute HTTP or HTTPS URL",
    );
  }

  if (provider === "google") {
    return {
      provider,
      clientId,
      clientSecret,
      redirectUri,
      scope:
        optionalProviderValue(env, ["GOOGLE_CALENDAR_SCOPE"]) ??
        "https://www.googleapis.com/auth/calendar.freebusy",
    };
  }

  return {
    provider,
    clientId,
    clientSecret,
    redirectUri,
    tenantId:
      optionalProviderValue(env, ["MICROSOFT_CALENDAR_TENANT_ID"]) ?? "common",
    scope:
      optionalProviderValue(env, ["MICROSOFT_CALENDAR_SCOPE"]) ??
      "Calendars.Read offline_access",
  };
}

export function isDevelopment(env: RuntimeEnv): boolean {
  return (
    env.NETLIFY_DEV === "true" ||
    env.NETLIFY_LOCAL === "true" ||
    env.CONTEXT === "dev" ||
    env.NODE_ENV === "development"
  );
}
