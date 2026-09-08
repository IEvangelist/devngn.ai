// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

import { mockUser } from "../../fixtures/wellness";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useConsentStore", () => {
  beforeEach(() => {
    const auth = useAuthStore();
    auth.token = "token";
    auth.user = mockUser;
  });

  it("loads missing consent and accepts the current canonical version", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accepted: null,
          current: { version: "1.0", text: "Canonical consent text" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          version: "1.0",
          text: "Canonical consent text",
          acceptedAt: "2026-09-08T15:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accepted: {
            version: "1.0",
            text: "Canonical consent text",
            acceptedAt: "2026-09-08T15:00:00Z",
          },
          current: { version: "1.0", text: "Canonical consent text" },
        }),
      );

    const consent = useConsentStore();
    await consent.load();

    expect(consent.hasCurrentConsent).toBe(false);
    expect(consent.current?.version).toBe("1.0");

    await consent.acceptCurrent();

    expect(consent.hasCurrentConsent).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);

    const getHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers);
    expect(getHeaders.has("Authorization")).toBe(true);

    const [, acceptInit] = vi.mocked(fetch).mock.calls[1] ?? [];
    expect(acceptInit?.method).toBe("POST");
    expect(acceptInit?.body).toBe(JSON.stringify({ version: "1.0" }));
  });

  it("invalidates previously accepted consent when a refresh fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accepted: {
            version: "1.0",
            text: "Canonical consent text",
            acceptedAt: "2026-09-08T15:00:00Z",
          },
          current: { version: "1.0", text: "Canonical consent text" },
        }),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const consent = useConsentStore();
    await consent.load();
    expect(consent.hasCurrentConsent).toBe(true);

    await consent.load();

    expect(consent.hasCurrentConsent).toBe(false);
    expect(consent.accepted).toBeNull();
    expect(consent.current).toBeNull();
    expect(consent.error).toBe("load");
  });

  it("ignores a consent response after the session is reset", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const consent = useConsentStore();
    const pending = consent.load();
    consent.reset();
    resolveResponse?.(
      jsonResponse(200, {
        accepted: {
          version: "1.0",
          text: "Canonical consent text",
          acceptedAt: "2026-09-08T15:00:00Z",
        },
        current: { version: "1.0", text: "Canonical consent text" },
      }),
    );
    await pending;

    expect(consent.hasCurrentConsent).toBe(false);
    expect(consent.current).toBeNull();
  });

  it("returns to sign-in when consent loading reports an expired session", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));

    const auth = useAuthStore();
    const consent = useConsentStore();
    await consent.load();

    expect(auth.token).toBeUndefined();
    expect(auth.user).toBeUndefined();
    expect(consent.current).toBeNull();
    expect(consent.error).toBeNull();
  });

  it("resets consent when no authenticated token is available", async () => {
    const auth = useAuthStore();
    auth.token = undefined;

    const consent = useConsentStore();
    await consent.load();

    expect(consent.current).toBeNull();
    expect(consent.accepted).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
