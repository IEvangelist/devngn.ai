// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

namespace Devngn.Wellness.Api.Moderation;

internal sealed class ProfanityServiceUnavailableException(
    string message,
    Exception? innerException = null) : Exception(message, innerException);
