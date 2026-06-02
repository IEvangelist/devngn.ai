// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class EquipmentConfiguration : IEntityTypeConfiguration<Equipment>
{
    public void Configure(EntityTypeBuilder<Equipment> b)
    {
        b.ToTable("equipment");
        b.HasKey(x => x.Id);

        b.Property(x => x.Tag).IsRequired().HasMaxLength(80);
        b.Property(x => x.DisplayName).IsRequired().HasMaxLength(200);
        b.Property(x => x.Notes).HasMaxLength(2000);

        b.HasOne(x => x.User)
            .WithMany(x => x.Equipment)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // See ProfileConfiguration for the rationale on this second FK: it enforces
        // "no wellness data without a current consent record" at the database level,
        // so concurrent consent revocation cannot leave orphan equipment behind.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        // The application catches Npgsql 23505 (unique violation) keyed on this
        // constraint name to surface a clean 409 on duplicate-tag POSTs without
        // misreporting any unrelated unique violation as a duplicate tag.
        b.HasIndex(x => new { x.UserId, x.Tag })
            .IsUnique()
            .HasDatabaseName("ix_equipment_user_id_tag");
    }
}
