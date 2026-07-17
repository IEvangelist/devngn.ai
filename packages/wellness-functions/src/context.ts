import type { Database } from "./lib/database.js";
import type { RuntimeEnv } from "./lib/config.js";

export interface RuntimeDependencies {
  readonly env: RuntimeEnv;
  readonly createDatabase: () => Database;
  readonly fetchImpl: typeof fetch;
  readonly now?: () => Date;
}

export interface RequestContext {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly env: RuntimeEnv;
  readonly fetchImpl: typeof fetch;
  readonly now: () => Date;
  readonly database: () => Database;
  readonly userId: string | null;
}

export type RouteHandler = (context: RequestContext) => Promise<Response>;
