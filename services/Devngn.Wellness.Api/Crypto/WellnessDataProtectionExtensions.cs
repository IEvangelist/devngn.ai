// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Crypto;

public static class WellnessDataProtectionExtensions
{
    /// <summary>
    /// Wires the wellness service's at-rest token encryption: SQL Server-backed
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

        services.AddSingleton<IXmlRepository>(sp =>
        {
            var connectionString = configuration.GetConnectionString("wellnessdb")
                ?? throw new InvalidOperationException(
                    "ConnectionStrings:wellnessdb must be configured for the DataProtection key ring.");
            return new SqlServerXmlRepository(
                connectionString,
                sp.GetRequiredService<ILogger<SqlServerXmlRepository>>());
        });

        services.AddSingleton<IRefreshTokenProtector, RefreshTokenProtector>();

        var bootstrapOptions = configuration
            .GetSection(WellnessDataProtectionOptions.SectionName)
            .Get<WellnessDataProtectionOptions>() ?? new WellnessDataProtectionOptions();

        var builder = services.AddDataProtection()
            .SetApplicationName(bootstrapOptions.ApplicationName)
            .SetDefaultKeyLifetime(bootstrapOptions.NewKeyLifetime);

        // Optional certificate wrapping. Configuring this turns the in-DB key ring into
        // PFX-wrapped XML, which is the recommended posture for production deployments
        // where stolen database backups must not yield decryptable refresh tokens.
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
