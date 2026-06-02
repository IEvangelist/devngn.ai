// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Data;

/// <summary>
/// EF Core DbContext for the wellness service. Entity sets are added in the domain milestone.
/// </summary>
public sealed class WellnessDbContext(DbContextOptions<WellnessDbContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasDefaultSchema("wellness");
    }
}
