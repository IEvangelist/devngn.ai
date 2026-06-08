// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;

namespace Devngn.Wellness.Client;

/// <summary>
/// Thrown when the wellness API returns a non-success status code that the client does not
/// translate into a sentinel result (such as <see langword="null"/> for a 404 lookup).
/// </summary>
public sealed class WellnessApiException : Exception
{
    /// <summary>Creates a new <see cref="WellnessApiException"/>.</summary>
    public WellnessApiException(HttpStatusCode statusCode, string message, string? responseBody = null)
        : base(message)
    {
        StatusCode = statusCode;
        ResponseBody = responseBody;
    }

    /// <summary>The HTTP status code returned by the API.</summary>
    public HttpStatusCode StatusCode { get; }

    /// <summary>The raw response body (often a <c>ProblemDetails</c> JSON payload), if any.</summary>
    public string? ResponseBody { get; }
}
