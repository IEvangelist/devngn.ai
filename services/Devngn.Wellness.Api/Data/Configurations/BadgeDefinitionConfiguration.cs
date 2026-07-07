// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class BadgeDefinitionConfiguration : IEntityTypeConfiguration<BadgeDefinition>
{
    public void Configure(EntityTypeBuilder<BadgeDefinition> b)
    {
        b.ToTable("badge_definitions");
        b.HasKey(x => x.Key);

        b.Property(x => x.Key).HasMaxLength(80);
        b.Property(x => x.Name).IsRequired().HasMaxLength(120);
        b.Property(x => x.Description).IsRequired().HasMaxLength(500);
        b.Property(x => x.Icon).IsRequired().HasMaxLength(80);
        b.Property(x => x.Category).IsRequired().HasMaxLength(60);

        b.HasIndex(x => x.IsHidden);
    }
}
