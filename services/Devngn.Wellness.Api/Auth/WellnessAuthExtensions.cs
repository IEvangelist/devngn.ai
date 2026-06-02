// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Registers all auth services, JWT bearer authentication, and named HttpClients used by
/// <see cref="GitHubOAuthService"/>. Call this from <c>Program.cs</c> after
/// <c>AddServiceDefaults()</c> so the shared resilience handler is applied to the
/// GitHub-bound HttpClients automatically.
/// </summary>
public static class WellnessAuthExtensions
{
    public static IHostApplicationBuilder AddWellnessAuth(this IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddOptions<GitHubOAuthOptions>()
            .Bind(builder.Configuration.GetSection(GitHubOAuthOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        builder.Services.AddOptions<JwtOptions>()
            .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        builder.Services.AddSingleton<IValidateOptions<JwtOptions>, JwtOptionsValidator>();

        builder.Services.TryAddSingletonTimeProvider();
        builder.Services.AddMemoryCache();

        builder.Services.AddHttpClient(GitHubOAuthService.OAuthClientName, (sp, client) =>
        {
            var opts = sp.GetRequiredService<IOptions<GitHubOAuthOptions>>().Value;
            client.DefaultRequestHeaders.UserAgent.ParseAdd(opts.UserAgent);
            client.DefaultRequestHeaders.Accept.Clear();
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        });

        builder.Services.AddHttpClient(GitHubOAuthService.ApiClientName, (sp, client) =>
        {
            var opts = sp.GetRequiredService<IOptions<GitHubOAuthOptions>>().Value;
            client.DefaultRequestHeaders.UserAgent.ParseAdd(opts.UserAgent);
        });

        builder.Services.AddScoped<IGitHubOAuthService, GitHubOAuthService>();
        builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
        builder.Services.AddSingleton<IDeviceFlowStore, DeviceFlowStore>();
        builder.Services.AddSingleton<IOAuthStateStore, OAuthStateStore>();
        builder.Services.AddScoped<IUserUpserter, UserUpserter>();

        builder.Services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                // Default mapping rewrites `sub` to ClaimTypes.NameIdentifier and a few others,
                // which makes claim reads ambiguous. We rely on the JWT names verbatim.
                o.MapInboundClaims = false;
            });

        builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<JwtOptions>>((bearer, jwt) =>
            {
                bearer.TokenValidationParameters = JwtTokenService.CreateValidationParameters(jwt.Value);
            });

        builder.Services.AddAuthorization();

        return builder;
    }

    private static void TryAddSingletonTimeProvider(this IServiceCollection services)
    {
        // ServiceDefaults / hosting may already have one registered; never replace it.
        services.AddSingleton(_ => TimeProvider.System);
    }
}
