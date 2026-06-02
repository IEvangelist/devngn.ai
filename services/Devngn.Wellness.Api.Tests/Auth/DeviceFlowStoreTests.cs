// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Auth;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Auth;

public sealed class DeviceFlowStoreTests
{
    [Fact]
    public void Create_returns_url_safe_handle_and_first_poll_succeeds_immediately()
    {
        var (store, _) = NewStore();

        var handle = store.Create("device-code-123", TimeSpan.FromMinutes(15), intervalSeconds: 5);

        Assert.False(string.IsNullOrEmpty(handle));
        Assert.DoesNotContain('+', handle);
        Assert.DoesNotContain('/', handle);
        Assert.DoesNotContain('=', handle);

        var session = store.BeginPoll(handle);
        Assert.NotNull(session);
        Assert.False(session!.TooSoon);
        Assert.Equal("device-code-123", session.DeviceCode);
        Assert.Equal(5, session.IntervalSeconds);
    }

    [Fact]
    public void BeginPoll_returns_null_for_unknown_handle()
        => Assert.Null(NewStore().Store.BeginPoll("does-not-exist"));

    [Fact]
    public void BeginPoll_returns_too_soon_when_called_inside_interval()
    {
        var (store, time) = NewStore();
        var handle = store.Create("dc", TimeSpan.FromMinutes(15), intervalSeconds: 5);

        store.BeginPoll(handle);                  // first poll allowed
        time.Advance(TimeSpan.FromSeconds(2));    // not enough wait
        var second = store.BeginPoll(handle);

        Assert.NotNull(second);
        Assert.True(second!.TooSoon);
    }

    [Fact]
    public void BeginPoll_allows_next_poll_after_interval_elapses()
    {
        var (store, time) = NewStore();
        var handle = store.Create("dc", TimeSpan.FromMinutes(15), intervalSeconds: 5);

        store.BeginPoll(handle);
        time.Advance(TimeSpan.FromSeconds(5));
        var second = store.BeginPoll(handle);

        Assert.False(second!.TooSoon);
    }

    [Fact]
    public void IncreaseInterval_lengthens_throttling_window()
    {
        var (store, time) = NewStore();
        var handle = store.Create("dc", TimeSpan.FromMinutes(15), intervalSeconds: 5);
        store.BeginPoll(handle);

        store.IncreaseInterval(handle, 30);
        time.Advance(TimeSpan.FromSeconds(10));        // would have passed the old 5s gate

        var session = store.BeginPoll(handle);
        Assert.True(session!.TooSoon);
        Assert.Equal(30, session.IntervalSeconds);
    }

    [Fact]
    public void Remove_makes_the_handle_invalid()
    {
        var (store, _) = NewStore();
        var handle = store.Create("dc", TimeSpan.FromMinutes(15), intervalSeconds: 5);

        store.Remove(handle);
        Assert.Null(store.BeginPoll(handle));
    }

    private static (DeviceFlowStore Store, FakeTimeProvider Time) NewStore()
    {
        // MemoryCache's internal clock is only consulted for absolute-expiration timing,
        // and all advances in these tests stay well inside the 15-minute TTL window, so
        // we let it use real time and only stub our own TimeProvider for the throttling logic.
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero));
        var store = new DeviceFlowStore(new MemoryCache(new MemoryCacheOptions()), time);
        return (store, time);
    }
}
