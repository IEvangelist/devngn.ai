// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Net;
using System.Net.Http.Json;
using Devngn.Wellness.Api.Moderation;
using Devngn.Wellness.Api.Tests.Auth;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Moderation;

public sealed class ProfanityServiceTests
{
    [Fact]
    public async Task SanitizeAsync_PostsFilterContract_ReturnsFilteredText()
    {
        var handler = new StubHttpMessageHandler(async (request, ct) =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("/profanity/filter", request.RequestUri?.AbsolutePath);

            var body = await request.Content!.ReadFromJsonAsync<FilterRequestDto>(cancellationToken: ct);
            Assert.NotNull(body);
            Assert.Equal("badword", body!.Text);
            Assert.Equal("Asterisk", body.Strategy);
            Assert.Equal("Body", body.Target);

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new
                {
                    containsProfanity = true,
                    inputText = "badword",
                    filteredText = "*******",
                    replacementStrategy = "Asterisk",
                    filtrationSteps = Array.Empty<object>(),
                    matches = Array.Empty<object>(),
                }),
            };
        });
        var service = CreateService(handler);

        var result = await service.SanitizeAsync("badword");

        Assert.Equal("*******", result);
    }

    [Fact]
    public async Task IsCleanAsync_PostsFilterContract_ReturnsInverseContainsProfanity()
    {
        var handler = new StubHttpMessageHandler(async (request, ct) =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("/profanity/filter", request.RequestUri?.AbsolutePath);

            var body = await request.Content!.ReadFromJsonAsync<FilterRequestDto>(cancellationToken: ct);
            Assert.NotNull(body);
            Assert.Equal("badword", body!.Text);
            Assert.Equal("Asterisk", body.Strategy);
            Assert.Equal("Body", body.Target);

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new
                {
                    containsProfanity = true,
                    inputText = "badword",
                    filteredText = "*******",
                    replacementStrategy = "Asterisk",
                    filtrationSteps = Array.Empty<object>(),
                    matches = Array.Empty<object>(),
                }),
            };
        });
        var service = CreateService(handler);

        var result = await service.IsCleanAsync("badword");

        Assert.False(result);
    }

    [Fact]
    public async Task SanitizeAsync_WhenFilterUnreachable_ThrowsUnavailable()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            throw new HttpRequestException("filter unavailable"));
        var service = CreateService(handler);

        await Assert.ThrowsAsync<ProfanityServiceUnavailableException>(
            () => service.SanitizeAsync("badword"));
    }

    [Fact]
    public async Task IsCleanAsync_WhenFilterUnreachable_ThrowsUnavailable()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            throw new HttpRequestException("filter unavailable"));
        var service = CreateService(handler);

        await Assert.ThrowsAsync<ProfanityServiceUnavailableException>(
            () => service.IsCleanAsync("badword"));
    }

    private static ProfanityService CreateService(HttpMessageHandler handler) =>
        new(
            new HttpClient(handler)
            {
                BaseAddress = new Uri("https://profanity-filter"),
            },
            NullLogger<ProfanityService>.Instance);

    private sealed record FilterRequestDto(string Text, string Strategy, string Target);
}
