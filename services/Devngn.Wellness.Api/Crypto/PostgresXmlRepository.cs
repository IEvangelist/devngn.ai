// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Npgsql;

namespace Devngn.Wellness.Api.Crypto;

/// <summary>
/// ASP.NET Core DataProtection <see cref="IXmlRepository"/> backed by the
/// <c>wellness.data_protection_keys</c> table. We deliberately go through
/// <see cref="NpgsqlDataSource"/> rather than the scoped <c>WellnessDbContext</c>:
/// DataProtection resolves this repository as a <b>singleton</b> when minting/loading
/// keys, and resolving a scoped service from a singleton would be a captive-dependency
/// bug. Using the singleton data source also frees us from EF Core's change-tracker
/// overhead for what is effectively a write-once / read-many key ring.
/// </summary>
internal sealed class PostgresXmlRepository : IXmlRepository
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<PostgresXmlRepository> _logger;

    private const string SelectAll =
        """
        SELECT "Xml" FROM wellness.data_protection_keys ORDER BY "Id"
        """;

    // ON CONFLICT DO NOTHING handles the rare case where two processes race to persist
    // the same freshly-minted key; the friendly name is the key's stable GUID-based
    // identifier, so "first one wins" is correct.
    private const string Insert =
        """
        INSERT INTO wellness.data_protection_keys ("FriendlyName", "Xml")
        VALUES (@friendly_name, @xml)
        ON CONFLICT ("FriendlyName") DO NOTHING
        """;

    public PostgresXmlRepository(NpgsqlDataSource dataSource, ILogger<PostgresXmlRepository> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public IReadOnlyCollection<XElement> GetAllElements()
    {
        var elements = new List<XElement>();

        using var connection = _dataSource.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = SelectAll;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var xml = reader.GetString(0);
            try
            {
                elements.Add(XElement.Parse(xml));
            }
            catch (System.Xml.XmlException ex)
            {
                _logger.LogError(ex, "Skipping malformed DataProtection key row in wellness.data_protection_keys.");
            }
        }

        return elements;
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        ArgumentNullException.ThrowIfNull(element);
        ArgumentException.ThrowIfNullOrWhiteSpace(friendlyName);

        using var connection = _dataSource.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = Insert;
        command.Parameters.AddWithValue("friendly_name", friendlyName);
        command.Parameters.AddWithValue("xml", element.ToString(SaveOptions.DisableFormatting));
        command.ExecuteNonQuery();
    }
}
