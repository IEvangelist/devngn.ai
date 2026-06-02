// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace Devngn.Wellness.Api.EquipmentApi;

internal sealed partial record CreateEquipmentRequest
{
    [Required]
    [StringLength(60, MinimumLength = 1)]
    [RegularExpression(EquipmentValidation.TagPattern, ErrorMessage = EquipmentValidation.TagError)]
    public string Tag { get; init; } = string.Empty;

    [Required]
    [StringLength(120, MinimumLength = 1)]
    public string DisplayName { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Notes { get; init; }
}

internal sealed record UpdateEquipmentRequest
{
    [Required]
    [StringLength(120, MinimumLength = 1)]
    public string DisplayName { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Notes { get; init; }
}

internal sealed record EquipmentResponse(
    Guid Id,
    string Tag,
    string DisplayName,
    string? Notes,
    DateTimeOffset CreatedAt);

internal static partial class EquipmentValidation
{
    public const string TagPattern = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
    public const string TagError = "Tag must be lower-kebab-case (e.g. \"mat\", \"bands-light\").";

    [GeneratedRegex(TagPattern)]
    public static partial Regex TagRegex();
}
