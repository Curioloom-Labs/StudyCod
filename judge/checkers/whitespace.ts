import { hasCyrillic, normalizeForWhitespaceCompare } from "./normalize";

export function checkWhitespace(actual: string, expected: string): boolean {
  const expectedBase = String(expected ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const expectedHasCyr = hasCyrillic(expectedBase);

  const a = normalizeForWhitespaceCompare(actual, expectedHasCyr);
  const e = normalizeForWhitespaceCompare(expected, expectedHasCyr);
  return a === e;
}