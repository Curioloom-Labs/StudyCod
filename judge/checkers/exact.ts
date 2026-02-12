import { hasCyrillic, normalizeForExactCompare } from "./normalize";

export function checkExact(actual: string, expected: string): boolean {
  const expectedBase = String(expected ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const expectedHasCyr = hasCyrillic(expectedBase);

  const a = normalizeForExactCompare(actual, expectedHasCyr);
  const e = normalizeForExactCompare(expected, expectedHasCyr);
  return a === e;
}
