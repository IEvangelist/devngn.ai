// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Gaps;

public static class WellnessGapsExtensions
{
    public static IServiceCollection AddWellnessGaps(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<GapDetectionOptions>()
            .Bind(configuration.GetSection(GapDetectionOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IValidateOptions<GapDetectionOptions>, GapDetectionOptionsValidator>();
        services.AddSingleton<IGapDetector, GapDetector>();
        return services;
    }
}
