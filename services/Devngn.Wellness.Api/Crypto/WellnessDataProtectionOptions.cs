// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Crypto;

/// <summary>
/// Configuration for the wellness service's at-rest token encryption.
/// </summary>
/// <remarks>
/// By default the DataProtection key ring lives in the same Postgres database as the
/// protected refresh tokens. That is sufficient to keep tokens off a filesystem dump
/// and out of replicas that don't have the key table, but it is <b>not</b> a defense
/// against an attacker who has full <c>postgres</c> read access — they would steal
/// both the keys and the ciphertexts. For production deployments, configure
/// <see cref="CertificatePath"/> (or <see cref="CertificateThumbprint"/>) so the key
/// ring is wrapped by an X.509 certificate that lives outside the database.
/// </remarks>
public sealed class WellnessDataProtectionOptions
{
    public const string SectionName = "Auth:DataProtection";

    /// <summary>Application discriminator passed to <c>SetApplicationName</c>. Stable across deploys.</summary>
    public string ApplicationName { get; init; } = "devngn.ai-wellness";

    /// <summary>How long a freshly-minted key remains the default. ASP.NET Core auto-rotates after this.</summary>
    public TimeSpan NewKeyLifetime { get; init; } = TimeSpan.FromDays(90);

    /// <summary>Optional path to a PFX whose private key wraps the in-DB key ring.</summary>
    public string? CertificatePath { get; init; }

    /// <summary>Password for <see cref="CertificatePath"/> if the PFX is encrypted.</summary>
    public string? CertificatePassword { get; init; }

    /// <summary>Optional thumbprint of a certificate already in the host's certificate store.</summary>
    public string? CertificateThumbprint { get; init; }
}
