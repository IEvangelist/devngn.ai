/*
 * Build-time resolution of desktop download availability.
 *
 * The marketing Download page links to stable-named installers on the newest
 * *published* GitHub Release (`releases/latest/download/<name>`). Those URLs
 * 404 whenever there is no published release yet — or the specific asset is
 * missing — which is exactly the "half-baked" state we must never render.
 *
 * This module asks the GitHub API which assets actually exist on the latest
 * published release so the page can fail safe: a download button is only
 * rendered for an asset that is genuinely downloadable, and the page
 * self-heals the next time it is built once a release ships. Every failure
 * mode (no release, network error, timeout, bad JSON, rate limit) collapses to
 * "nothing available" rather than throwing and breaking the build.
 */

/** A single downloadable installer, keyed by its stable release asset name. */
export interface DownloadLink {
  /** Stable asset file name, e.g. "devngn-macos-aarch64.dmg". */
  asset: string;
  label: string;
}

/** A desktop platform card definition (author-time, before availability). */
export interface DesktopPlatform {
  icon: string;
  os: string;
  note: string;
  primary: DownloadLink;
  secondary: DownloadLink[];
}

/** A download link resolved against real release availability. */
export interface ResolvedLink extends DownloadLink {
  href: string;
  available: boolean;
}

/** A platform card resolved against real release availability. */
export interface ResolvedPlatform {
  icon: string;
  os: string;
  note: string;
  primary: ResolvedLink;
  secondary: ResolvedLink[];
  /** True when the primary installer is actually downloadable. */
  available: boolean;
}

/** What the latest published GitHub release exposes for download. */
export interface ReleaseAvailability {
  /** Names of assets attached to the latest published release. */
  assets: Set<string>;
  /** Whether a published (non-draft, non-prerelease) release was found. */
  published: boolean;
  /** The release tag, e.g. "app-v1.2.3", when known. */
  tag: string | null;
}

/** A fresh "nothing is downloadable" result. Constructed per call so callers
 *  can never share or mutate a common Set. */
export function unavailable(): ReleaseAvailability {
  return { assets: new Set<string>(), published: false, tag: null };
}

function downloadBase(repo: string): string {
  return `https://github.com/${repo}/releases/latest/download`;
}

export function resolveLink(
  repo: string,
  link: DownloadLink,
  availability: ReleaseAvailability,
): ResolvedLink {
  return {
    ...link,
    href: `${downloadBase(repo)}/${link.asset}`,
    available: availability.assets.has(link.asset),
  };
}

export function resolvePlatform(
  repo: string,
  platform: DesktopPlatform,
  availability: ReleaseAvailability,
): ResolvedPlatform {
  const primary = resolveLink(repo, platform.primary, availability);
  const secondary = platform.secondary.map((link) =>
    resolveLink(repo, link, availability),
  );

  return {
    icon: platform.icon,
    os: platform.os,
    note: platform.note,
    primary,
    secondary,
    available: primary.available,
  };
}

export function resolvePlatforms(
  repo: string,
  platforms: DesktopPlatform[],
  availability: ReleaseAvailability,
): ResolvedPlatform[] {
  return platforms.map((platform) =>
    resolvePlatform(repo, platform, availability),
  );
}

/** True when any installer (primary or secondary) is downloadable. */
export function anyDownloadAvailable(platforms: ResolvedPlatform[]): boolean {
  return platforms.some(
    (platform) =>
      platform.available || platform.secondary.some((link) => link.available),
  );
}

interface GitHubReleaseAsset {
  name?: unknown;
}

interface GitHubRelease {
  draft?: unknown;
  prerelease?: unknown;
  tag_name?: unknown;
  assets?: unknown;
}

/**
 * Turn a GitHub release payload into an availability snapshot. `releases/latest`
 * already excludes drafts and prereleases, but this re-checks defensively so a
 * hand-fed or unexpected payload can never light up buttons that
 * `releases/latest/download/*` would refuse to serve.
 */
export function parseReleaseAvailability(
  data: GitHubRelease,
): ReleaseAvailability {
  if (data.draft === true || data.prerelease === true) {
    return unavailable();
  }

  const assets = new Set<string>();

  if (Array.isArray(data.assets)) {
    for (const asset of data.assets as GitHubReleaseAsset[]) {
      if (
        asset !== null &&
        typeof asset === "object" &&
        typeof asset.name === "string" &&
        asset.name.length > 0
      ) {
        assets.add(asset.name);
      }
    }
  }

  return {
    assets,
    published: true,
    tag: typeof data.tag_name === "string" ? data.tag_name : null,
  };
}

export interface FetchReleaseOptions {
  /** Injectable fetch, primarily for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Optional token to lift the unauthenticated GitHub rate limit in CI. */
  token?: string;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
}

/**
 * Resolve what the latest published release of `repo` (e.g.
 * "IEvangelist/devngn.ai") offers for download. Never throws — any failure
 * returns `unavailable()` so the site build stays green and the page degrades
 * to a "no downloads yet" state.
 */
export async function fetchReleaseAvailability(
  repo: string,
  options: FetchReleaseOptions = {},
): Promise<ReleaseAvailability> {
  const { fetchImpl = fetch, token, timeoutMs = 5000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": "devngn-site-build",
      "x-github-api-version": "2022-11-28",
    };

    if (token !== undefined && token.length > 0) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetchImpl(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers, signal: controller.signal },
    );

    if (!response.ok) {
      return unavailable();
    }

    const data = (await response.json()) as GitHubRelease;

    return parseReleaseAvailability(data);
  } catch {
    // Network error, timeout/abort, rate limit, or malformed JSON: fail safe.
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}
