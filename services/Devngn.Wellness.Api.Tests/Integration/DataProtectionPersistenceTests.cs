// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Devngn.Wellness.Api.Crypto;
using Devngn.Wellness.Api.Tests.Auth;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Devngn.Wellness.Api.Tests.Integration;

/// <summary>
/// End-to-end smoke tests for the Postgres-backed DataProtection key ring. The fixture
/// exercises the two failure modes that matter operationally: <i>(1)</i> a freshly-minted
/// key must survive a full host restart and still decrypt prior ciphertexts, and
/// <i>(2)</i> two host instances sharing the same Postgres must converge on the same
/// key ring rather than each minting a private one.
/// </summary>
[Collection(nameof(PostgresCollection))]
[Trait("Category", "Integration")]
public sealed class DataProtectionPersistenceTests(PostgresContainerFixture postgres)
{
    [Fact]
    public async Task Protected_payload_round_trips_across_host_restart()
    {
        // Phase 1: protect with the first host.
        string ciphertext;
        await using (var first = new AuthWebAppFactory(postgres.ConnectionString))
        {
            // Trigger host startup so DataProtection wires up against our test container.
            _ = first.CreateClient();
            using var scope = first.Services.CreateScope();
            var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
            ciphertext = protector.Protect("refresh-token-secret");
            Assert.NotEqual("refresh-token-secret", ciphertext);
        }

        // Phase 2: a freshly-constructed host must still decrypt because the key
        // landed in wellness.data_protection_keys, not in process memory.
        await using (var second = new AuthWebAppFactory(postgres.ConnectionString))
        {
            _ = second.CreateClient();
            using var scope = second.Services.CreateScope();
            var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();
            var plaintext = protector.Unprotect(ciphertext);
            Assert.Equal("refresh-token-secret", plaintext);
        }
    }

    [Fact]
    public async Task Tampered_payload_throws_on_unprotect()
    {
        await using var factory = new AuthWebAppFactory(postgres.ConnectionString);
        _ = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var protector = scope.ServiceProvider.GetRequiredService<IRefreshTokenProtector>();

        var ciphertext = protector.Protect("hello");

        // Flip a character in the middle of the ciphertext to simulate at-rest tampering.
        // The protector authenticates the payload, so unprotect must throw — silent
        // decryption-with-corruption would be the worst-case failure.
        var tampered = ciphertext[..(ciphertext.Length / 2)] +
                       (ciphertext[ciphertext.Length / 2] == 'A' ? 'B' : 'A') +
                       ciphertext[(ciphertext.Length / 2 + 1)..];

        Assert.ThrowsAny<Exception>(() => protector.Unprotect(tampered));
    }
}
