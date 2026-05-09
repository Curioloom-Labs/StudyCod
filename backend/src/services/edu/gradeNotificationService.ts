import { emailService } from "../emailService";
import { logger } from "../../utils/logger";
import { UiLocale, normalizeUiLocale } from "../../utils/uiLocale";
import type { GradingSystem } from "../../types/GradingSystem";

export type GradeNotificationKind = "task" | "summary" | "control";
export type GradeNotificationEvent = "created" | "updated";

export interface StudentGradeNotificationTarget {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  uiLanguage?: string | null;
}

function formatStudentName(student: StudentGradeNotificationTarget): string {
  const chunks = [student.firstName, student.lastName, student.middleName]
    .map(v => String(v || "").trim())
    .filter(Boolean);
  return chunks.join(" ");
}

function localizeSummaryName(name: string, locale: UiLocale): string {
  const normalized = String(name || "").trim();
  if (!normalized) return locale === "en" ? "Summary" : "Підсумкова";

  if (normalized.toUpperCase() === "THEMATIC") {
    return locale === "en" ? "Thematic" : "Тематична";
  }

  const lower = normalized.toLowerCase();
  if (lower === "thematic") return locale === "en" ? "Thematic" : "Тематична";
  if (lower === "тематична") return locale === "en" ? "Thematic" : "Тематична";

  return normalized;
}

export async function notifyStudentGradeChange(params: {
  student: StudentGradeNotificationTarget;
  kind: GradeNotificationKind;
  event: GradeNotificationEvent;
  itemTitle: string;
  grade: number;
  maxGrade?: number;
  gradingSystem?: GradingSystem | null;
  className?: string | null;
  feedback?: string | null;
  fallbackLocale?: UiLocale;
  requestId?: string;
}): Promise<void> {
  const email = String(params.student.email || "").trim();
  if (!email) return;

  const locale = normalizeUiLocale(params.student.uiLanguage, params.fallbackLocale ?? "uk");
  const title = params.kind === "summary"
    ? localizeSummaryName(params.itemTitle, locale)
    : String(params.itemTitle || "").trim();

  try {
    await emailService.sendGradeChangedEmail({
      to: email,
      event: params.event,
      kind: params.kind,
      itemTitle: title,
      grade: params.grade,
      maxGrade: params.maxGrade,
      gradingSystem: params.gradingSystem ?? undefined,
      className: params.className ?? null,
      feedback: params.feedback ?? null,
      studentName: formatStudentName(params.student) || null,
      locale
    });
  } catch (err: any) {
    logger.error("[grade-notify] Failed to send grade notification", {
      requestId: params.requestId,
      studentId: params.student.id,
      email,
      event: params.event,
      kind: params.kind,
      err: err?.message || err
    });
  }
}
