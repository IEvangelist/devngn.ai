// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Reflection;
using System.Text;
using Devngn.Wellness.Api.Catalog;
using Devngn.Wellness.Api.Data.Entities;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Catalog;

/// <summary>
/// Pure unit tests for <see cref="EmbeddedActivityCatalogProvider"/>. The default
/// constructor pulls from the production embedded JSON; the assembly-injected
/// overload lets us stand up a synthetic in-memory assembly with hand-crafted
/// resources to exercise the validation rules.
/// </summary>
public sealed class EmbeddedActivityCatalogProviderTests
{
    [Fact]
    public async Task Production_catalog_is_non_empty_and_uniquely_slugged()
    {
        var provider = new EmbeddedActivityCatalogProvider();
        var rows = await provider.GetCatalogAsync(CancellationToken.None);

        Assert.NotEmpty(rows);
        Assert.Equal(rows.Count, rows.Select(r => r.Slug).Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public async Task Production_catalog_entries_all_have_required_fields()
    {
        var provider = new EmbeddedActivityCatalogProvider();
        var rows = await provider.GetCatalogAsync(CancellationToken.None);

        Assert.All(rows, r =>
        {
            Assert.False(string.IsNullOrWhiteSpace(r.Title));
            Assert.False(string.IsNullOrWhiteSpace(r.Description));
            Assert.False(string.IsNullOrWhiteSpace(r.AnimationProvider));
            Assert.False(string.IsNullOrWhiteSpace(r.AnimationAssetId));
            Assert.True(r.DurationSeconds > 0);
            Assert.NotNull(r.EquipmentTags);
        });
    }

    [Fact]
    public async Task Production_catalog_is_idempotent_across_reads()
    {
        var provider = new EmbeddedActivityCatalogProvider();
        var first = await provider.GetCatalogAsync(CancellationToken.None);
        var second = await provider.GetCatalogAsync(CancellationToken.None);
        Assert.Same(first, second);
    }

    [Fact]
    public async Task Missing_resource_throws_with_helpful_message()
    {
        var provider = new EmbeddedActivityCatalogProvider(typeof(string).Assembly);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.Contains("catalog.json", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Empty_array_throws()
    {
        var provider = ProviderFor("[]");
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.Contains("empty list", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Invalid_json_throws_with_inner_exception()
    {
        var provider = ProviderFor("{not json}");
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.IsType<System.Text.Json.JsonException>(ex.InnerException);
    }

    [Fact]
    public async Task Non_kebab_slug_throws()
    {
        var json = """
        [{
          "slug": "Bad_Slug",
          "title": "x", "description": "x",
          "bodyArea": "Neck", "intensity": "Low",
          "durationSeconds": 10, "equipmentTags": [],
          "animationProvider": "local", "animationAssetId": "x",
          "licenseAttribution": null
        }]
        """;
        var provider = ProviderFor(json);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.Contains("lower-kebab", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Duplicate_slug_throws()
    {
        var json = """
        [
         {"slug":"a-b","title":"x","description":"x","bodyArea":"Neck","intensity":"Low","durationSeconds":10,"equipmentTags":[],"animationProvider":"local","animationAssetId":"x","licenseAttribution":null},
         {"slug":"a-b","title":"y","description":"y","bodyArea":"Neck","intensity":"Low","durationSeconds":10,"equipmentTags":[],"animationProvider":"local","animationAssetId":"y","licenseAttribution":null}
        ]
        """;
        var provider = ProviderFor(json);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.Contains("duplicated", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Non_positive_duration_throws()
    {
        var json = """
        [{"slug":"x","title":"x","description":"x","bodyArea":"Neck","intensity":"Low","durationSeconds":0,"equipmentTags":[],"animationProvider":"local","animationAssetId":"x","licenseAttribution":null}]
        """;
        var provider = ProviderFor(json);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.Contains("DurationSeconds", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Bad_equipment_tag_throws()
    {
        var json = """
        [{"slug":"x","title":"x","description":"x","bodyArea":"Neck","intensity":"Low","durationSeconds":10,"equipmentTags":["BAD_TAG"],"animationProvider":"local","animationAssetId":"x","licenseAttribution":null}]
        """;
        var provider = ProviderFor(json);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.Contains("equipment tag", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Missing_required_string_throws()
    {
        var json = """
        [{"slug":"x","title":" ","description":"x","bodyArea":"Neck","intensity":"Low","durationSeconds":10,"equipmentTags":[],"animationProvider":"local","animationAssetId":"x","licenseAttribution":null}]
        """;
        var provider = ProviderFor(json);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        Assert.Contains("Title", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Body_area_is_string_enum_not_integer()
    {
        // Integer enum values must be rejected — the provider opts out of
        // allowIntegerValues so the catalog can grow safely without ordinals shifting.
        var json = """
        [{"slug":"x","title":"x","description":"x","bodyArea":0,"intensity":"Low","durationSeconds":10,"equipmentTags":[],"animationProvider":"local","animationAssetId":"x","licenseAttribution":null}]
        """;
        var provider = ProviderFor(json);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await provider.GetCatalogAsync(CancellationToken.None));
        // JsonException wraps to InvalidOperationException via the provider.
        Assert.IsType<System.Text.Json.JsonException>(ex.InnerException);
    }

    [Fact]
    public async Task Empty_equipment_tags_array_is_allowed()
    {
        var json = """
        [{"slug":"x","title":"x","description":"x","bodyArea":"Neck","intensity":"Low","durationSeconds":10,"equipmentTags":[],"animationProvider":"local","animationAssetId":"x","licenseAttribution":null}]
        """;
        var provider = ProviderFor(json);
        var rows = await provider.GetCatalogAsync(CancellationToken.None);
        var row = Assert.Single(rows);
        Assert.Empty(row.EquipmentTags);
        Assert.Equal(BodyArea.Neck, row.BodyArea);
        Assert.Equal(IntensityLevel.Low, row.Intensity);
    }

    private static EmbeddedActivityCatalogProvider ProviderFor(string json)
    {
        var assembly = new InMemoryResourceAssembly("Devngn.Wellness.Api.Catalog.catalog.json", json);
        return new EmbeddedActivityCatalogProvider(assembly);
    }

    /// <summary>
    /// Minimal <see cref="Assembly"/> override that returns a hand-crafted stream
    /// for a single manifest resource name. The real provider only calls
    /// <see cref="Assembly.GetManifestResourceStream(string)"/>, so we don't need
    /// to fake the rest of the surface.
    /// </summary>
    private sealed class InMemoryResourceAssembly(string resourceName, string contents) : Assembly
    {
        public override Stream? GetManifestResourceStream(string name) =>
            name == resourceName ? new MemoryStream(Encoding.UTF8.GetBytes(contents)) : null;

        public override string? FullName => "InMemoryResourceAssembly";
    }
}
