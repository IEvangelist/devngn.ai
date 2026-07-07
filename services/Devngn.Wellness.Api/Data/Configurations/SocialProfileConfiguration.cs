// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class SocialProfileConfiguration : IEntityTypeConfiguration<SocialProfile>
{
    public void Configure(EntityTypeBuilder<SocialProfile> b)
    {
        b.ToTable("social_profiles");
        b.HasKey(x => x.UserId);

        b.Property(x => x.DisplayName).IsRequired().HasMaxLength(80);
        b.Property(x => x.Bio).HasMaxLength(500);

        b.HasIndex(x => x.IsPublic);

        // Consent-cascade: wiping a ConsentRecord also wipes the social profile.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);
    }
}
