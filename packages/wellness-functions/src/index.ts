import type { RuntimeDependencies } from "./context.js";

export { createRouter, dispatch } from "./router.js";
export type { RequestContext, RuntimeDependencies } from "./context.js";
export {
  ALLOWED_ORIGINS,
  applyCors,
  corsHeaders,
  getAllowedOrigins,
  handlePreflight,
} from "./lib/cors.js";
export {
  createJwtService,
  JwtValidationError,
  type JwtPayload,
  type JwtService,
} from "./lib/jwt.js";
export { createNetlifyDatabase, type Database } from "./lib/database.js";
export type {
  NetlifyFunctionConfig,
  NetlifyFunctionContext,
} from "./netlify.js";

/**
 * Function-friendly entry point. The caller supplies a fresh dependency set for
 * every invocation, preventing request state from surviving across invocations.
 */
export async function handleRequest(
  request: Request,
  dependencies: RuntimeDependencies,
): Promise<Response> {
  const { dispatch } = await import("./router.js");
  return dispatch(request, dependencies);
}
