export function inferNeedsInput(params: {
  taskDescription: string;
  aiInputFormat?: string | null;
}): boolean {
  const desc = String(params.taskDescription ?? "");
  const aiFmtRaw = params.aiInputFormat === undefined || params.aiInputFormat === null ? "" : String(params.aiInputFormat);

  const looksLikeNoInput = (s: string): boolean => {
    const t = s.toLowerCase();
    return /нема(є)?\s+вхідн/.test(t) || /без\s+вхідн/.test(t) || /відсутн/.test(t) || /no\s+input/.test(t) || /does\s+not\s+take\s+input/.test(t);
  };

  const looksLikeNeedsInput = (s: string): boolean => {
    const t = s.toLowerCase();
    return /\binput\b/.test(t) || /\bstdin\b/.test(t) || /вхідн\s*і\s*дан\s*і/.test(t) || /введенн/.test(t) || /читат/.test(t) || /зчитат/.test(t) || /з\s+консол/.test(t);
  };

  // Prefer AI inputFormat when available.
  if (aiFmtRaw.trim()) {
    if (looksLikeNoInput(aiFmtRaw)) return false;
    if (looksLikeNeedsInput(aiFmtRaw)) return true;
  }

  // Fallback to task description heuristics.
  if (looksLikeNoInput(desc)) return false;
  return looksLikeNeedsInput(desc);
}
