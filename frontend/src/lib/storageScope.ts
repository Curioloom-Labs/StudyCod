import { getCachedMeUser } from "./api/profile";

/** Stable browser-storage namespace for the currently authenticated principal. */
export const IDE_THEORY_COMPLETION_KEY = "studycod:ide:theory-complete:v1";

export function currentPrincipalStorageId(): string {
  const user = getCachedMeUser();
  if (!user) return "anonymous";
  const value = user.studentId ?? user.id;
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function scopedStorageKey(prefix: string, key: string | number): string {
  return `${prefix}:${currentPrincipalStorageId()}:${String(key)}`;
}
