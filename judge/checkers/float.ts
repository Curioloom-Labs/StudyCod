export function checkFloat(actual: string, expected: string, epsilon: number): boolean {
  const aTokens = tokenize(actual);
  const eTokens = tokenize(expected);
  if (aTokens.length !== eTokens.length) return false;
  for (let i = 0; i < aTokens.length; i++) {
    const a = aTokens[i];
    const e = eTokens[i];
    const an = toNumberIfPossible(a);
    const en = toNumberIfPossible(e);
    if (an !== null && en !== null) {
      if (!nearlyEqual(an, en, epsilon)) return false;
    } else {
      if (a !== e) return false;
    }
  }
  return true;
}
function tokenize(s: string): string[] {
  return String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split(/\s+/).filter(t => t.length > 0);
}
function toNumberIfPossible(t: string): number | null {
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function nearlyEqual(a: number, b: number, eps: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= eps) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return diff <= eps * scale;
}