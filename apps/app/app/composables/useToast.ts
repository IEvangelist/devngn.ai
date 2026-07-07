// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. SPDX-License-Identifier: MIT

export interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  duration?: number;
}

const toasts = ref<Toast[]>([]);

let _counter = 0;

export function useToast() {
  function show(
    message: string,
    type: Toast["type"] = "info",
    duration = 4000,
  ): string {
    const id = `toast-${++_counter}`;
    toasts.value.push({ id, message, type, duration });
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }

  function dismiss(id: string): void {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) toasts.value.splice(idx, 1);
  }

  const info = (msg: string, ms?: number) => show(msg, "info", ms);
  const success = (msg: string, ms?: number) => show(msg, "success", ms);
  const warning = (msg: string, ms?: number) => show(msg, "warning", ms);
  const error = (msg: string, ms?: number) => show(msg, "error", ms);

  return { toasts: readonly(toasts), show, dismiss, info, success, warning, error };
}
