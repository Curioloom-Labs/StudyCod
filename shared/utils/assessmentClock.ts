/** Absolute end time, shared by the server and every assessment screen. */
export function assessmentEndTime(startedAt: string | Date, minutes: number | null | undefined, deadline?: string | Date | null): number | null {
  const start = new Date(startedAt).getTime();
  const durationEnd = Number(minutes) > 0 ? start + Number(minutes) * 60_000 : null;
  const deadlineEnd = deadline ? new Date(deadline).getTime() : null;
  const ends = [durationEnd, deadlineEnd].filter((value): value is number => value !== null && Number.isFinite(value));
  return ends.length ? Math.min(...ends) : null;
}

export function assessmentRemainingSeconds(startedAt: string | Date, minutes: number | null | undefined, deadline?: string | Date | null, now = Date.now()): number | null {
  const end = assessmentEndTime(startedAt, minutes, deadline);
  return end === null ? null : Math.max(0, Math.ceil((end - now) / 1000));
}
