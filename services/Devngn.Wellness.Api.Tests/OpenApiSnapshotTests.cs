// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Devngn.Wellness.Api.Tests;

/// <summary>
/// Snapshot guard that keeps the committed OpenAPI document
/// (<c>services/Devngn.Wellness.Api/openapi/v1.json</c>) in lock-step with the API.
/// That committed document is the single source the TypeScript <c>@devngn/wellness-types</c>
/// package generates from, so this test is the ".NET DTOs &#8594; spec" drift guard.
///
/// Run with the environment variable <c>UPDATE_OPENAPI_SNAPSHOT=1</c> to (re)write the
/// committed document after an intentional contract change; otherwise the test fails when
/// the live document and the committed snapshot diverge.
/// </summary>
public sealed class OpenApiSnapshotTests
{
    private static readonly JsonSerializerOptions IndentedOptions = new() { WriteIndented = true };

    [Fact]
    public async Task OpenApiDocument_MatchesCommittedSnapshot()
    {
        await using var factory = new WellnessApiSmokeTests.Factory();
        using var client = factory.CreateClient();

        var live = await client.GetStringAsync("/openapi/v1.json");
        var normalizedLive = Normalize(live);

        var snapshotPath = SnapshotPath();

        if (string.Equals(Environment.GetEnvironmentVariable("UPDATE_OPENAPI_SNAPSHOT"), "1", StringComparison.Ordinal))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(snapshotPath)!);
            await File.WriteAllTextAsync(snapshotPath, normalizedLive, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            return;
        }

        Assert.True(File.Exists(snapshotPath),
            $"Committed OpenAPI snapshot not found at '{snapshotPath}'. Re-run with UPDATE_OPENAPI_SNAPSHOT=1 to create it.");

        var committed = Normalize(await File.ReadAllTextAsync(snapshotPath));

        Assert.True(
            string.Equals(committed, normalizedLive, StringComparison.Ordinal),
            "The committed OpenAPI snapshot is out of date. Re-run the test with UPDATE_OPENAPI_SNAPSHOT=1 " +
            "and regenerate @devngn/wellness-types (pnpm --filter @devngn/wellness-types generate).");
    }

    /// <summary>
    /// Re-serializes the document with stable indentation and LF line endings so the committed
    /// snapshot diffs cleanly and is byte-stable across platforms.
    /// </summary>
    private static string Normalize(string json)
    {
        var node = JsonNode.Parse(json);
        var pretty = node!.ToJsonString(IndentedOptions);
        return pretty.Replace("\r\n", "\n").TrimEnd() + "\n";
    }

    private static string SnapshotPath([CallerFilePath] string callerFilePath = "")
    {
        var testsDir = Path.GetDirectoryName(callerFilePath)!;
        return Path.GetFullPath(Path.Combine(testsDir, "..", "Devngn.Wellness.Api", "openapi", "v1.json"));
    }
}
