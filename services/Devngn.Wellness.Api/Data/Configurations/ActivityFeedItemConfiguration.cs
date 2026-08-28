// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Devngn.Wellness.Api.Data.Configurations;

internal sealed class ActivityFeedItemConfiguration : IEntityTypeConfiguration<ActivityFeedItem>
{
    private static readonly ValueComparer<System.Text.Json.JsonDocument?> MetadataComparer = new(
        (a, b) => Serialize(a) == Serialize(b),
        value => GetJsonHashCode(value),
        value => Deserialize(Serialize(value)));

    public void Configure(EntityTypeBuilder<ActivityFeedItem> b)
    {
        b.ToTable("activity_feed_items");
        b.HasKey(x => x.Id);

        b.Property(x => x.Type).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.Message).IsRequired().HasMaxLength(500);

        var metadata = b.Property(x => x.Metadata)
            .HasColumnType("nvarchar(max)")
            .HasConversion(
                value => Serialize(value),
                value => Deserialize(value));
        metadata.Metadata.SetValueComparer(MetadataComparer);

        // Consent-cascade: wiping a ConsentRecord also wipes feed history.
        b.HasOne<ConsentRecord>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .HasPrincipalKey(nameof(ConsentRecord.UserId))
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => new { x.UserId, x.CreatedAt });
    }

    private static string? Serialize(System.Text.Json.JsonDocument? value) =>
        value?.RootElement.GetRawText();

    private static int GetJsonHashCode(System.Text.Json.JsonDocument? value)
    {
        var json = Serialize(value);
        return json is null ? 0 : StringComparer.Ordinal.GetHashCode(json);
    }

    private static System.Text.Json.JsonDocument? Deserialize(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : System.Text.Json.JsonDocument.Parse(value);
}
