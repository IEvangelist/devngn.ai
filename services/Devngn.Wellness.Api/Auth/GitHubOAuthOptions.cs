// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// Configuration for the GitHub OAuth integration. Bind from <c>Auth:GitHub</c>.
/// Endpoint URLs default to GitHub's production values; tests override them to
/// point at <see cref="HttpMessageHandler"/> fakes hosted on <c>http://localhost</c>.
/// </summary>
public sealed class GitHubOAuthOptions
{
    public const string SectionName = "Auth:GitHub";

    [Required(AllowEmptyStrings = false)]
    public string ClientId { get; set; } = string.Empty;

    [Required(AllowEmptyStrings = false)]
    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>
    /// Space-separated list of GitHub OAuth scopes. Defaults to <c>read:user</c> only.
    /// We intentionally avoid <c>user:email</c> — email is not used by the wellness service.
    /// </summary>
    public string Scopes { get; set; } = "read:user";

    [Required, Url]
    public string DeviceCodeEndpoint { get; set; } = "https://github.com/login/device/code";

    [Required, Url]
    public string AccessTokenEndpoint { get; set; } = "https://github.com/login/oauth/access_token";

    [Required, Url]
    public string AuthorizeEndpoint { get; set; } = "https://github.com/login/oauth/authorize";

    [Required, Url]
    public string UserEndpoint { get; set; } = "https://api.github.com/user";

    /// <summary>
    /// Server-relative path the web flow redirects to. Used to construct the
    /// <c>redirect_uri</c> sent to GitHub. Defaults to <c>/v1/auth/github/web/callback</c>.
    /// </summary>
    [Required]
    public string WebCallbackPath { get; set; } = "/v1/auth/github/web/callback";

    /// <summary>User-Agent header value GitHub requires on API requests.</summary>
    [Required]
    public string UserAgent { get; set; } = "devngn.ai-wellness/1.0";
}
