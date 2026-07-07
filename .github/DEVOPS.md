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
#    apps/app/src-tauri/Cargo.toml to match, commit, and push to main.
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
> non-prerelease) release — so remember to publish the draft. No macOS *universal* dmg,
> Windows `.zip`, or Linux `.rpm` is produced; use the six assets above.

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

## 3. Generating the Tauri Signing Keypair

The Tauri updater requires an Ed25519 keypair.  **Generate it once** and store
it securely.  Never commit the private key.

```bash
# From the monorepo root (or any directory with @tauri-apps/cli installed):
pnpm --filter @devngn/app exec tauri signer generate -w ~/.tauri/devngn.key
```

The command prints output similar to:

```
Please set the following environment variables in your GitHub Secrets:
  TAURI_SIGNING_PRIVATE_KEY=<base64-encoded private key>
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<your chosen password>

Your public key was written to: ~/.tauri/devngn.key.pub
```

**After generating:**

1. Copy `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` into
   the repository secrets (§2).
2. Open `apps/app/src-tauri/tauri.conf.json` and replace the `plugins.updater.pubkey`
   placeholder with the **public key** from `~/.tauri/devngn.key.pub`:

   ```json
   "plugins": {
     "updater": {
       "pubkey": "<paste the public key string here>",
       "endpoints": [
         "https://github.com/IEvangelist/devngn.ai/releases/latest/download/latest.json"
       ]
     }
   }
   ```

3. Commit and push the `tauri.conf.json` change.  The public key is safe to commit.

> **Note:** `tauri.conf.json` currently contains a descriptive TODO placeholder.
> No CI edit was made to that file — the maintainer performs this one-time manual
> step after generating the keypair.

---

## 4. How the Tauri Updater Feed Works

`latest.json` is generated by `tauri-apps/tauri-action` (`uploadUpdaterJson: true`)
and attached to every GitHub Release at:

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
