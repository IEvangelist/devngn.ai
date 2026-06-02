// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class DataProtectionKeyConfiguration : IEntityTypeConfiguration<DataProtectionKey>
{
    public void Configure(EntityTypeBuilder<DataProtectionKey> b)
    {
        b.ToTable("data_protection_keys");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).UseIdentityByDefaultColumn();
        b.Property(x => x.FriendlyName).IsRequired().HasMaxLength(200);
        b.Property(x => x.Xml).IsRequired();
        b.Property(x => x.CreatedAt).HasDefaultValueSql("now() at time zone 'utc'");

        // DataProtection generates one element per key with a stable GUID-based friendly
        // name; never expect duplicates. Catching one would mean two processes raced to
        // mint a key, in which case taking the first wins is fine — but the index makes
        // the assumption explicit.
        b.HasIndex(x => x.FriendlyName).IsUnique();
    }
}
