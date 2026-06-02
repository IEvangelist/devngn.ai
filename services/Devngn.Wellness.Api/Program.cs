// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Data;
using Microsoft.AspNetCore.OpenApi;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Aspire ServiceDefaults: OpenTelemetry, health checks, service discovery,
// and resilient HttpClient defaults applied to every named HttpClient.
builder.AddServiceDefaults();

// Postgres + EF Core wired through Aspire's integration: registers DbContext,
// health check, retries, OpenTelemetry instrumentation, and connection pooling.
builder.AddNpgsqlDbContext<WellnessDbContext>("wellnessdb");

builder.Services.AddOpenApi("v1", options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info.Title = "devngn.ai Wellness API";
        document.Info.Version = "v1";
        document.Info.Description = "Opt-in dev wellness service: profiles, goals, equipment, schedule gaps, and short activity prompts.";
        document.Info.License = new() { Name = "MIT", Url = new("https://github.com/IEvangelist/devngn.ai/blob/main/LICENSE") };
        document.Info.Contact = new() { Name = "David Pine", Url = new("https://github.com/IEvangelist/devngn.ai") };
        return Task.CompletedTask;
    });
});

var app = builder.Build();

// /health (all checks) and /alive (liveness only) from Devngn.ServiceDefaults.
app.MapDefaultEndpoints();

if (app.Environment.IsDevelopment())
{
    // /openapi/v1.json
    app.MapOpenApi();
    // /scalar/v1
    app.MapScalarApiReference();
}

// Smoke endpoint until domain endpoints land in subsequent milestones.
app.MapGet("/v1/hello", () => Results.Ok(new HelloResponse("devngn.ai wellness", DateTimeOffset.UtcNow)))
    .WithName("Hello")
    .WithTags("Meta");

app.Run();

internal sealed record HelloResponse(string Service, DateTimeOffset Timestamp);

public partial class Program;
