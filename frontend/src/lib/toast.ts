export type ToastType = "info" | "success" | "error";

export type ToastPayload = {
  id?: number;
  type?: ToastType;
  message: string;
  durationMs?: number;
};

const TOAST_EVENT = "studycod:toast";

export function showToast(payload: ToastPayload): void {
  if (typeof window === "undefined") return;
  const id = payload.id ?? Date.now() + Math.floor(Math.random() * 10_000);
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, {
    detail: {
      id,
      type: payload.type ?? "info",
      message: String(payload.message || ""),
      durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : undefined,
    },
  }));
}

export const toast = {
  info: (message: string, durationMs?: number) => showToast({ type: "info", message, durationMs }),
  success: (message: string, durationMs?: number) => showToast({ type: "success", message, durationMs }),
  error: (message: string, durationMs?: number) => showToast({ type: "error", message, durationMs }),
};

export function getToastEventName(): string {
  return TOAST_EVENT;
}
