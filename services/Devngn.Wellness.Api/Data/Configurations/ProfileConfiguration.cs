// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ProfileConfiguration : IEntityTypeConfiguration<Profile>
{
    public void Configure(EntityTypeBuilder<Profile> b)
    {
        b.ToTable("profiles");
        b.HasKey(x => x.Id);

        b.Property(x => x.AgeRange).HasMaxLength(20);
        b.Property(x => x.HeightCm).HasColumnType("decimal(5,2)");
        b.Property(x => x.WeightKg).HasColumnType("decimal(5,2)");
        b.Property(x => x.Limitations).HasMaxLength(2000);
        b.Property(x => x.TimeOfDayPreference).HasMaxLength(200);
        b.Property(x => x.FitnessBaseline).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.PreferredIntensity).HasConversion<string>().HasMaxLength(20);

        b.HasIndex(x => x.UserId).IsUnique();
    }
}
