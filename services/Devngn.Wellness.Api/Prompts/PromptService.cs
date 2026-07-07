// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Gamification;
using Devngn.Wellness.Api.Schedule.Gaps;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Prompts;

/// <summary>
/// Default <see cref="IPromptService"/>. Scoped so it gets a fresh
/// <see cref="WellnessDbContext"/> per request / per streaming-loop iteration.
/// </summary>
internal sealed class PromptService(
    WellnessDbContext db,
    IGapDetector detector,
    IPromptMatcher matcher,
    IGamificationService gamification,
    IOptions<GapDetectionOptions> gapOptions,
    IOptions<PromptDeliveryOptions> promptOptions,
    ILogger<PromptService> logger,
    TimeProvider clock) : IPromptService
{
    public async Task<PromptResponse?> GenerateNextPromptAsync(
        Guid userId,
        DeliveryChannel channel,
        TimeZoneInfo timeZone,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(timeZone);

        var gaps = gapOptions.Value;
        var prompts = promptOptions.Value;
        var now = clock.GetUtcNow();
        var windowEnd = now + TimeSpan.FromMinutes(prompts.LookaheadMinutes);

        // Recent deliveries feed the engine's cooldown step: a just-delivered prompt
        // advances the active gap's start past the cooldown window, so the next pass
        // naturally finds no active gap until the user is eligible again.
        var cooldown = TimeSpan.FromMinutes(gaps.PromptCooldownMinutes);
        var recentDeliveries = await db.Prompts
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.DeliveredAt >= now - cooldown && p.DeliveredAt <= now)
            .OrderBy(p => p.DeliveredAt)
            .Select(p => p.DeliveredAt)
            .ToListAsync(cancellationToken);

        // Same busy-event projection the gap endpoint uses: enabled sources, busy only.
        var busyRows = await (
            from e in db.ScheduleEvents.AsNoTracking()
            join s in db.ScheduleSources.AsNoTracking() on e.SourceId equals s.Id
            where e.UserId == userId
                && e.Busy
                && s.ConnectionStatus != ScheduleSourceConnectionStatus.Disabled
                && e.EndUtc > now
                && e.StartUtc < windowEnd
            select new { e.StartUtc, e.EndUtc }
        ).ToListAsync(cancellationToken);

        var busy = busyRows.ConvertAll(r => new BusyInterval(r.StartUtc, r.EndUtc));
        var detected = detector.Detect(busy, now, windowEnd, recentDeliveries, timeZone, gaps, now);

        // The engine clips free intervals to "now", so the active gap (if any) starts
        // at now; anything starting later is in the future (or pushed out by cooldown).
        var activeGap = detected.FirstOrDefault(g => g.StartUtc <= now);
        if (activeGap is null)
        {
            return null;
        }

        var gapDurationSeconds = (int)(activeGap.EndUtc - activeGap.StartUtc).TotalSeconds;
        if (gapDurationSeconds <= 0)
        {
            return null;
        }

        var catalog = await db.Activities
            .AsNoTracking()
            .OrderBy(a => a.DurationSeconds)
            .ThenBy(a => a.Slug)
            .ToListAsync(cancellationToken);
        if (catalog.Count == 0)
        {
            return null;
        }

        var profile = await db.Profiles
            .AsNoTracking()
            .SingleOrDefaultAsync(p => p.UserId == userId, cancellationToken);

        var goals = await db.Goals
            .AsNoTracking()
            .Where(g => g.UserId == userId)
            .Select(g => g.Category)
            .ToListAsync(cancellationToken);

        var equipmentTags = await db.Equipment
            .AsNoTracking()
            .Where(eq => eq.UserId == userId)
            .Select(eq => eq.Tag)
            .ToListAsync(cancellationToken);

        var varietyWindow = TimeSpan.FromMinutes(prompts.RecentVarietyWindowMinutes);
        var recentActivityIds = await db.Prompts
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.DeliveredAt >= now - varietyWindow)
            .Select(p => p.ActivityId)
            .ToListAsync(cancellationToken);

        var equipmentSet = equipmentTags
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim().ToLowerInvariant())
            .ToHashSet(StringComparer.Ordinal);

        var context = new PromptMatchContext(
            gapDurationSeconds,
            profile,
            goals,
            equipmentSet,
            catalog,
            recentActivityIds.ToHashSet());

        var activity = matcher.Match(context);
        if (activity is null)
        {
            return null;
        }

        // NOTE (v1): the recent-delivery read above and this insert are not atomic, so
        // two simultaneous generators (e.g. an SSE stream + a POST /next) could both
        // emit a prompt for the same gap before either commits. Cooldown dedupes every
        // subsequent pass; a rare same-instant double-prompt is acceptable nag-wise and
        // not worth a per-user advisory lock at this stage.
        var prompt = new Prompt
        {
            UserId = userId,
            ActivityId = activity.Id,
            GapStartUtc = activeGap.StartUtc,
            GapEndUtc = activeGap.EndUtc,
            DeliveredAt = now,
            DeliveredVia = channel,
        };
        db.Prompts.Add(prompt);
        await db.SaveChangesAsync(cancellationToken);

        // Award gamification XP, update streak, and evaluate badges/milestones.
        // Errors here must not fail the prompt delivery — the user still gets their prompt.
        try
        {
            await gamification.AwardXpAsync(userId, 10, XpReason.PromptCompleted, cancellationToken);
            await gamification.UpdateStreakAsync(userId, DateOnly.FromDateTime(now.UtcDateTime), cancellationToken);
            await gamification.EvaluateBadgesAsync(userId, cancellationToken);
            await gamification.EvaluateMilestonesAsync(userId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gamification update failed for user {UserId}; prompt delivery unaffected.", userId);
        }

        return PromptResponse.From(prompt, activity);
    }
}
