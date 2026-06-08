// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Diagnostics;
using Devngn.Wellness.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.MigrationWorker;

/// <summary>
/// Applies pending EF Core migrations to the wellness Postgres database, then
/// signals the host to stop. The Aspire AppHost wires the API resource to
/// <c>waitForCompletion</c> on this worker so the API only starts after the
/// schema is up-to-date.
/// </summary>
public sealed class MigrationWorker(
    IServiceProvider serviceProvider,
    IHostApplicationLifetime hostApplicationLifetime,
    ILogger<MigrationWorker> logger) : BackgroundService
{
    public const string ActivitySourceName = "Devngn.Wellness.MigrationWorker";

    private static readonly ActivitySource s_activitySource = new(ActivitySourceName);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var activity = s_activitySource.StartActivity(
            "Migrating wellness database", ActivityKind.Client);

        try
        {
            await using var scope = serviceProvider.CreateAsyncScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();

            await RunMigrationAsync(dbContext, logger, stoppingToken);
        }
        catch (Exception ex)
        {
            activity?.AddException(ex);
            logger.LogError(ex, "Failed to apply wellness database migrations.");
            throw;
        }

        hostApplicationLifetime.StopApplication();
    }

    private static async Task RunMigrationAsync(
        WellnessDbContext dbContext,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        // Execution strategy wraps the migration in the configured retry policy
        // so transient Postgres errors during cold-start don't fail the worker.
        var strategy = dbContext.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            var pending = await dbContext.Database.GetPendingMigrationsAsync(cancellationToken);
            var pendingList = pending.ToList();

            if (pendingList.Count == 0)
            {
                logger.LogInformation("No pending wellness migrations to apply.");
                return;
            }

            logger.LogInformation(
                "Applying {Count} pending wellness migration(s): {Migrations}",
                pendingList.Count,
                string.Join(", ", pendingList));

            await dbContext.Database.MigrateAsync(cancellationToken);

            logger.LogInformation("Wellness migrations applied successfully.");
        });
    }
}
