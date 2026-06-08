// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>
/// Typed client for the devngn.ai wellness API. Wraps the JSON data-plane endpoints behind
/// strongly-typed methods, caches stable reads, and surfaces non-success responses as
/// <see cref="WellnessApiException"/>. Interactive auth/OAuth bootstrap flows are intentionally
/// out of scope; supply a token via <see cref="WellnessClientOptions.AccessTokenProvider"/>.
/// </summary>
public interface IWellnessClient
{
    // --- Auth -------------------------------------------------------------

    /// <summary>Gets the user behind the current access token (<c>GET /v1/auth/me</c>).</summary>
    Task<AuthenticatedUserResponse> GetCurrentUserAsync(CancellationToken cancellationToken = default);

    // --- Consent ----------------------------------------------------------

    /// <summary>Gets the caller's consent state (<c>GET /v1/consent</c>).</summary>
    Task<ConsentStateResponse> GetConsentAsync(CancellationToken cancellationToken = default);

    /// <summary>Accepts the supplied consent version (<c>POST /v1/consent</c>).</summary>
    Task<ConsentSnapshot> AcceptConsentAsync(AcceptConsentRequest request, CancellationToken cancellationToken = default);

    /// <summary>Revokes the caller's consent and deletes wellness data (<c>DELETE /v1/consent</c>).</summary>
    Task RevokeConsentAsync(CancellationToken cancellationToken = default);

    // --- Profile ----------------------------------------------------------

    /// <summary>Gets the caller's profile, or <see langword="null"/> if none exists (<c>GET /v1/profile</c>).</summary>
    Task<ProfileResponse?> GetProfileAsync(CancellationToken cancellationToken = default);

    /// <summary>Creates or replaces the caller's profile (<c>PUT /v1/profile</c>).</summary>
    Task<ProfileResponse> UpsertProfileAsync(UpsertProfileRequest request, CancellationToken cancellationToken = default);

    /// <summary>Deletes the caller's profile (<c>DELETE /v1/profile</c>).</summary>
    Task DeleteProfileAsync(CancellationToken cancellationToken = default);

    // --- Goals ------------------------------------------------------------

    /// <summary>Lists the caller's goals (<c>GET /v1/goals</c>).</summary>
    Task<IReadOnlyList<GoalResponse>> ListGoalsAsync(CancellationToken cancellationToken = default);

    /// <summary>Gets a goal by id, or <see langword="null"/> if not found (<c>GET /v1/goals/{id}</c>).</summary>
    Task<GoalResponse?> GetGoalAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Creates a goal (<c>POST /v1/goals</c>).</summary>
    Task<GoalResponse> CreateGoalAsync(CreateGoalRequest request, CancellationToken cancellationToken = default);

    /// <summary>Replaces a goal (<c>PUT /v1/goals/{id}</c>).</summary>
    Task<GoalResponse> UpdateGoalAsync(Guid id, UpdateGoalRequest request, CancellationToken cancellationToken = default);

    /// <summary>Deletes a goal (<c>DELETE /v1/goals/{id}</c>).</summary>
    Task DeleteGoalAsync(Guid id, CancellationToken cancellationToken = default);

    // --- Equipment --------------------------------------------------------

    /// <summary>Lists the caller's equipment (<c>GET /v1/equipment</c>). Cached when a cache scope is configured.</summary>
    Task<IReadOnlyList<EquipmentResponse>> ListEquipmentAsync(CancellationToken cancellationToken = default);

    /// <summary>Gets equipment by id, or <see langword="null"/> if not found (<c>GET /v1/equipment/{id}</c>).</summary>
    Task<EquipmentResponse?> GetEquipmentAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Registers a piece of equipment (<c>POST /v1/equipment</c>).</summary>
    Task<EquipmentResponse> AddEquipmentAsync(CreateEquipmentRequest request, CancellationToken cancellationToken = default);

    /// <summary>Updates a piece of equipment (<c>PUT /v1/equipment/{id}</c>).</summary>
    Task<EquipmentResponse> UpdateEquipmentAsync(Guid id, UpdateEquipmentRequest request, CancellationToken cancellationToken = default);

    /// <summary>Deletes a piece of equipment (<c>DELETE /v1/equipment/{id}</c>).</summary>
    Task DeleteEquipmentAsync(Guid id, CancellationToken cancellationToken = default);

    // --- Schedule sources -------------------------------------------------

    /// <summary>Lists the caller's schedule sources (<c>GET /v1/schedule/sources</c>).</summary>
    Task<IReadOnlyList<ScheduleSourceResponse>> ListScheduleSourcesAsync(CancellationToken cancellationToken = default);

    /// <summary>Gets a schedule source by id, or <see langword="null"/> if not found.</summary>
    Task<ScheduleSourceResponse?> GetScheduleSourceAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Creates a user-provided schedule source (<c>POST /v1/schedule/sources</c>).</summary>
    Task<ScheduleSourceResponse> CreateScheduleSourceAsync(CreateScheduleSourceRequest request, CancellationToken cancellationToken = default);

    /// <summary>Patches a schedule source (<c>PATCH /v1/schedule/sources/{id}</c>).</summary>
    Task<ScheduleSourceResponse> UpdateScheduleSourceAsync(Guid id, UpdateScheduleSourceRequest request, CancellationToken cancellationToken = default);

    /// <summary>Deletes a schedule source (<c>DELETE /v1/schedule/sources/{id}</c>).</summary>
    Task DeleteScheduleSourceAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Triggers a sync for a Google/Microsoft source (<c>POST /v1/schedule/sources/{id}/sync</c>).</summary>
    Task<ScheduleSyncResponse> SyncScheduleSourceAsync(Guid id, CancellationToken cancellationToken = default);

    // --- Schedule events --------------------------------------------------

    /// <summary>Lists persisted schedule events in a window (<c>GET /v1/schedule/events</c>).</summary>
    Task<IReadOnlyList<ScheduleEventResponse>> ListScheduleEventsAsync(
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        Guid? sourceId = null,
        CancellationToken cancellationToken = default);

    /// <summary>Bulk-pushes events to a user-provided source (<c>POST /v1/schedule/events</c>).</summary>
    Task<IReadOnlyList<ScheduleEventResponse>> PushScheduleEventsAsync(PushScheduleEventsRequest request, CancellationToken cancellationToken = default);

    /// <summary>Deletes a schedule event (<c>DELETE /v1/schedule/events/{id}</c>).</summary>
    Task DeleteScheduleEventAsync(Guid id, CancellationToken cancellationToken = default);

    // --- Gaps -------------------------------------------------------------

    /// <summary>Computes free gaps in a window (<c>GET /v1/gaps</c>).</summary>
    Task<IReadOnlyList<GapResponse>> ListGapsAsync(
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        string? timeZone = null,
        CancellationToken cancellationToken = default);

    // --- Activities -------------------------------------------------------

    /// <summary>
    /// Lists catalog activities (<c>GET /v1/activities</c>). The unfiltered call is cached;
    /// any filtered call bypasses the cache.
    /// </summary>
    Task<IReadOnlyList<ActivityResponse>> ListActivitiesAsync(
        IEnumerable<string>? availableEquipmentTags = null,
        BodyArea? bodyArea = null,
        int? maxDurationSeconds = null,
        CancellationToken cancellationToken = default);

    // --- Prompts ----------------------------------------------------------

    /// <summary>Lists prompt history, newest first (<c>GET /v1/prompts</c>).</summary>
    Task<IReadOnlyList<PromptResponse>> ListPromptsAsync(int? limit = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Requests the next prompt on demand (<c>POST /v1/prompts/next</c>); returns
    /// <see langword="null"/> when no eligible gap/activity is available (HTTP 204).
    /// </summary>
    Task<PromptResponse?> RequestNextPromptAsync(
        string? timeZone = null,
        DeliveryChannel? channel = null,
        CancellationToken cancellationToken = default);

    /// <summary>Dismisses a prompt (<c>POST /v1/prompts/{id}/dismiss</c>).</summary>
    Task<PromptResponse> DismissPromptAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Marks a prompt complete (<c>POST /v1/prompts/{id}/complete</c>).</summary>
    Task<PromptResponse> CompletePromptAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Submits feedback for a prompt (<c>POST /v1/prompts/{id}/feedback</c>).</summary>
    Task<PromptResponse> SubmitPromptFeedbackAsync(Guid id, FeedbackRequest request, CancellationToken cancellationToken = default);
}
