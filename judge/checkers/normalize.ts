function safeUnicodeNormalize(s: string, form: "NFC" | "NFKC" = "NFC"): string {
  try {
    // Some JS engines can throw on invalid normalization forms; be defensive.
    return s.normalize(form);
  } catch {
    return s;
  }
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeCommonInvisibleChars(s: string): string {
  // NBSP and zero-width characters can sneak in via copy/paste and cause WA.
  return s
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
}

function normalizeApostrophes(s: string): string {
  // Common apostrophe-like characters (Ukrainian texts often use these).
  return s.replace(/[\u2018\u2019\u201B\u2032\u02BC]/g, "'");
}

export function hasCyrillic(s: string): boolean {
  // Covers Cyrillic + Ukrainian-specific letters.
  return /[\u0400-\u04FF]/.test(s);
}

function toConfusableSkeletonChar(ch: string): string {
  // Canonicalize common Latin/Cyrillic look-alikes to a shared “skeleton” (Latin).
  // This is intentionally conservative: only the most common confusables.
  switch (ch) {
    // A / А
    case "A":
    case "А":
      return "A";
    case "a":
    case "а":
      return "a";

    // B / В (uppercase only; lowercase 'в' is less reliably confused with 'b')
    case "B":
    case "В":
      return "B";

    // C / С
    case "C":
    case "С":
      return "C";
    case "c":
    case "с":
      return "c";

    // E / Е
    case "E":
    case "Е":
      return "E";
    case "e":
    case "е":
      return "e";

    // H / Н
    case "H":
    case "Н":
      return "H";
    case "h":
    case "н":
      return "h";

    // I / І (Ukrainian)
    case "I":
    case "І":
      return "I";
    case "i":
    case "і":
      return "i";

    // K / К
    case "K":
    case "К":
      return "K";
    case "k":
    case "к":
      return "k";

    // M / М
    case "M":
    case "М":
      return "M";
    case "m":
    case "м":
      return "m";

    // O / О
    case "O":
    case "О":
      return "O";
    case "o":
    case "о":
      return "o";

    // P / Р
    case "P":
    case "Р":
      return "P";
    case "p":
    case "р":
      return "p";

    // T / Т
    case "T":
    case "Т":
      return "T";
    case "t":
    case "т":
      return "t";

    // X / Х
    case "X":
    case "Х":
      return "X";
    case "x":
    case "х":
      return "x";

    // Y / У
    case "Y":
    case "У":
      return "Y";
    case "y":
    case "у":
      return "y";

    default:
      return ch;
  }
}

function toConfusableSkeleton(s: string): string {
  // Iterate by code points (for surrogate pairs); mapping is 1-to-1 for our set.
  let out = "";
  for (const ch of s) out += toConfusableSkeletonChar(ch);
  return out;
}

export function normalizeForExactCompare(s: string, expectedHasCyrillic: boolean): string {
  let t = String(s ?? "");
  t = normalizeNewlines(t);
  t = normalizeCommonInvisibleChars(t);
  t = normalizeApostrophes(t);
  t = safeUnicodeNormalize(t, "NFC");

  if (expectedHasCyrillic) {
    t = toConfusableSkeleton(t);
  }

  return t.trimEnd();
}

export function normalizeForWhitespaceCompare(s: string, expectedHasCyrillic: boolean): string {
  let t = String(s ?? "");
  t = normalizeNewlines(t);
  t = normalizeCommonInvisibleChars(t);
  t = normalizeApostrophes(t);
  t = safeUnicodeNormalize(t, "NFC");

  if (expectedHasCyrillic) {
    t = toConfusableSkeleton(t);
  }

  return t.trim().split(/\s+/).join(" ");
}
