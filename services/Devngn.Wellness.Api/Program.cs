// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Text.Json.Serialization;
using Devngn.Wellness.Api.Auth;
using Devngn.Wellness.Api.Catalog;
using Devngn.Wellness.Api.Consent;
using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Data;
using Devngn.Wellness.Api.EquipmentApi;
using Devngn.Wellness.Api.Goals;
using Devngn.Wellness.Api.Identity;
using Devngn.Wellness.Api.Profiles;
using Devngn.Wellness.Api.Schedule;
using Devngn.Wellness.Api.Schedule.Gaps;
using Devngn.Wellness.Api.Schedule.Google;
using Devngn.Wellness.Api.Schedule.Microsoft;
using Microsoft.AspNetCore.OpenApi;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Aspire ServiceDefaults: OpenTelemetry, health checks, service discovery,
// and resilient HttpClient defaults applied to every named HttpClient.
builder.AddServiceDefaults();

// Postgres + EF Core wired through Aspire's integration: registers DbContext,
// health check, retries, OpenTelemetry instrumentation, and connection pooling.
builder.AddNpgsqlDbContext<WellnessDbContext>("wellnessdb");

// GitHub OAuth (Device + Web flow), JWT issuance/validation, and named HttpClients
// for github.com + api.github.com. Options are validated at startup so a missing
// signing key fails the process rather than producing insecure tokens.
builder.AddWellnessAuth();

// ASP.NET Core DataProtection with a Postgres-backed key ring + IRefreshTokenProtector
// for encrypting OAuth refresh tokens at rest. Must register BEFORE WellnessIdentity
// so the IHttpContextAccessor pipeline is independent of the key ring.
builder.Services.AddWellnessDataProtection(builder.Configuration);

// Google Calendar OAuth + free/busy sync. Two named HttpClients: token exchange (no
// retries — refresh tokens rotate) and free/busy (default resilience).
builder.Services.AddWellnessGoogleCalendar(builder.Configuration);

// Microsoft Graph OAuth + calendarView sync. Mirrors the Google story: token-exchange
// client opts out of resilience (rotated refresh tokens), Graph client keeps defaults.
builder.Services.AddWellnessMicrosoftCalendar(builder.Configuration);

// Pure gap-detection engine + GET /v1/gaps endpoint. The detector itself has no
// I/O — options are validated at startup so bad config doesn't silently make
// every gap ineligible.
builder.Services.AddWellnessGaps(builder.Configuration);

// Curated wellness activity catalog (mobility, breathing, posture, etc.). Loads
// from an embedded JSON resource, fails startup if validation fails, and seeds
// the database via a hosted service on app start.
builder.Services.AddWellnessActivityCatalog();

// IHttpContextAccessor + scoped ICurrentUserContext for endpoints that need the
// authenticated user id without re-parsing the JWT.
builder.AddWellnessIdentity();

// Enum payloads cross the wire as their string names (e.g. "Mobility") rather than
// integer ordinals so the OpenAPI doc — and the generated TS types — stay stable as
// the C# enums grow.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

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

app.UseAuthentication();
app.UseAuthorization();

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

app.MapAuthEndpoints();
app.MapConsentEndpoints();
app.MapProfileEndpoints();
app.MapGoalEndpoints();
app.MapEquipmentEndpoints();
app.MapScheduleSourceEndpoints();
app.MapScheduleEventEndpoints();
app.MapScheduleConnectEndpoints();
app.MapGapEndpoints();
app.MapActivityEndpoints();

app.Run();

internal sealed record HelloResponse(string Service, DateTimeOffset Timestamp);

public partial class Program;
