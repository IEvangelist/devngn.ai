// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Extensions.DependencyInjection;

namespace Devngn.Wellness.Client.Tests;

/// <summary>
/// Wires up an <see cref="IWellnessClient"/> backed by a <see cref="StubHttpMessageHandler"/>
/// so tests can assert on the exact requests issued and control the responses. Resilience is
/// disabled so the pipeline stays deterministic (no retries/timeouts).
/// </summary>
internal static class TestHarness
{
    public static Harness Build(Action<WellnessClientOptions>? configure = null)
    {
        var stub = new StubHttpMessageHandler();
        var services = new ServiceCollection();

        services.AddWellnessClient(o =>
        {
            o.BaseAddress = new Uri("https://wellness.test");
            o.ConfigureResilience = false;
            configure?.Invoke(o);
        });

        services.AddHttpClient(WellnessClientServiceCollectionExtensions.HttpClientName)
            .ConfigurePrimaryHttpMessageHandler(() => stub);

        var provider = services.BuildServiceProvider();
        var client = provider.GetRequiredService<IWellnessClient>();
        return new Harness(client, stub, provider);
    }

    internal sealed class Harness(IWellnessClient client, StubHttpMessageHandler stub, ServiceProvider provider) : IDisposable
    {
        public IWellnessClient Client { get; } = client;

        public StubHttpMessageHandler Stub { get; } = stub;

        public void Dispose() => provider.Dispose();
    }
}
