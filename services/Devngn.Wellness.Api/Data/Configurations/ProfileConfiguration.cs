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

        b.HasOne(x => x.User)
            .WithOne(x => x.Profile)
            .HasForeignKey<Profile>(x => x.UserId)
            .HasPrincipalKey<User>(x => x.Id)
            .OnDelete(DeleteBehavior.Cascade);

        // Second FK on the same user_id column points at ConsentRecord.UserId.
        // Deleting a ConsentRecord (consent revocation) cascades to wipe the Profile,
        // and inserts after revocation fail the FK check even if a stale auth filter
        // had previously waved the request through.
        b.HasOne<ConsentRecord>()
            .WithOne()
            .HasForeignKey<Profile>(x => x.UserId)
            .HasPrincipalKey<ConsentRecord>(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
