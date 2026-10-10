import * as fs from "fs/promises";
import * as path from "path";
import { createHash, randomUUID } from "crypto";
import type { JudgeRequest } from "./result";

const ROOT = "/var/cache/studycod/compile";
const TTL = 3600_000;
const MAX_BYTES = 512 * 1024 * 1024;
type Artifact = { path: string; sha256: string; size: number; executable: boolean };
type Manifest = { created: number; files: Artifact[]; bytes: number };
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export async function compilationCacheKey(req: JudgeRequest, plan: string[], chroot: string): Promise<string | null> {
  if (process.platform !== "linux" || process.getuid?.() !== 0 || !req.cache_owner || req.trace) return null;
  let version: string;
  try { version = await fs.readFile("/usr/local/lib/studycod-judge/toolchain-version", "utf8"); }
  catch { return null; }
  if (!version.trim()) return null;
  return digest(JSON.stringify({ owner: req.cache_owner, language: req.language, compiler: req.compiler,
    source: req.source, files: req.files, entry: req.entry, plan, chroot, version }));
}
function safeRelative(value: string): boolean {
  return Boolean(value) && !path.isAbsolute(value) && !value.split(/[\\/]/).some(p => !p || p === "." || p === "..");
}
export async function restoreCompilation(key: string | null, workDir: string): Promise<boolean> {
  if (!key) return false;
  const dir = path.join(ROOT, key);
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8")) as Manifest;
    if (Date.now() - manifest.created > TTL || manifest.bytes > MAX_BYTES || !Array.isArray(manifest.files)) return false;
    // Verify every private artifact before copying any into the new sandbox.
    for (const entry of manifest.files) {
      if (!safeRelative(entry.path)) return false;
      const file = path.join(dir, "files", entry.path);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.size || digest(await fs.readFile(file)) !== entry.sha256) return false;
    }
    for (const entry of manifest.files) {
      const destination = path.join(workDir, entry.path);
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await fs.copyFile(path.join(dir, "files", entry.path), destination);
      await fs.chown(destination, 999, 987);
      await fs.chmod(destination, entry.executable ? 0o700 : 0o600);
      let parent = path.dirname(destination);
      while (parent !== workDir) { await fs.chown(parent, 999, 987); parent = path.dirname(parent); }
    }
    await fs.utimes(dir, new Date(), new Date());
    return true;
  } catch { return false; }
}
async function prune(required: number): Promise<void> {
  const entries: Array<{ dir: string; size: number; last: number }> = [];
  for (const name of await fs.readdir(ROOT)) {
    const dir = path.join(ROOT, name);
    if (!/^[a-f0-9]{64}$/.test(name)) {
      const stat = await fs.stat(dir);
      if (Date.now() - stat.mtimeMs > TTL) await fs.rm(dir, { recursive: true, force: true });
      continue;
    }
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8")) as Manifest;
      const stat = await fs.stat(dir);
      if (Date.now() - manifest.created > TTL) await fs.rm(dir, { recursive: true, force: true });
      else entries.push({ dir, size: manifest.bytes, last: stat.mtimeMs });
    } catch { await fs.rm(dir, { recursive: true, force: true }); }
  }
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  for (const entry of entries.sort((a, b) => a.last - b.last)) {
    if (total + required <= MAX_BYTES) break;
    await fs.rm(entry.dir, { recursive: true, force: true }); total -= entry.size;
  }
}
export async function storeCompilation(key: string | null, workDir: string): Promise<void> {
  if (!key) return;
  const files: Artifact[] = [];
  let bytes = 0;
  let entryCount = 0;
  async function scan(relative: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(workDir, relative), { withFileTypes: true })) {
      if (++entryCount > 4096) throw new Error("CACHE_ARTIFACT_TOO_LARGE");
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (!safeRelative(next) || entry.isSymbolicLink()) throw new Error("UNSAFE_CACHE_ARTIFACT");
      if (entry.isDirectory()) { bytes += 4096; await scan(next); }
      else if (entry.isFile()) {
        const file = path.join(workDir, next);
        const stat = await fs.lstat(file);
        // Reserve disk blocks and per-file metadata, including zero-length files.
        bytes += Math.ceil(stat.size / 4096) * 4096 + 4096;
        if (bytes > 128 * 1024 * 1024 || files.length >= 4096) throw new Error("CACHE_ARTIFACT_TOO_LARGE");
        files.push({ path: next, size: stat.size, executable: Boolean(stat.mode & 0o111), sha256: digest(await fs.readFile(file)) });
      } else throw new Error("UNSAFE_CACHE_ARTIFACT");
    }
  }
  const temporary = path.join(ROOT, `.tmp-${randomUUID()}`);
  try {
    await scan("");
    await fs.mkdir(ROOT, { recursive: true, mode: 0o700 });
    await fs.chmod(ROOT, 0o700);
    const manifest: Manifest = { created: Date.now(), files, bytes: bytes + 65536 };
    manifest.bytes += Buffer.byteLength(JSON.stringify(manifest));
    await prune(manifest.bytes);
    await fs.mkdir(path.join(temporary, "files"), { recursive: true, mode: 0o700 });
    for (const entry of files) {
      const target = path.join(temporary, "files", entry.path);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.copyFile(path.join(workDir, entry.path), target);
      await fs.chown(target, 0, 0); await fs.chmod(target, 0o600);
    }
    await fs.writeFile(path.join(temporary, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
    await fs.rename(temporary, path.join(ROOT, key));
  } catch {
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  }
}
