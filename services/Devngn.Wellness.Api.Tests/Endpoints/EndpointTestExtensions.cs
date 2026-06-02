// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.Http.Headers;
using Devngn.Wellness.Api.Auth;
using Devngn.Wellness.Api.Consent;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Tests.Auth;
using Microsoft.Extensions.DependencyInjection;

namespace Devngn.Wellness.Api.Tests.Endpoints;

/// <summary>
/// Test helpers that mint authenticated users for endpoint tests. Centralizes the
/// User-row + ConsentRecord seed pattern that every consent-gated endpoint test
/// requires, and returns a primed <see cref="HttpClient"/> with a Bearer header.
/// </summary>
internal static class EndpointTestExtensions
{
    public sealed record SeededUser(Guid Id, User User, string Token);

    public static async Task<SeededUser> SeedAuthenticatedUserAsync(
        this AuthWebAppFactory factory,
        bool withConsent = true,
        string consentVersion = ConsentRegistry.CurrentVersion,
        string? login = null,
        long? gitHubId = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WellnessDbContext>();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();

        var user = new User
        {
            GitHubId = gitHubId ?? Random.Shared.NextInt64(1, long.MaxValue),
            Login = login ?? $"dev-{Guid.NewGuid():N}",
            DisplayName = "Test Dev",
        };
        if (withConsent)
        {
            user.Consent = new ConsentRecord
            {
                Version = consentVersion,
                Text = ConsentRegistry.KnownVersions[consentVersion],
            };
        }
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var token = jwt.Issue(user).AccessToken;
        return new SeededUser(user.Id, user, token);
    }

    public static HttpClient CreateClientWithBearer(this AuthWebAppFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
