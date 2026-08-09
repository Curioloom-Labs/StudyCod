/** Stable browser-storage namespace for the currently authenticated principal. */
export const IDE_THEORY_COMPLETION_KEY = "studycod:ide:theory-complete:v1";

export function currentPrincipalStorageId(): string {
  if (typeof window === "undefined") return "anonymous";
  try {
    const token = window.localStorage.getItem("token");
    if (!token) return "anonymous";
    const payload = token.split(".")[1];
    if (!payload) return "anonymous";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(normalized)) as Record<string, unknown>;
    const value = parsed.studentId ?? parsed.userId ?? parsed.sub ?? parsed.id;
    return value == null ? "anonymous" : String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
  } catch {
    return "anonymous";
  }
}

export function scopedStorageKey(prefix: string, key: string | number): string {
  return `${prefix}:${currentPrincipalStorageId()}:${String(key)}`;
}
