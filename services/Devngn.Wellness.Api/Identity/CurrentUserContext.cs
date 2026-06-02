// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Devngn.Wellness.Api.Identity;

/// <summary>
/// Extracts the authenticated user id from the ambient <see cref="HttpContext"/>.
/// Registered as <em>scoped</em> so it cannot accidentally cache a per-request value
/// across requests if anyone misuses it; the underlying lookup is still cheap.
/// </summary>
internal interface ICurrentUserContext
{
    /// <returns>The <see cref="Data.Entities.User"/> id encoded in the JWT <c>sub</c> claim, or null.</returns>
    Guid? UserId { get; }
}

internal sealed class CurrentUserContext(IHttpContextAccessor accessor) : ICurrentUserContext
{
    public Guid? UserId
    {
        get
        {
            var sub = accessor.HttpContext?.User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }
}
