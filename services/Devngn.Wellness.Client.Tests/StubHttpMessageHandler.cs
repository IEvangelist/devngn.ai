// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Text;

namespace Devngn.Wellness.Client.Tests;

/// <summary>
/// Test double that records every outgoing request and returns a caller-supplied response.
/// </summary>
internal sealed class StubHttpMessageHandler : HttpMessageHandler
{
    public List<RecordedRequest> Requests { get; } = [];

    public Func<HttpRequestMessage, string?, StubResponse> Responder { get; set; } =
        static (_, _) => new StubResponse(HttpStatusCode.OK, "null");

    public int CountRequests(HttpMethod method, string pathContains) =>
        Requests.Count(r => r.Method == method && r.Uri.PathAndQuery.Contains(pathContains, StringComparison.Ordinal));

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        string? body = null;
        if (request.Content is not null)
        {
            body = await request.Content.ReadAsStringAsync(cancellationToken);
        }

        Requests.Add(new RecordedRequest(request.Method, request.RequestUri!, request.Headers.Authorization?.ToString(), body));

        var spec = Responder(request, body);
        var response = new HttpResponseMessage(spec.StatusCode);
        if (spec.Content is not null)
        {
            response.Content = new StringContent(spec.Content, Encoding.UTF8, "application/json");
        }

        return response;
    }
}

internal sealed record StubResponse(HttpStatusCode StatusCode, string? Content);

internal sealed record RecordedRequest(HttpMethod Method, Uri Uri, string? Authorization, string? Body);
