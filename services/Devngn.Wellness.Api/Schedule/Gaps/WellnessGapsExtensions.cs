// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Gaps;

public static class WellnessGapsExtensions
{
    /// <summary>
    /// DI key for the <see cref="TimeProvider"/> used exclusively by gap detection.
    /// Tests can override this keyed registration to pin the clock to a deterministic
    /// date without affecting JWT bearer validation, which uses the unkeyed singleton
    /// registered by <c>AddWellnessAuth</c>.
    /// </summary>
    public const string GapClockKey = "gap-clock";

    public static IServiceCollection AddWellnessGaps(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<GapDetectionOptions>()
            .Bind(configuration.GetSection(GapDetectionOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IValidateOptions<GapDetectionOptions>, GapDetectionOptionsValidator>();
        // Forward the keyed clock to the unkeyed TimeProvider.System in production.
        // Tests override this key independently to keep JWT bearer validation unaffected.
        services.AddKeyedSingleton<TimeProvider>(GapClockKey, static (sp, _) => sp.GetRequiredService<TimeProvider>());
        services.AddSingleton<IGapDetector, GapDetector>();
        return services;
    }
}
