// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Prompts;

public static class WellnessPromptsExtensions
{
    /// <summary>
    /// Registers prompt-delivery services: the pure <see cref="IPromptMatcher"/>
    /// (singleton — it's stateless), the scoped <see cref="IPromptService"/>
    /// orchestrator, and validated <see cref="PromptDeliveryOptions"/>.
    /// </summary>
    public static IServiceCollection AddWellnessPrompts(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<PromptDeliveryOptions>()
            .Bind(configuration.GetSection(PromptDeliveryOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IPromptMatcher, PromptMatcher>();
        services.AddScoped<IPromptService, PromptService>();
        return services;
    }
}
