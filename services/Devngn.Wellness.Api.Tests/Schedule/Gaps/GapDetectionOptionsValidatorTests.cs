// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Schedule.Gaps;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Schedule.Gaps;

public sealed class GapDetectionOptionsValidatorTests
{
    private readonly GapDetectionOptionsValidator _validator = new();

    [Fact]
    public void Default_options_are_valid()
    {
        var result = _validator.Validate(name: null, new GapDetectionOptions());
        Assert.True(result.Succeeded);
    }

    [Fact]
    public void EarliestHour_equal_to_LatestHour_fails()
    {
        var result = _validator.Validate(name: null, new GapDetectionOptions
        {
            EarliestHourLocal = 12,
            LatestHourLocal = 12,
        });
        Assert.True(result.Failed);
        Assert.Contains(result.Failures, m => m.Contains("EarliestHourLocal"));
    }

    [Fact]
    public void EarliestHour_greater_than_LatestHour_fails()
    {
        var result = _validator.Validate(name: null, new GapDetectionOptions
        {
            EarliestHourLocal = 18,
            LatestHourLocal = 9,
        });
        Assert.True(result.Failed);
    }

    [Fact]
    public void MaxGap_less_than_MinGap_fails()
    {
        var result = _validator.Validate(name: null, new GapDetectionOptions
        {
            MinGapMinutes = 60,
            MaxGapMinutes = 30,
        });
        Assert.True(result.Failed);
        Assert.Contains(result.Failures, m => m.Contains("MaxGapMinutes"));
    }

    [Fact]
    public void Blackout_end_equal_to_start_fails()
    {
        var opts = new GapDetectionOptions();
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow
        {
            StartHour = 12,
            StartMinute = 0,
            EndHour = 12,
            EndMinute = 0,
        });
        var result = _validator.Validate(name: null, opts);
        Assert.True(result.Failed);
        Assert.Contains(result.Failures, m => m.Contains("BlackoutWindowsLocal[0]"));
    }

    [Fact]
    public void Blackout_end_before_start_fails()
    {
        var opts = new GapDetectionOptions();
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow
        {
            StartHour = 13,
            EndHour = 12,
            EndMinute = 30,
        });
        var result = _validator.Validate(name: null, opts);
        Assert.True(result.Failed);
    }

    [Fact]
    public void Blackout_end_beyond_24_hours_fails()
    {
        var opts = new GapDetectionOptions();
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow
        {
            StartHour = 23,
            EndHour = 24,
            EndMinute = 30, // 24:30 — out of range
        });
        var result = _validator.Validate(name: null, opts);
        Assert.True(result.Failed);
        Assert.Contains(result.Failures, m => m.Contains("cannot exceed 24:00"));
    }

    [Fact]
    public void Valid_blackout_at_end_of_day_is_accepted()
    {
        var opts = new GapDetectionOptions();
        opts.BlackoutWindowsLocal.Add(new BlackoutWindow
        {
            StartHour = 22,
            EndHour = 24,
            EndMinute = 0,
        });
        var result = _validator.Validate(name: null, opts);
        Assert.True(result.Succeeded);
    }
}
