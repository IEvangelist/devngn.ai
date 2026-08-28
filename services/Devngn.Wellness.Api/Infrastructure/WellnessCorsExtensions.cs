// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Infrastructure;

internal static class WellnessCorsExtensions
{
    internal const string PolicyName = "wellness";

    internal static readonly string[] ProductionOrigins =
    [
        "https://devngn.ai",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ];

    internal static IServiceCollection AddWellnessCors(
        this IServiceCollection services,
        IHostEnvironment environment)
    {
        services.AddCors(options =>
            options.AddPolicy(PolicyName, policy =>
            {
                policy.AllowAnyHeader()
                    .AllowAnyMethod();

                if (environment.IsDevelopment())
                {
                    policy.AllowAnyOrigin();
                }
                else
                {
                    policy.WithOrigins(ProductionOrigins);
                }
            }));

        return services;
    }
}
