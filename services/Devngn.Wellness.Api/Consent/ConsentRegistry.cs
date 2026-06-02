// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Collections.Frozen;

namespace Devngn.Wellness.Api.Consent;

/// <summary>
/// Canonical store of consent texts the service knows about. The client tells us
/// <em>which version</em> they accepted; the server records the verbatim text that
/// corresponds to that version, never trusting client-supplied prose for the audit
/// record. To revise consent semantics, add a new <see cref="KnownVersions"/> entry
/// and bump <see cref="CurrentVersion"/>; never edit an existing entry's text once
/// any user has accepted it.
/// </summary>
internal static class ConsentRegistry
{
    public const string CurrentVersion = "1.0";

    public static readonly FrozenDictionary<string, string> KnownVersions = new Dictionary<string, string>
    {
        ["1.0"] = """
            devngn.ai wellness — Consent v1.0

            By accepting, you allow devngn.ai to store the following data so it can deliver
            personalized wellness prompts during your schedule gaps:

              * A self-reported wellness profile (optional age range, height, weight,
                fitness baseline, preferred intensity, limitations, time-of-day preference).
              * The wellness goals you set (title, category, target metric, start/end dates).
              * The equipment you have registered as available.

            This data is stored only on the devngn.ai wellness service and is never shared
            with third parties. You can revoke this consent at any time via
            DELETE /v1/consent, which permanently deletes your profile, goals, and
            equipment. Revoking consent does not delete your devngn.ai account itself.
            """,
    }.ToFrozenDictionary(StringComparer.Ordinal);

    public static bool TryGetText(string version, out string text)
        => KnownVersions.TryGetValue(version, out text!);
}
