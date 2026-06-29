import { gzipSync, gunzipSync } from "zlib";

/**
 * Codec for library_task_revisions.snapshot.
 *
 * Snapshots inline a task's full test suite, which is large (tens of MB) and
 * highly compressible. We store gzip+base64 with a short marker prefix so the
 * value still fits the existing LONGTEXT (text) column with no schema change.
 *
 * Backward-compatible: legacy rows are plain JSON (they never start with the
 * marker), so parseSnapshot decodes both formats transparently. New writes are
 * compressed; existing rows can be migrated later with an opt-in backfill.
 */
const GZIP_PREFIX = "gz1:";

// Below this size base64 overhead isn't worth it; tiny snapshots stay plain JSON.
const MIN_COMPRESS_BYTES = 1024;

export function encodeSnapshot(value: unknown): string {
  const json = JSON.stringify(value);
  if (json.length < MIN_COMPRESS_BYTES) return json;
  const compressed = gzipSync(Buffer.from(json, "utf8")).toString("base64");
  // Guard against the pathological case where compression somehow grows the
  // payload (already-random data): keep whichever is smaller.
  const encoded = GZIP_PREFIX + compressed;
  return encoded.length < json.length ? encoded : json;
}

export function parseSnapshot<T = any>(stored: string | null | undefined): T {
  const s = String(stored ?? "null");
  if (s.startsWith(GZIP_PREFIX)) {
    const buf = Buffer.from(s.slice(GZIP_PREFIX.length), "base64");
    return JSON.parse(gunzipSync(buf).toString("utf8")) as T;
  }
  return JSON.parse(s) as T;
}

export function isCompressedSnapshot(stored: string | null | undefined): boolean {
  return String(stored ?? "").startsWith(GZIP_PREFIX);
}
