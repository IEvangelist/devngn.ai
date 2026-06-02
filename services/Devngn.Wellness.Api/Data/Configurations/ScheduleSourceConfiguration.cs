// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ScheduleSourceConfiguration : IEntityTypeConfiguration<ScheduleSource>
{
    public void Configure(EntityTypeBuilder<ScheduleSource> b)
    {
        b.ToTable("schedule_sources");
        b.HasKey(x => x.Id);

        b.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.DisplayName).IsRequired().HasMaxLength(200);
        b.Property(x => x.CredentialRef).HasMaxLength(200);
        b.Property(x => x.ProtectedRefreshToken).HasMaxLength(8000);
        b.Property(x => x.Scope).HasMaxLength(2000);
        b.Property(x => x.LastSyncErrorCode).HasMaxLength(80);
        b.Property(x => x.ConnectionStatus).HasConversion<string>().HasMaxLength(30);

        b.HasOne(x => x.User)
            .WithMany(x => x.ScheduleSources)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Same DB-level consent enforcement as Profile/Goal/Equipment (see
        // ProfileConfiguration). Revoking consent therefore cascade-deletes a user's
        // schedule sources (and via them all their events) even if a concurrent sync
        // pass slips through the application-level consent gate.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => new { x.UserId, x.Type });

        // Alternate key targeting (Id, UserId) so ScheduleEvent can declare a composite
        // FK back to (SourceId, UserId). The DB then refuses any event whose source
        // belongs to a different user — a single-column FK on SourceId alone cannot
        // express that invariant.
        b.HasAlternateKey(x => new { x.Id, x.UserId });
    }
}
