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

        b.HasOne(x => x.User)
            .WithMany(x => x.ScheduleSources)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => new { x.UserId, x.Type });
    }
}
