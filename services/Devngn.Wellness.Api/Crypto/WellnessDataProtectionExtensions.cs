// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Devngn.Wellness.Api.Crypto;

public static class WellnessDataProtectionExtensions
{
    /// <summary>
    /// Marker key the wellness service uses to register its dedicated
    /// <see cref="NpgsqlDataSource"/> for the DataProtection key ring. Using a keyed
    /// service avoids colliding with Aspire's own data source registration, which is
    /// optimized for EF Core and isn't guaranteed to be exposed as the default
    /// <see cref="NpgsqlDataSource"/> singleton.
    /// </summary>
    public const string DataProtectionDataSourceKey = "wellness.dataprotection";

    /// <summary>
    /// Wires the wellness service's at-rest token encryption: Postgres-backed
    /// DataProtection key ring + the <see cref="IRefreshTokenProtector"/> service used
    /// by the schedule-source endpoints. Idempotent — safe to call once during
    /// composition.
    /// </summary>
    public static IServiceCollection AddWellnessDataProtection(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddOptions<WellnessDataProtectionOptions>()
            .Bind(configuration.GetSection(WellnessDataProtectionOptions.SectionName))
            .ValidateOnStart();

        // Resolve the wellness DB connection string from the same configuration key
        // the EF Core context uses. Build a dedicated NpgsqlDataSource (keyed) so the
        // XmlRepository has a stable singleton-safe data source independent of any
        // Aspire keyed registration that the DbContext path uses internally.
        services.AddKeyedSingleton(DataProtectionDataSourceKey, (_, _) =>
        {
            var connectionString = configuration.GetConnectionString("wellnessdb")
                ?? throw new InvalidOperationException(
                    "ConnectionStrings:wellnessdb must be configured for the DataProtection key ring.");
            return NpgsqlDataSource.Create(connectionString);
        });

        // The IXmlRepository implementation is singleton-safe because it talks to its
        // dedicated NpgsqlDataSource directly. Resolving from DataProtection's own
        // singleton scope therefore avoids the scoped-DbContext trap.
        services.AddSingleton<IXmlRepository>(sp => new PostgresXmlRepository(
            sp.GetRequiredKeyedService<NpgsqlDataSource>(DataProtectionDataSourceKey),
            sp.GetRequiredService<ILogger<PostgresXmlRepository>>()));

        services.AddSingleton<IRefreshTokenProtector, RefreshTokenProtector>();

        var bootstrapOptions = configuration
            .GetSection(WellnessDataProtectionOptions.SectionName)
            .Get<WellnessDataProtectionOptions>() ?? new WellnessDataProtectionOptions();

        var builder = services.AddDataProtection()
            .SetApplicationName(bootstrapOptions.ApplicationName)
            .SetDefaultKeyLifetime(bootstrapOptions.NewKeyLifetime);

        // Optional certificate wrapping. Configuring this turns the in-DB key ring into
        // PFX-wrapped XML, which is the recommended posture for production deployments
        // where stolen Postgres backups must not yield decryptable refresh tokens.
        if (!string.IsNullOrWhiteSpace(bootstrapOptions.CertificatePath))
        {
            var cert = X509CertificateLoader.LoadPkcs12FromFile(
                bootstrapOptions.CertificatePath,
                bootstrapOptions.CertificatePassword);
            builder.ProtectKeysWithCertificate(cert);
        }
        else if (!string.IsNullOrWhiteSpace(bootstrapOptions.CertificateThumbprint))
        {
            builder.ProtectKeysWithCertificate(bootstrapOptions.CertificateThumbprint);
        }

        // Wire the XmlRepository post-configure via IOptions so we don't have to call
        // BuildServiceProvider() during composition (which would create a parallel
        // container and double-instantiate singletons).
        services.AddOptions<KeyManagementOptions>()
            .Configure<IXmlRepository>((options, repo) =>
            {
                options.XmlRepository = repo;
            });

        return services;
    }
}

