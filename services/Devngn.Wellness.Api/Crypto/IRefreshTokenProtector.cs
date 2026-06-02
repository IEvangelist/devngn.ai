// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Crypto;

/// <summary>
/// Encrypts and decrypts OAuth refresh tokens for at-rest storage in
/// <c>schedule_sources.ProtectedRefreshToken</c>. Backed by ASP.NET Core
/// DataProtection with the wellness-specific purpose <c>Wellness.RefreshToken.v1</c>;
/// the purpose string is stable so a future rev would bump the suffix and migrate.
/// </summary>
public interface IRefreshTokenProtector
{
    /// <summary>Encrypts a refresh-token string. Returns base64 ciphertext safe for column storage.</summary>
    string Protect(string plaintext);

    /// <summary>Decrypts a previously-protected base64 ciphertext. Throws if the payload is tampered or the key ring rolled past retention.</summary>
    string Unprotect(string protectedPayload);
}
