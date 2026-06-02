/**
 * Short-lived Redis marker for "student row's ui_language is already in sync".
 *
 * authMiddleware fired an UPDATE on `students.ui_language` on EVERY student
 * request (the `WHERE ui_language <> ?` guard makes it idempotent, but the
 * round-trip still hits MySQL each time). For poll-heavy endpoints (judge
 * status, EDU dashboard refresh) that is a per-request write on the pool.
 *
 * This marker lets the middleware skip the DB round-trip while the value is
 * known-synced. On Redis miss / unavailability the caller falls back to the
 * UPDATE, so correctness never depends on Redis.
 */
import { runWithRedis, redisKey } from "../redis/sharedRedis";

const TTL_SECONDS = (() => {
  const raw = String(process.env.AUTH_STUDENT_UILANG_CACHE_TTL_SECONDS ?? "").trim();
  if (!raw) return 3600;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 86_400 ? n : 3600;
})();

function markerKey(studentId: number): string {
  return redisKey("auth", "student", String(studentId), "uilang");
}

/** Returns the last-synced ui_language for the student, or null on miss/unavailable. */
export async function getStudentUiLangMarker(studentId: number): Promise<string | null> {
  if (!Number.isFinite(studentId) || studentId <= 0) return null;
  const raw = await runWithRedis("studentUiLang.get", async redis => {
    return await redis.get(markerKey(studentId));
  });
  return typeof raw === "string" && raw ? raw : null;
}

/** Record that the student's ui_language is synced to `uiLanguage`. */
export async function setStudentUiLangMarker(studentId: number, uiLanguage: string): Promise<void> {
  if (!Number.isFinite(studentId) || studentId <= 0 || !uiLanguage) return;
  await runWithRedis("studentUiLang.set", async redis => {
    await redis.set(markerKey(studentId), uiLanguage, { EX: TTL_SECONDS });
    return true;
  });
}

/** Invalidate the marker (e.g. on explicit language change). */
export async function invalidateStudentUiLangMarker(studentId: number): Promise<void> {
  if (!Number.isFinite(studentId) || studentId <= 0) return;
  await runWithRedis("studentUiLang.del", async redis => {
    await redis.del(markerKey(studentId));
    return true;
  });
}
