type InputRequirementText = {
  taskDescription: string;
  aiInputFormat?: string | null;
};

function looksLikeNoInput(value: string): boolean {
  const text = String(value ?? "").toLowerCase();
  return /нема(є)?\s+вхідн/.test(text)
    || /без\s+вхідн/.test(text)
    || /відсутн/.test(text)
    || /no\s+input/.test(text)
    || /does\s+not\s+take\s+input/.test(text)
    || /вхідн[\p{L}\p{M}]*\s+дан[\p{L}\p{M}]*\s+не\s+(?:використов[\p{L}\p{M}]*|потрібн[\p{L}\p{M}]*|пода[\p{L}\p{M}]*|зчиту[\p{L}\p{M}]*|ввод[\p{L}\p{M}]*|передбач[\p{L}\p{M}]*)/iu.test(text)
    || /\binput(?:\s+data)?\s+(?:is\s+)?(?:not\s+(?:used|required|provided|read|needed)|unused)\b/i.test(text);
}

function looksLikeNeedsInput(value: string): boolean {
  const text = String(value ?? "").toLowerCase();
  return /\binput\b/.test(text)
    || /\bstdin\b/.test(text)
    || /вхідн\s*і\s*дан\s*і/.test(text)
    || /введенн/.test(text)
    || /читат/.test(text)
    || /зчитат/.test(text)
    || /з\s+консол/.test(text);
}

export function explicitlyDeclaresNoInput(params: InputRequirementText): boolean {
  return looksLikeNoInput(String(params.aiInputFormat ?? ""))
    || looksLikeNoInput(String(params.taskDescription ?? ""));
}

export function inferNeedsInput(params: InputRequirementText): boolean {
  const desc = String(params.taskDescription ?? "");
  const aiFmtRaw = params.aiInputFormat === undefined || params.aiInputFormat === null ? "" : String(params.aiInputFormat);

  // A negated input statement is more specific than the generic "input data"
  // tokens also present in phrases such as "Вхідні дані не використовуються".
  if (explicitlyDeclaresNoInput(params)) return false;

  // Prefer AI inputFormat when available.
  if (aiFmtRaw.trim() && looksLikeNeedsInput(aiFmtRaw)) return true;

  // Fallback to task description heuristics.
  return looksLikeNeedsInput(desc);
}
