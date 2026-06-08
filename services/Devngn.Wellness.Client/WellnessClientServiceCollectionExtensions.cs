// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Client;

/// <summary>
/// Registration helpers for <see cref="IWellnessClient"/>.
/// </summary>
public static class WellnessClientServiceCollectionExtensions
{
    /// <summary>Logical name of the <see cref="HttpClient"/> backing the wellness client.</summary>
    public const string HttpClientName = "wellness-api";

    /// <summary>
    /// Registers <see cref="IWellnessClient"/> and its named <see cref="HttpClient"/>
    /// (<see cref="HttpClientName"/>), a bearer-token <see cref="DelegatingHandler"/>,
    /// <see cref="IMemoryCache"/>, and — unless disabled via
    /// <see cref="WellnessClientOptions.ConfigureResilience"/> — a standard resilience
    /// pipeline whose retries are restricted to safe HTTP methods.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configure">Configures the client (base address, token provider, caching).</param>
    /// <returns>The same <see cref="IServiceCollection"/> for chaining.</returns>
    public static IServiceCollection AddWellnessClient(this IServiceCollection services, Action<WellnessClientOptions> configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configure);

        services.AddOptions<WellnessClientOptions>()
            .Configure(configure)
            .Validate(static o => o.BaseAddress is not null, $"{nameof(WellnessClientOptions)}.{nameof(WellnessClientOptions.BaseAddress)} must be set.")
            .Validate(static o => o.BaseAddress is null || o.BaseAddress.IsAbsoluteUri, $"{nameof(WellnessClientOptions)}.{nameof(WellnessClientOptions.BaseAddress)} must be an absolute URI.");

        services.AddMemoryCache();
        services.AddTransient<WellnessAuthHandler>();

        var httpBuilder = services.AddHttpClient(HttpClientName, static (sp, http) =>
        {
            var options = sp.GetRequiredService<IOptions<WellnessClientOptions>>().Value;
            http.BaseAddress = NormalizeBaseAddress(options.BaseAddress!);
        });

        // Read the configured options once at registration so client-side resilience can be
        // opted out (hosts that already apply ConfigureHttpClientDefaults shouldn't stack a
        // second pipeline). The resilience handler is added outermost so each retry re-runs
        // the inner auth handler; retries are limited to idempotent/safe methods so a transient
        // failure can never re-apply a non-idempotent POST (e.g. prompts/next, event push).
        var probe = new WellnessClientOptions();
        configure(probe);
        if (probe.ConfigureResilience)
        {
            httpBuilder
                .AddStandardResilienceHandler()
                .Configure(static o => o.Retry.DisableForUnsafeHttpMethods());
        }

        httpBuilder.AddHttpMessageHandler<WellnessAuthHandler>();

        services.AddSingleton<IWellnessClient, WellnessClient>();

        return services;
    }

    private static Uri NormalizeBaseAddress(Uri baseAddress)
    {
        var absolute = baseAddress.AbsoluteUri;
        return absolute.EndsWith('/') ? baseAddress : new Uri(absolute + "/", UriKind.Absolute);
    }
}
