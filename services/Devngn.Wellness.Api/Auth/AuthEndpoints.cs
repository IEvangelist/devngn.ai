// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Security.Claims;
using System.Web;
using Devngn.Wellness.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Devngn.Wellness.Api.Auth;

internal static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/v1/auth").WithTags("Auth");

        group.MapPost("/github/device", StartDeviceFlowAsync)
            .WithName("StartDeviceFlow")
            .AllowAnonymous();

        group.MapPost("/github/device/poll", PollDeviceFlowAsync)
            .WithName("PollDeviceFlow")
            .AllowAnonymous();

        group.MapGet("/github/web/start", StartWebFlow)
            .WithName("StartWebFlow")
            .AllowAnonymous();

        group.MapGet("/github/web/callback", WebCallbackAsync)
            .WithName("WebCallback")
            .AllowAnonymous();

        group.MapGet("/me", GetMeAsync)
            .WithName("GetMe")
            .RequireAuthorization();

        return group;
    }

    // ---------------------------------------------------------------------
    // Device Flow

    public sealed record DeviceFlowStartResponse(
        string SessionId,
        string UserCode,
        string VerificationUri,
        int ExpiresInSeconds,
        int IntervalSeconds);

    public sealed record DeviceFlowPollRequest(string SessionId);

    public sealed record AccessTokenResponse(
        string AccessToken,
        string TokenType,
        DateTimeOffset ExpiresAt,
        AuthenticatedUserResponse User);

    public sealed record AuthenticatedUserResponse(
        Guid Id,
        long GitHubId,
        string Login,
        string? DisplayName,
        string? AvatarUrl);

    public sealed record AuthErrorResponse(string Error, string? Description = null);

    private static async Task<IResult> StartDeviceFlowAsync(
        IGitHubOAuthService github,
        IDeviceFlowStore store,
        CancellationToken ct)
    {
        var device = await github.RequestDeviceCodeAsync(ct);

        var handle = store.Create(
            device.DeviceCode,
            TimeSpan.FromSeconds(Math.Max(60, device.ExpiresIn)),
            Math.Max(1, device.Interval));

        return Results.Ok(new DeviceFlowStartResponse(
            handle,
            device.UserCode,
            device.VerificationUri,
            device.ExpiresIn,
            device.Interval));
    }

    private static async Task<IResult> PollDeviceFlowAsync(
        DeviceFlowPollRequest body,
        HttpContext http,
        IGitHubOAuthService github,
        IDeviceFlowStore store,
        IUserUpserter upserter,
        IJwtTokenService jwt,
        CancellationToken ct)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.SessionId))
        {
            return Results.BadRequest(new AuthErrorResponse("invalid_request", "sessionId is required."));
        }

        var session = store.BeginPoll(body.SessionId);
        if (session is null)
        {
            return Results.Json(
                new AuthErrorResponse("expired_token", "Unknown or expired device flow session."),
                statusCode: StatusCodes.Status410Gone);
        }

        if (session.TooSoon)
        {
            http.Response.Headers.RetryAfter = session.IntervalSeconds.ToString();
            return Results.Json(
                new AuthErrorResponse("slow_down", $"Wait at least {session.IntervalSeconds}s between polls."),
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        var outcome = await github.PollDeviceTokenAsync(session.DeviceCode, ct);

        switch (outcome)
        {
            case DevicePollOutcome.Pending pending:
                http.Response.Headers.RetryAfter = pending.IntervalSeconds.ToString();
                return Results.Json(
                    new AuthErrorResponse("authorization_pending"),
                    statusCode: StatusCodes.Status202Accepted);

            case DevicePollOutcome.SlowDown slow:
                store.IncreaseInterval(body.SessionId, slow.IntervalSeconds);
                http.Response.Headers.RetryAfter = slow.IntervalSeconds.ToString();
                return Results.Json(
                    new AuthErrorResponse("slow_down"),
                    statusCode: StatusCodes.Status429TooManyRequests);

            case DevicePollOutcome.Failed failed:
                store.Remove(body.SessionId);
                var status = failed.Error switch
                {
                    "expired_token" => StatusCodes.Status410Gone,
                    "access_denied" => StatusCodes.Status403Forbidden,
                    "device_flow_disabled" => StatusCodes.Status409Conflict,
                    _ => StatusCodes.Status400BadRequest,
                };
                return Results.Json(new AuthErrorResponse(failed.Error, failed.Description), statusCode: status);

            case DevicePollOutcome.Succeeded ok:
                store.Remove(body.SessionId);
                return await CompleteSignInAsync(ok.AccessToken, github, upserter, jwt, ct);

            default:
                return Results.Problem("Unhandled device-flow outcome.", statusCode: 500);
        }
    }

    // ---------------------------------------------------------------------
    // Web Flow

    private static IResult StartWebFlow(
        string? returnPath,
        HttpRequest request,
        IOAuthStateStore stateStore,
        IOptions<GitHubOAuthOptions> options)
    {
        if (!IsSafeRelativePath(returnPath))
        {
            return Results.BadRequest(new AuthErrorResponse(
                "invalid_return_path",
                "returnPath must be a relative path beginning with '/' and contain no scheme or '//'."));
        }

        var opts = options.Value;
        var state = stateStore.Create(returnPath);
        var redirectUri = BuildRedirectUri(request, opts.WebCallbackPath);

        var query = HttpUtility.ParseQueryString(string.Empty);
        query["client_id"] = opts.ClientId;
        query["redirect_uri"] = redirectUri;
        query["scope"] = opts.Scopes;
        query["state"] = state.State;
        query["code_challenge"] = state.CodeChallenge;
        query["code_challenge_method"] = "S256";
        query["allow_signup"] = "true";

        var separator = opts.AuthorizeEndpoint.Contains('?') ? '&' : '?';
        var url = $"{opts.AuthorizeEndpoint}{separator}{query}";

        return Results.Redirect(url, permanent: false);
    }

    private static async Task<IResult> WebCallbackAsync(
        string? code,
        string? state,
        string? error,
        string? error_description,
        HttpRequest request,
        IOAuthStateStore stateStore,
        IGitHubOAuthService github,
        IUserUpserter upserter,
        IJwtTokenService jwt,
        IOptions<GitHubOAuthOptions> options,
        CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(error))
        {
            return Results.BadRequest(new AuthErrorResponse(error, error_description));
        }
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
        {
            return Results.BadRequest(new AuthErrorResponse("invalid_request", "code and state are required."));
        }

        var bound = stateStore.Take(state);
        if (bound is null)
        {
            return Results.BadRequest(new AuthErrorResponse("invalid_state", "Unknown, expired, or replayed state."));
        }

        var redirectUri = BuildRedirectUri(request, options.Value.WebCallbackPath);
        var outcome = await github.ExchangeWebCodeAsync(code, redirectUri, bound.CodeVerifier, ct);

        if (outcome is WebCallbackOutcome.Failed failed)
        {
            return Results.BadRequest(new AuthErrorResponse(failed.Error, failed.Description));
        }
        if (outcome is not WebCallbackOutcome.Succeeded ok)
        {
            return Results.Problem("Unhandled web-callback outcome.", statusCode: 500);
        }

        var token = await CompleteSignInAsync(ok.AccessToken, github, upserter, jwt, ct);

        // No bound return path → JSON for programmatic clients (curl, tests).
        if (string.IsNullOrEmpty(bound.ReturnPath))
        {
            return token;
        }

        // Return the JWT to the caller via URL fragment so it never appears in server logs
        // or HTTP Referer headers. ReturnPath was already validated as a safe relative path.
        var issued = ExtractIssuedTokenForRedirect(token);
        var fragment = $"#access_token={Uri.EscapeDataString(issued.AccessToken)}" +
                       $"&token_type={Uri.EscapeDataString(issued.TokenType)}" +
                       $"&expires_at={Uri.EscapeDataString(issued.ExpiresAt.ToUnixTimeSeconds().ToString())}";
        return Results.Redirect(bound.ReturnPath + fragment, permanent: false);
    }

    // ---------------------------------------------------------------------
    // /me

    private static async Task<IResult> GetMeAsync(
        ClaimsPrincipal principal,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(sub) || !Guid.TryParse(sub, out var userId))
        {
            return Results.Unauthorized();
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        return user is null
            ? Results.NotFound(new AuthErrorResponse("user_not_found", "The authenticated user no longer exists."))
            : Results.Ok(new AuthenticatedUserResponse(
                user.Id, user.GitHubId, user.Login, user.DisplayName, user.AvatarUrl));
    }

    // ---------------------------------------------------------------------
    // Helpers

    /// <summary>
    /// Shared tail of both device-flow and web-flow success paths: fetch the GitHub user,
    /// upsert the local <see cref="Data.Entities.User"/>, mint a JWT, and shape the response.
    /// </summary>
    private static async Task<IResult> CompleteSignInAsync(
        string githubAccessToken,
        IGitHubOAuthService github,
        IUserUpserter upserter,
        IJwtTokenService jwt,
        CancellationToken ct)
    {
        var ghUser = await github.GetUserAsync(githubAccessToken, ct);
        var user = await upserter.UpsertAsync(ghUser, ct);
        var token = jwt.Issue(user);

        return Results.Ok(new AccessTokenResponse(
            token.AccessToken,
            token.TokenType,
            token.ExpiresAt,
            new AuthenticatedUserResponse(user.Id, user.GitHubId, user.Login, user.DisplayName, user.AvatarUrl)));
    }

    private static IssuedToken ExtractIssuedTokenForRedirect(IResult result)
    {
        // CompleteSignInAsync always returns Results.Ok(AccessTokenResponse). We need the
        // raw token to build a redirect fragment; reach into the typed value via
        // IValueHttpResult to keep this strongly typed and avoid serialization round-trips.
        if (result is Microsoft.AspNetCore.Http.HttpResults.Ok<AccessTokenResponse> ok && ok.Value is { } body)
        {
            return new IssuedToken(body.AccessToken, body.ExpiresAt, body.TokenType);
        }
        throw new InvalidOperationException("Expected an Ok<AccessTokenResponse> result from sign-in completion.");
    }

    /// <summary>
    /// Validates <paramref name="returnPath"/> is either null/empty or a relative path that
    /// cannot be coerced into an absolute or protocol-relative URL. This is the only thing
    /// standing between us and a token-exfiltration redirect, so be strict.
    /// </summary>
    internal static bool IsSafeRelativePath(string? returnPath)
    {
        if (string.IsNullOrEmpty(returnPath))
        {
            return true;
        }
        if (!returnPath.StartsWith('/'))
        {
            return false;
        }
        // "//host", "/\\host", and any scheme prefix would all resolve to an off-site URL.
        if (returnPath.StartsWith("//", StringComparison.Ordinal) ||
            returnPath.StartsWith("/\\", StringComparison.Ordinal))
        {
            return false;
        }
        if (Uri.TryCreate(returnPath, UriKind.Absolute, out _))
        {
            return false;
        }
        return true;
    }

    private static string BuildRedirectUri(HttpRequest request, string callbackPath)
        => $"{request.Scheme}://{request.Host}{callbackPath}";
}
