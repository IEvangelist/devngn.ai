// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Tests.Auth;

/// <summary>
/// Minimal HttpMessageHandler stub: hands every request to a caller-supplied delegate.
/// Used to test <see cref="Devngn.Wellness.Api.Auth.GitHubOAuthService"/> without
/// hitting the network.
/// </summary>
internal sealed class StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
    : HttpMessageHandler
{
    public List<HttpRequestMessage> Requests { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        return await handler(request, cancellationToken);
    }
}
