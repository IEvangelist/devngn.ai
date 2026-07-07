// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using Devngn.Wellness.Api.Moderation;
using Devngn.Wellness.Api.Tests.Auth;
using Devngn.Wellness.Api.Tests.Endpoints;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Social;

/// <summary>
/// Integration tests for the social endpoints (<c>/v1/social/*</c>).
/// Covers auth enforcement (401/403), profanity sanitization via a stubbed
/// <see cref="IProfanityService"/>, and consent gating.
/// Requires Docker/Postgres.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class SocialEndpointTests(PostgresContainerFixture postgres)
{
    private AuthWebAppFactory Factory(Action<IServiceCollection>? configureServices = null) =>
        new(postgres.ConnectionString, configureServices: configureServices);

    private AuthWebAppFactory FactoryWithStubProfanity(StubProfanityService stub) =>
        Factory(services =>
        {
            // Add a singleton stub after the typed-HttpClient registration so the last-wins
            // DI resolution picks it up — the profanity-filter sidecar is not needed in tests.
            services.AddSingleton<IProfanityService>(stub);
        });

    // -------------------------------------------------------------------------
    // 401 — anonymous requests are rejected on every social endpoint
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData("GET",    "/v1/social/profile")]
    [InlineData("PUT",    "/v1/social/profile")]
    [InlineData("POST",   "/v1/social/follow/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", "/v1/social/follow/00000000-0000-0000-0000-000000000001")]
    [InlineData("GET",    "/v1/social/followers")]
    [InlineData("GET",    "/v1/social/following")]
    [InlineData("GET",    "/v1/social/feed")]
    public async Task Social_AnonymousRequest_Returns401(string method, string path)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "PUT" or "POST")
        {
            request.Content = JsonContent.Create(new { displayName = "X", isPublic = true });
        }
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // -------------------------------------------------------------------------
    // 403 — authenticated but no consent
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData("/v1/social/profile")]
    [InlineData("/v1/social/followers")]
    [InlineData("/v1/social/following")]
    [InlineData("/v1/social/feed")]
    public async Task Social_AuthenticatedNoConsent_Returns403(string path)
    {
        using var factory = Factory();
        var seeded = await factory.SeedAuthenticatedUserAsync(withConsent: false);
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // -------------------------------------------------------------------------
    // Profanity sanitization — displayName is sanitized before persistence
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpsertProfile_DisplayNameWithProfanity_IsSanitized()
    {
        var stub = new StubProfanityService(("badword", "***"));
        using var factory = FactoryWithStubProfanity(stub);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "Hello badword World",
            isPublic = true,
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var profile = await response.Content.ReadFromJsonAsync<SocialProfileDto>();
        Assert.NotNull(profile);
        Assert.Equal("Hello *** World", profile!.DisplayName);
    }

    // -------------------------------------------------------------------------
    // Profanity sanitization — bio is sanitized before persistence
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpsertProfile_BioWithProfanity_IsSanitized()
    {
        var stub = new StubProfanityService(("dirty", "####"));
        using var factory = FactoryWithStubProfanity(stub);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "CleanName",
            bio = "My dirty secret",
            isPublic = true,
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var profile = await response.Content.ReadFromJsonAsync<SocialProfileDto>();
        Assert.NotNull(profile);
        Assert.Equal("My #### secret", profile!.Bio);
    }

    // -------------------------------------------------------------------------
    // Profanity sanitization — clean input passes through unchanged
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpsertProfile_CleanDisplayName_PassesThroughUnchanged()
    {
        var stub = new StubProfanityService(); // no replacements configured
        using var factory = FactoryWithStubProfanity(stub);
        var seeded = await factory.SeedAuthenticatedUserAsync();
        using var client = factory.CreateClientWithBearer(seeded.Token);

        var response = await client.PutAsJsonAsync("/v1/social/profile", new
        {
            displayName = "Alice the Developer",
            isPublic = false,
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var profile = await response.Content.ReadFromJsonAsync<SocialProfileDto>();
        Assert.NotNull(profile);
        Assert.Equal("Alice the Developer", profile!.DisplayName);
        Assert.False(profile.IsPublic);
    }

    // -------------------------------------------------------------------------
    // DTOs and helpers
    // -------------------------------------------------------------------------

    private sealed record SocialProfileDto(Guid UserId, string DisplayName, string? Bio, bool IsPublic);

    /// <summary>
    /// Stub <see cref="IProfanityService"/> that replaces configured word pairs
    /// without requiring the profanity-filter sidecar to be running.
    /// </summary>
    private sealed class StubProfanityService : IProfanityService
    {
        private readonly (string Find, string Replace)[] _replacements;

        public StubProfanityService(params (string Find, string Replace)[] replacements)
        {
            _replacements = replacements;
        }

        public Task<string> SanitizeAsync(string text, CancellationToken cancellationToken = default)
        {
            var result = text;
            foreach (var (find, replace) in _replacements)
            {
                result = result.Replace(find, replace, StringComparison.OrdinalIgnoreCase);
            }
            return Task.FromResult(result);
        }

        public Task<bool> IsCleanAsync(string text, CancellationToken cancellationToken = default)
        {
            foreach (var (find, _) in _replacements)
            {
                if (text.Contains(find, StringComparison.OrdinalIgnoreCase))
                {
                    return Task.FromResult(false);
                }
            }
            return Task.FromResult(true);
        }
    }
}
