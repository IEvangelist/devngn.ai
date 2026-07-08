import { describe, expect, it, vi } from "vitest";
import {
  anyDownloadAvailable,
  fetchReleaseAvailability,
  parseReleaseAvailability,
  resolveLink,
  resolvePlatforms,
  unavailable,
  type DesktopPlatform,
  type ReleaseAvailability,
} from "./release-info";

const repo = "IEvangelist/devngn.ai";

const platforms: DesktopPlatform[] = [
  {
    icon: "apple",
    os: "macOS",
    note: "Apple Silicon & Intel",
    primary: { asset: "devngn-macos-aarch64.dmg", label: "Apple Silicon" },
    secondary: [{ asset: "devngn-macos-x64.dmg", label: "Intel (x64)" }],
  },
  {
    icon: "windows",
    os: "Windows",
    note: "Windows 10 & 11",
    primary: { asset: "devngn-windows-x64-setup.exe", label: "Installer" },
    secondary: [{ asset: "devngn-windows-x64.msi", label: "MSI package" }],
  },
];

function availabilityWith(...assets: string[]): ReleaseAvailability {
  return { assets: new Set(assets), published: true, tag: "app-v1.2.3" };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("release-info resolvers", () => {
  it("builds the stable latest-download href", () => {
    const link = resolveLink(
      repo,
      { asset: "devngn-macos-aarch64.dmg", label: "Apple Silicon" },
      unavailable(),
    );

    expect(link.href).toBe(
      "https://github.com/IEvangelist/devngn.ai/releases/latest/download/devngn-macos-aarch64.dmg",
    );
  });

  it("marks a link available only when its asset exists", () => {
    const present = availabilityWith("devngn-macos-aarch64.dmg");

    expect(
      resolveLink(repo, { asset: "devngn-macos-aarch64.dmg", label: "x" }, present)
        .available,
    ).toBe(true);
    expect(
      resolveLink(repo, { asset: "devngn-macos-x64.dmg", label: "x" }, present)
        .available,
    ).toBe(false);
  });

  it("marks a platform available based on its primary installer", () => {
    const resolved = resolvePlatforms(
      repo,
      platforms,
      availabilityWith("devngn-macos-aarch64.dmg"),
    );

    expect(resolved[0]?.available).toBe(true);
    expect(resolved[0]?.secondary[0]?.available).toBe(false);
    expect(resolved[1]?.available).toBe(false);
  });

  it("reports no downloads when nothing is published", () => {
    const resolved = resolvePlatforms(repo, platforms, unavailable());

    expect(anyDownloadAvailable(resolved)).toBe(false);
  });

  it("reports downloads when only a secondary asset exists", () => {
    const resolved = resolvePlatforms(
      repo,
      platforms,
      availabilityWith("devngn-macos-x64.dmg"),
    );

    expect(resolved[0]?.available).toBe(false);
    expect(anyDownloadAvailable(resolved)).toBe(true);
  });
});

describe("parseReleaseAvailability", () => {
  it("collects named assets from a published release", () => {
    const result = parseReleaseAvailability({
      tag_name: "app-v1.2.3",
      assets: [
        { name: "devngn-macos-aarch64.dmg" },
        { name: "devngn-windows-x64.msi" },
        { size: 10 },
        { name: "" },
      ],
    });

    expect(result.published).toBe(true);
    expect(result.tag).toBe("app-v1.2.3");
    expect([...result.assets].sort()).toEqual([
      "devngn-macos-aarch64.dmg",
      "devngn-windows-x64.msi",
    ]);
  });

  it("treats a draft or prerelease as unavailable", () => {
    expect(
      parseReleaseAvailability({ draft: true, assets: [{ name: "a.dmg" }] })
        .assets.size,
    ).toBe(0);
    expect(
      parseReleaseAvailability({ prerelease: true, assets: [{ name: "a.dmg" }] })
        .published,
    ).toBe(false);
  });
});

describe("fetchReleaseAvailability", () => {
  it("returns assets from a successful response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        tag_name: "app-v1.2.3",
        assets: [{ name: "devngn-linux-amd64.deb" }],
      }),
    );

    const result = await fetchReleaseAvailability(repo, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.assets.has("devngn-linux-amd64.deb")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/IEvangelist/devngn.ai/releases/latest",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("sends an auth header only when a token is provided", async () => {
    const capture = vi.fn(
      (_url: string, _init?: { headers?: Record<string, string> }) =>
        Promise.resolve(jsonResponse({ assets: [] })),
    );

    await fetchReleaseAvailability(repo, {
      fetchImpl: capture as unknown as typeof fetch,
      token: "secret-token",
    });

    const headers = capture.mock.calls[0]?.[1]?.headers ?? {};
    expect(headers.authorization).toBe("Bearer secret-token");
  });

  it("fails safe on a 404 (no published release)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 404));

    const result = await fetchReleaseAvailability(repo, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.published).toBe(false);
    expect(result.assets.size).toBe(0);
  });

  it("fails safe when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await fetchReleaseAvailability(repo, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.assets.size).toBe(0);
  });

  it("fails safe when the request times out", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );

    const result = await fetchReleaseAvailability(repo, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
    });

    expect(result.assets.size).toBe(0);
  });
});
