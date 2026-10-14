type Subscriber = { email?: string | null; marketingEmailsEnabled: boolean };

/** A class recipient must also respect the linked account's opt-out for that same mailbox. */
export function studentMarketingEnabled(student: Subscriber & { user?: Subscriber | null }): boolean {
  if (!student.marketingEmailsEnabled) return false;
  const accountEmail = String(student.user?.email ?? "").trim().toLowerCase();
  if (!accountEmail || accountEmail !== String(student.email ?? "").trim().toLowerCase()) return true;
  return Boolean(student.user?.marketingEmailsEnabled);
}
