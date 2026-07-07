// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class PlayerStateConfiguration : IEntityTypeConfiguration<PlayerState>
{
    public void Configure(EntityTypeBuilder<PlayerState> b)
    {
        b.ToTable("player_states");
        b.HasKey(x => x.UserId);

        b.Property<uint>("xmin").IsRowVersion();
        b.Property(x => x.RankTier).HasConversion<string>().HasMaxLength(20);

        // Consent-cascade: wiping a ConsentRecord also wipes the player state.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);
    }
}
