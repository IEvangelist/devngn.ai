// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Gamification;

/// <summary>
/// On startup, upserts the canonical set of badge and milestone definitions.
/// Idempotent: existing definitions are updated only when content changes.
/// Follows the same pattern as <c>ActivityCatalogSeeder</c>.
/// </summary>
internal sealed class GamificationSeeder(
    IServiceScopeFactory scopeFactory,
    ILogger<GamificationSeeder> logger) : IHostedService
{
    private static readonly BadgeDefinition[] Badges =
    [
        new() { Key = "first-steps",       Name = "First Steps",        Description = "Complete your first wellness prompt.",             Icon = "👟", Category = "activity",  XpThreshold = 0,    IsHidden = false },
        new() { Key = "centurion",          Name = "Centurion",          Description = "Earn your first 100 XP.",                         Icon = "💯", Category = "xp",        XpThreshold = 100,  IsHidden = false },
        new() { Key = "five-hundred",       Name = "Half a Grand",       Description = "Earn 500 XP.",                                    Icon = "⭐", Category = "xp",        XpThreshold = 500,  IsHidden = false },
        new() { Key = "legend-status",      Name = "Legend Status",      Description = "Earn 5 000 XP.",                                  Icon = "🏆", Category = "xp",        XpThreshold = 5000, IsHidden = false },
        new() { Key = "goal-setter",        Name = "Goal Setter",        Description = "Create 3 wellness goals.",                        Icon = "🎯", Category = "goals",     XpThreshold = 0,    IsHidden = false },
        new() { Key = "bronze-achiever",    Name = "Bronze Achiever",    Description = "Reach level 1.",                                  Icon = "🥉", Category = "rank",      XpThreshold = 0,    IsHidden = false },
        new() { Key = "silver-achiever",    Name = "Silver Achiever",    Description = "Reach level 5.",                                  Icon = "🥈", Category = "rank",      XpThreshold = 0,    IsHidden = false },
        new() { Key = "gold-achiever",      Name = "Gold Achiever",      Description = "Reach level 10.",                                 Icon = "🥇", Category = "rank",      XpThreshold = 0,    IsHidden = false },
        new() { Key = "seven-day-streak",   Name = "Week Warrior",       Description = "Maintain a 7-day wellness streak.",               Icon = "🔥", Category = "streak",    XpThreshold = 0,    IsHidden = false },
        new() { Key = "thirty-day-streak",  Name = "Monthly Maven",      Description = "Maintain a 30-day wellness streak.",              Icon = "🌟", Category = "streak",    XpThreshold = 0,    IsHidden = false },
        // Hidden badges (anonymized until earned)
        new() { Key = "night-owl",          Name = "Night Owl",          Description = "Complete a prompt after 10 PM.",                  Icon = "🦉", Category = "hidden",    XpThreshold = 0,    IsHidden = true  },
        new() { Key = "comeback-streak",    Name = "Comeback Kid",       Description = "Return to activity after a 3+ day break.",        Icon = "💪", Category = "hidden",    XpThreshold = 0,    IsHidden = true  },
    ];

    private static readonly MilestoneDefinition[] Milestones =
    [
        new() { Key = "first-prompt",      Name = "First Prompt",       Description = "Complete your very first wellness prompt.",        IsHidden = false },
        new() { Key = "ten-prompts",       Name = "10 Prompts",         Description = "Complete 10 wellness prompts.",                    IsHidden = false },
        new() { Key = "fifty-prompts",     Name = "50 Prompts",         Description = "Complete 50 wellness prompts.",                    IsHidden = false },
        new() { Key = "hundred-prompts",   Name = "Century Club",       Description = "Complete 100 wellness prompts.",                   IsHidden = false },
        new() { Key = "first-week",        Name = "First Week",         Description = "Achieve a 7-day activity streak.",                 IsHidden = false },
        new() { Key = "social-butterfly",  Name = "Social Butterfly",   Description = "Follow 5 other wellness users.",                   IsHidden = false },
        // Hidden milestones
        new() { Key = "hidden-marathon",   Name = "Marathon Champion",  Description = "Complete 1 000 wellness prompts.",                 IsHidden = true  },
    ];

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();

        var badgeKeys = Badges.Select(b => b.Key).ToArray();
        var existingBadges = await db.BadgeDefinitions
            .Where(b => badgeKeys.Contains(b.Key))
            .ToDictionaryAsync(b => b.Key, cancellationToken);

        var insertedB = 0;
        var updatedB = 0;
        foreach (var def in Badges)
        {
            if (existingBadges.TryGetValue(def.Key, out var existing))
            {
                if (BadgeChanged(existing, def))
                {
                    ApplyBadge(def, existing);
                    updatedB++;
                }
            }
            else
            {
                db.BadgeDefinitions.Add(def);
                insertedB++;
            }
        }

        var milestoneKeys = Milestones.Select(m => m.Key).ToArray();
        var existingMilestones = await db.MilestoneDefinitions
            .Where(m => milestoneKeys.Contains(m.Key))
            .ToDictionaryAsync(m => m.Key, cancellationToken);

        var insertedM = 0;
        var updatedM = 0;
        foreach (var def in Milestones)
        {
            if (existingMilestones.TryGetValue(def.Key, out var existing))
            {
                if (MilestoneChanged(existing, def))
                {
                    ApplyMilestone(def, existing);
                    updatedM++;
                }
            }
            else
            {
                db.MilestoneDefinitions.Add(def);
                insertedM++;
            }
        }

        if (insertedB > 0 || updatedB > 0 || insertedM > 0 || updatedM > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        logger.LogInformation(
            "Gamification seeded: {BI} badges inserted, {BU} updated; {MI} milestones inserted, {MU} updated.",
            insertedB, updatedB, insertedM, updatedM);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static bool BadgeChanged(BadgeDefinition current, BadgeDefinition def) =>
        current.Name != def.Name
        || current.Description != def.Description
        || current.Icon != def.Icon
        || current.Category != def.Category
        || current.XpThreshold != def.XpThreshold
        || current.IsHidden != def.IsHidden;

    private static void ApplyBadge(BadgeDefinition def, BadgeDefinition target)
    {
        target.Name = def.Name;
        target.Description = def.Description;
        target.Icon = def.Icon;
        target.Category = def.Category;
        target.XpThreshold = def.XpThreshold;
        target.IsHidden = def.IsHidden;
    }

    private static bool MilestoneChanged(MilestoneDefinition current, MilestoneDefinition def) =>
        current.Name != def.Name
        || current.Description != def.Description
        || current.IsHidden != def.IsHidden;

    private static void ApplyMilestone(MilestoneDefinition def, MilestoneDefinition target)
    {
        target.Name = def.Name;
        target.Description = def.Description;
        target.IsHidden = def.IsHidden;
    }
}
