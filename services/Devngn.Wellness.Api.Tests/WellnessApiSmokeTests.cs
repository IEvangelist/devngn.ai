// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Devngn.Wellness.Api.Tests;

/// <summary>
/// WebApplicationFactory smoke tests. The DbContext is registered but never queried by these
/// endpoints, so a placeholder connection string is sufficient and no Postgres is required.
/// Real database integration tests using Testcontainers land in the domain milestone.
/// </summary>
public sealed class WellnessApiSmokeTests : IClassFixture<WellnessApiSmokeTests.Factory>
{
    private readonly Factory _factory;

    public WellnessApiSmokeTests(Factory factory) => _factory = factory;

    [Fact]
    public async Task Alive_ReturnsHealthy()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/alive");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Hello_ReturnsServiceMetadata()
    {
        using var client = _factory.CreateClient();

        var payload = await client.GetFromJsonAsync<HelloDto>("/v1/hello");

        Assert.NotNull(payload);
        Assert.Equal("devngn.ai wellness", payload!.Service);
        Assert.True(payload.Timestamp <= DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task OpenApi_DocumentIsServed_WithExpectedMetadata()
    {
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);

        var info = doc.RootElement.GetProperty("info");
        Assert.Equal("devngn.ai Wellness API", info.GetProperty("title").GetString());
        Assert.Equal("v1", info.GetProperty("version").GetString());
        Assert.Equal("MIT", info.GetProperty("license").GetProperty("name").GetString());
    }

    public sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    // Aspire's AddNpgsqlDbContext requires the connection string at registration
                    // time but does not connect until first query, so a placeholder is sufficient
                    // for endpoints that don't hit the database.
                    ["ConnectionStrings:wellnessdb"] = "Host=localhost;Port=5432;Database=test;Username=test;Password=test",
                    // AddWellnessAuth validates options at startup; provide test values so the
                    // app boots even though these smoke tests never exercise the auth endpoints.
                    ["Auth:GitHub:ClientId"] = "test-client-id",
                    ["Auth:GitHub:ClientSecret"] = "test-client-secret",
                    ["Auth:Jwt:Issuer"] = "wellness-smoke",
                    ["Auth:Jwt:Audience"] = "wellness-smoke",
                    ["Auth:Jwt:SigningKey"] = Devngn.Wellness.Api.Tests.Auth.AuthWebAppFactory.TestSigningKey,
                });
            });
        }
    }

    private sealed record HelloDto(string Service, DateTimeOffset Timestamp);
}
