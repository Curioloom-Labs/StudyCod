export function checkWhitespace(actual: string, expected: string): boolean {
  const a = normalize(actual);
  const e = normalize(expected);
  return a === e;
}
function normalize(s: string): string {
  return String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split(/\s+/).join(" ");
}