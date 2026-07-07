// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class FollowConfiguration : IEntityTypeConfiguration<Follow>
{
    public void Configure(EntityTypeBuilder<Follow> b)
    {
        b.ToTable("follows");
        b.HasKey(x => new { x.FollowerId, x.FolloweeId });

        // Consent-cascade on the follower side; the followee side uses cascade too
        // so revoking either party's consent removes the relationship.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.FollowerId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.FolloweeId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => x.FolloweeId);
        b.HasIndex(x => x.FollowerId);
    }
}
