export function checkNonEmpty(actual: string): boolean {
  return String(actual ?? "").trim().length > 0;
}
