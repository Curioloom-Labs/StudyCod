// Subdomain routing for the 3-surface split:
//   studycod.space         — landing + Personal + auth hub
//   school.studycod.space  — EDU / LMS
//   contest.studycod.space — contests
// Auth is shared across all three via the `.studycod.space` session cookie.

const ROOT = "studycod.space";

export type HostContext = "school" | "contest" | "main";

export function getHostContext(): HostContext {
  const h = (typeof window !== "undefined" ? window.location.hostname : "").toLowerCase();
  if (h.startsWith("school.")) return "school";
  if (h.startsWith("contest.")) return "contest";
  return "main";
}

/**
 * Keep EDU on `school.` and contests on `contest.` (and off the bare domain).
 * Loop-safe: only redirects when the current host doesn't match the path's area,
 * and never touches non-studycod hosts (localhost / preview deploys).
 */
export function enforceSubdomain(pathname: string): void {
  if (typeof window === "undefined") return;
  const host = window.location.hostname.toLowerCase();
  if (host !== ROOT && !host.endsWith("." + ROOT)) return; // dev / unknown host — leave alone
  const ctx = getHostContext();
  const rest = window.location.pathname + window.location.search + window.location.hash;

  if (/^\/edu(?:\/|$)/.test(pathname) && ctx !== "school") {
    window.location.replace(`https://school.${ROOT}${rest}`);
  } else if (/^\/contest/.test(pathname) && ctx !== "contest") {
    window.location.replace(`https://contest.${ROOT}${rest}`);
  }
}
