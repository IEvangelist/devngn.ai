// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Integration;

/// <summary>
/// Spins up a real Postgres container, applies the wellness migrations once,
/// and exposes a connection string that integration tests can share via the
/// <see cref="PostgresCollection"/> xUnit collection.
/// </summary>
public sealed class PostgresContainerFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("wellnessdb")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var ctx = CreateContext();
        await ctx.Database.MigrateAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    public WellnessDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<WellnessDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        return new WellnessDbContext(options);
    }
}

[CollectionDefinition(nameof(PostgresCollection))]
public sealed class PostgresCollection : ICollectionFixture<PostgresContainerFixture>;
