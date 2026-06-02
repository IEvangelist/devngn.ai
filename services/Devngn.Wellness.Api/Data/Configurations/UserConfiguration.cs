// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> b)
    {
        b.ToTable("users");
        b.HasKey(x => x.Id);

        b.Property(x => x.Login).IsRequired().HasMaxLength(120);
        b.Property(x => x.DisplayName).HasMaxLength(200);
        b.Property(x => x.AvatarUrl).HasMaxLength(500);

        b.HasIndex(x => x.GitHubId).IsUnique();
        b.HasIndex(x => x.Login);

        b.HasOne(x => x.Consent)
            .WithOne(x => x.User!)
            .HasForeignKey<ConsentRecord>(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne(x => x.Profile)
            .WithOne(x => x.User!)
            .HasForeignKey<Profile>(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
