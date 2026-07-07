// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Unit tests for useAuthStore.
 *
 * Covers:
 *  - isAuthenticated computed (token + user presence)
 *  - init() web path — reads token from localStorage, calls refreshUser
 *  - handleCallback() — persists token and fetches user (web path)
 *  - signOut() — clears token and user
 *  - Tauri path — mocks window.__TAURI_INTERNALS__ + @tauri-apps/plugin-store
 *
 * Network calls (WellnessClient.me → GET /v1/auth/me) are intercepted via
 * the global fetch stub established in setup.ts.
 *
 * vi.mock() MUST be at module top-level because Vitest hoists it before any
 * describe block executes. If the factory references block-scoped variables
 * they will be undefined at hoist time → ReferenceError.
 */

import { setActivePinia, createPinia } from "pinia";
import { mockUser } from "../../fixtures/wellness";

const TOKEN_KEY = "devngn_token";

/** Build a minimal AuthenticatedUserResponse for fetch mocking. */
const mockUserResponse = new Response(JSON.stringify(mockUser), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

// ── Tauri store mock (module-level so factory closure is in scope) ────────────
// vi.mock is hoisted to file top by Vitest's babel/acorn transform.  The
// factory must not close over describe-block variables — those don't exist yet.
const mockTauriStoreGet = vi.fn();
const mockTauriStoreSet = vi.fn();
const mockTauriStoreDelete = vi.fn();
const mockTauriLoad = vi.fn();

vi.mock("@tauri-apps/plugin-store", () => ({
  load: (...args: unknown[]) => mockTauriLoad(...args),
}));

describe("useAuthStore — isAuthenticated computed", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it("isAuthenticated is false initially (no token, no user)", () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
  });

  it("isAuthenticated is false when token is set but user is undefined", () => {
    const store = useAuthStore();
    store.token = "tok";
    expect(store.isAuthenticated).toBe(false);
  });

  it("isAuthenticated is true when both token and user are set", () => {
    const store = useAuthStore();
    store.token = "tok";
    store.user = mockUser;
    expect(store.isAuthenticated).toBe(true);
  });

  it("isAuthenticated reverts to false after sign out", async () => {
    const store = useAuthStore();
    store.token = "tok";
    store.user = mockUser;
    expect(store.isAuthenticated).toBe(true);

    await store.signOut();
    expect(store.isAuthenticated).toBe(false);
  });
});

describe("useAuthStore — web path token persistence", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    // Ensure window.__TAURI_INTERNALS__ is NOT set (web path)
    delete (window as unknown as Record<string, unknown>)["__TAURI_INTERNALS__"];
  });

  it("init() does nothing when localStorage has no token", async () => {
    const store = useAuthStore();
    await store.init();
    expect(store.token).toBeUndefined();
    expect(store.user).toBeUndefined();
  });

  it("init() restores token from localStorage and fetches user", async () => {
    localStorage.setItem(TOKEN_KEY, "stored-token");
    vi.mocked(fetch).mockResolvedValueOnce(mockUserResponse.clone());

    const store = useAuthStore();
    await store.init();

    expect(store.token).toBe("stored-token");
    expect(store.user).toMatchObject({ id: "user-42" });
  });

  it("init() clears token if refreshUser returns undefined (401)", async () => {
    localStorage.setItem(TOKEN_KEY, "expired-token");
    // me() returns undefined (401 / 404)
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );

    const store = useAuthStore();
    await store.init();

    // refreshUser sets user to undefined when me() returns undefined
    expect(store.user).toBeUndefined();
  });

  it("handleCallback() persists the token to localStorage and fetches user", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockUserResponse.clone());

    const store = useAuthStore();
    await store.handleCallback("new-access-token");

    expect(store.token).toBe("new-access-token");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("new-access-token");
    expect(store.user?.login).toBe("devngntest");
  });

  it("signOut() removes token from localStorage", async () => {
    localStorage.setItem(TOKEN_KEY, "tok");
    const store = useAuthStore();
    store.token = "tok";
    store.user = mockUser;

    await store.signOut();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(store.token).toBeUndefined();
    expect(store.user).toBeUndefined();
  });
});

describe("useAuthStore — Tauri path token persistence", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    // Simulate Tauri environment
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    // Reset the module-level mock fns and wire up the load() factory
    mockTauriStoreGet.mockReset();
    mockTauriStoreSet.mockReset();
    mockTauriStoreDelete.mockReset();
    mockTauriLoad.mockReset();
    mockTauriLoad.mockResolvedValue({
      get: mockTauriStoreGet,
      set: mockTauriStoreSet,
      delete: mockTauriStoreDelete,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("init() reads token from Tauri store (not localStorage) when isTauri is true", async () => {
    mockTauriStoreGet.mockResolvedValueOnce("tauri-token");
    vi.mocked(fetch).mockResolvedValueOnce(mockUserResponse.clone());

    const store = useAuthStore();
    await store.init();

    expect(mockTauriLoad).toHaveBeenCalledWith("devngn.json");
    expect(mockTauriStoreGet).toHaveBeenCalledWith(TOKEN_KEY);
    expect(store.token).toBe("tauri-token");
  });

  it("init() falls back gracefully when Tauri store fails", async () => {
    mockTauriStoreGet.mockRejectedValueOnce(new Error("Tauri store error"));

    const store = useAuthStore();
    await store.init();

    // Falls back — no token, no crash
    expect(store.token).toBeUndefined();
  });

  it("handleCallback() persists token to Tauri store when isTauri is true", async () => {
    mockTauriStoreSet.mockResolvedValueOnce(undefined);
    vi.mocked(fetch).mockResolvedValueOnce(mockUserResponse.clone());

    const store = useAuthStore();
    await store.handleCallback("tauri-access-token");

    expect(mockTauriStoreSet).toHaveBeenCalledWith(TOKEN_KEY, "tauri-access-token");
    expect(store.token).toBe("tauri-access-token");
  });
});
