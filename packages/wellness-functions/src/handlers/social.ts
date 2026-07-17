import { Filter } from "bad-words";

import type { RequestContext } from "../context.js";
import { json, noContent, problem, validationProblem } from "../lib/http.js";
import { isBoolean, parseJsonObject } from "../lib/json.js";
import { requiredTrimmedString, optionalTrimmedString } from "./shared.js";

const profanityFilter = new Filter();

export async function getSocialProfile(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'userId', user_id::text,
       'displayName', display_name,
       'bio', bio,
       'isPublic', is_public
     ) AS result
     FROM social_profiles
     WHERE user_id = $1::uuid`,
    [context.userId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Social profile not found.")
    : json(rows[0]?.result);
}

export async function upsertSocialProfile(
  context: RequestContext,
): Promise<Response> {
  const body = await parseJsonObject(context.request);
  if (body === null) {
    return validationProblem({ body: ["A JSON object is required."] });
  }
  const errors: Record<string, string[]> = {};
  const displayName = requiredTrimmedString(body, "displayName", 80);
  if (displayName === undefined) {
    errors.displayName = [
      "DisplayName is required and must not exceed 80 characters.",
    ];
  }
  const bio = optionalTrimmedString(body, "bio", 500);
  if (body.bio !== undefined && bio === undefined) {
    errors.bio = ["Bio must be a string with at most 500 characters."];
  }
  const rawPublic = body.isPublic;
  const isPublic =
    rawPublic === undefined
      ? true
      : isBoolean(rawPublic)
        ? rawPublic
        : undefined;
  if (isPublic === undefined) {
    errors.isPublic = ["isPublic must be a boolean."];
  }
  if (
    Object.keys(errors).length > 0 ||
    displayName === undefined ||
    isPublic === undefined
  ) {
    return validationProblem(errors);
  }
  const sanitizedDisplayName = profanityFilter.clean(displayName);
  const sanitizedBio =
    bio === undefined || bio === null ? null : profanityFilter.clean(bio);
  const rows = await context.database().query(
    `INSERT INTO social_profiles (user_id, display_name, bio, is_public)
     VALUES ($1::uuid, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           bio = EXCLUDED.bio,
           is_public = EXCLUDED.is_public
     RETURNING json_build_object(
       'userId', user_id::text,
       'displayName', display_name,
       'bio', bio,
       'isPublic', is_public
     ) AS result`,
    [context.userId, sanitizedDisplayName, sanitizedBio, isPublic],
  );
  return json(rows[0]?.result);
}

export async function follow(context: RequestContext): Promise<Response> {
  const userId = context.userId;
  const followeeId = context.params.followeeId;
  if (userId === null) {
    return problem(401, "Unauthorized", "Authentication is required.");
  }
  if (userId === followeeId) {
    return json({ error: "cannot_follow_self" }, 400);
  }
  const followee = await context
    .database()
    .query(
      "SELECT user_id::text AS id FROM consent_records WHERE user_id = $1::uuid",
      [followeeId],
    );
  if (followee.length === 0) {
    return json({ error: "followee_not_available" }, 400);
  }
  const rows = await context.database().query(
    `INSERT INTO follows (follower_id, followee_id, created_at)
     VALUES ($1::uuid, $2::uuid, now())
     ON CONFLICT (follower_id, followee_id) DO NOTHING
     RETURNING follower_id::text AS follower_id`,
    [userId, followeeId],
  );
  return rows.length === 0
    ? json({ error: "already_following" }, 409)
    : noContent();
}

export async function unfollow(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `DELETE FROM follows
      WHERE follower_id = $1::uuid AND followee_id = $2::uuid
      RETURNING follower_id::text AS follower_id`,
    [context.userId, context.params.followeeId],
  );
  return rows.length === 0
    ? problem(404, "Not Found", "Follow relationship not found.")
    : noContent();
}

export async function listFollowers(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'followerId', follower_id::text,
       'followedAt', created_at
     ) AS result
     FROM follows
     WHERE followee_id = $1::uuid
     ORDER BY created_at DESC`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}

export async function listFollowing(
  context: RequestContext,
): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'followeeId', followee_id::text,
       'followedAt', created_at
     ) AS result
     FROM follows
     WHERE follower_id = $1::uuid
     ORDER BY created_at DESC`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}

export async function getFeed(context: RequestContext): Promise<Response> {
  const rows = await context.database().query(
    `SELECT json_build_object(
       'id', id::text,
       'type', type,
       'message', message,
       'createdAt', created_at
     ) AS result
     FROM activity_feed_items
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 50`,
    [context.userId],
  );
  return json(rows.map((row) => row.result));
}
