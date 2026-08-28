// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Devngn.Wellness.Api.Data;

internal static class SqlServerExceptionClassifier
{
    internal static bool IsUniqueViolation(
        DbUpdateException exception,
        string? databaseObjectName = null)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is not SqlException { Number: 2601 or 2627 } sqlException)
            {
                continue;
            }

            return databaseObjectName is null ||
                sqlException.Message.Contains(databaseObjectName, StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }
}
