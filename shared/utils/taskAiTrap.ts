export const TASK_AI_TRAP_START = "<!-- STUDYCOD_AI_TRAP_START -->";
export const TASK_AI_TRAP_END = "<!-- STUDYCOD_AI_TRAP_END -->";

export function hasValidTaskAiTrap(description: string): boolean {
  const starts = description.match(/<!--\s*STUDYCOD_AI_TRAP_START\s*-->/gi) ?? [];
  const ends = description.match(/<!--\s*STUDYCOD_AI_TRAP_END\s*-->/gi) ?? [];
  if (starts.length !== 1 || ends.length !== 1) return false;

  const startIndex = description.search(/<!--\s*STUDYCOD_AI_TRAP_START\s*-->/i);
  const endIndex = description.search(/<!--\s*STUDYCOD_AI_TRAP_END\s*-->/i);
  if (startIndex < 0 || endIndex <= startIndex) return false;

  const contentStart = startIndex + starts[0].length;
  return description.slice(contentStart, endIndex).trim().length >= 20;
}

/** Removes the deliberately misleading student-facing segment before test generation. */
export function stripTaskAiTrapSegments(description: string): string {
  let result = String(description ?? "");
  const startPattern = /<!--\s*STUDYCOD_AI_TRAP_START\s*-->/i;
  const endPattern = /<!--\s*STUDYCOD_AI_TRAP_END\s*-->/i;

  while (true) {
    const startIndex = result.search(startPattern);
    if (startIndex < 0) break;
    const startMatch = result.slice(startIndex).match(startPattern);
    const contentStart = startIndex + (startMatch?.[0].length ?? 0);
    const relativeEndIndex = result.slice(contentStart).search(endPattern);
    if (relativeEndIndex < 0) {
      result = result.slice(0, startIndex);
      break;
    }
    const endMatch = result.slice(contentStart + relativeEndIndex).match(endPattern);
    const endExclusive = contentStart + relativeEndIndex + (endMatch?.[0].length ?? 0);
    result = `${result.slice(0, startIndex)}${result.slice(endExclusive)}`;
  }

  return result.replace(/<!--\s*STUDYCOD_AI_TRAP_END\s*-->/gi, "").trim();
}
