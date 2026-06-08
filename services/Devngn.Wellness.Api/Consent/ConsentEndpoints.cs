// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Consent;

internal static class ConsentEndpoints
{
    public static IEndpointRouteBuilder MapConsentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/consent")
            .WithTags("Consent")
            .RequireAuthorization();

        group.MapGet("", GetAsync)
            .Produces<ConsentStateResponse>()
            .WithName("GetConsent")
            .WithSummary("Returns the user's accepted consent (if any) and the current canonical text.");

        group.MapPost("", AcceptAsync)
            .ValidateBody<RouteHandlerBuilder, AcceptConsentRequest>()
            .Produces<ConsentSnapshot>()
            .ProducesValidationProblem()
            .WithName("AcceptConsent")
            .WithSummary("Idempotently accepts the named consent version using the server's canonical text.");

        group.MapDelete("", RevokeAsync)
            .Produces(StatusCodes.Status204NoContent)
            .WithName("RevokeConsent")
            .WithSummary("Revokes consent and cascade-deletes profile, goals, and equipment.");

        return app;
    }

    private static async Task<IResult> GetAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        var record = await db.ConsentRecords
            .AsNoTracking()
            .Where(c => c.UserId == userId.Value)
            .Select(c => new ConsentSnapshot(c.Version, c.Text, c.AcceptedAt))
            .SingleOrDefaultAsync(ct);

        var current = new CurrentConsentText(
            ConsentRegistry.CurrentVersion,
            ConsentRegistry.KnownVersions[ConsentRegistry.CurrentVersion]);

        return Results.Ok(new ConsentStateResponse(record, current));
    }

    private static async Task<IResult> AcceptAsync(
        [FromBody] AcceptConsentRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Version) ||
            !ConsentRegistry.TryGetText(request.Version, out var canonicalText))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["version"] = ["Unknown consent version. Use GET /v1/consent to discover the current version."],
            });
        }

        var existing = await db.ConsentRecords
            .Where(c => c.UserId == userId.Value)
            .SingleOrDefaultAsync(ct);

        if (existing is not null)
        {
            if (string.Equals(existing.Version, request.Version, StringComparison.Ordinal))
            {
                // Same version re-posted: truly idempotent — preserve the original AcceptedAt.
                return Results.Ok(new ConsentSnapshot(existing.Version, existing.Text, existing.AcceptedAt));
            }

            // Version upgrade: rewrite text + bump AcceptedAt to reflect the new acceptance.
            existing.Version = request.Version;
            existing.Text = canonicalText;
            existing.AcceptedAt = clock.GetUtcNow();
        }
        else
        {
            db.ConsentRecords.Add(new ConsentRecord
            {
                UserId = userId.Value,
                Version = request.Version,
                Text = canonicalText,
                AcceptedAt = clock.GetUtcNow(),
            });
        }

        await db.SaveChangesAsync(ct);

        var snapshot = await db.ConsentRecords
            .AsNoTracking()
            .Where(c => c.UserId == userId.Value)
            .Select(c => new ConsentSnapshot(c.Version, c.Text, c.AcceptedAt))
            .SingleAsync(ct);
        return Results.Ok(snapshot);
    }

    private static async Task<IResult> RevokeAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        // FK cascade from ConsentRecord.UserId removes Profile, Goals, and Equipment in
        // one round trip. ExecuteDelete sidesteps EF change tracking entirely.
        await db.ConsentRecords
            .Where(c => c.UserId == userId.Value)
            .ExecuteDeleteAsync(ct);

        return Results.NoContent();
    }
}
