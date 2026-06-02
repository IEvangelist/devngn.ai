// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Configuration for JWT issuance and validation. Bind from <c>Auth:Jwt</c>.
/// <see cref="SigningKey"/> is a base64-encoded byte string and must decode to at
/// least 32 bytes (HS256 requires &gt;= 256-bit keys for safety).
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Auth:Jwt";

    [Required(AllowEmptyStrings = false)]
    public string Issuer { get; set; } = string.Empty;

    [Required(AllowEmptyStrings = false)]
    public string Audience { get; set; } = string.Empty;

    /// <summary>Base64-encoded HMAC signing key; must decode to &gt;= 32 bytes.</summary>
    [Required(AllowEmptyStrings = false)]
    public string SigningKey { get; set; } = string.Empty;

    /// <summary>Stable key identifier embedded in the JWT header to support future rotation.</summary>
    [Required(AllowEmptyStrings = false)]
    public string KeyId { get; set; } = "v1";

    /// <summary>
    /// Access token lifetime in minutes. Default 60. We deliberately avoid week-long
    /// tokens because there is no refresh/revocation path in v1; if a token leaks,
    /// the user must wait for it to expire or rotate the signing key.
    /// </summary>
    [Range(1, 1440)]
    public int AccessTokenLifetimeMinutes { get; set; } = 60;
}

/// <summary>
/// Validates <see cref="JwtOptions"/> at startup. Ensures the signing key decodes
/// from base64 and yields at least 32 bytes; data-annotation validation handles
/// the rest.
/// </summary>
internal sealed class JwtOptionsValidator : IValidateOptions<JwtOptions>
{
    public ValidateOptionsResult Validate(string? name, JwtOptions options)
    {
        var failures = new List<string>();

        if (!string.IsNullOrWhiteSpace(options.SigningKey))
        {
            try
            {
                var bytes = Convert.FromBase64String(options.SigningKey);
                if (bytes.Length < 32)
                {
                    failures.Add($"{nameof(JwtOptions.SigningKey)} must decode to at least 32 bytes (got {bytes.Length}).");
                }
            }
            catch (FormatException)
            {
                failures.Add($"{nameof(JwtOptions.SigningKey)} must be a valid base64 string.");
            }
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }
}
