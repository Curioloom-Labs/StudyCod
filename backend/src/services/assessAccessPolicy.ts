export const ASSESS_COMPANY_ROLES = ["OWNER", "HR", "ENGINEER"] as const;
export type AssessCompanyRole = typeof ASSESS_COMPANY_ROLES[number];
export type AssessInterviewRole = AssessCompanyRole | "CANDIDATE";

export const ASSESS_COMPANY_CAPABILITIES = [
  "READ_WORKSPACE",
  "MANAGE_MEMBERS",
  "INVITE_CANDIDATES",
  "REVIEW_HR",
  "MANAGE_TECHNICAL_TASK",
  "REVIEW_TECHNICAL",
  "MANAGE_INTERVIEWS",
  "READ_CANDIDATE_DOSSIER",
  "READ_CANDIDATE_ANSWERS",
  "READ_HR_REVIEW",
  "READ_TECHNICAL_REVIEW",
  "READ_TECHNICAL_TASK",
] as const;

export type AssessCompanyCapability = typeof ASSESS_COMPANY_CAPABILITIES[number];

const ALL_CAPABILITIES: readonly AssessCompanyCapability[] = ASSESS_COMPANY_CAPABILITIES;

const ROLE_CAPABILITIES: Record<AssessCompanyRole, readonly AssessCompanyCapability[]> = {
  OWNER: ALL_CAPABILITIES,
  HR: [
    "READ_WORKSPACE",
    "INVITE_CANDIDATES",
    "REVIEW_HR",
    "MANAGE_INTERVIEWS",
    "READ_CANDIDATE_DOSSIER",
    "READ_CANDIDATE_ANSWERS",
    "READ_HR_REVIEW",
  ],
  ENGINEER: [
    "READ_WORKSPACE",
    "MANAGE_TECHNICAL_TASK",
    "REVIEW_TECHNICAL",
    "MANAGE_INTERVIEWS",
    "READ_CANDIDATE_DOSSIER",
    "READ_TECHNICAL_REVIEW",
    "READ_TECHNICAL_TASK",
  ],
};

export function isAssessCompanyRole(value: unknown): value is AssessCompanyRole {
  return typeof value === "string" && (ASSESS_COMPANY_ROLES as readonly string[]).includes(value);
}

export function canAssessCompanyRole(role: unknown, capability: AssessCompanyCapability): role is AssessCompanyRole {
  return isAssessCompanyRole(role) && ROLE_CAPABILITIES[role].includes(capability);
}

export function canManageAssessInterview(role: unknown): role is AssessCompanyRole {
  return canAssessCompanyRole(role, "MANAGE_INTERVIEWS");
}

export type InterviewPolicyContext = {
  role: AssessInterviewRole;
  userId: number;
  hostUserId: number;
  editorUserId: number;
  status: string;
  consentStatus: string;
  consentAt: unknown;
};

const ACTIVE_CONSENT_STATUSES = new Set([
  "ACCEPTED",
  "PORTFOLIO_SELECTED",
  "TASK_ASSIGNED",
  "TASK_SUBMITTED",
  "REVIEWED",
]);

export function hasActiveInterviewConsent(status: unknown, consentAt: unknown): boolean {
  return typeof status === "string" && ACTIVE_CONSENT_STATUSES.has(status) && Boolean(consentAt);
}

export function canCompanyMemberAccessInterview(
  role: AssessCompanyRole,
  userId: number,
  hostUserId: number,
  interviewerIds: readonly number[],
): boolean {
  return role === "OWNER" || hostUserId === userId || interviewerIds.includes(userId);
}

export function canHostAssessInterview(context: InterviewPolicyContext): boolean {
  return context.role !== "CANDIDATE" && (context.role === "OWNER" || context.hostUserId === context.userId);
}

export function canReadAssessInterviewWorkspace(context: InterviewPolicyContext): boolean {
  if (context.role !== "CANDIDATE") return true;
  return hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && ["LIVE", "COMPLETED"].includes(context.status);
}

export function canEditAssessInterviewDraft(context: InterviewPolicyContext): boolean {
  return canReadAssessInterviewWorkspace(context)
    && hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && context.status === "LIVE"
    && context.editorUserId === context.userId;
}

export function canRunAssessInterviewCode(context: InterviewPolicyContext): boolean {
  return canReadAssessInterviewWorkspace(context)
    && hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && context.status === "LIVE"
    && (context.role !== "CANDIDATE" || context.editorUserId === context.userId);
}

export function canJoinAssessInterview(context: InterviewPolicyContext): boolean {
  return hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && context.status === "LIVE";
}

export function canSendAssessInterviewMessage(context: InterviewPolicyContext): boolean {
  return hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && ["SCHEDULED", "LIVE"].includes(context.status);
}

export function canStartAssessInterview(context: InterviewPolicyContext): boolean {
  return canHostAssessInterview(context)
    && hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && context.status === "SCHEDULED";
}

export function canControlAssessInterview(context: InterviewPolicyContext): boolean {
  return canHostAssessInterview(context)
    && hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && context.status === "LIVE";
}

export function canEndAssessInterview(context: InterviewPolicyContext): boolean {
  return canHostAssessInterview(context)
    && (context.status === "COMPLETED" || context.status === "LIVE" && hasActiveInterviewConsent(context.consentStatus, context.consentAt));
}

export function canCancelAssessInterview(context: InterviewPolicyContext): boolean {
  return canHostAssessInterview(context) && context.status === "SCHEDULED";
}

export function canSubmitAssessInterviewQuiz(context: InterviewPolicyContext): boolean {
  return context.role === "CANDIDATE"
    && hasActiveInterviewConsent(context.consentStatus, context.consentAt)
    && ["SCHEDULED", "LIVE"].includes(context.status);
}

export function canReadAssessInterviewQuizAnswers(context: InterviewPolicyContext): boolean {
  return context.role === "CANDIDATE" && hasActiveInterviewConsent(context.consentStatus, context.consentAt);
}

export function canReadAssessInterviewNotes(context: InterviewPolicyContext): boolean {
  return context.role !== "CANDIDATE";
}

export function canReleaseAssessInterviewFeedback(context: InterviewPolicyContext): boolean {
  return context.role !== "CANDIDATE" && context.status === "COMPLETED";
}

export function canCancelAssessInterviewExecution(context: InterviewPolicyContext, jobOwnerId: number): boolean {
  return context.role !== "CANDIDATE" || jobOwnerId === context.userId;
}

export function canRespondToAssessInterview(context: InterviewPolicyContext): boolean {
  return context.role === "CANDIDATE" && context.consentStatus === "INVITED";
}
