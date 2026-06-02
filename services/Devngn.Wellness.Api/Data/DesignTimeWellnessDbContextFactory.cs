// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Devngn.Wellness.Api.Data;

/// <summary>
/// Used by <c>dotnet ef</c> at design time so migrations can be generated without
/// running the full Aspire host. The connection string is a placeholder - migrations
/// never connect to a real database during generation.
/// </summary>
internal sealed class DesignTimeWellnessDbContextFactory : IDesignTimeDbContextFactory<WellnessDbContext>
{
    public WellnessDbContext CreateDbContext(string[] args)
    {
        var builder = new DbContextOptionsBuilder<WellnessDbContext>()
            .UseNpgsql("Host=localhost;Port=5432;Database=wellnessdb;Username=designtime;Password=designtime");

        return new WellnessDbContext(builder.Options);
    }
}
