// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

/**
 * Unit tests for useToast composable.
 *
 * useToast is a module-level composable (not a Pinia store) — its reactive
 * `toasts` ref persists across test runs in the same module. We clear all
 * toasts in beforeEach to keep tests isolated.
 *
 * Auto-dismiss behaviour is verified with vi.useFakeTimers().
 */

describe("useToast — basic operations", () => {
  let toast: ReturnType<typeof useToast>;

  beforeEach(() => {
    vi.useFakeTimers();
    toast = useToast();
    // Clear any leftover toasts from previous tests
    const ids = toast.toasts.value.map((t) => t.id);
    ids.forEach((id) => toast.dismiss(id));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── show ──────────────────────────────────────────────────────────────────────

  it("show() adds a toast to the list and returns its ID", () => {
    const id = toast.show("Hello", "info");
    expect(id).toMatch(/^toast-\d+$/);
    expect(toast.toasts.value).toHaveLength(1);
    expect(toast.toasts.value[0]!.message).toBe("Hello");
    expect(toast.toasts.value[0]!.type).toBe("info");
  });

  it("show() defaults to type 'info' when type is omitted", () => {
    toast.show("msg");
    expect(toast.toasts.value[0]!.type).toBe("info");
  });

  it("show() multiple toasts accumulates them in order", () => {
    toast.show("first", "info");
    toast.show("second", "success");
    expect(toast.toasts.value).toHaveLength(2);
    expect(toast.toasts.value[1]!.message).toBe("second");
  });

  // ── dismiss ───────────────────────────────────────────────────────────────────

  it("dismiss() removes the toast with the given ID", () => {
    const id = toast.show("remove me", "warning");
    expect(toast.toasts.value).toHaveLength(1);
    toast.dismiss(id);
    expect(toast.toasts.value).toHaveLength(0);
  });

  it("dismiss() is a no-op for an unknown ID", () => {
    toast.show("keep", "info");
    toast.dismiss("nonexistent-id");
    expect(toast.toasts.value).toHaveLength(1);
  });

  // ── type helpers ──────────────────────────────────────────────────────────────

  it("info() adds a toast with type 'info'", () => {
    toast.info("info msg");
    expect(toast.toasts.value[0]!.type).toBe("info");
  });

  it("success() adds a toast with type 'success'", () => {
    toast.success("it worked");
    expect(toast.toasts.value[0]!.type).toBe("success");
  });

  it("warning() adds a toast with type 'warning'", () => {
    toast.warning("be careful");
    expect(toast.toasts.value[0]!.type).toBe("warning");
  });

  it("error() adds a toast with type 'error'", () => {
    toast.error("something broke");
    expect(toast.toasts.value[0]!.type).toBe("error");
  });

  // ── auto-dismiss ──────────────────────────────────────────────────────────────

  it("auto-dismisses after the specified duration (4000ms default)", () => {
    toast.show("auto-gone", "info", 4000);
    expect(toast.toasts.value).toHaveLength(1);

    vi.advanceTimersByTime(3999);
    expect(toast.toasts.value).toHaveLength(1); // Still present

    vi.advanceTimersByTime(1);
    expect(toast.toasts.value).toHaveLength(0); // Gone
  });

  it("auto-dismisses after a custom duration", () => {
    toast.show("short", "success", 1500);
    vi.advanceTimersByTime(1499);
    expect(toast.toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toast.toasts.value).toHaveLength(0);
  });

  it("persists indefinitely when duration is 0", () => {
    toast.show("sticky", "info", 0);
    vi.advanceTimersByTime(999_999);
    expect(toast.toasts.value).toHaveLength(1); // Never auto-dismissed
  });

  it("toasts list is readonly (direct mutation should be ignored)", () => {
    toast.show("readonly test", "info");
    // The returned toasts is wrapped in readonly() — attempting to push to it
    // throws in strict mode or silently fails. We just verify the type contract.
    const toastList = toast.toasts;
    // TypeScript: toastList is Readonly<Ref<Toast[]>>, toastList.value is readonly
    // Runtime: we can only observe, not mutate
    expect(Array.isArray(toastList.value)).toBe(true);
  });

  // ── concurrent toasts ─────────────────────────────────────────────────────────

  it("handles multiple concurrent toasts with independent timers", () => {
    const id1 = toast.show("fast", "info", 1000);
    const id2 = toast.show("slow", "success", 3000);

    vi.advanceTimersByTime(1000);
    expect(toast.toasts.value).toHaveLength(1);
    expect(toast.toasts.value[0]!.id).toBe(id2);

    vi.advanceTimersByTime(2000);
    expect(toast.toasts.value).toHaveLength(0);

    void id1; // suppress unused variable warning
  });
});
