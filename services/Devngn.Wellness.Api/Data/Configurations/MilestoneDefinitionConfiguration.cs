// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class MilestoneDefinitionConfiguration : IEntityTypeConfiguration<MilestoneDefinition>
{
    public void Configure(EntityTypeBuilder<MilestoneDefinition> b)
    {
        b.ToTable("milestone_definitions");
        b.HasKey(x => x.Key);

        b.Property(x => x.Key).HasMaxLength(80);
        b.Property(x => x.Name).IsRequired().HasMaxLength(120);
        b.Property(x => x.Description).IsRequired().HasMaxLength(500);

        b.HasIndex(x => x.IsHidden);
    }
}
