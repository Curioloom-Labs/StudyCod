export type InOutImportResult = {
  tests: Array<{ baseName: string; input: string; expectedOutput: string }>;
  errors: string[];
};

function normalizeNewlines(s: string): string {
  return String(s ?? "").replace(/\r\n/g, "\n");
}

function getExtLower(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function getBaseName(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return name;
  return name.slice(0, idx);
}

/**
 * Pairs files by base name: `sample.in` + `sample.out`.
 * Ignores other extensions.
 */
export async function importTestsFromInOutFiles(files: File[]): Promise<InOutImportResult> {
  const errors: string[] = [];
  const map = new Map<string, { inFile?: File; outFile?: File }>();

  for (const f of files) {
    const ext = getExtLower(f.name);
    if (ext !== "in" && ext !== "out") continue;

    const base = getBaseName(f.name);
    const rec = map.get(base) ?? {};
    if (ext === "in") {
      if (rec.inFile) errors.push(`Duplicate .in for "${base}" (${rec.inFile.name}, ${f.name})`);
      rec.inFile = f;
    } else {
      if (rec.outFile) errors.push(`Duplicate .out for "${base}" (${rec.outFile.name}, ${f.name})`);
      rec.outFile = f;
    }
    map.set(base, rec);
  }

  const tests: Array<{ baseName: string; input: string; expectedOutput: string }> = [];

  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  for (const [baseName, rec] of entries) {
    if (!rec.inFile || !rec.outFile) {
      if (!rec.inFile) errors.push(`Missing .in for "${baseName}" (have: ${rec.outFile?.name || "none"})`);
      if (!rec.outFile) errors.push(`Missing .out for "${baseName}" (have: ${rec.inFile?.name || "none"})`);
      continue;
    }

    const inputRaw = await rec.inFile.text();
    const outRaw = await rec.outFile.text();

    tests.push({
      baseName,
      input: normalizeNewlines(inputRaw),
      expectedOutput: normalizeNewlines(outRaw)
    });
  }

  if (tests.length === 0 && errors.length === 0) {
    errors.push("No .in/.out files found");
  }

  return { tests, errors };
}
