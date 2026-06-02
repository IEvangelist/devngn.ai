// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ConsentRecordConfiguration : IEntityTypeConfiguration<ConsentRecord>
{
    public void Configure(EntityTypeBuilder<ConsentRecord> b)
    {
        b.ToTable("consent_records");
        b.HasKey(x => x.Id);

        b.Property(x => x.Version).IsRequired().HasMaxLength(40);
        b.Property(x => x.Text).IsRequired();

        b.HasIndex(x => x.UserId).IsUnique();
    }
}
