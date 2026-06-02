// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Data.Entities;

/// <summary>
/// ASP.NET Core DataProtection key-ring element persisted to Postgres. The wellness
/// service writes one row per generated key so refresh-token encryption survives
/// restarts and rolling deploys without resorting to filesystem persistence.
/// </summary>
/// <remarks>
/// Threat model: this table stores the key-ring in cleartext XML. A full database
/// compromise therefore reveals both the protected refresh tokens and the keys used
/// to decrypt them. Production deployments should additionally wrap the key ring
/// with a certificate or external KMS by setting
/// <c>Auth:DataProtection:CertificateThumbprint</c> (or its KMS equivalent) so
/// stolen database backups alone are not sufficient to decrypt tokens. For local
/// development and OSS self-hosters, cleartext-in-Postgres is the default.
/// </remarks>
public sealed class DataProtectionKey
{
    public int Id { get; set; }

    public string FriendlyName { get; set; } = string.Empty;

    public string Xml { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
