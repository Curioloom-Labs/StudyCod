import { env } from "../env";

function positiveInt(raw: string | undefined, fallback: number, minimum = 1): number {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

export const EDU_APPEAL_WINDOW_DAYS = positiveInt(env.EDU_APPEAL_WINDOW_DAYS, 7);
export const EDU_MAX_ACTIVE_APPEALS_PER_STUDENT = positiveInt(
  env.EDU_MAX_ACTIVE_APPEALS_PER_STUDENT,
  5,
);
export const EDU_APPEAL_SLA_HOURS = positiveInt(env.EDU_APPEAL_SLA_HOURS, 48);
export const EDU_APPEAL_SLA_WARNING_HOURS = positiveInt(env.EDU_APPEAL_SLA_WARNING_HOURS, 8);
export const EDU_APPEAL_ESCALATION_HOURS = Math.max(
  EDU_APPEAL_SLA_HOURS,
  positiveInt(env.EDU_APPEAL_ESCALATION_HOURS, 72),
);
export const EDU_TEACHER_DIGEST_WINDOW_DAYS = positiveInt(env.EDU_TEACHER_DIGEST_WINDOW_DAYS, 7);
