// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.Data;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Data.SqlClient;

namespace Devngn.Wellness.Api.Crypto;

/// <summary>
/// ASP.NET Core DataProtection <see cref="IXmlRepository"/> backed by the
/// <c>wellness.data_protection_keys</c> table.
/// </summary>
internal sealed class SqlServerXmlRepository(
    string connectionString,
    ILogger<SqlServerXmlRepository> logger) : IXmlRepository
{
    private const string SelectAll =
        """
        SELECT [Xml] FROM [wellness].[data_protection_keys] ORDER BY [Id]
        """;

    private const string Insert =
        """
        BEGIN TRY
            INSERT INTO [wellness].[data_protection_keys] ([FriendlyName], [Xml])
            VALUES (@friendly_name, @xml);
        END TRY
        BEGIN CATCH
            IF ERROR_NUMBER() NOT IN (2601, 2627)
                THROW;
        END CATCH
        """;

    public IReadOnlyCollection<XElement> GetAllElements()
    {
        var elements = new List<XElement>();

        using var connection = new SqlConnection(connectionString);
        connection.Open();
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
                logger.LogError(ex, "Skipping malformed DataProtection key row.");
            }
        }

        return elements;
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        ArgumentNullException.ThrowIfNull(element);
        ArgumentException.ThrowIfNullOrWhiteSpace(friendlyName);

        using var connection = new SqlConnection(connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = Insert;
        command.Parameters.Add(new SqlParameter("@friendly_name", SqlDbType.NVarChar, 200)
        {
            Value = friendlyName,
        });
        command.Parameters.Add(new SqlParameter("@xml", SqlDbType.NVarChar, -1)
        {
            Value = element.ToString(SaveOptions.DisableFormatting),
        });
        command.ExecuteNonQuery();
    }
}
