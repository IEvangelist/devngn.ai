// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ScheduleEventConfiguration : IEntityTypeConfiguration<ScheduleEvent>
{
    public void Configure(EntityTypeBuilder<ScheduleEvent> b)
    {
        b.ToTable("schedule_events");
        b.HasKey(x => x.Id);

        b.Property(x => x.ExternalId).HasMaxLength(200);

        b.HasOne(x => x.User)
            .WithMany(x => x.ScheduleEvents)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Same DB-level consent enforcement as the other wellness tables.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        // Composite FK to ScheduleSource(Id, UserId): the DB refuses any event whose
        // SourceId belongs to a different user than UserId. Subsumes the legacy
        // single-column FK on SourceId; that FK is dropped in the AddScheduleSourcesPhase7a
        // migration. Keep the navigation `Source` for query ergonomics.
        b.HasOne(x => x.Source)
            .WithMany(s => s.Events)
            .HasForeignKey(x => new { x.SourceId, x.UserId })
            .HasPrincipalKey(s => new { s.Id, s.UserId })
            .OnDelete(DeleteBehavior.Cascade);

        // Hot path: "give me this user's busy windows in [from, to)".
        b.HasIndex(x => new { x.UserId, x.StartUtc, x.EndUtc });

        // Idempotent ingest from external providers; for free/busy syncs the provider
        // adapters don't supply an ExternalId — those use replace-window semantics —
        // but direct-push events from CLI/extension/user use this for safe retries.
        b.HasIndex(x => new { x.SourceId, x.ExternalId })
            .IsUnique()
            .HasFilter("\"ExternalId\" IS NOT NULL");
    }
}
