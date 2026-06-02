// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Gaps;

/// <summary>
/// Cross-field validation. Bad config could silently make every gap ineligible,
/// so we fail at <see cref="OptionsBuilderExtensions.ValidateOnStart{TOptions}"/>
/// time rather than at runtime.
/// </summary>
internal sealed class GapDetectionOptionsValidator : IValidateOptions<GapDetectionOptions>
{
    public ValidateOptionsResult Validate(string? name, GapDetectionOptions options)
    {
        var errors = new List<string>();

        if (options.EarliestHourLocal >= options.LatestHourLocal)
        {
            errors.Add($"{nameof(options.EarliestHourLocal)} ({options.EarliestHourLocal}) must be strictly less than {nameof(options.LatestHourLocal)} ({options.LatestHourLocal}).");
        }

        if (options.MaxGapMinutes < options.MinGapMinutes)
        {
            errors.Add($"{nameof(options.MaxGapMinutes)} ({options.MaxGapMinutes}) must be >= {nameof(options.MinGapMinutes)} ({options.MinGapMinutes}).");
        }

        for (var i = 0; i < options.BlackoutWindowsLocal.Count; i++)
        {
            var b = options.BlackoutWindowsLocal[i];
            var startTotal = (b.StartHour * 60) + b.StartMinute;
            var endTotal = (b.EndHour * 60) + b.EndMinute;
            if (endTotal <= startTotal)
            {
                errors.Add($"BlackoutWindowsLocal[{i}] ({b.StartHour:D2}:{b.StartMinute:D2}-{b.EndHour:D2}:{b.EndMinute:D2}) must end strictly after its start.");
            }
            if (endTotal > 24 * 60)
            {
                errors.Add($"BlackoutWindowsLocal[{i}] end ({b.EndHour:D2}:{b.EndMinute:D2}) cannot exceed 24:00.");
            }
        }

        return errors.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(errors);
    }
}
