// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

internal sealed partial class WellnessClient
{
    // --- Auth -------------------------------------------------------------

    public Task<AuthenticatedUserResponse> GetCurrentUserAsync(CancellationToken cancellationToken = default) =>
        SendForJsonAsync<AuthenticatedUserResponse>(HttpMethod.Get, "v1/auth/me", null, cancellationToken);

    // --- Prompts ----------------------------------------------------------

    public async Task<IReadOnlyList<PromptResponse>> ListPromptsAsync(int? limit = null, CancellationToken cancellationToken = default)
    {
        var query = new QueryStringBuilder().Add("limit", limit);
        return await SendForJsonAsync<List<PromptResponse>>(
            HttpMethod.Get, $"v1/prompts{query}", null, cancellationToken).ConfigureAwait(false);
    }

    public Task<PromptResponse?> RequestNextPromptAsync(
        string? timeZone = null,
        DeliveryChannel? channel = null,
        CancellationToken cancellationToken = default)
    {
        var query = new QueryStringBuilder()
            .Add("tz", timeZone)
            .Add("channel", channel);

        return SendForJsonOrNoContentAsync<PromptResponse>(
            HttpMethod.Post, $"v1/prompts/next{query}", null, cancellationToken);
    }

    public Task<PromptResponse> DismissPromptAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForJsonAsync<PromptResponse>(HttpMethod.Post, $"v1/prompts/{id}/dismiss", null, cancellationToken);

    public Task<PromptResponse> CompletePromptAsync(Guid id, CancellationToken cancellationToken = default) =>
        SendForJsonAsync<PromptResponse>(HttpMethod.Post, $"v1/prompts/{id}/complete", null, cancellationToken);

    public Task<PromptResponse> SubmitPromptFeedbackAsync(Guid id, FeedbackRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return SendForJsonAsync<PromptResponse>(HttpMethod.Post, $"v1/prompts/{id}/feedback", request, cancellationToken);
    }
}
