// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Client;

/// <summary>
/// Configuration for the <see cref="IWellnessClient"/> registered by
/// <see cref="WellnessClientServiceCollectionExtensions.AddWellnessClient"/>.
/// </summary>
public sealed class WellnessClientOptions
{
    /// <summary>
    /// Absolute base address of the wellness API (e.g. <c>https://localhost:7042</c> or a
    /// service-discovery name such as <c>https+http://wellness-api</c>). Required.
    /// </summary>
    public Uri? BaseAddress { get; set; }

    /// <summary>
    /// Supplies the bearer access token for each request. Return <see langword="null"/> to send
    /// no <c>Authorization</c> header (the call will then be rejected by the API with 401).
    /// </summary>
    /// <remarks>
    /// The default registration is a singleton, so this delegate may be invoked concurrently and
    /// must not capture scoped services directly. For a single-user host (CLI/desktop) returning a
    /// stored token is fine. For a multi-user web host, read the token from an ambient/request-scoped
    /// accessor (e.g. <c>IHttpContextAccessor</c>) inside the delegate, or register a scoped client.
    /// </remarks>
    public Func<CancellationToken, ValueTask<string?>>? AccessTokenProvider { get; set; }

    /// <summary>
    /// Master switch for client-side caching of stable reads. Defaults to <see langword="true"/>.
    /// The global activity catalog is always safe to cache; profile and equipment are only cached
    /// when <see cref="CacheScopeProvider"/> yields a non-null per-user discriminator.
    /// </summary>
    public bool EnableCaching { get; set; } = true;

    /// <summary>
    /// Supplies a stable per-user discriminator used to scope the <em>user-specific</em> caches
    /// (profile and equipment). Return <see langword="null"/> (the default behaviour when this is
    /// unset) to disable user-specific caching entirely so a shared cache can never leak one user's
    /// data to another. Single-user hosts can leave this unset or return a constant.
    /// </summary>
    public Func<CancellationToken, ValueTask<string?>>? CacheScopeProvider { get; set; }

    /// <summary>Time-to-live for the cached activity catalog. Defaults to 10 minutes.</summary>
    public TimeSpan ActivityCatalogCacheDuration { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>Time-to-live for the cached profile. Defaults to 5 minutes.</summary>
    public TimeSpan ProfileCacheDuration { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>Time-to-live for the cached equipment list. Defaults to 5 minutes.</summary>
    public TimeSpan EquipmentCacheDuration { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// When <see langword="true"/> (default), the named client adds a standard resilience handler
    /// (retry/circuit-breaker/timeout) with retries restricted to safe HTTP methods. Set to
    /// <see langword="false"/> when the host already applies resilience via
    /// <c>ConfigureHttpClientDefaults</c> to avoid stacking handlers.
    /// </summary>
    public bool ConfigureResilience { get; set; } = true;
}
