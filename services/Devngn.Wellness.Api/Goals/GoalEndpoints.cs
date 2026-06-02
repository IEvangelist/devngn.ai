// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Goals;

internal static class GoalEndpoints
{
    public static IEndpointRouteBuilder MapGoalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/goals")
            .WithTags("Goals")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("", ListAsync).WithName("ListGoals");
        group.MapGet("{id:guid}", GetAsync).WithName("GetGoal");
        group.MapPost("", CreateAsync)
            .ValidateBody<RouteHandlerBuilder, CreateGoalRequest>()
            .WithName("CreateGoal");
        group.MapPut("{id:guid}", UpdateAsync)
            .ValidateBody<RouteHandlerBuilder, UpdateGoalRequest>()
            .WithName("UpdateGoal");
        group.MapDelete("{id:guid}", DeleteAsync).WithName("DeleteGoal");

        return app;
    }

    private static async Task<IResult> ListAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var rows = await db.Goals
            .AsNoTracking()
            .Where(g => g.UserId == userId)
            .OrderBy(g => g.StartDate)
            .ThenBy(g => g.CreatedAt)
            .Select(g => Map(g))
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        // Scoped by both id AND userId so another user's goal id returns 404, not 403,
        // and never leaks existence of resources outside the caller's tenant.
        var goal = await db.Goals
            .AsNoTracking()
            .Where(g => g.Id == id && g.UserId == userId)
            .Select(g => Map(g))
            .SingleOrDefaultAsync(ct);
        return goal is null ? Results.NotFound() : Results.Ok(goal);
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] CreateGoalRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        HttpContext http,
        CancellationToken ct)
    {
        if (ValidateDates(request.StartDate, request.EndDate) is { } error)
        {
            return error;
        }

        var userId = currentUser.UserId!.Value;
        var now = clock.GetUtcNow();
        var goal = new Goal
        {
            UserId = userId,
            Title = request.Title.Trim(),
            Description = NormalizeOptional(request.Description),
            Category = request.Category,
            TargetMetric = NormalizeOptional(request.TargetMetric),
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Goals.Add(goal);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/v1/goals/{goal.Id}", Map(goal));
    }

    private static async Task<IResult> UpdateAsync(
        Guid id,
        [FromBody] UpdateGoalRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
    {
        if (ValidateDates(request.StartDate, request.EndDate) is { } error)
        {
            return error;
        }

        var userId = currentUser.UserId!.Value;
        var goal = await db.Goals.SingleOrDefaultAsync(g => g.Id == id && g.UserId == userId, ct);
        if (goal is null)
        {
            return Results.NotFound();
        }

        goal.Title = request.Title.Trim();
        goal.Description = NormalizeOptional(request.Description);
        goal.Category = request.Category;
        goal.TargetMetric = NormalizeOptional(request.TargetMetric);
        goal.StartDate = request.StartDate;
        goal.EndDate = request.EndDate;
        goal.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return Results.Ok(Map(goal));
    }

    private static async Task<IResult> DeleteAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var affected = await db.Goals.Where(g => g.Id == id && g.UserId == userId).ExecuteDeleteAsync(ct);
        return affected > 0 ? Results.NoContent() : Results.NotFound();
    }

    private static IResult? ValidateDates(DateOnly start, DateOnly? end)
    {
        if (end is not null && end.Value < start)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["endDate"] = ["EndDate must be on or after StartDate."],
            });
        }
        return null;
    }

    private static string? NormalizeOptional(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static GoalResponse Map(Goal g) => new(
        g.Id, g.Title, g.Description, g.Category, g.TargetMetric,
        g.StartDate, g.EndDate, g.CreatedAt, g.UpdatedAt);
}
