// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Devngn.Wellness.Api.Catalog;

/// <summary>
/// First-party catalog provider that loads a curated set of wellness activities
/// from an embedded JSON resource shipped with the assembly. The result is
/// validated once at first read (slug shape, unique slugs, required strings,
/// positive duration, lower-kebab equipment tags) and cached for the lifetime
/// of the singleton; any validation error is bubbled up so the host fails fast
/// on startup rather than serving a silently-degraded catalog.
/// </summary>
internal sealed partial class EmbeddedActivityCatalogProvider : IActivityCatalogProvider
{
    private const string ResourceName = "Devngn.Wellness.Api.Catalog.catalog.json";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(allowIntegerValues: false) },
    };

    private readonly Assembly _assembly;
    private readonly Lazy<IReadOnlyList<ActivityDefinition>> _catalog;

    public EmbeddedActivityCatalogProvider()
        : this(typeof(EmbeddedActivityCatalogProvider).Assembly)
    {
    }

    internal EmbeddedActivityCatalogProvider(Assembly assembly)
    {
        _assembly = assembly;
        _catalog = new Lazy<IReadOnlyList<ActivityDefinition>>(
            LoadAndValidate,
            LazyThreadSafetyMode.ExecutionAndPublication);
    }

    public Task<IReadOnlyList<ActivityDefinition>> GetCatalogAsync(CancellationToken cancellationToken) =>
        Task.FromResult(_catalog.Value);

    private IReadOnlyList<ActivityDefinition> LoadAndValidate()
    {
        using var stream = _assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"Embedded activity catalog '{ResourceName}' was not found in {_assembly.FullName}. " +
                "Confirm the .csproj includes <EmbeddedResource Include=\"Catalog\\catalog.json\" />.");

        List<ActivityDefinition>? raw;
        try
        {
            raw = JsonSerializer.Deserialize<List<ActivityDefinition>>(stream, JsonOptions);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"Embedded activity catalog '{ResourceName}' is not valid JSON or does not match the {nameof(ActivityDefinition)} schema.",
                ex);
        }

        if (raw is null || raw.Count == 0)
        {
            throw new InvalidOperationException(
                $"Embedded activity catalog '{ResourceName}' deserialised to an empty list. The catalog must contain at least one activity.");
        }

        var seenSlugs = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < raw.Count; i++)
        {
            ValidateDefinition(raw[i], i, seenSlugs);
        }

        return raw;
    }

    private static void ValidateDefinition(ActivityDefinition d, int index, HashSet<string> seenSlugs)
    {
        if (string.IsNullOrWhiteSpace(d.Slug) || !LowerKebabRegex().IsMatch(d.Slug))
        {
            throw new InvalidOperationException(
                $"Catalog entry [{index}]: slug '{d.Slug}' must be lower-kebab-case (matches ^[a-z0-9]+(-[a-z0-9]+)*$).");
        }

        if (!seenSlugs.Add(d.Slug))
        {
            throw new InvalidOperationException(
                $"Catalog entry [{index}]: slug '{d.Slug}' is duplicated. Slugs must be unique.");
        }

        if (string.IsNullOrWhiteSpace(d.Title))
        {
            throw new InvalidOperationException($"Catalog entry '{d.Slug}': Title is required.");
        }

        if (string.IsNullOrWhiteSpace(d.Description))
        {
            throw new InvalidOperationException($"Catalog entry '{d.Slug}': Description is required.");
        }

        if (d.DurationSeconds <= 0)
        {
            throw new InvalidOperationException(
                $"Catalog entry '{d.Slug}': DurationSeconds must be > 0 (got {d.DurationSeconds}).");
        }

        if (string.IsNullOrWhiteSpace(d.AnimationProvider))
        {
            throw new InvalidOperationException($"Catalog entry '{d.Slug}': AnimationProvider is required.");
        }

        if (string.IsNullOrWhiteSpace(d.AnimationAssetId))
        {
            throw new InvalidOperationException($"Catalog entry '{d.Slug}': AnimationAssetId is required.");
        }

        // EquipmentTags is allowed to be empty (no equipment needed), but every entry must
        // be lower-kebab so the request-side query normaliser produces matching strings.
        foreach (var tag in d.EquipmentTags)
        {
            if (string.IsNullOrWhiteSpace(tag) || !LowerKebabRegex().IsMatch(tag))
            {
                throw new InvalidOperationException(
                    $"Catalog entry '{d.Slug}': equipment tag '{tag}' must be lower-kebab-case.");
            }
        }

        // Steps are optional. When present, each must carry an instruction and any numeric
        // hint must be positive so the client never renders "0 reps" / "hold for 0s".
        if (d.Steps is { Length: > 0 } steps)
        {
            for (var s = 0; s < steps.Length; s++)
            {
                var step = steps[s];
                if (string.IsNullOrWhiteSpace(step.Text))
                {
                    throw new InvalidOperationException(
                        $"Catalog entry '{d.Slug}': step [{s}] must have non-empty text.");
                }

                if (step.HoldSeconds is <= 0 || step.Reps is <= 0 || step.Sets is <= 0)
                {
                    throw new InvalidOperationException(
                        $"Catalog entry '{d.Slug}': step [{s}] hold/reps/sets must be > 0 when specified.");
                }
            }
        }
    }

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex LowerKebabRegex();
}
