// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Catalog;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Validation;
using EquipmentEntity = Devngn.Wellness.Api.Data.Entities.Equipment;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Devngn.Wellness.Api.EquipmentApi;

internal static class EquipmentEndpoints
{
    /// <summary>EF-generated index name for (UserId, Tag) uniqueness; see EquipmentConfiguration.</summary>
    public const string UniqueTagIndexName = "ix_equipment_user_id_tag";

    public static IEndpointRouteBuilder MapEquipmentEndpoints(this IEndpointRouteBuilder app)
    {
        // Curated, registerable gear list. Pure static metadata (no per-user data), so it
        // sits outside the consent gate: a user setting up for the first time can browse it.
        app.MapGet("/v1/equipment/catalog", ListCatalogAsync)
            .RequireAuthorization()
            .WithTags("Equipment")
            .Produces<IReadOnlyList<EquipmentCatalogEntryResponse>>()
            .WithName("ListEquipmentCatalog");

        var group = app.MapGroup("/v1/equipment")
            .WithTags("Equipment")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("", ListAsync)
            .Produces<IReadOnlyList<EquipmentResponse>>()
            .WithName("ListEquipment");
        group.MapGet("{id:guid}", GetAsync)
            .Produces<EquipmentResponse>()
            .Produces(StatusCodes.Status404NotFound)
            .WithName("GetEquipment");
        group.MapPost("", CreateAsync)
            .ValidateBody<RouteHandlerBuilder, CreateEquipmentRequest>()
            .Produces<EquipmentResponse>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status409Conflict)
            .ProducesValidationProblem()
            .WithName("CreateEquipment");
        group.MapPut("{id:guid}", UpdateAsync)
            .ValidateBody<RouteHandlerBuilder, UpdateEquipmentRequest>()
            .Produces<EquipmentResponse>()
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .WithName("UpdateEquipment");
        group.MapDelete("{id:guid}", DeleteAsync)
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound)
            .WithName("DeleteEquipment");

        return app;
    }

    private static async Task<IResult> ListCatalogAsync(
        IEquipmentCatalogProvider catalog,
        CancellationToken ct)
    {
        var items = await catalog.GetCatalogAsync(ct);
        var result = new List<EquipmentCatalogEntryResponse>(items.Count);
        foreach (var e in items)
        {
            result.Add(new EquipmentCatalogEntryResponse(
                e.Tag,
                e.DisplayName,
                e.Category,
                e.Description,
                e.RecommendedWeeklySessions,
                e.MinSessionMinutes));
        }
        return Results.Ok(result);
    }

    private static async Task<IResult> ListAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var rows = await db.Equipment
            .AsNoTracking()
            .Where(e => e.UserId == userId)
            .OrderBy(e => e.Tag)
            .Select(e => Map(e))
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
        var item = await db.Equipment
            .AsNoTracking()
            .Where(e => e.Id == id && e.UserId == userId)
            .Select(e => Map(e))
            .SingleOrDefaultAsync(ct);
        return item is null ? Results.NotFound() : Results.Ok(item);
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] CreateEquipmentRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var entity = new EquipmentEntity
        {
            UserId = userId,
            Tag = request.Tag.Trim(),
            DisplayName = request.DisplayName.Trim(),
            Notes = NormalizeOptional(request.Notes),
            CreatedAt = clock.GetUtcNow(),
        };
        db.Equipment.Add(entity);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsDuplicateTagViolation(ex))
        {
            return Results.Conflict(new
            {
                error = "duplicate_tag",
                message = $"Equipment tag '{entity.Tag}' is already registered for this user.",
            });
        }

        return Results.Created($"/v1/equipment/{entity.Id}", Map(entity));
    }

    private static async Task<IResult> UpdateAsync(
        Guid id,
        [FromBody] UpdateEquipmentRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var entity = await db.Equipment.SingleOrDefaultAsync(e => e.Id == id && e.UserId == userId, ct);
        if (entity is null)
        {
            return Results.NotFound();
        }

        // Tag is the user-facing stable identifier the catalog matcher keys off; rotating
        // tags via PUT would invalidate prompt history. Use POST + DELETE to "rename" one.
        entity.DisplayName = request.DisplayName.Trim();
        entity.Notes = NormalizeOptional(request.Notes);
        await db.SaveChangesAsync(ct);
        return Results.Ok(Map(entity));
    }

    private static async Task<IResult> DeleteAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var affected = await db.Equipment.Where(e => e.Id == id && e.UserId == userId).ExecuteDeleteAsync(ct);
        return affected > 0 ? Results.NoContent() : Results.NotFound();
    }

    private static bool IsDuplicateTagViolation(DbUpdateException ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            if (current is PostgresException pg &&
                pg.SqlState == "23505" &&
                string.Equals(pg.ConstraintName, UniqueTagIndexName, StringComparison.Ordinal))
            {
                return true;
            }
        }
        return false;
    }

    private static string? NormalizeOptional(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static EquipmentResponse Map(EquipmentEntity e) => new(
        e.Id, e.Tag, e.DisplayName, e.Notes, e.CreatedAt);
}

/// <summary>Wire shape for one entry in <c>GET /v1/equipment/catalog</c>.</summary>
public sealed record EquipmentCatalogEntryResponse(
    string Tag,
    string DisplayName,
    EquipmentCategory Category,
    string? Description,
    int? RecommendedWeeklySessions,
    int? MinSessionMinutes);
