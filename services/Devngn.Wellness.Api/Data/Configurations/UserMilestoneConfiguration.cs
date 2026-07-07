// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class UserMilestoneConfiguration : IEntityTypeConfiguration<UserMilestone>
{
    public void Configure(EntityTypeBuilder<UserMilestone> b)
    {
        b.ToTable("user_milestones");
        b.HasKey(x => new { x.UserId, x.MilestoneKey });

        b.Property(x => x.MilestoneKey).HasMaxLength(80);

        b.HasOne(x => x.Milestone)
            .WithMany()
            .HasForeignKey(x => x.MilestoneKey)
            .HasPrincipalKey(x => x.Key)
            .OnDelete(DeleteBehavior.Cascade);

        // Consent-cascade: wiping a ConsentRecord also wipes achieved milestones.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);
    }
}
