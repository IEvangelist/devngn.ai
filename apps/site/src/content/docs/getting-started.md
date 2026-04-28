---
title: Getting started
description: Start managing your AI-bits with devngn.ai.
---

devngn.ai is the dev engine for managing your AI-bits: the instructions, skills, rules, prompts, memories, model preferences, vendor folders, evals, and AI tooling configuration that collect across developer workspaces.

The first product milestone focuses on three surfaces:

- `devngn` CLI for scanning and syncing AI-bits.
- VS Code extension for visual inventory, drift, conflicts, and recommendations.
- Hosted Astro site for docs, account surfaces, registry delivery, and research freshness.

## CLI shape

```sh
devngn scan
devngn doctor
devngn vendors
devngn research vendors
devngn skills list
devngn sync
```

## Vendor research

Every production adapter starts with a vendor `/research` SKILL run. The research output captures current folder structures, file patterns, metadata, extension IDs, commands, update channels, and branding references before devngn treats the adapter as reliable.

## Hosted sync and analytics

The hosted surface is part of the product from the start. Sync payloads are redacted before they leave the machine, and analytics events use an allowlist schema that avoids raw instruction contents, secrets, prompts, completions, full environment dumps, and unnecessary hardware identifiers.
