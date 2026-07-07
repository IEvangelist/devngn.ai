// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Moderation;
using Devngn.Wellness.Api.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Devngn.Wellness.Api.Social;

internal static class SocialEndpoints
{
    /// <summary>EF-generated unique-index name for (FollowerId, FolloweeId).</summary>
    public const string UniqueFollowIndexName = "pk_follows";

    public static IEndpointRouteBuilder MapSocialEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/social")
            .WithTags("Social")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("profile", GetProfileAsync)
            .Produces<SocialProfileResponse>()
            .Produces(StatusCodes.Status404NotFound)
            .WithName("GetSocialProfile");

        group.MapPut("profile", UpsertProfileAsync)
            .ValidateBody<RouteHandlerBuilder, UpsertSocialProfileRequest>()
            .Produces<SocialProfileResponse>()
            .ProducesValidationProblem()
            .WithName("UpsertSocialProfile");

        group.MapPost("follow/{followeeId:guid}", FollowAsync)
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status400BadRequest)
            .WithName("Follow");

        group.MapDelete("follow/{followeeId:guid}", UnfollowAsync)
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound)
            .WithName("Unfollow");

        group.MapGet("followers", ListFollowersAsync)
            .Produces<IReadOnlyList<FollowerResponse>>()
            .WithName("ListFollowers");

        group.MapGet("following", ListFollowingAsync)
            .Produces<IReadOnlyList<FollowResponse>>()
            .WithName("ListFollowing");

        group.MapGet("feed", GetFeedAsync)
            .Produces<IReadOnlyList<FeedItemResponse>>()
            .WithName("GetFeed");

        return app;
    }

    private static async Task<IResult> GetProfileAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var profile = await db.SocialProfiles
            .AsNoTracking()
            .Where(sp => sp.UserId == userId)
            .SingleOrDefaultAsync(ct);

        return profile is null ? Results.NotFound() : Results.Ok(Map(profile));
    }

    private static async Task<IResult> UpsertProfileAsync(
        [FromBody] UpsertSocialProfileRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        IProfanityService profanity,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;

        var displayName = await profanity.SanitizeAsync(request.DisplayName.Trim(), ct);
        var bio = request.Bio is null
            ? null
            : await profanity.SanitizeAsync(request.Bio.Trim(), ct);

        var existing = await db.SocialProfiles.SingleOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (existing is null)
        {
            var profile = new SocialProfile
            {
                UserId = userId,
                DisplayName = displayName,
                Bio = string.IsNullOrWhiteSpace(bio) ? null : bio,
                IsPublic = request.IsPublic,
            };
            db.SocialProfiles.Add(profile);
            await db.SaveChangesAsync(ct);
            return Results.Ok(Map(profile));
        }

        existing.DisplayName = displayName;
        existing.Bio = string.IsNullOrWhiteSpace(bio) ? null : bio;
        existing.IsPublic = request.IsPublic;
        await db.SaveChangesAsync(ct);
        return Results.Ok(Map(existing));
    }

    private static async Task<IResult> FollowAsync(
        Guid followeeId,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;

        if (userId == followeeId)
        {
            return Results.BadRequest(new { error = "cannot_follow_self" });
        }

        db.Follows.Add(new Follow
        {
            FollowerId = userId,
            FolloweeId = followeeId,
            CreatedAt = clock.GetUtcNow(),
        });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsDuplicateFollow(ex))
        {
            return Results.Conflict(new { error = "already_following" });
        }

        return Results.NoContent();
    }

    private static async Task<IResult> UnfollowAsync(
        Guid followeeId,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var affected = await db.Follows
            .Where(f => f.FollowerId == userId && f.FolloweeId == followeeId)
            .ExecuteDeleteAsync(ct);
        return affected > 0 ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> ListFollowersAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var rows = await db.Follows
            .AsNoTracking()
            .Where(f => f.FolloweeId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FollowerResponse(f.FollowerId, f.CreatedAt))
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    private static async Task<IResult> ListFollowingAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var rows = await db.Follows
            .AsNoTracking()
            .Where(f => f.FollowerId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FollowResponse(f.FolloweeId, f.CreatedAt))
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    private static async Task<IResult> GetFeedAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var rows = await db.ActivityFeedItems
            .AsNoTracking()
            .Where(f => f.UserId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .Take(50)
            .Select(f => new FeedItemResponse(f.Id, f.Type, f.Message, f.CreatedAt))
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    private static bool IsDuplicateFollow(DbUpdateException ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            if (current is PostgresException pg && pg.SqlState == "23505")
            {
                return true;
            }
        }
        return false;
    }

    private static SocialProfileResponse Map(SocialProfile sp) =>
        new(sp.UserId, sp.DisplayName, sp.Bio, sp.IsPublic);
}
