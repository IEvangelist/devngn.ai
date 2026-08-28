// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Infrastructure;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Infrastructure;

public sealed class WellnessCorsExtensionsTests
{
    [Fact]
    public async Task Production_policy_allows_only_the_site_and_desktop_origins()
    {
        using var services = CreateServices(Environments.Production);
        var policy = await GetPolicyAsync(services);

        Assert.False(policy.AllowAnyOrigin);
        Assert.Equal(
            WellnessCorsExtensions.ProductionOrigins.Order(),
            policy.Origins.Order());
        Assert.True(policy.AllowAnyHeader);
        Assert.True(policy.AllowAnyMethod);
    }

    [Fact]
    public async Task Development_policy_allows_any_origin()
    {
        using var services = CreateServices(Environments.Development);
        var policy = await GetPolicyAsync(services);

        Assert.True(policy.AllowAnyOrigin);
    }

    private static ServiceProvider CreateServices(string environmentName)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddWellnessCors(new TestHostEnvironment(environmentName));
        return services.BuildServiceProvider();
    }

    private static async Task<CorsPolicy> GetPolicyAsync(ServiceProvider services)
    {
        var provider = services.GetRequiredService<ICorsPolicyProvider>();
        var context = new DefaultHttpContext { RequestServices = services };
        return await provider.GetPolicyAsync(context, WellnessCorsExtensions.PolicyName)
            ?? throw new InvalidOperationException("Wellness CORS policy was not registered.");
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;

        public string ApplicationName { get; set; } = "Devngn.Wellness.Api.Tests";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
