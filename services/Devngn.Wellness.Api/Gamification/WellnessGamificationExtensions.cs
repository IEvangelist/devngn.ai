// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Gamification;

public static class WellnessGamificationExtensions
{
    /// <summary>
    /// Registers the <see cref="IGamificationService"/> and the
    /// <see cref="GamificationSeeder"/> hosted service that seeds badge and milestone definitions.
    /// </summary>
    public static IServiceCollection AddWellnessGamification(this IServiceCollection services)
    {
        services.AddScoped<IGamificationService, GamificationService>();
        services.AddHostedService<GamificationSeeder>();
        return services;
    }
}
