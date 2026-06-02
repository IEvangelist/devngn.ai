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

        b.HasOne(x => x.Source)
            .WithMany(x => x.Events)
            .HasForeignKey(x => x.SourceId)
            .OnDelete(DeleteBehavior.Cascade);

        // Hot path: "give me this user's busy windows in [from, to)".
        b.HasIndex(x => new { x.UserId, x.StartUtc, x.EndUtc });

        // Idempotent ingest from external providers.
        b.HasIndex(x => new { x.SourceId, x.ExternalId })
            .IsUnique()
            .HasFilter("\"ExternalId\" IS NOT NULL");
    }
}
