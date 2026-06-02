// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Integration;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class DomainPersistenceTests(PostgresContainerFixture fixture)
{
    [Fact]
    public async Task User_with_consent_profile_goal_equipment_and_schedule_roundtrips()
    {
        await using var ctx = fixture.CreateContext();

        var user = NewUser();
        user.Consent = new ConsentRecord { Version = "1.0", Text = "I agree.", AcceptedAt = DateTimeOffset.UtcNow };
        user.Profile = new Profile
        {
            AgeRange = "30-39",
            HeightCm = 178.50m,
            WeightKg = 81.25m,
            FitnessBaseline = FitnessBaseline.Moderate,
            PreferredIntensity = IntensityLevel.Medium,
            Limitations = "low-impact knees",
            TimeOfDayPreference = "morning,afternoon",
        };
        user.Goals.Add(new Goal
        {
            Title = "10 mobility breaks per day",
            Category = GoalCategory.Mobility,
            TargetMetric = "10/day",
            StartDate = new DateOnly(2026, 1, 1),
        });
        user.Equipment.Add(new Equipment { Tag = "mat", DisplayName = "Yoga mat" });
        user.Equipment.Add(new Equipment { Tag = "standing-desk", DisplayName = "Standing desk" });

        var source = new ScheduleSource
        {
            UserId = user.Id,
            Type = ScheduleSourceType.User,
            DisplayName = "Local push",
        };
        user.ScheduleSources.Add(source);

        ctx.Users.Add(user);
        await ctx.SaveChangesAsync();

        ctx.ScheduleEvents.Add(new ScheduleEvent
        {
            UserId = user.Id,
            SourceId = source.Id,
            StartUtc = new DateTimeOffset(2026, 6, 1, 14, 0, 0, TimeSpan.Zero),
            EndUtc = new DateTimeOffset(2026, 6, 1, 14, 30, 0, TimeSpan.Zero),
            Busy = true,
        });
        await ctx.SaveChangesAsync();

        await using var ctx2 = fixture.CreateContext();
        var stored = await ctx2.Users
            .Include(x => x.Consent)
            .Include(x => x.Profile)
            .Include(x => x.Goals)
            .Include(x => x.Equipment)
            .Include(x => x.ScheduleSources)
                .ThenInclude(s => s.Events)
            .SingleAsync(x => x.Id == user.Id);

        Assert.Equal("1.0", stored.Consent!.Version);
        Assert.Equal(FitnessBaseline.Moderate, stored.Profile!.FitnessBaseline);
        Assert.Equal(178.50m, stored.Profile.HeightCm);
        Assert.Single(stored.Goals);
        Assert.Equal(2, stored.Equipment.Count);
        Assert.Single(stored.ScheduleSources);
        Assert.Single(stored.ScheduleSources.Single().Events);
    }

    [Fact]
    public async Task Activity_persists_equipment_tags_as_text_array_and_enforces_unique_slug()
    {
        await using var ctx = fixture.CreateContext();

        var slug = $"shoulder-rolls-{Guid.NewGuid():N}";
        ctx.Activities.Add(new Activity
        {
            Slug = slug,
            Title = "Shoulder rolls",
            Description = "Roll shoulders backward then forward in a slow circle.",
            BodyArea = BodyArea.Upper,
            Intensity = IntensityLevel.Low,
            DurationSeconds = 5,
            EquipmentTags = ["chair-only"],
            AnimationProvider = "local",
            AnimationAssetId = "shoulder-rolls.svg",
        });
        await ctx.SaveChangesAsync();

        var stored = await ctx.Activities.SingleAsync(x => x.Slug == slug);
        Assert.Equal(["chair-only"], stored.EquipmentTags);

        await using var ctx2 = fixture.CreateContext();
        ctx2.Activities.Add(new Activity
        {
            Slug = slug,
            Title = "Shoulder rolls duplicate",
            Description = "Duplicate slug should be rejected.",
            BodyArea = BodyArea.Upper,
            Intensity = IntensityLevel.Low,
            DurationSeconds = 5,
            EquipmentTags = [],
            AnimationProvider = "local",
            AnimationAssetId = "x",
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => ctx2.SaveChangesAsync());
    }

    [Fact]
    public async Task Equipment_per_user_tag_is_unique()
    {
        await using var ctx = fixture.CreateContext();
        var user = NewUser();
        user.Consent = new ConsentRecord { Version = "1.0", Text = "ok" };
        user.Equipment.Add(new Equipment { Tag = "mat", DisplayName = "Yoga mat" });
        user.Equipment.Add(new Equipment { Tag = "mat", DisplayName = "Duplicate" });
        ctx.Users.Add(user);

        await Assert.ThrowsAsync<DbUpdateException>(() => ctx.SaveChangesAsync());
    }

    [Fact]
    public async Task Equipment_without_consent_record_violates_foreign_key()
    {
        // The dual-FK schema (Equipment.UserId references both User.Id and
        // ConsentRecord.UserId) is what guarantees we never accumulate wellness data
        // for a user who has not — or has just revoked — consent. The endpoint layer
        // returns a friendly 403 before reaching this; this test pins the DB invariant.
        await using var ctx = fixture.CreateContext();
        var user = NewUser();
        ctx.Users.Add(user);
        await ctx.SaveChangesAsync();

        ctx.Equipment.Add(new Equipment { UserId = user.Id, Tag = "mat", DisplayName = "Yoga mat" });
        await Assert.ThrowsAsync<DbUpdateException>(() => ctx.SaveChangesAsync());
    }

    [Fact]
    public async Task Deleting_consent_cascades_to_profile_goals_and_equipment_but_leaves_user()
    {
        await using var ctx = fixture.CreateContext();

        var user = NewUser();
        user.Consent = new ConsentRecord { Version = "1.0", Text = "ok" };
        user.Profile = new Profile { FitnessBaseline = FitnessBaseline.Light };
        user.Goals.Add(new Goal { Title = "g", Category = GoalCategory.Posture, StartDate = new DateOnly(2026, 1, 1) });
        user.Equipment.Add(new Equipment { Tag = "mat", DisplayName = "Yoga mat" });
        ctx.Users.Add(user);
        await ctx.SaveChangesAsync();

        var consent = await ctx.ConsentRecords.SingleAsync(c => c.UserId == user.Id);
        ctx.ConsentRecords.Remove(consent);
        await ctx.SaveChangesAsync();

        await using var verify = fixture.CreateContext();
        Assert.NotNull(await verify.Users.SingleOrDefaultAsync(x => x.Id == user.Id));
        Assert.False(await verify.ConsentRecords.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.Profiles.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.Goals.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.Equipment.AnyAsync(x => x.UserId == user.Id));
    }

    [Fact]
    public async Task GitHub_id_is_unique_across_users()
    {
        await using var ctx = fixture.CreateContext();
        var sharedGitHubId = Random.Shared.NextInt64(1_000_000, long.MaxValue);
        ctx.Users.Add(NewUser(sharedGitHubId));
        ctx.Users.Add(NewUser(sharedGitHubId));

        await Assert.ThrowsAsync<DbUpdateException>(() => ctx.SaveChangesAsync());
    }

    [Fact]
    public async Task Deleting_user_cascades_to_consent_profile_goals_equipment_sources_and_events()
    {
        await using var ctx = fixture.CreateContext();

        var user = NewUser();
        user.Consent = new ConsentRecord { Version = "1.0", Text = "ok" };
        user.Profile = new Profile { FitnessBaseline = FitnessBaseline.Light };
        user.Goals.Add(new Goal { Title = "g", Category = GoalCategory.Posture, StartDate = new DateOnly(2026, 1, 1) });
        user.Equipment.Add(new Equipment { Tag = "mat", DisplayName = "Yoga mat" });

        var source = new ScheduleSource { UserId = user.Id, Type = ScheduleSourceType.User, DisplayName = "Local" };
        user.ScheduleSources.Add(source);
        ctx.Users.Add(user);
        await ctx.SaveChangesAsync();

        ctx.ScheduleEvents.Add(new ScheduleEvent
        {
            UserId = user.Id,
            SourceId = source.Id,
            StartUtc = DateTimeOffset.UtcNow,
            EndUtc = DateTimeOffset.UtcNow.AddMinutes(15),
        });
        await ctx.SaveChangesAsync();

        ctx.Users.Remove(user);
        await ctx.SaveChangesAsync();

        await using var verify = fixture.CreateContext();
        Assert.Null(await verify.Users.SingleOrDefaultAsync(x => x.Id == user.Id));
        Assert.False(await verify.ConsentRecords.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.Profiles.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.Goals.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.Equipment.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.ScheduleSources.AnyAsync(x => x.UserId == user.Id));
        Assert.False(await verify.ScheduleEvents.AnyAsync(x => x.UserId == user.Id));
    }

    [Fact]
    public async Task ScheduleEvent_schema_does_not_contain_title_or_body_columns()
    {
        await using var conn = new NpgsqlConnection(fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            "SELECT column_name FROM information_schema.columns " +
            "WHERE table_schema = 'wellness' AND table_name = 'schedule_events'";

        var columns = new List<string>();
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                columns.Add(reader.GetString(0));
            }
        }

        Assert.NotEmpty(columns);
        Assert.DoesNotContain("title", columns, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("body", columns, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("description", columns, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("subject", columns, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("attendees", columns, StringComparer.OrdinalIgnoreCase);
    }

    private static User NewUser(long? gitHubId = null) => new()
    {
        GitHubId = gitHubId ?? Random.Shared.NextInt64(1, long.MaxValue),
        Login = $"dev-{Guid.NewGuid():N}",
        DisplayName = "Test Dev",
    };
}
