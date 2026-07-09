// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Devngn.Wellness.Api.Catalog;

/// <summary>
/// First-party equipment-catalog provider that loads the curated, registerable gear list
/// from an embedded JSON resource. Validated once at first read (tag shape, unique tags,
/// non-empty display names, positive policy numbers) and cached for the singleton's life,
/// so any malformed entry fails startup instead of degrading the picker silently.
/// </summary>
internal sealed partial class EmbeddedEquipmentCatalogProvider : IEquipmentCatalogProvider
{
    private const string ResourceName = "Devngn.Wellness.Api.Catalog.equipment-catalog.json";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(allowIntegerValues: false) },
    };

    private readonly Assembly _assembly;
    private readonly Lazy<IReadOnlyList<EquipmentDefinition>> _catalog;

    public EmbeddedEquipmentCatalogProvider()
        : this(typeof(EmbeddedEquipmentCatalogProvider).Assembly)
    {
    }

    internal EmbeddedEquipmentCatalogProvider(Assembly assembly)
    {
        _assembly = assembly;
        _catalog = new Lazy<IReadOnlyList<EquipmentDefinition>>(
            LoadAndValidate,
            LazyThreadSafetyMode.ExecutionAndPublication);
    }

    public Task<IReadOnlyList<EquipmentDefinition>> GetCatalogAsync(CancellationToken cancellationToken) =>
        Task.FromResult(_catalog.Value);

    private IReadOnlyList<EquipmentDefinition> LoadAndValidate()
    {
        using var stream = _assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"Embedded equipment catalog '{ResourceName}' was not found in {_assembly.FullName}. " +
                "Confirm the .csproj includes <EmbeddedResource Include=\"Catalog\\equipment-catalog.json\" />.");

        List<EquipmentDefinition>? raw;
        try
        {
            raw = JsonSerializer.Deserialize<List<EquipmentDefinition>>(stream, JsonOptions);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"Embedded equipment catalog '{ResourceName}' is not valid JSON or does not match the {nameof(EquipmentDefinition)} schema.",
                ex);
        }

        if (raw is null || raw.Count == 0)
        {
            throw new InvalidOperationException(
                $"Embedded equipment catalog '{ResourceName}' deserialised to an empty list. The catalog must contain at least one item.");
        }

        var seenTags = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < raw.Count; i++)
        {
            ValidateDefinition(raw[i], i, seenTags);
        }

        return raw;
    }

    private static void ValidateDefinition(EquipmentDefinition d, int index, HashSet<string> seenTags)
    {
        if (string.IsNullOrWhiteSpace(d.Tag) || !LowerKebabRegex().IsMatch(d.Tag))
        {
            throw new InvalidOperationException(
                $"Equipment entry [{index}]: tag '{d.Tag}' must be lower-kebab-case (matches ^[a-z0-9]+(-[a-z0-9]+)*$).");
        }

        if (!seenTags.Add(d.Tag))
        {
            throw new InvalidOperationException(
                $"Equipment entry [{index}]: tag '{d.Tag}' is duplicated. Tags must be unique.");
        }

        if (string.IsNullOrWhiteSpace(d.DisplayName))
        {
            throw new InvalidOperationException($"Equipment entry '{d.Tag}': DisplayName is required.");
        }

        if (d.RecommendedWeeklySessions is <= 0)
        {
            throw new InvalidOperationException(
                $"Equipment entry '{d.Tag}': RecommendedWeeklySessions must be > 0 when specified.");
        }

        if (d.MinSessionMinutes is <= 0)
        {
            throw new InvalidOperationException(
                $"Equipment entry '{d.Tag}': MinSessionMinutes must be > 0 when specified.");
        }
    }

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex LowerKebabRegex();
}
