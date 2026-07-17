import {
  createNetlifyDatabase,
  handleRequest,
} from "../../../../packages/wellness-functions/index.js";
import type { Database } from "../../../../packages/wellness-functions/index.js";
import type {
  NetlifyFunctionConfig,
  NetlifyFunctionContext,
} from "../../../../packages/wellness-functions/index.js";

export const config: NetlifyFunctionConfig = {
  path: "/v1/*",
};

/**
 * Netlify's modern Request/Response function entry point. Dependencies are
 * constructed for this invocation only; persistent state belongs in Netlify DB.
 */
export default async function wellnessV1(
  request: Request,
  _context: NetlifyFunctionContext,
): Promise<Response> {
  const env: Readonly<Record<string, string | undefined>> = {
    ...process.env,
  };
  let database: Database | undefined;
  try {
    return await handleRequest(request, {
      env,
      createDatabase: () => {
        if (database === undefined) {
          database = createNetlifyDatabase(env);
        }
        return database;
      },
      fetchImpl: fetch,
      now: () => new Date(),
    });
  } finally {
    await database?.close?.();
  }
}
