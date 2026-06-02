// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Cryptography;
using Devngn.Wellness.Api.Auth;
using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Internal;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;

namespace Devngn.Wellness.Api.Tests.Auth;

/// <summary>
/// Shared WebApplicationFactory for auth integration tests. Wires in a real Postgres
/// connection string from the test fixture plus the minimum JWT/GitHub config needed
/// for <c>AddWellnessAuth</c> to pass <c>ValidateOnStart</c>. Callers can pass extra
/// service / config customizations per test.
/// </summary>
internal sealed class AuthWebAppFactory(
    string connectionString,
    Action<IDictionary<string, string?>>? configureConfig = null,
    Action<IServiceCollection>? configureServices = null)
    : WebApplicationFactory<Program>
{
    /// <summary>Stable 32-byte base64 key shared by all auth tests so we can issue + verify tokens.</summary>
    public static string TestSigningKey { get; } = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    public const string TestIssuer = "devngn.ai-wellness-tests";

    public const string TestAudience = "devngn.ai-wellness-tests";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            var settings = new Dictionary<string, string?>
            {
                ["ConnectionStrings:wellnessdb"] = connectionString,
                ["Auth:GitHub:ClientId"] = "test-client-id",
                ["Auth:GitHub:ClientSecret"] = "test-client-secret",
                ["Auth:GitHub:Scopes"] = "read:user",
                ["Auth:Jwt:Issuer"] = TestIssuer,
                ["Auth:Jwt:Audience"] = TestAudience,
                ["Auth:Jwt:SigningKey"] = TestSigningKey,
                ["Auth:Jwt:KeyId"] = "test-kid",
                ["Auth:Jwt:AccessTokenLifetimeMinutes"] = "60",
                ["Auth:Google:ClientId"] = "test-google-client-id",
                ["Auth:Google:ClientSecret"] = "test-google-client-secret",
                ["Auth:Google:RedirectUri"] = "https://localhost:5001/v1/schedule/callback/google",
            };
            configureConfig?.Invoke(settings);
            config.AddInMemoryCollection(settings);
        });

        builder.ConfigureTestServices(services =>
        {
            // appsettings.Development.json hard-codes ConnectionStrings:wellnessdb to
            // localhost:5432 for the local dev loop. Aspire's AddNpgsqlDbContext reads
            // that value at AppHost-build time (before WAF's InMemory config callback
            // runs), so we cannot redirect via configuration. Strip every EF registration
            // Aspire added and re-register a pool against the test container so the app
            // actually talks to our Postgres. Using internal EF types here is intentional
            // — Aspire registers the pooled-lease pipeline via these exact descriptors.
#pragma warning disable EF1001
            services.RemoveAll<DbContextOptions<WellnessDbContext>>();
            services.RemoveAll<DbContextOptions>();
            services.RemoveAll<IDbContextPool<WellnessDbContext>>();
            services.RemoveAll<IScopedDbContextLease<WellnessDbContext>>();
            services.RemoveAll<WellnessDbContext>();
            services.AddDbContextPool<WellnessDbContext>(o => o.UseNpgsql(connectionString));
#pragma warning restore EF1001

            // PostgresXmlRepository (DataProtection key ring) uses its own keyed
            // NpgsqlDataSource registered by AddWellnessDataProtection. That factory
            // reads ConnectionStrings:wellnessdb from configuration — but
            // appsettings.Development.json wins over our InMemory config (see the EF
            // surgery above). Override the keyed singleton so DataProtection writes
            // land in the test container, not the dev DB. This also exercises the same
            // code path the DataProtection roundtrip tests assert against.
            services.RemoveAll<NpgsqlDataSource>();
            services.RemoveAll<NpgsqlConnection>();
            services.RemoveAllKeyed<NpgsqlDataSource>(WellnessDataProtectionExtensions.DataProtectionDataSourceKey);
            services.AddKeyedSingleton(
                WellnessDataProtectionExtensions.DataProtectionDataSourceKey,
                (_, _) => NpgsqlDataSource.Create(connectionString));

            configureServices?.Invoke(services);
        });
    }
}
