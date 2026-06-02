// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Extensions.Caching.Memory;

namespace Devngn.Wellness.Api.Auth;

/// <summary>
/// In-memory store mapping a server-minted opaque handle to a GitHub device-flow session.
/// We give clients our own handle rather than GitHub's <c>device_code</c> so that:
/// <list type="number">
///   <item>GitHub's <c>device_code</c> is never observable outside this process.</item>
///   <item>We can enforce per-handle poll throttling and expiry without inventing a separate state machine.</item>
///   <item>We can swap providers later without changing the client contract.</item>
/// </list>
/// </summary>
internal interface IDeviceFlowStore
{
    /// <returns>The opaque handle clients send back on poll.</returns>
    string Create(string deviceCode, TimeSpan ttl, int intervalSeconds);

    /// <summary>
    /// Atomically reads and updates a session for a poll attempt. Returns
    /// <c>null</c> when no session exists for the handle (treat as
    /// <c>410 expired_token</c>). Returns <see cref="DeviceFlowSession.TooSoon"/>
    /// = <c>true</c> when the caller is polling faster than the agreed interval.
    /// </summary>
    DeviceFlowSession? BeginPoll(string handle);

    void IncreaseInterval(string handle, int newIntervalSeconds);

    void Remove(string handle);
}

internal sealed record DeviceFlowSession(string DeviceCode, int IntervalSeconds, DateTimeOffset ExpiresAt, bool TooSoon);

internal sealed class DeviceFlowStore(IMemoryCache cache, TimeProvider timeProvider) : IDeviceFlowStore
{
    private const string KeyPrefix = "auth:device:";

    public string Create(string deviceCode, TimeSpan ttl, int intervalSeconds)
    {
        var handle = Convert.ToBase64String(Guid.CreateVersion7().ToByteArray())
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var now = timeProvider.GetUtcNow();
        var entry = new MutableEntry(deviceCode, intervalSeconds, now.Add(ttl), LastPollAt: DateTimeOffset.MinValue);
        // MemoryCache evicts on wall-clock, not on our injected TimeProvider, so use a
        // relative TTL. In production these clocks match; this also keeps unit tests with
        // a frozen FakeTimeProvider from causing immediate cache eviction.
        cache.Set(KeyPrefix + handle, entry, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl });
        return handle;
    }

    public DeviceFlowSession? BeginPoll(string handle)
    {
        var key = KeyPrefix + handle;
        if (!cache.TryGetValue<MutableEntry>(key, out var entry) || entry is null)
        {
            return null;
        }

        var now = timeProvider.GetUtcNow();
        // GitHub's spec requires us to wait at least `interval` seconds between polls.
        // We enforce this server-side as well so a misbehaving client doesn't make the
        // first request that triggers GitHub's `slow_down`.
        var earliestNextPoll = entry.LastPollAt.AddSeconds(entry.IntervalSeconds);
        var tooSoon = entry.LastPollAt != DateTimeOffset.MinValue && now < earliestNextPoll;

        if (!tooSoon)
        {
            var updated = entry with { LastPollAt = now };
            cache.Set(key, updated, BuildEntryOptions(entry.ExpiresAt, now));
        }

        return new DeviceFlowSession(entry.DeviceCode, entry.IntervalSeconds, entry.ExpiresAt, tooSoon);
    }

    public void IncreaseInterval(string handle, int newIntervalSeconds)
    {
        var key = KeyPrefix + handle;
        if (cache.TryGetValue<MutableEntry>(key, out var entry) && entry is not null)
        {
            var updated = entry with { IntervalSeconds = Math.Max(entry.IntervalSeconds, newIntervalSeconds) };
            cache.Set(key, updated, BuildEntryOptions(entry.ExpiresAt, timeProvider.GetUtcNow()));
        }
    }

    public void Remove(string handle) => cache.Remove(KeyPrefix + handle);

    private static MemoryCacheEntryOptions BuildEntryOptions(DateTimeOffset expiresAt, DateTimeOffset now)
    {
        // Preserve the original session lifetime across re-Sets by computing the remaining
        // TTL ourselves; MemoryCache's own clock is wall-time and doesn't know about our
        // injected TimeProvider.
        var remaining = expiresAt - now;
        if (remaining <= TimeSpan.Zero)
        {
            remaining = TimeSpan.FromMilliseconds(1);
        }
        return new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = remaining };
    }

    private sealed record MutableEntry(string DeviceCode, int IntervalSeconds, DateTimeOffset ExpiresAt, DateTimeOffset LastPollAt);
}
