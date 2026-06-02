// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ActivityConfiguration : IEntityTypeConfiguration<Activity>
{
    public void Configure(EntityTypeBuilder<Activity> b)
    {
        b.ToTable("activities");
        b.HasKey(x => x.Id);

        b.Property(x => x.Slug).IsRequired().HasMaxLength(120);
        b.Property(x => x.Title).IsRequired().HasMaxLength(200);
        b.Property(x => x.Description).IsRequired().HasMaxLength(2000);
        b.Property(x => x.BodyArea).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.Intensity).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.AnimationProvider).IsRequired().HasMaxLength(80);
        b.Property(x => x.AnimationAssetId).IsRequired().HasMaxLength(200);
        b.Property(x => x.LicenseAttribution).HasMaxLength(500);

        // Npgsql maps string[] natively to PostgreSQL text[].
        b.Property(x => x.EquipmentTags).HasColumnType("text[]");

        b.HasIndex(x => x.Slug).IsUnique();
        b.HasIndex(x => new { x.BodyArea, x.Intensity });
    }
}
