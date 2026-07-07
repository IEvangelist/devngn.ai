// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ActivityFeedItemConfiguration : IEntityTypeConfiguration<ActivityFeedItem>
{
    public void Configure(EntityTypeBuilder<ActivityFeedItem> b)
    {
        b.ToTable("activity_feed_items");
        b.HasKey(x => x.Id);

        b.Property(x => x.Type).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.Message).IsRequired().HasMaxLength(500);

        // Metadata stored as PostgreSQL jsonb for schema flexibility.
        b.Property(x => x.Metadata).HasColumnType("jsonb");

        // Consent-cascade: wiping a ConsentRecord also wipes feed history.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => new { x.UserId, x.CreatedAt });
    }
}
