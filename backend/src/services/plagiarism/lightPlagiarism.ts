export type PlagiarismFingerprint = ReadonlySet<number>;

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const JAVA_KEYWORDS = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
  "true",
  "false",
  "null",
  "var"
]);

const PYTHON_KEYWORDS = new Set([
  "false",
  "none",
  "true",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield"
]);

function stripComments(code: string): string {
  // block comments
  let out = code.replace(/\/\*[\s\S]*?\*\//g, " ");
  // line comments (java/js)
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  // python style
  out = out.replace(/#.*$/gm, " ");
  return out;
}

function stripStrings(code: string): string {
  // very lightweight, language-agnostic-ish
  let out = code;
  out = out.replace(/"([^"\\]|\\.)*"/g, " STR ");
  out = out.replace(/'([^'\\]|\\.)*'/g, " STR ");
  out = out.replace(/`([^`\\]|\\.)*`/g, " STR ");
  // python triple quotes (best effort)
  out = out.replace(/'''[\s\S]*?'''/g, " STR ");
  out = out.replace(/\"\"\"[\s\S]*?\"\"\"/g, " STR ");
  return out;
}

function toNormalizedTokens(code: string, lang: "JAVA" | "PYTHON" | string): string[] {
  const stripped = stripStrings(stripComments(code));
  const raw = stripped
    .replace(/\r\n/g, "\n")
    .replace(/[^A-Za-z0-9_]+/g, " ")
    .trim();

  if (!raw) return [];

  const keywords = String(lang).toUpperCase() === "PYTHON" ? PYTHON_KEYWORDS : JAVA_KEYWORDS;

  const parts = raw.split(/\s+/g);
  const tokens: string[] = [];

  for (const p of parts) {
    if (!p) continue;

    if (/^\d+$/.test(p)) {
      tokens.push("NUM");
      continue;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) {
      const lower = p.toLowerCase();
      if (keywords.has(lower)) {
        tokens.push(lower);
      } else {
        tokens.push("ID");
      }
      continue;
    }
  }

  return tokens;
}

export function buildFingerprint(code: string, opts?: { lang?: "JAVA" | "PYTHON" | string; shingleSize?: number }): PlagiarismFingerprint {
  const lang = opts?.lang || "JAVA";
  const k = Math.max(3, Math.min(10, opts?.shingleSize ?? 5));

  const tokens = toNormalizedTokens(code || "", lang);
  const set = new Set<number>();

  if (tokens.length < k) return set;

  for (let i = 0; i + k <= tokens.length; i++) {
    const shingle = tokens.slice(i, i + k).join("\u0001");
    set.add(fnv1a32(shingle));
  }

  return set;
}

export function jaccardSimilarity(a: PlagiarismFingerprint, b: PlagiarismFingerprint): number {
  if (!a.size || !b.size) return 0;

  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) {
    if (big.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  if (!union) return 0;
  return inter / union;
}

export function computeTopMatches<T extends { key: number; fingerprint: PlagiarismFingerprint }>(
  items: T[],
  targetKeys: number[],
  opts?: { topN?: number; minSimilarity?: number }
): Map<number, Array<{ key: number; similarity: number }>> {
  const topN = Math.max(1, Math.min(10, opts?.topN ?? 3));
  const minSim = Math.max(0, Math.min(1, opts?.minSimilarity ?? 0.6));

  const byKey = new Map<number, T>();
  for (const it of items) byKey.set(it.key, it);

  const out = new Map<number, Array<{ key: number; similarity: number }>>();

  for (const targetKey of targetKeys) {
    const target = byKey.get(targetKey);
    if (!target) continue;

    const scored: Array<{ key: number; similarity: number }> = [];
    for (const other of items) {
      if (other.key === targetKey) continue;
      const sim = jaccardSimilarity(target.fingerprint, other.fingerprint);
      if (sim >= minSim) {
        scored.push({
          key: other.key,
          similarity: sim
        });
      }
    }

    scored.sort((x, y) => y.similarity - x.similarity);
    out.set(targetKey, scored.slice(0, topN));
  }

  return out;
}
