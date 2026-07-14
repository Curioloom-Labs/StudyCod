export type HostContext = "school" | "contest" | "main";

/**
 * Legacy subdomains are intentionally ignored now.
 * EDU, contests and personal product surfaces must work from the same host
 * without automatic `school.` / `contest.` redirects.
 */
export function getHostContext(): HostContext {
  return "main";
}

export function enforceSubdomain(_pathname: string): void {
  // No-op by product decision: subdomains are no longer routing authority.
}
