// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ScheduleOAuthStateConfiguration : IEntityTypeConfiguration<ScheduleOAuthState>
{
    public void Configure(EntityTypeBuilder<ScheduleOAuthState> b)
    {
        b.ToTable("schedule_oauth_states");
        b.HasKey(x => x.State);

        b.Property(x => x.State).HasMaxLength(128);
        b.Property(x => x.Provider).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.CodeVerifier).IsRequired().HasMaxLength(200);
        b.Property(x => x.ReturnPath).IsRequired().HasMaxLength(2000);

        // Used by the periodic-cleanup job (future) and by callback lookups that need
        // to bail out cleanly on expired state.
        b.HasIndex(x => x.ExpiresAt);

        // Tie the state record to the user that initiated the flow so a deleted user
        // can't leave orphaned state behind. Cascade on User delete; do not cascade
        // from ConsentRecord here — OAuth state for a future profile is conceptually
        // fine to keep around for the ~10 minutes it lives.
        b.HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
