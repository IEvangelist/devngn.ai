# DevOps & Release Runbook — devngn.ai

> **Scope:** desktop app releases, CI secrets, signing keys, and the updater feed.  
> **Maintained by:** Dozer (DevOps/Release, devngn squad)

---

## 1. Cutting a Desktop Release

Desktop releases are tag-driven. The `app-release.yml` workflow fires automatically on any tag matching `app-v*`.

```bash
# 1. Ensure main is clean and all PRs are merged.
# 2. Decide the version (SemVer, e.g. 1.2.3).
# 3. Update the version field in apps/app/src-tauri/tauri.conf.json and
#    apps/app/src-tauri/Cargo.toml to match, commit, and push to main. Use
#    normal SemVer (for example, 1.2.3) when building MSI installers; WiX/MSI
#    rejects text prerelease identifiers such as alpha.420.
# 4. Push the tag:
git tag app-v1.2.3
git push origin app-v1.2.3
```

Before cutting a public release, make sure §2 is configured. Windows installers
must be Authenticode-signed, and macOS DMGs must be Developer ID signed and
notarized, otherwise browsers and the OS will warn users that the downloads are
untrusted.

The workflow will:

1. Check out the repo on **Windows**, **macOS (ARM)**, **macOS (Intel)**, and **Ubuntu** runners in parallel.
2. Install Node 22, pnpm, Rust stable, and Linux system dependencies.
3. Run `pnpm install` and then `tauri-apps/tauri-action`, which internally runs:
   - `pnpm --filter @devngn/app generate` (Nuxt SPA → `apps/app/.output/public`)
   - `tauri build [--target <arch>]`
4. Bundle platform installers:
   - Windows: Authenticode-signed NSIS setup `.exe` + WiX `.msi`
   - macOS: Developer ID signed and notarized `.dmg` (ARM and Intel separately)
   - Linux: `.AppImage` + `.deb`
5. Upload all bundles to a **draft** GitHub Release tagged `app-v*`.
6. Generate and upload **`latest.json`** (the Tauri updater feed) to the same release.

Once the draft release looks correct, publish it manually from the GitHub Releases UI.
Publishing the release makes `latest.json` available at the endpoint configured in
`tauri.conf.json`, which the in-app updater polls.

### 1a. Stable-named download aliases (marketing "Download" page)

`tauri-action` names bundles with the embedded version (e.g. `devngn_1.2.3_aarch64.dmg`),
which is correct for the updater but means the version changes every release. So the
`alias-assets` job (runs after all platform builds) publishes **stable-named copies** of
each installer to the same release. The marketing site links to these durable URLs:

| Platform              | Stable asset name              | `releases/latest/download/…` URL                          |
| --------------------- | ------------------------------ | --------------------------------------------------------- |
| Windows (installer)   | `devngn-windows-x64-setup.exe` | `…/releases/latest/download/devngn-windows-x64-setup.exe` |
| Windows (MSI)         | `devngn-windows-x64.msi`       | `…/releases/latest/download/devngn-windows-x64.msi`       |
| macOS (Apple Silicon) | `devngn-macos-aarch64.dmg`     | `…/releases/latest/download/devngn-macos-aarch64.dmg`     |
| macOS (Intel)         | `devngn-macos-x64.dmg`         | `…/releases/latest/download/devngn-macos-x64.dmg`         |
| Linux (AppImage)      | `devngn-linux-x86_64.AppImage` | `…/releases/latest/download/devngn-linux-x86_64.AppImage` |
| Linux (Debian/Ubuntu) | `devngn-linux-amd64.deb`       | `…/releases/latest/download/devngn-linux-amd64.deb`       |

> `releases/latest/download/…` resolves only against the newest **published** (non-draft,
> non-prerelease) release — so remember to publish the draft. No macOS _universal_
> dmg, Windows `.zip`, or Linux `.rpm` is produced; use the six assets above.
>
> **The marketing Download page fails safe.** At build time it asks the GitHub API which
> assets the latest _published_ release actually exposes (see `apps/site/src/lib/release-info.ts`).
> Until a release is published it renders a "Coming soon / in development" state instead of
> dead download buttons, and it self-heals on the next build once a release ships. So after
> you publish the draft, **rebuild/redeploy the site** (or trigger a Netlify deploy) so the
> buttons light up.

---

## 2. Required Secrets and Variables

Add secrets under **Settings → Secrets and variables → Actions → Repository secrets**.
Add variables under **Settings → Secrets and variables → Actions → Repository variables**.

### Tauri Updater Signing

| Secret name                          | Description                                   |
| ------------------------------------ | --------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Ed25519 private key, base64-encoded (see §3). |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passphrase chosen during key generation.      |

### Windows Authenticode Signing

Windows release builds use Microsoft Artifact Signing (formerly Azure Trusted
Signing) through OIDC. This avoids exporting a PFX/private key into GitHub
Actions. Create an Artifact Signing account, complete identity validation, create
a certificate profile, then grant the GitHub OIDC app registration the
**Artifact Signing Certificate Profile Signer** role on that profile.

| Repository variable                          | Description                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `AZURE_ARTIFACT_SIGNING_CLIENT_ID`           | Microsoft Entra app/client ID configured with GitHub Actions federated credentials.                |
| `AZURE_ARTIFACT_SIGNING_TENANT_ID`           | Microsoft Entra tenant ID.                                                                         |
| `AZURE_ARTIFACT_SIGNING_SUBSCRIPTION_ID`     | Azure subscription ID containing the Artifact Signing account.                                     |
| `AZURE_ARTIFACT_SIGNING_ENDPOINT`            | Region endpoint, e.g. `https://wus2.codesigning.azure.net`. Must match the account/profile region. |
| `AZURE_ARTIFACT_SIGNING_ACCOUNT`             | Artifact Signing account name.                                                                     |
| `AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE` | Certificate profile name used for public releases.                                                 |

The Windows job calls `apps/app/src-tauri/scripts/setup-windows-signing.ps1` to
download the Windows SDK SignTool and `Microsoft.ArtifactSigning.Client`, writes
the Artifact Signing metadata JSON, and configures Tauri's `bundle.windows.signCommand`.
Tauri then signs each Windows binary/installer and verifies the signature before
publishing assets.

### macOS Developer ID Signing and Notarization

macOS releases need an Apple Developer Program account, a **Developer ID
Application** certificate, and an App Store Connect API key for notarization.

| Secret name                  | Description                                                     |
| ---------------------------- | --------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Base64-encoded exported Developer ID Application `.p12`.        |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12`.                        |
| `KEYCHAIN_PASSWORD`          | Temporary keychain password used only inside the macOS runner.  |
| `APPLE_API_ISSUER`           | App Store Connect API issuer ID.                                |
| `APPLE_API_KEY`              | App Store Connect API key ID.                                   |
| `APPLE_API_KEY_PRIVATE_KEY`  | Contents of the downloaded App Store Connect `.p8` private key. |

The macOS jobs import the certificate into a temporary keychain, set
`APPLE_SIGNING_IDENTITY`, write the `.p8` key to `$RUNNER_TEMP`, and let Tauri
sign, notarize, and staple the DMGs.

### Linux Installer Trust

Linux does not have an Authenticode/Gatekeeper equivalent for direct GitHub
downloads. The Tauri updater artifacts are already Ed25519-signed (§3/§4). If
devngn later ships through an APT repository, Flatpak, Snap, Homebrew, or a Linux
package registry, add that ecosystem's repository/package signing at that layer.
The current `.deb` and AppImage do not need a browser trust signing equivalent.

### Azure AI Translator (i18n workflow)

| Secret name                         | Description                                              |
| ----------------------------------- | -------------------------------------------------------- |
| `AZURE_TRANSLATOR_SUBSCRIPTION_KEY` | Azure AI Translator resource subscription key.           |
| `AZURE_TRANSLATOR_ENDPOINT`         | e.g. `https://api.cognitive.microsofttranslator.com/`    |
| `AZURE_TRANSLATOR_REGION`           | Azure region (e.g. `eastus`). Omit for global resources. |

`GITHUB_TOKEN` is provisioned automatically by Actions — no manual secret needed.

---

## 3. The Tauri Signing Keypair

The Tauri updater requires an Ed25519 (minisign) keypair. **A keypair is
generated and its public key is committed** to
`apps/app/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The public key is
safe to commit; the private key and its password are **not** in the repo — they
live only in the repository secrets below.

**Status: configured.** The `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets are set (§2), so CI signs the updater
artifacts. The keypair was (re)generated for the first signed release; the private
key + password are backed up outside the repo (e.g. `~/.tauri/devngn.key` on the
maintainer's machine) and should be stored in a password manager.

| Secret                               | Value                                               |
| ------------------------------------ | --------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of the generated `*.key` private-key file. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password chosen when the key was generated.     |

If these secrets are ever cleared, the release workflow still builds installers but
the updater `latest.json` will be unsigned and clients will refuse the update.

This updater key is separate from OS trust:

- Windows browser/SmartScreen trust comes from Authenticode signatures produced
  by Microsoft Artifact Signing.
- macOS Gatekeeper trust comes from Developer ID signing plus notarization.
- Linux updater trust comes from Tauri's Ed25519 updater signatures; repository
  trust is handled only if/when we publish through a Linux package repository.

### Rotating / regenerating the keypair

If you ever need a fresh key (lost private key, suspected compromise):

```bash
# From the monorepo root (or any directory with @tauri-apps/cli installed):
pnpm --filter @devngn/app exec tauri signer generate -w ~/.tauri/devngn.key
```

The command writes the private key to the given path, a `<path>.pub` public-key
file next to it, and prints the env-var names to store. **After regenerating:**

1. Update `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the
   repository secrets (§2).
2. Replace `plugins.updater.pubkey` in `apps/app/src-tauri/tauri.conf.json` with the
   **contents of `<path>.pub`**, then commit & push. The public key is safe to commit.

> **Important:** clients that installed a build signed with the _old_ key will not
> accept updates signed with the _new_ key. Rotate only when necessary and ship a
> release soon after so users converge on the new key.

---

## 4. How the Tauri Updater Feed Works

`latest.json` is generated by `tauri-apps/tauri-action` (`uploadUpdaterJson: true`)
and attached to every GitHub Release at:

> **Prerequisite:** `bundle.createUpdaterArtifacts: true` must be set in
> `tauri.conf.json` (it is). Tauri v2 only emits the signed updater bundles + `.sig`
> files — which tauri-action turns into `latest.json` — when this flag is enabled.
> Without it, releases would ship installers but no self-update feed.

```
https://github.com/IEvangelist/devngn.ai/releases/latest/download/latest.json
```

This URL is the endpoint declared in `tauri.conf.json → plugins.updater.endpoints`.
On startup (and periodically), the running app calls this URL; if the version in
`latest.json` is newer than the installed version, the updater downloads and applies
the signed update bundle. Signatures in `latest.json` are verified against the
**public key** baked into the binary at build time.

```
Tag push app-v1.2.3
   │
   ▼
app-release.yml (matrix: win/mac-arm/mac-x64/linux)
   │  tauri-action builds, signs Windows, signs/notarizes macOS,
   │  signs updater bundles
   │  tauri-action uploads bundles + latest.json → draft GitHub Release
   │
   ▼
Maintainer publishes the draft release
   │
   ▼
latest.json is live at releases/latest/download/latest.json
   │
   ▼
Running devngn app polls endpoint → detects new version → auto-updates
```

---

## 5. i18n / Localization Workflow

`translate.yml` runs on every push to `main` that modifies
`apps/app/i18n/locales/en.json`, or manually via `workflow_dispatch`.

It uses **`IEvangelist/resource-translator@v3`** (Azure AI Translator) to
machine-translate the English catalog into `es`, `fr`, `de`, `pt`, `ja`, and
`zh-Hans`, then opens a PR on the `machine-translation/locales` branch with the
updated target catalogs.

### Naming-bridge limitation

`resource-translator` discovers JSON files via the glob `**/*.en.json` (the
`{basename}.{locale}.json` convention). Our catalogs use `{locale}.json`
(e.g., `en.json`). The workflow bridges this by creating a temporary
`catalog.en.json` copy before the action runs and renaming the outputs back
afterward. This is a documented workaround, not a bug in the action.

Reviewers of translation PRs should verify key completeness and tone before
merging. Merge to `main` to ship the updated translations.

---

## 6. PWA Auto-Update

The Nuxt/Vite PWA (`@vite-pwa/nuxt`) is built as part of the same `generate`
step that produces the Tauri frontend. For the **PWA path** (browser /
installable web app), updates are delivered via the Service Worker's cache
update mechanism — no `latest.json` is involved. The Tauri desktop app uses
the separate updater plugin described in §4. Both update paths are triggered by
publishing new release assets or deploying the SPA to its hosting origin.

---

## 7. Wellness API — Netlify Site + Functions

Production now ships the Wellness API from the `apps/site` Netlify project.
Released desktop builds call `https://devngn.ai`; there is no separate Azure
production API origin. The ASP.NET Core service at
`services/Devngn.Wellness.Api` remains the reference/local implementation.

### 7a. Origins and release target

| Context                                | Base URL                       | Notes                                                                                                                                                              |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production site + released desktop app | `https://devngn.ai`            | `/v1/*` is claimed in-source by `apps/site/netlify/functions/v1.ts`                                                                                                |
| Local Netlify parity                   | `http://localhost:8888`        | Run `netlify dev --filter @devngn/site` from the repo root                                                                                                         |
| Local desktop/Nuxt app                 | `https://devngn.ai` by default | Override `NUXT_PUBLIC_API_BASE_URL` to target `http://localhost:8888` (Netlify parity) or `https://localhost:7107` (.NET reference API) before local app dev/build |
| .NET reference API                     | `https://localhost:7107`       | Local/self-hosted reference only, not production                                                                                                                   |

The Tauri `connect-src` policy already allows the production and documented
local development origins above.

### 7b. Netlify project settings

Set the **Package directory** to `apps/site` in the Netlify UI and leave the
**Base directory** unset so builds run from the repository root. With that
monorepo layout, all configured paths must stay repo-root-relative.

| Setting                 | Value                                     | Where set                           |
| ----------------------- | ----------------------------------------- | ----------------------------------- |
| Package directory       | `apps/site`                               | Netlify UI → Build settings         |
| Base directory          | unset (`/`)                               | Netlify UI                          |
| Build command           | `pnpm --filter @devngn/site... build`     | `apps/site/netlify.toml`            |
| Publish directory       | `apps/site/dist`                          | `apps/site/netlify.toml`            |
| Functions directory     | `apps/site/netlify/functions`             | `apps/site/netlify.toml`            |
| Functions bundler       | `esbuild`                                 | `apps/site/netlify.toml`            |
| `/v1/*` route ownership | `export const config = { path: "/v1/*" }` | `apps/site/netlify/functions/v1.ts` |
| Migrations directory    | `apps/site/netlify/database/migrations`   | Netlify Database convention         |

### 7c. Runtime environment variables

Set these for the `apps/site` Netlify project. `apps/site/.env.example` is the
source-of-truth template for canonical names and placeholder values.

| Variable                            | Required | Purpose                                                                                     |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `GITHUB_OAUTH_CLIENT_ID`            | Yes      | GitHub OAuth app client ID for the web flow                                                 |
| `GITHUB_OAUTH_CLIENT_SECRET`        | Yes      | GitHub OAuth app client secret for the web flow                                             |
| `GITHUB_DEVICE_OAUTH_CLIENT_ID`     | No       | Separate GitHub OAuth app client ID for device flow; falls back to `GITHUB_OAUTH_CLIENT_ID` |
| `JWT_SECRET`                        | Yes      | Base64 signing key that decodes to at least 32 bytes                                        |
| `JWT_ISSUER`                        | Yes      | Production issuer, `https://devngn.ai`                                                      |
| `JWT_AUDIENCE`                      | Yes      | Audience claim for Wellness JWT validation                                                  |
| `JWT_ACCESS_TOKEN_LIFETIME_SECONDS` | No       | Access-token TTL override; defaults to `3600`                                               |
| `JWT_KEY_ID`                        | No       | JWT key id; defaults to `v1`                                                                |
| `ALLOWED_ORIGINS`                   | No       | Extra exact origins to append to the built-in allow-list                                    |
| `NETLIFY_DB_URL`                    | Yes      | Auto-injected by Netlify Database in linked environments                                    |
| `GOOGLE_CALENDAR_CLIENT_ID`         | No       | Google Calendar OAuth client ID                                                             |
| `GOOGLE_CALENDAR_CLIENT_SECRET`     | No       | Google Calendar OAuth client secret                                                         |
| `GOOGLE_CALENDAR_REDIRECT_URI`      | No       | Google Calendar callback URL                                                                |
| `MICROSOFT_CALENDAR_CLIENT_ID`      | No       | Microsoft Calendar OAuth client ID                                                          |
| `MICROSOFT_CALENDAR_CLIENT_SECRET`  | No       | Microsoft Calendar OAuth client secret                                                      |
| `MICROSOFT_CALENDAR_REDIRECT_URI`   | No       | Microsoft Calendar callback URL                                                             |
| `MICROSOFT_CALENDAR_TENANT_ID`      | No       | Microsoft Entra tenant; defaults to `common`                                                |

Legacy `WELLNESS_JWT_*` and `WELLNESS_ALLOWED_ORIGINS` aliases remain accepted
by the current functions package for compatibility, but new production config
should prefer the canonical names above.

### 7d. CORS allow-list

The functions package ships with this built-in exact allow-list:

```text
https://devngn.ai
http://tauri.localhost
https://tauri.localhost
tauri://localhost
```

Use `ALLOWED_ORIGINS` only to append more exact origins, such as local browser
frontends or an authenticated deploy preview:

```text
http://localhost:3000
http://localhost:4321
http://localhost:8888
https://deploy-preview-<n>--...netlify.app
```

Wildcards are ignored; use explicit origins only.

### 7e. Disposable pre-v1 database baseline

Netlify Database only auto-discovers SQL from:

```text
apps/site/netlify/database/migrations/
```

Until the first stable release, keep exactly one editable schema/seed artifact:

```text
apps/site/netlify/database/migrations/00000000000000_wellness_baseline.sql
```

When the pre-v1 schema changes, edit that file in place and reset or reprovision
the affected database before applying the baseline. Do not add timestamped
migrations or maintain upgrade history while all data remains disposable.
Functions must never create or alter schema during a request.

Useful CLI commands from the repo root:

```bash
netlify database status --filter @devngn/site
netlify database migrations apply --filter @devngn/site
```

`migrations apply` targets the local development database. Production and deploy
preview databases apply the baseline automatically during deployment. Before the
first stable release needs persistent in-place upgrades, replace this reset policy
with normal forward-only migrations.

### 7f. Local dev and config validation

Run Netlify CLI commands from the repository root so `--filter @devngn/site`
matches the same package-directory resolution used in production:

```bash
pnpm install --frozen-lockfile
netlify link --filter @devngn/site
netlify build --filter @devngn/site --dry --offline
netlify env:list --filter @devngn/site
netlify database status --filter @devngn/site
netlify dev --filter @devngn/site
```

- `netlify build --dry --offline` validates the monorepo config without
  deploying.
- Use `netlify env:set` / `netlify env:list` or the Netlify UI for linked
  runtime variables; the current CLI no longer exposes `env:pull`.
- Copy `apps/site/.env.example` to `apps/site/.env.local` only for direct
  `pnpm dev:site` / `astro dev` workflows.

### 7g. Free-plan / credit caveats

Current Netlify pricing is credit-based across all plans. Important
production-shaping caveats from the official pricing and Database billing docs:

- Free plan: **$0** with **300 credits/month**
- Production deploys cost **15 credits each**
- Netlify Database is available on credit-based plans, including Free
- Free-plan database limits per account/database include **3 databases**,
  **20 branches**, **48 compute units per billing period**, and **5 GB** each
  for writes, bandwidth, and storage

That is enough for low-volume development and previews, but sustained production
traffic or always-on database usage will burn through the free allocation
quickly.

### 7h. Release cutover checklist

1. Link the Netlify project to this repo and set **Package directory**
   = `apps/site`; leave **Base directory** unset.
2. Provision Netlify Database for the site and keep migrations under
   `apps/site/netlify/database/migrations/`.
3. Set the required GitHub/JWT/database variables and any optional calendar
   provider variables needed for this environment.
4. Deploy the site and verify `https://devngn.ai/v1/hello` plus the GitHub web
   flow and any schedule callback flows you enabled.
5. Cut the desktop release with `app-release.yml`; tag pushes default to
   `https://devngn.ai`, while manual `workflow_dispatch` runs can override the
   API base URL for smoke drills.
6. Publish the GitHub release draft, then rebuild/redeploy the Netlify site if
   the marketing download page needs the newly published release assets.
