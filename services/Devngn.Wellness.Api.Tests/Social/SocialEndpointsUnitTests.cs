// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Moderation;
using Devngn.Wellness.Api.Social;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Social;

public sealed class SocialEndpointsUnitTests
{
    [Fact]
    public async Task UpsertProfile_ProfanityUnavailable_Returns503()
    {
        var result = await SocialEndpoints.UpsertProfileAsync(
            request: new UpsertSocialProfileRequest
            {
                DisplayName = "Alice the Developer",
                IsPublic = true,
            },
            currentUser: new StubCurrentUserContext(Guid.CreateVersion7()),
            db: null!,
            profanity: new UnavailableProfanityService(),
            ct: CancellationToken.None);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, statusResult.StatusCode);
    }

    private sealed class StubCurrentUserContext(Guid userId) : ICurrentUserContext
    {
        public Guid? UserId => userId;
    }

    private sealed class UnavailableProfanityService : IProfanityService
    {
        public Task<string> SanitizeAsync(string text, CancellationToken cancellationToken = default) =>
            throw new ProfanityServiceUnavailableException("Profanity filter unavailable.");

        public Task<bool> IsCleanAsync(string text, CancellationToken cancellationToken = default) =>
            throw new ProfanityServiceUnavailableException("Profanity filter unavailable.");
    }
}
