// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Auth;
using Devngn.Wellness.Api.Tests.Integration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Auth;

[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class UserUpserterTests(PostgresContainerFixture fixture)
{
    [Fact]
    public async Task First_login_creates_new_user_row()
    {
        var gh = NewGitHubUser();

        await using var ctx = fixture.CreateContext();
        var upserter = new UserUpserter(ctx, TimeProvider.System, NullLogger<UserUpserter>.Instance);

        var user = await upserter.UpsertAsync(gh, default);

        Assert.NotEqual(Guid.Empty, user.Id);
        Assert.Equal(gh.Id, user.GitHubId);
        Assert.Equal(gh.Login, user.Login);
        Assert.Equal(gh.Name, user.DisplayName);
    }

    [Fact]
    public async Task Second_login_updates_mutable_fields_in_place_and_keeps_user_id()
    {
        var gh1 = NewGitHubUser();
        Guid firstId;

        await using (var ctx = fixture.CreateContext())
        {
            var upserter = new UserUpserter(ctx, TimeProvider.System, NullLogger<UserUpserter>.Instance);
            firstId = (await upserter.UpsertAsync(gh1, default)).Id;
        }

        var gh2 = gh1 with { Login = "renamed-login", Name = "Renamed Dev", AvatarUrl = "https://avatars.example/new" };
        await using (var ctx2 = fixture.CreateContext())
        {
            var upserter = new UserUpserter(ctx2, TimeProvider.System, NullLogger<UserUpserter>.Instance);
            var updated = await upserter.UpsertAsync(gh2, default);

            Assert.Equal(firstId, updated.Id);
            Assert.Equal("renamed-login", updated.Login);
            Assert.Equal("Renamed Dev", updated.DisplayName);
            Assert.Equal("https://avatars.example/new", updated.AvatarUrl);
        }
    }

    [Fact]
    public async Task Concurrent_first_time_logins_for_same_github_id_resolve_to_a_single_row()
    {
        var gh = NewGitHubUser();

        async Task<Guid> RunUpsertAsync()
        {
            await using var ctx = fixture.CreateContext();
            var upserter = new UserUpserter(ctx, TimeProvider.System, NullLogger<UserUpserter>.Instance);
            return (await upserter.UpsertAsync(gh, default)).Id;
        }

        var tasks = Enumerable.Range(0, 5).Select(_ => RunUpsertAsync()).ToArray();
        var ids = await Task.WhenAll(tasks);

        var distinct = ids.Distinct().ToArray();
        Assert.Single(distinct);

        await using var verify = fixture.CreateContext();
        var rowCount = verify.Users.Count(u => u.GitHubId == gh.Id);
        Assert.Equal(1, rowCount);
    }

    private static GitHubUser NewGitHubUser() => new(
        Id: Random.Shared.NextInt64(1, long.MaxValue),
        Login: $"login-{Guid.NewGuid():N}",
        Name: "Test Dev",
        AvatarUrl: "https://avatars.example/old");
}
