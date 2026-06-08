// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.WebSockets;
using System.Text.Json;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.Data.Entities;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Prompts;

/// <summary>
/// Prompt-delivery surface. REST endpoints for history + lifecycle (dismiss / complete
/// / feedback) and an on-demand <c>POST /v1/prompts/next</c>, plus long-lived
/// <c>GET /v1/prompts/stream</c> (SSE) and <c>GET /v1/prompts/ws</c> (WebSocket)
/// subscriptions that push a prompt as soon as a gap opens.
/// </summary>
/// <remarks>
/// All endpoints authenticate with the same JWT bearer the rest of the API uses. The
/// documented streaming consumers (the VS Code extension and CLI daemon) run on Node
/// and set the <c>Authorization</c> header on their EventSource / WebSocket clients; a
/// browser-native <c>EventSource</c> (which can't set headers) is not a v1 target and
/// would need a cookie / negotiated-token scheme instead.
/// </remarks>
internal static class PromptEndpoints
{
    public static IEndpointRouteBuilder MapPromptEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/v1/prompts")
            .WithTags("Prompts")
            .RequireAuthorization()
            .RequireConsent();

        group.MapGet("", ListAsync).WithName("ListPrompts");
        group.MapPost("next", NextAsync).WithName("NextPrompt");
        group.MapPost("{id:guid}/dismiss", DismissAsync).WithName("DismissPrompt");
        group.MapPost("{id:guid}/complete", CompleteAsync).WithName("CompletePrompt");
        group.MapPost("{id:guid}/feedback", FeedbackAsync)
            .ValidateBody<RouteHandlerBuilder, FeedbackRequest>()
            .WithName("SubmitPromptFeedback");
        group.MapGet("stream", StreamAsync).WithName("StreamPrompts");
        group.MapGet("ws", WebSocketAsync).WithName("PromptsWebSocket");

        return app;
    }

    private static async Task<IResult> ListAsync(
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        IOptions<PromptDeliveryOptions> options,
        [FromQuery] int? limit,
        CancellationToken ct)
    {
        var opts = options.Value;
        var take = limit is { } l and > 0 ? Math.Min(l, opts.HistoryMaxLimit) : opts.HistoryDefaultLimit;

        var userId = currentUser.UserId!.Value;
        var rows = await db.Prompts
            .AsNoTracking()
            .Include(p => p.Activity)
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.DeliveredAt)
            .ThenByDescending(p => p.Id)
            .Take(take)
            .ToListAsync(ct);

        var response = rows.Select(p => PromptResponse.From(p, p.Activity!)).ToList();
        return Results.Ok(response);
    }

    private static async Task<IResult> NextAsync(
        ICurrentUserContext currentUser,
        IPromptService service,
        [FromQuery] string? tz,
        [FromQuery] string? channel,
        CancellationToken ct)
    {
        if (!TryResolveTimeZone(tz, out var timeZone, out var tzError))
        {
            return tzError!;
        }
        if (!TryParseChannel(channel, out var deliveryChannel, out var channelError))
        {
            return channelError!;
        }

        var userId = currentUser.UserId!.Value;
        var prompt = await service.GenerateNextPromptAsync(userId, deliveryChannel, timeZone, ct);
        return prompt is null ? Results.NoContent() : Results.Ok(prompt);
    }

    private static Task<IResult> DismissAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
        => SetLifecycleAsync(id, currentUser, db, ct, p => p.DismissedAt ??= clock.GetUtcNow());

    private static Task<IResult> CompleteAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        TimeProvider clock,
        CancellationToken ct)
        => SetLifecycleAsync(id, currentUser, db, ct, p => p.CompletedAt ??= clock.GetUtcNow());

    private static async Task<IResult> FeedbackAsync(
        Guid id,
        [FromBody] FeedbackRequest request,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        var prompt = await db.Prompts
            .Include(p => p.Activity)
            .SingleOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (prompt is null)
        {
            return Results.NotFound();
        }

        prompt.FeedbackRating = request.Rating;
        await db.SaveChangesAsync(ct);
        return Results.Ok(PromptResponse.From(prompt, prompt.Activity!));
    }

    /// <summary>
    /// Shared dismiss / complete handler. Scoped by id AND userId so another user's
    /// prompt id returns 404 (not 403, never leaking existence). The mutation is
    /// idempotent — the timestamp is only set if it was null — so retries are safe.
    /// </summary>
    private static async Task<IResult> SetLifecycleAsync(
        Guid id,
        ICurrentUserContext currentUser,
        WellnessDbContext db,
        CancellationToken ct,
        Action<Prompt> mutate)
    {
        var userId = currentUser.UserId!.Value;
        var prompt = await db.Prompts
            .Include(p => p.Activity)
            .SingleOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (prompt is null)
        {
            return Results.NotFound();
        }

        mutate(prompt);
        await db.SaveChangesAsync(ct);
        return Results.Ok(PromptResponse.From(prompt, prompt.Activity!));
    }

    /// <summary>
    /// Server-Sent Events subscription. Emits a <c>prompt</c> event whenever a gap is
    /// active and the user is out of cooldown; otherwise a heartbeat comment keeps the
    /// connection alive. The first detection runs immediately, so a client that
    /// connects during an open gap is notified without waiting a full poll interval.
    /// </summary>
    private static async Task StreamAsync(
        HttpContext http,
        ICurrentUserContext currentUser,
        IServiceScopeFactory scopeFactory,
        IOptions<PromptDeliveryOptions> options,
        IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions> jsonOptions,
        ILoggerFactory loggerFactory,
        [FromQuery] string? tz,
        [FromQuery] string? channel,
        CancellationToken ct)
    {
        var userId = currentUser.UserId!.Value;
        if (!TryResolveTimeZone(tz, out var timeZone, out _))
        {
            await WriteValidationAsync(http, "tz", InvalidTimeZoneMessage(tz), ct);
            return;
        }
        if (!TryParseChannel(channel, out var deliveryChannel, out _))
        {
            await WriteValidationAsync(http, "channel", InvalidChannelMessage(channel), ct);
            return;
        }

        var logger = loggerFactory.CreateLogger("Devngn.Wellness.Api.Prompts.Stream");
        var serializer = jsonOptions.Value.SerializerOptions;
        var poll = TimeSpan.FromSeconds(options.Value.StreamPollSeconds);

        http.Response.Headers.ContentType = "text/event-stream";
        http.Response.Headers.CacheControl = "no-cache";

        try
        {
            while (!ct.IsCancellationRequested)
            {
                var prompt = await TryGenerateAsync(scopeFactory, userId, deliveryChannel, timeZone, logger, ct);
                if (prompt is null && ct.IsCancellationRequested)
                {
                    break;
                }

                if (prompt is not null)
                {
                    var json = JsonSerializer.Serialize(prompt, serializer);
                    await http.Response.WriteAsync($"event: prompt\ndata: {json}\n\n", ct);
                }
                else
                {
                    await http.Response.WriteAsync(": heartbeat\n\n", ct);
                }
                await http.Response.Body.FlushAsync(ct);

                await Task.Delay(poll, ct);
            }
        }
        catch (OperationCanceledException)
        {
            // Client disconnected (or the host is shutting down) — a normal end of stream.
        }
    }

    /// <summary>
    /// WebSocket subscription mirroring <see cref="StreamAsync"/>: each delivered prompt
    /// is sent as a single JSON text frame. Non-WebSocket requests get a 400.
    /// </summary>
    private static async Task WebSocketAsync(
        HttpContext http,
        ICurrentUserContext currentUser,
        IServiceScopeFactory scopeFactory,
        IOptions<PromptDeliveryOptions> options,
        IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions> jsonOptions,
        ILoggerFactory loggerFactory,
        [FromQuery] string? tz,
        [FromQuery] string? channel,
        CancellationToken ct)
    {
        if (!http.WebSockets.IsWebSocketRequest)
        {
            await WriteValidationAsync(http, "request", "This endpoint requires a WebSocket upgrade.", ct);
            return;
        }

        var userId = currentUser.UserId!.Value;
        if (!TryResolveTimeZone(tz, out var timeZone, out _))
        {
            await WriteValidationAsync(http, "tz", InvalidTimeZoneMessage(tz), ct);
            return;
        }
        if (!TryParseChannel(channel, out var deliveryChannel, out _))
        {
            await WriteValidationAsync(http, "channel", InvalidChannelMessage(channel), ct);
            return;
        }

        var logger = loggerFactory.CreateLogger("Devngn.Wellness.Api.Prompts.WebSocket");
        var serializer = jsonOptions.Value.SerializerOptions;
        var poll = TimeSpan.FromSeconds(options.Value.StreamPollSeconds);

        using var socket = await http.WebSockets.AcceptWebSocketAsync();
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var token = linkedCts.Token;

        // This is a push-only socket — we never expect application messages from the
        // client — but we must still drain the receive side. Without it, a client's
        // close frame (or a graceful disconnect that doesn't abort the request) is
        // never observed and the send loop polls the database forever; the drain
        // cancels the linked token the moment the client goes away.
        var drain = DrainUntilClosedAsync(socket, linkedCts);
        try
        {
            while (!token.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var prompt = await TryGenerateAsync(scopeFactory, userId, deliveryChannel, timeZone, logger, token);
                if (prompt is not null)
                {
                    var bytes = JsonSerializer.SerializeToUtf8Bytes(prompt, serializer);
                    await socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, token);
                }
                await Task.Delay(poll, token);
            }

            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "stream ended", CancellationToken.None);
            }
        }
        catch (OperationCanceledException)
        {
            // Client disconnected / shutdown — normal.
        }
        catch (WebSocketException)
        {
            // Abrupt client disconnect — nothing actionable.
        }
        finally
        {
            if (!linkedCts.IsCancellationRequested)
            {
                linkedCts.Cancel();
            }
            await drain;
        }
    }

    /// <summary>
    /// Drains the receive side of a push-only <see cref="WebSocket"/>. Completes —
    /// cancelling <paramref name="linkedCts"/> so the send loop unwinds — when the
    /// client sends a close frame or the connection drops. Never throws; transport
    /// faults here are expected end-of-connection signals, not actionable errors.
    /// </summary>
    private static async Task DrainUntilClosedAsync(WebSocket socket, CancellationTokenSource linkedCts)
    {
        var buffer = new byte[256];
        try
        {
            while (!linkedCts.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, linkedCts.Token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Send loop ended first and cancelled us — expected.
        }
        catch (WebSocketException)
        {
            // Client aborted — expected end of connection.
        }
        finally
        {
            if (!linkedCts.IsCancellationRequested)
            {
                linkedCts.Cancel();
            }
        }
    }

    /// <summary>
    /// Runs one generation pass inside its own DI scope (so the streaming connection
    /// never holds a single long-lived <see cref="WellnessDbContext"/>) and swallows
    /// non-cancellation faults — after the response has started we can't turn an
    /// exception into a clean error, so we log and let the loop continue / end.
    /// </summary>
    private static async Task<PromptResponse?> TryGenerateAsync(
        IServiceScopeFactory scopeFactory,
        Guid userId,
        DeliveryChannel channel,
        TimeZoneInfo timeZone,
        ILogger logger,
        CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IPromptService>();
            return await service.GenerateNextPromptAsync(userId, channel, timeZone, ct);
        }
        catch (OperationCanceledException)
        {
            return null;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Prompt generation failed for user {UserId} during streaming delivery.", userId);
            return null;
        }
    }

    private static bool TryResolveTimeZone(string? tz, out TimeZoneInfo timeZone, out IResult? error)
    {
        if (string.IsNullOrWhiteSpace(tz))
        {
            timeZone = TimeZoneInfo.Utc;
            error = null;
            return true;
        }

        try
        {
            timeZone = TimeZoneInfo.FindSystemTimeZoneById(tz);
            error = null;
            return true;
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            timeZone = TimeZoneInfo.Utc;
            error = Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["tz"] = [InvalidTimeZoneMessage(tz)],
            });
            return false;
        }
    }

    private static bool TryParseChannel(string? channel, out DeliveryChannel result, out IResult? error)
    {
        if (string.IsNullOrWhiteSpace(channel))
        {
            result = DeliveryChannel.Web;
            error = null;
            return true;
        }

        if (Enum.TryParse(channel, ignoreCase: true, out result) && Enum.IsDefined(result))
        {
            error = null;
            return true;
        }

        result = DeliveryChannel.Web;
        error = Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["channel"] = [InvalidChannelMessage(channel)],
        });
        return false;
    }

    private static string InvalidTimeZoneMessage(string? tz)
        => $"Unknown or invalid time zone '{tz}'. Use an IANA name (e.g. 'America/New_York') or omit for UTC.";

    private static string InvalidChannelMessage(string? channel)
        => $"Unknown channel '{channel}'. Valid values: vscode, cli, web.";

    private static async Task WriteValidationAsync(HttpContext http, string field, string message, CancellationToken ct)
    {
        http.Response.StatusCode = StatusCodes.Status400BadRequest;
        await http.Response.WriteAsJsonAsync(
            new ValidationProblemDetails(new Dictionary<string, string[]> { [field] = [message] })
            {
                Status = StatusCodes.Status400BadRequest,
            },
            ct);
    }
}
