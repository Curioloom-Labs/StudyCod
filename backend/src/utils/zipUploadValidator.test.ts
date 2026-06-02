import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import {
  validateUploadedZip,
  ZipValidationError,
  ZipExtractionBudget,
  ZIP_MAX_ENTRIES,
  ZIP_MAX_PER_ENTRY_BYTES,
} from "./zipUploadValidator";

function buildZip(entries: Array<{ name: string; data: Buffer | string }>): AdmZip {
  const zip = new AdmZip();
  for (const e of entries) {
    zip.addFile(e.name, Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf-8"));
  }
  // Round-trip through buffer so per-entry compressedSize/size headers are populated.
  return new AdmZip(zip.toBuffer());
}

// adm-zip SANITIZES traversal sequences (`..`, leading `/`, `\`) when it WRITES
// an entry name via addFile. So authoring a malicious name through addFile would
// test adm-zip's normalization, not our validator. To exercise the real attack
// path we author an equal-length, all-safe placeholder and then byte-patch the
// raw bytes back into the buffer's local + central headers — exactly how a
// hand-crafted malicious archive looks when adm-zip READS it (read does NOT
// normalize, confirmed: entryName comes through verbatim).
function buildZipWithRawName(name: string, data = "x"): AdmZip {
  const placeholder = name.replace(/[^A-Za-z0-9]/g, "A");
  assert.equal(placeholder.length, name.length, "placeholder must preserve length");
  const zip = new AdmZip();
  zip.addFile(placeholder, Buffer.from(data, "utf-8"));
  const buf = zip.toBuffer();
  const ph = Buffer.from(placeholder, "utf-8");
  const ml = Buffer.from(name, "utf-8");
  let idx = 0;
  while ((idx = buf.indexOf(ph, idx)) !== -1) {
    ml.copy(buf, idx);
    idx += ml.length;
  }
  return new AdmZip(buf);
}

function expectCode(fn: () => void, code: string) {
  try {
    fn();
    assert.fail(`Expected ZipValidationError(${code}), got success`);
  } catch (err) {
    assert.ok(err instanceof ZipValidationError, `expected ZipValidationError, got ${err}`);
    assert.equal((err as ZipValidationError).code, code);
  }
}

test("accepts a benign small archive", () => {
  const zip = buildZip([
    { name: "task.json", data: JSON.stringify({ title: "t", description: "d" }) },
    { name: "theory.md", data: "# Theory" },
  ]);
  validateUploadedZip(zip);
});

test("rejects ../ traversal entry", () => {
  const zip = buildZipWithRawName("../etc/passwd", "evil");
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_UNSAFE_PATH");
});

test("rejects absolute /etc/shadow entry", () => {
  const zip = buildZipWithRawName("/etc/shadow", "evil");
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_UNSAFE_PATH");
});

test("rejects Windows drive-letter entry", () => {
  const zip = buildZipWithRawName("C:/Windows/System32/cmd.exe", "evil");
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_UNSAFE_PATH");
});

test("rejects backslash-segmented entry", () => {
  const zip = buildZipWithRawName("sub\\..\\evil", "evil");
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_UNSAFE_PATH");
});

test("rejects nested ../ in middle of path", () => {
  const zip = buildZipWithRawName("ok/../evil/secret", "x");
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_UNSAFE_PATH");
});

test("rejects archives with too many entries", () => {
  const entries = Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => ({
    name: `file${i}.txt`,
    data: "x",
  }));
  const zip = buildZip(entries);
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_TOO_MANY_ENTRIES");
});

test("rejects per-entry size over the cap", () => {
  // Build a real entry that exceeds ZIP_MAX_PER_ENTRY_BYTES via repeated content.
  // Using an incompressible random buffer keeps deflate from shrinking it so
  // the uncompressed header reflects reality.
  const big = Buffer.alloc(ZIP_MAX_PER_ENTRY_BYTES + 1024);
  for (let i = 0; i < big.length; i++) big[i] = (Math.random() * 256) | 0;
  const zip = buildZip([{ name: "big.bin", data: big }]);
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_ENTRY_TOO_LARGE");
});

test("rejects suspicious compression ratio (zip-bomb)", () => {
  // 4 MB of zeros compresses extremely well — ratio will be > 200.
  const bomb = Buffer.alloc(4 * 1024 * 1024, 0);
  const zip = buildZip([{ name: "bomb.bin", data: bomb }]);
  expectCode(() => validateUploadedZip(zip), "ARCHIVE_SUSPICIOUS_RATIO");
});

test("happy path with nested directories is OK", () => {
  const zip = buildZip([
    { name: "task.json", data: "{}" },
    { name: "assets/img.txt", data: "noop" },
    { name: "nested/deep/inner.md", data: "ok" },
  ]);
  validateUploadedZip(zip);
});

test("ZipExtractionBudget returns data within caps", () => {
  const zip = buildZip([{ name: "a.txt", data: "hello" }]);
  const budget = new ZipExtractionBudget();
  const buf = budget.readEntry(zip.getEntry("a.txt")!);
  assert.equal(buf.toString("utf-8"), "hello");
  assert.equal(budget.bytesRead, 5);
});

test("ZipExtractionBudget rejects per-entry over ACTUAL-byte cap", () => {
  const zip = buildZip([{ name: "a.txt", data: "0123456789" }]);
  const budget = new ZipExtractionBudget(5, 1000); // 5-byte per-entry cap
  expectCode(() => { budget.readEntry(zip.getEntry("a.txt")!); }, "ARCHIVE_ENTRY_TOO_LARGE");
});

test("ZipExtractionBudget rejects total over cap across entries", () => {
  const zip = buildZip([
    { name: "a.txt", data: "aaaa" },
    { name: "b.txt", data: "bbbb" },
  ]);
  const budget = new ZipExtractionBudget(1000, 6); // 6-byte running total; 4+4 > 6
  budget.readEntry(zip.getEntry("a.txt")!); // 4 bytes — ok
  expectCode(() => { budget.readEntry(zip.getEntry("b.txt")!); }, "ARCHIVE_TOTAL_TOO_LARGE");
});
