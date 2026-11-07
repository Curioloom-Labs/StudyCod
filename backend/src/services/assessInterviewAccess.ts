import { AppDataSource } from "../data-source";
import { assessInterviewJson } from "./assessInterviewKit";
import { activeAssessCompanyRole } from "./assessCompanyAccess";
import {
  canCompanyMemberAccessInterview,
  canCancelAssessInterview,
  canCancelAssessInterviewExecution,
  canControlAssessInterview,
  canEndAssessInterview,
  canEditAssessInterviewDraft,
  canHostAssessInterview,
  canJoinAssessInterview,
  canReadAssessInterviewNotes,
  canReadAssessInterviewQuizAnswers,
  canReadAssessInterviewWorkspace,
  canReleaseAssessInterviewFeedback,
  canRespondToAssessInterview,
  canRunAssessInterviewCode,
  canSendAssessInterviewMessage,
  canStartAssessInterview,
  canSubmitAssessInterviewQuiz,
  hasActiveInterviewConsent,
  type AssessInterviewRole,
  type InterviewPolicyContext,
} from "./assessAccessPolicy";

export type InterviewAccess = {
  row: Record<string, any>;
  role: AssessInterviewRole;
  userId: number;
  canHost: boolean;
  consented: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_CONSENT_STATUSES = new Set(["WITHDRAWN", "DECLINED", "CLOSED"]);

function safeInterviewerIds(value: unknown): number[] {
  const parsed = assessInterviewJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((item): item is number => Number.isSafeInteger(item) && item > 0))];
}

function policyContext(access: InterviewAccess): InterviewPolicyContext {
  return {
    role: access.role,
    userId: access.userId,
    hostUserId: Number(access.row.host_user_id),
    editorUserId: Number(access.row.editor_user_id),
    status: String(access.row.status ?? ""),
    consentStatus: String(access.row.consent_status ?? ""),
    consentAt: access.row.consent_at,
  };
}

export async function interviewAccess(id: string, userId: number): Promise<InterviewAccess | null> {
  if (!UUID_PATTERN.test(id) || !Number.isSafeInteger(userId) || userId <= 0) return null;

  const rows = await AppDataSource.query(`SELECT i.*,DATE_FORMAT(i.scheduled_at,'%Y-%m-%dT%H:%i:%s.000Z') AS scheduled_utc,a.candidate_id,a.status AS consent_status,a.consent_at,
    CASE WHEN i.status='LIVE' AND i.started_at IS NOT NULL AND TIMESTAMPADD(MINUTE,i.duration_minutes,i.started_at)<=UTC_TIMESTAMP(3) THEN 1 ELSE 0 END AS duration_expired,
    CASE WHEN i.status='LIVE' AND i.started_at IS NOT NULL THEN GREATEST(0,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(3),TIMESTAMPADD(MINUTE,i.duration_minutes,i.started_at))) ELSE NULL END AS duration_remaining_seconds,
    c.name AS company_name,u.username AS candidate_username,h.username AS host_username
    FROM growth_interviews i JOIN growth_company_assessments a ON a.id=i.assessment_id
    JOIN growth_companies c ON c.id=i.company_id JOIN users u ON u.id=a.candidate_id JOIN users h ON h.id=i.host_user_id
    WHERE i.id=? LIMIT 1`, [id]) as Array<Record<string, any>>;

  const row = rows[0];
  if (!row || TERMINAL_CONSENT_STATUSES.has(String(row.consent_status ?? ""))) return null;

  const candidateId = Number(row.candidate_id);
  if (!Number.isSafeInteger(candidateId) || candidateId <= 0) return null;
  const consented = hasActiveInterviewConsent(row.consent_status, row.consent_at);

  let role: AssessInterviewRole;
  if (candidateId === userId) {
    role = "CANDIDATE";
  } else {
    const companyId = typeof row.company_id === "string" ? row.company_id : "";
    const companyRole = await activeAssessCompanyRole(companyId, userId);
    if (!companyRole) return null;
    if (!canCompanyMemberAccessInterview(companyRole, userId, Number(row.host_user_id), safeInterviewerIds(row.interviewer_ids_json))) return null;
    role = companyRole;
  }

  const access: InterviewAccess = { row, role, userId, canHost: false, consented };
  access.canHost = canHostAssessInterview(policyContext(access));
  return access;
}

export function canReadInterviewWorkspace(access: InterviewAccess): boolean {
  return canReadAssessInterviewWorkspace(policyContext(access));
}

export function canEditInterviewDraft(access: InterviewAccess): boolean {
  return canEditAssessInterviewDraft(policyContext(access));
}

export function canJoinInterview(access: InterviewAccess): boolean {
  return canJoinAssessInterview(policyContext(access));
}

export function canSendInterviewMessage(access: InterviewAccess): boolean {
  return canSendAssessInterviewMessage(policyContext(access));
}

export function canStartInterview(access: InterviewAccess): boolean {
  return canStartAssessInterview(policyContext(access));
}

export function canControlInterview(access: InterviewAccess): boolean {
  return canControlAssessInterview(policyContext(access));
}

export function canEndInterview(access: InterviewAccess): boolean {
  return canEndAssessInterview(policyContext(access));
}

export function canCancelInterview(access: InterviewAccess): boolean {
  return canCancelAssessInterview(policyContext(access));
}

export function canCancelInterviewExecution(access: InterviewAccess, jobOwnerId: number): boolean {
  return canCancelAssessInterviewExecution(policyContext(access), jobOwnerId);
}

export function canRunInterviewCode(access: InterviewAccess): boolean {
  return canRunAssessInterviewCode(policyContext(access));
}

export function canTakeInterviewQuiz(access: InterviewAccess): boolean {
  return canSubmitAssessInterviewQuiz(policyContext(access));
}

export function canReadInterviewQuizAnswers(access: InterviewAccess): boolean {
  return canReadAssessInterviewQuizAnswers(policyContext(access));
}

export function canRunInterviewCodeInSession(access: InterviewAccess, session: Record<string, unknown>): boolean {
  return canRunAssessInterviewCode({
    ...policyContext(access),
    status: String(session.status ?? ""),
    editorUserId: Number(session.editor_user_id),
  });
}

export function canReadInterviewNotes(access: InterviewAccess): boolean {
  return canReadAssessInterviewNotes(policyContext(access));
}

export function canReleaseInterviewFeedback(access: InterviewAccess): boolean {
  return canReleaseAssessInterviewFeedback(policyContext(access));
}

export function canRespondToInterview(access: InterviewAccess): boolean {
  return canRespondToAssessInterview(policyContext(access));
}
