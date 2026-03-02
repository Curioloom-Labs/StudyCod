export type ContestPlatform = "codeforces" | "atcoder" | "leetcode" | "codechef";

const BASE_URLS: Record<ContestPlatform, string> = {
  codeforces: "https://codeforces.com/profile/",
  atcoder: "https://atcoder.jp/users/",
  leetcode: "https://leetcode.com/u/",
  codechef: "https://www.codechef.com/users/",
};

const LABELS: Record<ContestPlatform, string> = {
  codeforces: "Codeforces",
  atcoder: "AtCoder",
  leetcode: "LeetCode",
  codechef: "CodeChef",
};

const HANDLE_RE = /^[A-Za-z0-9._-]{1,32}$/;

export function contestPlatformLabel(platform: ContestPlatform): string {
  return LABELS[platform];
}

export function normalizeContestHandle(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 32);
}

export function validateContestHandle(raw: unknown): { valid: boolean; value: string; error?: string } {
  const value = normalizeContestHandle(raw);
  if (!value) return { valid: true, value };
  if (!HANDLE_RE.test(value)) {
    return {
      valid: false,
      value,
      error: "Use only letters, digits, dot, underscore, hyphen (max 32).",
    };
  }
  return { valid: true, value };
}

export function buildContestProfileUrl(platform: ContestPlatform, raw: unknown): string | null {
  const { valid, value } = validateContestHandle(raw);
  if (!valid || !value) return null;
  return `${BASE_URLS[platform]}${encodeURIComponent(value)}`;
}
