// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.ServiceDiscovery;
using Xunit;

namespace Devngn.ServiceDefaults.Tests;

public sealed class ServiceDefaultsExtensionsTests
{
    [Fact]
    public void AddServiceDefaults_BuildsHostWithoutErrors()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.AddServiceDefaults();

        using var host = builder.Build();

        Assert.NotNull(host.Services);
    }

    [Fact]
    public void AddServiceDefaults_RegistersServiceDiscovery()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.AddServiceDefaults();

        using var host = builder.Build();
        var resolver = host.Services.GetService<ServiceEndpointResolver>();

        Assert.NotNull(resolver);
    }

    [Fact]
    public void AddServiceDefaults_RegistersHttpClientFactory_AndCreatesNamedClient()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.AddServiceDefaults();

        using var host = builder.Build();
        var factory = host.Services.GetRequiredService<IHttpClientFactory>();
        using var client = factory.CreateClient("wellness-api");

        Assert.NotNull(client);
    }

    [Fact]
    public void AddDefaultHealthChecks_RegistersSelfCheck()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.AddDefaultHealthChecks();

        using var host = builder.Build();
        var options = host.Services.GetRequiredService<IOptions<HealthCheckServiceOptions>>().Value;

        Assert.Contains(options.Registrations, r => r.Name == "self" && r.Tags.Contains("live"));
    }
}
