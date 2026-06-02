// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class PromptConfiguration : IEntityTypeConfiguration<Prompt>
{
    public void Configure(EntityTypeBuilder<Prompt> b)
    {
        b.ToTable("prompts");
        b.HasKey(x => x.Id);

        b.Property(x => x.DeliveredVia).HasConversion<string>().HasMaxLength(20);

        b.HasOne(x => x.User)
            .WithMany(x => x.Prompts)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne(x => x.Activity)
            .WithMany()
            .HasForeignKey(x => x.ActivityId)
            .OnDelete(DeleteBehavior.Restrict);

        // Cooldown / nag-fatigue checks scan recent prompts per user.
        b.HasIndex(x => new { x.UserId, x.DeliveredAt });
    }
}
