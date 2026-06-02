import type AdmZip from "adm-zip";

// Limits for uploaded ZIP archives. Defends against zip-slip and zip-bomb
// attacks. Upstream multer limits cap the COMPRESSED size; without these
// checks an adversary can still inflate to multiple GB or write outside the
// archive root via crafted entry names ("../../etc/...").
export const ZIP_MAX_ENTRIES = 64;
export const ZIP_MAX_PER_ENTRY_BYTES = 50 * 1024 * 1024;          // 50 MB per file
export const ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES = 75 * 1024 * 1024; // 75 MB total
export const ZIP_MAX_COMPRESSION_RATIO = 200;
export const ZIP_RATIO_INSPECT_THRESHOLD_BYTES = 1024 * 1024;     // ignore ratio for tiny entries

export class ZipValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ZipValidationError";
  }
}

export function validateUploadedZip(zip: AdmZip): void {
  const entries = zip.getEntries();
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw new ZipValidationError("ARCHIVE_TOO_MANY_ENTRIES");
  }
  let totalUncompressed = 0;
  for (const entry of entries) {
    const entryName = String(entry.entryName ?? "");
    // Zip-slip: reject absolute paths, drive letters, backslashes, and `..`
    // segments. We don't extract to disk here, but ./ paths are still parsed
    // by callers (e.g. readZipJson) and could be confused with adjacent files.
    if (
      !entryName ||
      entryName.startsWith("/") ||
      entryName.startsWith("\\") ||
      /^[A-Za-z]:/.test(entryName) ||
      entryName.includes("\\") ||
      entryName.split("/").some(seg => seg === "..")
    ) {
      throw new ZipValidationError("ARCHIVE_UNSAFE_PATH");
    }
    const uncompressed = Number((entry.header as any)?.size ?? 0);
    const compressed = Number((entry.header as any)?.compressedSize ?? 0);
    if (!Number.isFinite(uncompressed) || uncompressed < 0) {
      throw new ZipValidationError("ARCHIVE_INVALID_ENTRY");
    }
    if (uncompressed > ZIP_MAX_PER_ENTRY_BYTES) {
      throw new ZipValidationError("ARCHIVE_ENTRY_TOO_LARGE");
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ZipValidationError("ARCHIVE_TOTAL_TOO_LARGE");
    }
    // Zip-bomb heuristic: a single small compressed entry that expands to a
    // huge uncompressed size. We only inspect the ratio for entries large
    // enough to be a real threat — tiny stored entries naturally have a
    // ratio of 1:0 in some toolchains.
    if (
      compressed > 0 &&
      uncompressed > ZIP_RATIO_INSPECT_THRESHOLD_BYTES &&
      uncompressed / compressed > ZIP_MAX_COMPRESSION_RATIO
    ) {
      throw new ZipValidationError("ARCHIVE_SUSPICIOUS_RATIO");
    }
  }
}

// `validateUploadedZip` can only inspect the ZIP *central directory* headers,
// which are attacker-controlled: a crafted archive can declare a tiny
// `size`/`compressedSize` yet inflate to far more when `getData()` runs. To
// defend against that lying-header zip-bomb we must measure the ACTUAL number
// of decompressed bytes as entries are read, and abort once a running budget
// is exceeded — before the inflated buffers are handed to downstream consumers
// (JSON.parse, DB writes, etc.).
//
// NOTE: a single catastrophic entry is still inflated once by adm-zip (it has
// no streaming API), but the per-entry header cap in `validateUploadedZip`
// plus this running total bound the realistic blast radius.
export class ZipExtractionBudget {
  private totalBytes = 0;

  constructor(
    private readonly maxPerEntryBytes: number = ZIP_MAX_PER_ENTRY_BYTES,
    private readonly maxTotalBytes: number = ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES
  ) {}

  /**
   * Decompress one entry and charge its real size against the budget.
   * Throws ZipValidationError if the actual bytes exceed per-entry/total caps.
   */
  readEntry(entry: AdmZip.IZipEntry): Buffer {
    const buf = entry.getData();
    const len = buf?.length ?? 0;
    if (len > this.maxPerEntryBytes) {
      throw new ZipValidationError("ARCHIVE_ENTRY_TOO_LARGE");
    }
    this.totalBytes += len;
    if (this.totalBytes > this.maxTotalBytes) {
      throw new ZipValidationError("ARCHIVE_TOTAL_TOO_LARGE");
    }
    return buf;
  }

  /** Convenience for text entries (utf-8). */
  readEntryText(entry: AdmZip.IZipEntry): string {
    return this.readEntry(entry).toString("utf-8");
  }

  get bytesRead(): number {
    return this.totalBytes;
  }
}
