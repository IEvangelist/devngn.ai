// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Consent;
using Devngn.Wellness.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Identity;

/// <summary>
/// Endpoint convention extensions that gate access on the authenticated user having a
/// <em>current-version</em> consent record. The database FK from Profile / Goal /
/// Equipment to ConsentRecord remains the authoritative invariant; this filter is the
/// UX layer that returns a clean 403 with a typed error code (and never the raw
/// FK-violation 500 that the DB would otherwise produce).
/// </summary>
internal static class ConsentGate
{
    public const string ConsentRequiredError = "consent_required";
    public const string StaleConsentError = "stale_consent";

    public static TBuilder RequireConsent<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
    {
        return builder.AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var current = http.RequestServices.GetRequiredService<ICurrentUserContext>();
            var userId = current.UserId;
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var db = http.RequestServices.GetRequiredService<WellnessDbContext>();
            var state = await db.Users
                .Where(u => u.Id == userId.Value)
                .Select(u => new
                {
                    u.Id,
                    ConsentVersion = u.Consent != null ? u.Consent.Version : null
                })
                .SingleOrDefaultAsync(http.RequestAborted);

            if (state is null)
            {
                return Results.Unauthorized();
            }

            if (state.ConsentVersion is null)
            {
                return Results.Json(
                    new { error = ConsentRequiredError, currentVersion = ConsentRegistry.CurrentVersion },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            if (!string.Equals(state.ConsentVersion, ConsentRegistry.CurrentVersion, StringComparison.Ordinal))
            {
                return Results.Json(
                    new
                    {
                        error = StaleConsentError,
                        acceptedVersion = state.ConsentVersion,
                        currentVersion = ConsentRegistry.CurrentVersion,
                    },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            return await next(ctx);
        });
    }
}
