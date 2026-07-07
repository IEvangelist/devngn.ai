// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class XpEventConfiguration : IEntityTypeConfiguration<XpEvent>
{
    public void Configure(EntityTypeBuilder<XpEvent> b)
    {
        b.ToTable("xp_events");
        b.HasKey(x => x.Id);

        b.Property(x => x.Reason).HasConversion<string>().HasMaxLength(40);

        // Consent-cascade: wiping a ConsentRecord also wipes all XP history.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => new { x.UserId, x.CreatedAt });
    }
}
