// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Globalization;
using System.Text;

namespace Devngn.Wellness.Client;

/// <summary>
/// Builds a URL-encoded query string using invariant, round-trippable formatting so
/// dates, decimals, and enums never vary by the host's current culture.
/// </summary>
internal sealed class QueryStringBuilder
{
    private readonly StringBuilder _builder = new();

    public QueryStringBuilder Add(string key, string? value)
    {
        if (value is null)
        {
            return this;
        }

        _builder.Append(_builder.Length == 0 ? '?' : '&');
        _builder.Append(Uri.EscapeDataString(key));
        _builder.Append('=');
        _builder.Append(Uri.EscapeDataString(value));
        return this;
    }

    public QueryStringBuilder Add(string key, int? value) =>
        Add(key, value?.ToString(CultureInfo.InvariantCulture));

    public QueryStringBuilder Add(string key, DateTimeOffset? value) =>
        Add(key, value?.ToString("O", CultureInfo.InvariantCulture));

    public QueryStringBuilder Add(string key, Enum? value) =>
        Add(key, value?.ToString());

    public QueryStringBuilder AddEach(string key, IEnumerable<string>? values)
    {
        if (values is not null)
        {
            foreach (var value in values)
            {
                Add(key, value);
            }
        }

        return this;
    }

    public override string ToString() => _builder.ToString();
}
