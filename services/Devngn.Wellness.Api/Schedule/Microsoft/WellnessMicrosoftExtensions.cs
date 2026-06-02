// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Schedule.OAuth;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Microsoft;

public static class WellnessMicrosoftExtensions
{
    public static IServiceCollection AddWellnessMicrosoftCalendar(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<MicrosoftCalendarOptions>()
            .Bind(configuration.GetSection(MicrosoftCalendarOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // Same retry-suppression rationale as Google: Microsoft rotates refresh tokens,
        // so a retried refresh after a read-side connection-reset can land us with the
        // "old" token persisted while Microsoft has activated the "new" one.
#pragma warning disable EXTEXP0001
        services
            .AddHttpClient(MicrosoftCalendarClient.TokenHttpClientName, ConfigureTokenClient)
            .RemoveAllResilienceHandlers();
#pragma warning restore EXTEXP0001

        // calendarView is a safely-retryable GET; let the standard resilience handler
        // kick in for 5xx/429 transient errors.
        services.AddHttpClient(MicrosoftCalendarClient.GraphHttpClientName, ConfigureGraphClient);

        // IScheduleOAuthStateStore is provider-agnostic; only register once. AddWellnessGoogleCalendar
        // adds it too — TryAdd guards against double-registration when both providers are wired.
        services.TryAddScoped<IScheduleOAuthStateStore, ScheduleOAuthStateStore>();
        services.AddScoped<IMicrosoftCalendarClient, MicrosoftCalendarClient>();
        services.AddScoped<MicrosoftScheduleSyncService>();

        return services;

        static void ConfigureTokenClient(IServiceProvider sp, HttpClient client)
        {
            var opts = sp.GetRequiredService<IOptions<MicrosoftCalendarOptions>>().Value;
            client.Timeout = opts.RequestTimeout;
            client.DefaultRequestHeaders.UserAgent.ParseAdd("devngn-wellness/1.0 (+https://github.com/IEvangelist/devngn.ai)");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        }

        static void ConfigureGraphClient(IServiceProvider sp, HttpClient client)
        {
            var opts = sp.GetRequiredService<IOptions<MicrosoftCalendarOptions>>().Value;
            client.Timeout = opts.RequestTimeout;
            client.DefaultRequestHeaders.UserAgent.ParseAdd("devngn-wellness/1.0 (+https://github.com/IEvangelist/devngn.ai)");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        }
    }
}
