// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Schedule.OAuth;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;

namespace Devngn.Wellness.Api.Schedule.Google;

public static class WellnessGoogleExtensions
{
    public static IServiceCollection AddWellnessGoogleCalendar(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<GoogleCalendarOptions>()
            .Bind(configuration.GetSection(GoogleCalendarOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // OAuth token exchange MUST NOT be retried. Google rotates refresh tokens, so
        // a retried request after a connection-reset on the response read can be
        // recorded as `invalid_grant` and lock us out of an otherwise-fine source.
        // RemoveAllResilienceHandlers is the supported way to opt one named client out
        // of the global standard pipeline added by ServiceDefaults.
#pragma warning disable EXTEXP0001
        services
            .AddHttpClient(GoogleCalendarClient.TokenHttpClientName, ConfigureTokenClient)
            .RemoveAllResilienceHandlers();
#pragma warning restore EXTEXP0001

        // free/busy is safely retryable; let the standard resilience handler kick in
        // for transient 5xx/429s.
        services.AddHttpClient(GoogleCalendarClient.CalendarHttpClientName, ConfigureCalendarClient);

        services.AddScoped<IScheduleOAuthStateStore, ScheduleOAuthStateStore>();
        services.AddScoped<IGoogleCalendarClient, GoogleCalendarClient>();
        services.AddScoped<GoogleScheduleSyncService>();

        return services;

        static void ConfigureTokenClient(IServiceProvider sp, HttpClient client)
        {
            var opts = sp.GetRequiredService<IOptions<GoogleCalendarOptions>>().Value;
            client.Timeout = opts.RequestTimeout;
            client.DefaultRequestHeaders.UserAgent.ParseAdd("devngn-wellness/1.0 (+https://github.com/IEvangelist/devngn.ai)");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        }

        static void ConfigureCalendarClient(IServiceProvider sp, HttpClient client)
        {
            var opts = sp.GetRequiredService<IOptions<GoogleCalendarOptions>>().Value;
            client.Timeout = opts.RequestTimeout;
            client.DefaultRequestHeaders.UserAgent.ParseAdd("devngn-wellness/1.0 (+https://github.com/IEvangelist/devngn.ai)");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        }
    }
}
