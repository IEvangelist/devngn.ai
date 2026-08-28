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

        // SQL Server forbids two cascade paths from ConsentRecord to this table.
        // Consent revocation deletes both incoming and outgoing follows explicitly.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.FollowerId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.ClientCascade);

        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.FolloweeId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.ClientCascade);

        b.HasIndex(x => x.FolloweeId);
        b.HasIndex(x => x.FollowerId);
    }
}
