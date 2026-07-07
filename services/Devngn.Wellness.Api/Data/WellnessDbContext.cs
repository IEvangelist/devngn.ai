// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Data;

/// <summary>
/// EF Core <see cref="DbContext"/> for the wellness service. All tables live under the
/// <c>wellness</c> Postgres schema and snake_case naming is left to per-entity config.
/// </summary>
public sealed class WellnessDbContext(DbContextOptions<WellnessDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<ConsentRecord> ConsentRecords => Set<ConsentRecord>();

    public DbSet<Profile> Profiles => Set<Profile>();

    public DbSet<Goal> Goals => Set<Goal>();

    public DbSet<Equipment> Equipment => Set<Equipment>();

    public DbSet<ScheduleSource> ScheduleSources => Set<ScheduleSource>();

    public DbSet<ScheduleEvent> ScheduleEvents => Set<ScheduleEvent>();

    public DbSet<Activity> Activities => Set<Activity>();

    public DbSet<Prompt> Prompts => Set<Prompt>();

    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    public DbSet<ScheduleOAuthState> ScheduleOAuthStates => Set<ScheduleOAuthState>();

    // Gamification
    public DbSet<XpEvent> XpEvents => Set<XpEvent>();

    public DbSet<PlayerState> PlayerStates => Set<PlayerState>();

    public DbSet<BadgeDefinition> BadgeDefinitions => Set<BadgeDefinition>();

    public DbSet<UserBadge> UserBadges => Set<UserBadge>();

    public DbSet<MilestoneDefinition> MilestoneDefinitions => Set<MilestoneDefinition>();

    public DbSet<UserMilestone> UserMilestones => Set<UserMilestone>();

    // Social
    public DbSet<SocialProfile> SocialProfiles => Set<SocialProfile>();

    public DbSet<Follow> Follows => Set<Follow>();

    public DbSet<ActivityFeedItem> ActivityFeedItems => Set<ActivityFeedItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasDefaultSchema("wellness");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WellnessDbContext).Assembly);
    }
}
