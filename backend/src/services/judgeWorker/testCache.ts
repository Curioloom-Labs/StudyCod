import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { In } from "typeorm";
import { AppDataSource } from "../../data-source";
import { TestData } from "../../entities/TestData";
import { logger } from "../../utils/logger";

/**
 * Content-addressed on-disk cache for stored test data.
 *
 * Stored tests are static per task, so instead of inlining every input/expected into the
 * judge request (which serialised tens of MB through Redis + stdin and hit per-test caps),
 * we materialise each test's input/output to a file named by the sha256 of its content and
 * pass the judge only file references. The same content is written once and reused across
 * submissions; editing a test changes its hash and therefore its file automatically.
 *
 * The judge worker must see the same JUDGE_TEST_CACHE_DIR (it validates that referenced
 * paths live under it). Since the worker inherits the backend's environment, set
 * JUDGE_TEST_CACHE_DIR in production so both agree.
 */

/** Test-delivery mode. `refs` (default) materialises tests to files; `inline` is legacy. */
export function judgeTestsMode(): "refs" | "inline" {
  return String(process.env.JUDGE_TESTS_MODE ?? "").trim().toLowerCase() === "inline" ? "inline" : "refs";
}

let resolvedDir: string | null = null;

export function resolveTestCacheDir(): string {
  if (resolvedDir) return resolvedDir;
  const fromEnv = (process.env.JUDGE_TEST_CACHE_DIR || "").trim();
  const candidates = [fromEnv, "/var/lib/studycod/judge-cache", path.join(process.cwd(), ".judge-cache")].filter(Boolean);
  for (const dir of candidates) {
    try {
      fsSync.mkdirSync(dir, { recursive: true });
      // Confirm writability.
      fsSync.accessSync(dir, fsSync.constants.W_OK);
      resolvedDir = path.resolve(dir);
      // Keep the env in sync so the spawned judge worker validates against the same root.
      process.env.JUDGE_TEST_CACHE_DIR = resolvedDir;
      return resolvedDir;
    } catch {
      // try next candidate
    }
  }
  // Last resort: a temp dir (volatile, but keeps the feature functional).
  const tmp = path.join(os.tmpdir(), "studycod-judge-cache");
  fsSync.mkdirSync(tmp, { recursive: true });
  resolvedDir = tmp;
  process.env.JUDGE_TEST_CACHE_DIR = resolvedDir;
  return resolvedDir;
}

export function sha256Hex(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function cachePathForHash(hash: string): string {
  const dir = resolveTestCacheDir();
  return path.join(dir, hash.slice(0, 2), hash.slice(2, 4), hash);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

/** Write content to its content-addressed path if absent; bump atime/mtime for GC. */
async function ensureCached(content: string, hash: string): Promise<string> {
  const finalPath = cachePathForHash(hash);
  if (await fileExists(finalPath)) {
    // Touch so the GC sweep treats recently-used files as hot.
    const now = new Date();
    try {
      await fs.utimes(finalPath, now, now);
    } catch {}
    return finalPath;
  }
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  await fs.writeFile(tmpPath, content, { encoding: "utf8" });
  try {
    await fs.rename(tmpPath, finalPath);
  } catch (e: any) {
    // Another worker may have created it concurrently; tolerate that.
    if (!(await fileExists(finalPath))) {
      try {
        await fs.rm(tmpPath, { force: true });
      } catch {}
      throw e;
    }
    try {
      await fs.rm(tmpPath, { force: true });
    } catch {}
  }
  return finalPath;
}

export interface TestMetaRow {
  id: number | string;
  input_sha256?: string | null;
  output_sha256?: string | null;
}

export interface TestRef {
  inputPath: string;
  outputPath: string;
}

export interface TestHashUpdate {
  id: number | string;
  inputHash: string;
  outputHash: string;
}

export interface MaterializeResult {
  refs: Map<string, TestRef>;
  /** Rows whose hashes were (re)computed and should be persisted back to the DB. */
  hashUpdates: TestHashUpdate[];
}

export type TestContentLoader = (
  ids: Array<number | string>
) => Promise<Map<string, { input: string; output: string }>>;

/**
 * Resolve referenced file paths for the given tests, materialising content only for rows
 * that are missing a hash or whose cached file is absent (cache miss). `loadContent` is
 * called once with just the cache-miss ids, so a full cache hit reads no blob content.
 */
export async function materializeTests(
  rows: TestMetaRow[],
  loadContent: TestContentLoader
): Promise<MaterializeResult> {
  const refs = new Map<string, TestRef>();
  const hashUpdates: TestHashUpdate[] = [];
  const needContent: Array<number | string> = [];

  // First pass: satisfy from known hashes whose files already exist.
  const pending = new Map<string, { inHash?: string; outHash?: string }>();
  for (const row of rows) {
    const key = String(row.id);
    const inHash = row.input_sha256 || undefined;
    const outHash = row.output_sha256 || undefined;
    const inOk = inHash ? await fileExists(cachePathForHash(inHash)) : false;
    const outOk = outHash ? await fileExists(cachePathForHash(outHash)) : false;
    if (inOk && outOk) {
      refs.set(key, { inputPath: cachePathForHash(inHash!), outputPath: cachePathForHash(outHash!) });
    } else {
      pending.set(key, { inHash: inOk ? inHash : undefined, outHash: outOk ? outHash : undefined });
      needContent.push(row.id);
    }
  }

  if (needContent.length > 0) {
    const content = await loadContent(needContent);
    for (const id of needContent) {
      const key = String(id);
      const c = content.get(key);
      if (!c) throw new Error(`TEST_CONTENT_MISSING: ${key}`);
      const inHash = sha256Hex(c.input);
      const outHash = sha256Hex(c.output);
      const inputPath = await ensureCached(c.input, inHash);
      const outputPath = await ensureCached(c.output, outHash);
      refs.set(key, { inputPath, outputPath });
      hashUpdates.push({ id, inputHash: inHash, outputHash: outHash });
    }
  }

  return { refs, hashUpdates };
}

/**
 * Background GC: delete cache files not accessed within the TTL. Safe to call periodically;
 * a deleted file is simply re-materialised on the next cache miss.
 */
export async function sweepTestCache(ttlMs?: number): Promise<{ removed: number; scanned: number }> {
  const dir = resolveTestCacheDir();
  const ttl = ttlMs === undefined
    ? Math.max(60 * 60 * 1000, parseInt(String(process.env.JUDGE_TEST_CACHE_TTL_MS ?? ""), 10) || 14 * 24 * 60 * 60 * 1000)
    : Math.max(0, ttlMs);
  const cutoff = Date.now() - ttl;
  let removed = 0;
  let scanned = 0;
  let referencedHashes: Set<string> | null = null;
  try {
    const rows = (await AppDataSource.query(
      `SELECT input_sha256 AS inputHash, output_sha256 AS outputHash
         FROM test_data
        WHERE input_sha256 IS NOT NULL OR output_sha256 IS NOT NULL`
    )) as Array<{ inputHash?: string | null; outputHash?: string | null }>;
    referencedHashes = new Set(
      rows.flatMap(row => [row.inputHash, row.outputHash].filter((hash): hash is string => Boolean(hash)))
    );
  } catch {
    // A cache sweep must remain best-effort if the database is unavailable.
  }
  async function walk(d: string): Promise<void> {
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        scanned++;
        try {
          const st = await fs.stat(full);
          const last = Math.max(st.atimeMs, st.mtimeMs);
          const isOrphan = referencedHashes !== null && !referencedHashes.has(e.name);
          if (isOrphan || last < cutoff) {
            await fs.rm(full, { force: true });
            removed++;
          }
        } catch {}
      }
    }
  }
  await walk(dir);
  if (removed > 0) logger.info("[judge] test cache GC", { removed, scanned, dir });
  return { removed, scanned };
}

/**
 * Default content loader: reads `input` + `expected_output` for the given test ids straight
 * from the DB. Used as the `loadContent` for stored-test paths — invoked only for cache-miss
 * ids (refs mode) or inline fallback, so a warm cache reads no big `input` blobs.
 */
export async function loadTestContentByIds(
  ids: Array<number | string>
): Promise<Map<string, { input: string; output: string }>> {
  const m = new Map<string, { input: string; output: string }>();
  const numeric = ids.map(Number).filter(n => Number.isFinite(n));
  if (numeric.length === 0) return m;
  const repo = AppDataSource.getRepository(TestData);
  const rows = await repo.find({
    where: { id: In(numeric) } as any,
    select: { id: true, input: true, expectedOutput: true } as any
  });
  for (const r of rows) m.set(String(r.id), { input: r.input || "", output: r.expectedOutput || "" });
  return m;
}

/** Persist computed content hashes so future checks can identify cached files. Best-effort. */
async function persistTestHashes(updates: TestHashUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  try {
    const repo = AppDataSource.getRepository(TestData);
    // Group by (inputHash,outputHash) is unnecessary — ids are unique; update per row.
    await Promise.all(
      updates.map(u =>
        repo.update({ id: Number(u.id) } as any, { inputSha256: u.inputHash, outputSha256: u.outputHash } as any)
      )
    );
  } catch (e: any) {
    logger.warn("[judge] failed to persist test hashes", { error: e?.message || String(e) });
  }
}

export interface WorkerTest {
  id: number | string;
  group?: string;
  weight?: number;
  hidden?: boolean;
  input?: string;
  output?: string;
  input_path?: string;
  output_path?: string;
}

export interface BuildJudgeTestsOptions<T> {
  /** Per-row group/weight/hidden mapping (from already-selected metadata). */
  meta: (row: T) => { group?: string; weight?: number; hidden?: boolean };
  /** Known content hashes for the row (from DB), used to find cached files. */
  hashes: (row: T) => { inputHash?: string | null; outputHash?: string | null };
  /**
   * Load `{ input, output }` for the given ids. Called only for cache-miss ids in refs
   * mode, or for every id in inline mode/fallback. Implementations may read the big `input`
   * column from the DB lazily so a full cache hit reads no input blobs at all.
   */
  loadContent: (ids: Array<number | string>) => Promise<Map<string, { input: string; output: string }>>;
}

/**
 * Build the judge's `tests` array from stored test metadata. In `refs` mode (default) test
 * content is materialised to the on-disk cache and passed by file reference (tiny request,
 * no per-test size cap, constant worker memory) — loading content only for cache misses.
 * On any failure it falls back to inline so grading never breaks. Hashes are backfilled to
 * the DB in the background.
 */
export async function buildJudgeTests<T extends { id: number | string }>(
  rows: T[],
  opts: BuildJudgeTestsOptions<T>
): Promise<{ tests: WorkerTest[]; mode: "refs" | "inline" }> {
  const buildInline = async (): Promise<WorkerTest[]> => {
    const content = await opts.loadContent(rows.map(r => r.id));
    return rows.map(r => {
      const c = content.get(String(r.id));
      return { id: r.id, input: c?.input || "", output: c?.output || "", ...opts.meta(r) };
    });
  };

  if (judgeTestsMode() !== "refs") {
    return { tests: await buildInline(), mode: "inline" };
  }

  try {
    const { refs, hashUpdates } = await materializeTests(
      rows.map(r => {
        const h = opts.hashes(r);
        return { id: r.id, input_sha256: h.inputHash, output_sha256: h.outputHash };
      }),
      opts.loadContent
    );
    const tests: WorkerTest[] = rows.map(r => {
      const ref = refs.get(String(r.id));
      if (!ref) throw new Error(`TEST_REF_MISSING: ${r.id}`);
      return { id: r.id, input_path: ref.inputPath, output_path: ref.outputPath, ...opts.meta(r) };
    });
    void persistTestHashes(hashUpdates);
    return { tests, mode: "refs" };
  } catch (e: any) {
    logger.warn("[judge] refs materialisation failed; falling back to inline tests", { error: e?.message || String(e) });
    return { tests: await buildInline(), mode: "inline" };
  }
}
