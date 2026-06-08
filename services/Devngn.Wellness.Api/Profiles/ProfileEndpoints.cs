// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Profiles;

internal static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/profile")
            .WithTags("Profile")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("", GetAsync)
            .Produces<ProfileResponse>()
            .Produces(StatusCodes.Status404NotFound)
            .WithName("GetProfile");
        group.MapPut("", UpsertAsync)
            .ValidateBody<RouteHandlerBuilder, UpsertProfileRequest>()
            .Produces<ProfileResponse>()
            .ProducesValidationProblem()
            .WithName("UpsertProfile");
        group.MapDelete("", DeleteAsync)
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound)
            .WithName("DeleteProfile");

        return app;
    }

    private static async Task<IResult> GetAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var profile = await db.Profiles
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => Map(p))
            .SingleOrDefaultAsync(ct);

        return profile is null ? Results.NotFound() : Results.Ok(profile);
    }

    private static async Task<IResult> UpsertAsync(
        [FromBody] UpsertProfileRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var existing = await db.Profiles.SingleOrDefaultAsync(p => p.UserId == userId, ct);
        var now = clock.GetUtcNow();

        if (existing is null)
        {
            var profile = new Profile
            {
                UserId = userId,
                AgeRange = NormalizeOptional(request.AgeRange),
                HeightCm = request.HeightCm,
                WeightKg = request.WeightKg,
                FitnessBaseline = request.FitnessBaseline,
                PreferredIntensity = request.PreferredIntensity,
                Limitations = NormalizeOptional(request.Limitations),
                TimeOfDayPreference = NormalizeOptional(request.TimeOfDayPreference),
                UpdatedAt = now,
            };
            db.Profiles.Add(profile);
            await db.SaveChangesAsync(ct);
            return Results.Ok(Map(profile));
        }

        // True PUT semantics: omitted nullable fields become null. The endpoint contract is
        // "this is the new state of the profile," not "patch only what I sent."
        existing.AgeRange = NormalizeOptional(request.AgeRange);
        existing.HeightCm = request.HeightCm;
        existing.WeightKg = request.WeightKg;
        existing.FitnessBaseline = request.FitnessBaseline;
        existing.PreferredIntensity = request.PreferredIntensity;
        existing.Limitations = NormalizeOptional(request.Limitations);
        existing.TimeOfDayPreference = NormalizeOptional(request.TimeOfDayPreference);
        existing.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return Results.Ok(Map(existing));
    }

    private static async Task<IResult> DeleteAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var affected = await db.Profiles.Where(p => p.UserId == userId).ExecuteDeleteAsync(ct);
        return affected > 0 ? Results.NoContent() : Results.NotFound();
    }

    private static string? NormalizeOptional(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ProfileResponse Map(Profile p) => new(
        p.Id, p.AgeRange, p.HeightCm, p.WeightKg, p.FitnessBaseline,
        p.PreferredIntensity, p.Limitations, p.TimeOfDayPreference, p.UpdatedAt);
}
