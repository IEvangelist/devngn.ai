// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.Http.Headers;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Client;

/// <summary>
/// Delegating handler that attaches the bearer token supplied by
/// <see cref="WellnessClientOptions.AccessTokenProvider"/> to every outgoing request.
/// </summary>
internal sealed class WellnessAuthHandler(IOptions<WellnessClientOptions> options) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var provider = options.Value.AccessTokenProvider;
        if (provider is not null)
        {
            var token = await provider(cancellationToken).ConfigureAwait(false);
            if (!string.IsNullOrWhiteSpace(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }
        }

        return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
    }
}
