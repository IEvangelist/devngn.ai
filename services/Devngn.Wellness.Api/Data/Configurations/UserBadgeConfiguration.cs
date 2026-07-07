// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class UserBadgeConfiguration : IEntityTypeConfiguration<UserBadge>
{
    public void Configure(EntityTypeBuilder<UserBadge> b)
    {
        b.ToTable("user_badges");
        b.HasKey(x => new { x.UserId, x.BadgeKey });

        b.Property(x => x.BadgeKey).HasMaxLength(80);

        b.HasOne(x => x.Badge)
            .WithMany()
            .HasForeignKey(x => x.BadgeKey)
            .HasPrincipalKey(x => x.Key)
            .OnDelete(DeleteBehavior.Cascade);

        // Consent-cascade: wiping a ConsentRecord also wipes earned badges.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => new { x.UserId, x.EarnedAt });
    }
}
