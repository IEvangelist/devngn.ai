// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

using System.ComponentModel.DataAnnotations;

namespace Devngn.Wellness.Api.Validation;

/// <summary>
/// Endpoint filter that runs <see cref="Validator.TryValidateObject(object, ValidationContext, ICollection{ValidationResult}?, bool)"/>
/// against the first argument of type <typeparamref name="T"/>. Minimal API request DTOs
/// arrive via model binding without any automatic DataAnnotations enforcement; this
/// keeps the validation declarative on the DTO and turns failures into <c>400</c>
/// problem-details responses instead of model-state-aware controllers.
/// </summary>
internal static class ValidationEndpointFilter
{
    public static TBuilder ValidateBody<TBuilder, T>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
        where T : class
    {
        return builder.AddEndpointFilter(async (ctx, next) =>
        {
            T? target = null;
            foreach (var arg in ctx.Arguments)
            {
                if (arg is T candidate)
                {
                    target = candidate;
                    break;
                }
            }

            if (target is null)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    [""] = ["Request body is required."],
                });
            }

            var errors = new List<ValidationResult>();
            var context = new ValidationContext(target);
            if (!Validator.TryValidateObject(target, context, errors, validateAllProperties: true))
            {
                var problems = errors
                    .SelectMany(e => (e.MemberNames.Any() ? e.MemberNames : [""])
                        .Select(m => (Field: m, Message: e.ErrorMessage ?? "Invalid value.")))
                    .GroupBy(x => x.Field, StringComparer.Ordinal)
                    .ToDictionary(g => g.Key, g => g.Select(x => x.Message).ToArray(), StringComparer.Ordinal);
                return Results.ValidationProblem(problems);
            }

            return await next(ctx);
        });
    }
}
