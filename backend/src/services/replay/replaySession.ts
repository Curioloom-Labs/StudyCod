/**
 * Solve-replay snapshot processing.
 *
 * The client records periodic code snapshots during a solve session. Before we
 * persist them we (1) drop consecutive identical snapshots (only real edits
 * matter), (2) cap the number of snapshots by even downsampling while always
 * keeping the first and last, and (3) cap total payload size by dropping the
 * OLDEST snapshots first (recent state matters most for playback).
 *
 * Pure + deterministic — fully unit-testable.
 */
export interface ReplaySnapshot {
  /** Milliseconds since session start. */
  tMs: number;
  code: string;
}

export interface BoundSnapshotsOptions {
  maxSnapshots?: number;
  maxTotalBytes?: number;
}

export const DEFAULT_MAX_SNAPSHOTS = 300;
export const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;

function byteLen(s: string): number {
  return Buffer.byteLength(String(s ?? ""), "utf8");
}

/** Drop consecutive snapshots whose code is unchanged from the previous kept one. */
function dedupeConsecutive(snaps: ReplaySnapshot[]): ReplaySnapshot[] {
  const out: ReplaySnapshot[] = [];
  let prevCode: string | null = null;
  for (const s of snaps) {
    if (s.code !== prevCode) {
      out.push(s);
      prevCode = s.code;
    }
  }
  return out;
}

/** Evenly downsample to at most `max`, always keeping first and last. */
function downsample(snaps: ReplaySnapshot[], max: number): ReplaySnapshot[] {
  if (snaps.length <= max) return snaps;
  if (max <= 2) return [snaps[0], snaps[snaps.length - 1]];
  const out: ReplaySnapshot[] = [snaps[0]];
  const inner = max - 2;
  const step = (snaps.length - 1) / (inner + 1);
  for (let i = 1; i <= inner; i++) {
    out.push(snaps[Math.round(i * step)]);
  }
  out.push(snaps[snaps.length - 1]);
  // Round() can collide on dense ranges; de-dup by reference position.
  return out.filter((s, i) => i === 0 || s !== out[i - 1]);
}

export function boundSnapshots(raw: ReplaySnapshot[], options: BoundSnapshotsOptions = {}): ReplaySnapshot[] {
  const maxSnapshots = Math.max(2, Math.floor(options.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS));
  const maxTotalBytes = Math.max(1024, Math.floor(options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES));

  const normalized = (Array.isArray(raw) ? raw : [])
    .filter((s) => s && typeof s.code === "string" && Number.isFinite(s.tMs))
    .map((s) => ({ tMs: Math.max(0, Math.floor(s.tMs)), code: s.code }))
    .sort((a, b) => a.tMs - b.tMs);

  let snaps = dedupeConsecutive(normalized);
  snaps = downsample(snaps, maxSnapshots);

  // Cap total bytes by dropping the OLDEST snapshots (keep recent state).
  let total = snaps.reduce((n, s) => n + byteLen(s.code), 0);
  while (snaps.length > 1 && total > maxTotalBytes) {
    const removed = snaps.shift()!;
    total -= byteLen(removed.code);
  }
  return snaps;
}
