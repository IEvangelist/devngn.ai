// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Devngn.Wellness.MigrationWorker;

var builder = Host.CreateApplicationBuilder(args);

// Aspire ServiceDefaults: OpenTelemetry, health checks, and service discovery
// so migration spans, logs, and metrics show up alongside the API in the
// Aspire dashboard.
builder.AddServiceDefaults();

// Same EF Core registration as the API: Aspire wires the connection string,
// connection pooling, retries, health check, and OpenTelemetry instrumentation
// from the "wellnessdb" resource declared in the AppHost.
builder.AddNpgsqlDbContext<WellnessDbContext>("wellnessdb");

builder.Services.AddHostedService<MigrationWorker>();

builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing.AddSource(MigrationWorker.ActivitySourceName));

var host = builder.Build();
host.Run();

namespace Devngn.Wellness.MigrationWorker
{
    public partial class Program;
}
