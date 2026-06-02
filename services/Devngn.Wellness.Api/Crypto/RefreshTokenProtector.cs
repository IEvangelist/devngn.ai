// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.AspNetCore.DataProtection;

namespace Devngn.Wellness.Api.Crypto;

internal sealed class RefreshTokenProtector : IRefreshTokenProtector
{
    // Stable purpose string. Versioned so a future incompatible key derivation can be
    // rolled out side-by-side and migrated tokens in the background.
    public const string Purpose = "Wellness.RefreshToken.v1";

    private readonly IDataProtector _protector;

    public RefreshTokenProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector(Purpose);
    }

    public string Protect(string plaintext)
    {
        ArgumentException.ThrowIfNullOrEmpty(plaintext);
        return _protector.Protect(plaintext);
    }

    public string Unprotect(string protectedPayload)
    {
        ArgumentException.ThrowIfNullOrEmpty(protectedPayload);
        return _protector.Unprotect(protectedPayload);
    }
}
