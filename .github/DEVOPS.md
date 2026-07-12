# DevOps & Release Runbook — devngn.ai

> **Scope:** desktop app releases, CI secrets, signing keys, and the updater feed.  
> **Maintained by:** Dozer (DevOps/Release, devngn squad)

---

## 1. Cutting a Desktop Release

Desktop releases are tag-driven.  The `app-release.yml` workflow fires automatically on any tag matching `app-v*`.

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

The workflow will:

1. Check out the repo on **Windows**, **macOS (ARM)**, **macOS (Intel)**, and **Ubuntu** runners in parallel.
2. Install Node 22, pnpm, Rust stable, and Linux system dependencies.
3. Run `pnpm install` and then `tauri-apps/tauri-action`, which internally runs:
   - `pnpm --filter @devngn/app generate` (Nuxt SPA → `apps/app/.output/public`)
   - `tauri build [--target <arch>]`
4. Bundle platform installers:
   - Windows: NSIS setup `.exe` + WiX `.msi`
   - macOS: `.dmg` (ARM and Intel separately)
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

| Platform | Stable asset name | `releases/latest/download/…` URL |
|----------|-------------------|-----------------------------------|
| Windows (installer) | `devngn-windows-x64-setup.exe` | `…/releases/latest/download/devngn-windows-x64-setup.exe` |
| Windows (MSI)       | `devngn-windows-x64.msi`       | `…/releases/latest/download/devngn-windows-x64.msi` |
| macOS (Apple Silicon) | `devngn-macos-aarch64.dmg`   | `…/releases/latest/download/devngn-macos-aarch64.dmg` |
| macOS (Intel)       | `devngn-macos-x64.dmg`         | `…/releases/latest/download/devngn-macos-x64.dmg` |
| Linux (AppImage)    | `devngn-linux-x86_64.AppImage` | `…/releases/latest/download/devngn-linux-x86_64.AppImage` |
| Linux (Debian/Ubuntu) | `devngn-linux-amd64.deb`     | `…/releases/latest/download/devngn-linux-amd64.deb` |

> `releases/latest/download/…` resolves only against the newest **published** (non-draft,
> non-prerelease) release — so remember to publish the draft. No macOS *universal*
> dmg, Windows `.zip`, or Linux `.rpm` is produced; use the six assets above.
>
> **The marketing Download page fails safe.** At build time it asks the GitHub API which
> assets the latest *published* release actually exposes (see `apps/site/src/lib/release-info.ts`).
> Until a release is published it renders a "Coming soon / in development" state instead of
> dead download buttons, and it self-heals on the next build once a release ships. So after
> you publish the draft, **rebuild/redeploy the site** (or trigger a Netlify deploy) so the
> buttons light up.

---

## 2. Required Secrets

Add these under **Settings → Secrets and variables → Actions → Repository secrets**.

### Tauri Updater Signing

| Secret name                          | Description |
|--------------------------------------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY`          | Ed25519 private key, base64-encoded (see §3). |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passphrase chosen during key generation.       |

### Azure AI Translator (i18n workflow)

| Secret name                          | Description |
|--------------------------------------|-------------|
| `AZURE_TRANSLATOR_SUBSCRIPTION_KEY`  | Azure AI Translator resource subscription key. |
| `AZURE_TRANSLATOR_ENDPOINT`          | e.g. `https://api.cognitive.microsofttranslator.com/` |
| `AZURE_TRANSLATOR_REGION`            | Azure region (e.g. `eastus`). Omit for global resources. |

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

| Secret                              | Value                                             |
| ----------------------------------- | ------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`         | Contents of the generated `*.key` private-key file. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`| The password chosen when the key was generated.     |

If these secrets are ever cleared, the release workflow still builds installers but
the updater `latest.json` will be unsigned and clients will refuse the update.

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

> **Important:** clients that installed a build signed with the *old* key will not
> accept updates signed with the *new* key. Rotate only when necessary and ship a
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
the signed update bundle.  Signatures in `latest.json` are verified against the
**public key** baked into the binary at build time.

```
Tag push app-v1.2.3
   │
   ▼
app-release.yml (matrix: win/mac-arm/mac-x64/linux)
   │  tauri-action builds + signs bundles
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
`{basename}.{locale}.json` convention).  Our catalogs use `{locale}.json`
(e.g., `en.json`).  The workflow bridges this by creating a temporary
`catalog.en.json` copy before the action runs and renaming the outputs back
afterward.  This is a documented workaround, not a bug in the action.

Reviewers of translation PRs should verify key completeness and tone before
merging.  Merge to `main` to ship the updated translations.

---

## 6. PWA Auto-Update

The Nuxt/Vite PWA (`@vite-pwa/nuxt`) is built as part of the same `generate`
step that produces the Tauri frontend.  For the **PWA path** (browser /
installable web app), updates are delivered via the Service Worker's cache
update mechanism — no `latest.json` is involved.  The Tauri desktop app uses
the separate updater plugin described in §4.  Both update paths are triggered by
publishing new release assets or deploying the SPA to its hosting origin.
