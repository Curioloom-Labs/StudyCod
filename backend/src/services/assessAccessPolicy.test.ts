import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSESS_COMPANY_CAPABILITIES,
  canAssessCompanyRole,
  canCancelAssessInterview,
  canCancelAssessInterviewExecution,
  canCompanyMemberAccessInterview,
  canControlAssessInterview,
  canEditAssessInterviewDraft,
  canEndAssessInterview,
  canHostAssessInterview,
  canJoinAssessInterview,
  canManageAssessInterview,
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
  isAssessCompanyRole,
  type InterviewPolicyContext,
} from "./assessAccessPolicy";

test("company roles follow one explicit least-privilege capability matrix", () => {
  const expected: Record<string, string[]> = {
    OWNER: [...ASSESS_COMPANY_CAPABILITIES],
    HR: ["READ_WORKSPACE", "INVITE_CANDIDATES", "REVIEW_HR", "MANAGE_INTERVIEWS", "READ_CANDIDATE_DOSSIER", "READ_CANDIDATE_ANSWERS", "READ_HR_REVIEW"],
    ENGINEER: ["READ_WORKSPACE", "MANAGE_TECHNICAL_TASK", "REVIEW_TECHNICAL", "MANAGE_INTERVIEWS", "READ_CANDIDATE_DOSSIER", "READ_TECHNICAL_REVIEW", "READ_TECHNICAL_TASK"],
  };

  for (const role of ["OWNER", "HR", "ENGINEER", "CANDIDATE", "UNKNOWN", null]) {
    assert.equal(isAssessCompanyRole(role), typeof role === "string" && role in expected);
    const roleCapabilities = typeof role === "string" ? expected[role] : undefined;
    for (const capability of ASSESS_COMPANY_CAPABILITIES) {
      assert.equal(canAssessCompanyRole(role, capability), roleCapabilities?.includes(capability) ?? false, `${String(role)}:${capability}`);
    }
  }
  assert.equal(canManageAssessInterview("HR"), true);
  assert.equal(canManageAssessInterview("CANDIDATE"), false);
});

function context(overrides: Partial<InterviewPolicyContext> = {}): InterviewPolicyContext {
  return {
    role: "CANDIDATE",
    userId: 10,
    hostUserId: 20,
    editorUserId: 10,
    status: "LIVE",
    consentStatus: "ACCEPTED",
    consentAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

test("only an owner, host, or explicitly assigned active member can access a company interview", () => {
  assert.equal(canCompanyMemberAccessInterview("OWNER", 40, 20, []), true);
  assert.equal(canCompanyMemberAccessInterview("HR", 20, 20, []), true);
  assert.equal(canCompanyMemberAccessInterview("ENGINEER", 30, 20, [30]), true);
  assert.equal(canCompanyMemberAccessInterview("HR", 40, 20, [30]), false);
});

test("candidate workspace access requires accepted consent and a live or completed interview", () => {
  assert.equal(hasActiveInterviewConsent("ACCEPTED", "2026-11-01"), true);
  assert.equal(hasActiveInterviewConsent("INVITED", "2026-11-01"), false);
  assert.equal(hasActiveInterviewConsent("WITHDRAWN", "2026-11-01"), false);
  assert.equal(hasActiveInterviewConsent("ACCEPTED", null), false);
  assert.equal(canReadAssessInterviewWorkspace(context({ consentStatus: "INVITED", consentAt: null })), false);
  assert.equal(canReadAssessInterviewWorkspace(context({ status: "SCHEDULED" })), false);
  assert.equal(canReadAssessInterviewWorkspace(context({ status: "CANCELLED" })), false);
  assert.equal(canReadAssessInterviewWorkspace(context({ status: "LIVE" })), true);
  assert.equal(canReadAssessInterviewWorkspace(context({ status: "COMPLETED" })), true);
  assert.equal(canReadAssessInterviewWorkspace(context({ role: "ENGINEER", status: "SCHEDULED", consentAt: null })), true);
});

test("draft, execution, quiz, notes, feedback, and cancellation use explicit role and state rules", () => {
  assert.equal(canHostAssessInterview(context({ role: "OWNER" })), true);
  assert.equal(canHostAssessInterview(context({ role: "HR", hostUserId: 10 })), true);
  assert.equal(canHostAssessInterview(context({ role: "HR", hostUserId: 20 })), false);
  assert.equal(canEditAssessInterviewDraft(context()), true);
  assert.equal(canEditAssessInterviewDraft(context({ editorUserId: 11 })), false);
  assert.equal(canEditAssessInterviewDraft(context({ status: "SCHEDULED" })), false);
  assert.equal(canRunAssessInterviewCode(context()), true);
  assert.equal(canRunAssessInterviewCode(context({ editorUserId: 11 })), false);
  assert.equal(canRunAssessInterviewCode(context({ role: "ENGINEER", editorUserId: 11 })), true);
  assert.equal(canSubmitAssessInterviewQuiz(context()), true);
  assert.equal(canSubmitAssessInterviewQuiz(context({ status: "COMPLETED" })), false);
  assert.equal(canSubmitAssessInterviewQuiz(context({ role: "HR" })), false);
  assert.equal(canReadAssessInterviewQuizAnswers(context()), true);
  assert.equal(canReadAssessInterviewQuizAnswers(context({ role: "HR" })), false);
  assert.equal(canReadAssessInterviewQuizAnswers(context({ consentStatus: "WITHDRAWN" })), false);
  assert.equal(canReadAssessInterviewNotes(context({ role: "CANDIDATE" })), false);
  assert.equal(canReadAssessInterviewNotes(context({ role: "ENGINEER" })), true);
  assert.equal(canReleaseAssessInterviewFeedback(context({ role: "HR", status: "COMPLETED" })), true);
  assert.equal(canReleaseAssessInterviewFeedback(context({ role: "HR", status: "LIVE" })), false);
  assert.equal(canReleaseAssessInterviewFeedback(context({ role: "CANDIDATE", status: "COMPLETED" })), false);
  assert.equal(canCancelAssessInterviewExecution(context({ role: "CANDIDATE" }), 10), true);
  assert.equal(canCancelAssessInterviewExecution(context({ role: "CANDIDATE" }), 20), false);
  assert.equal(canCancelAssessInterviewExecution(context({ role: "ENGINEER" }), 20), true);
  assert.equal(canRespondToAssessInterview(context({ consentStatus: "INVITED" })), true);
  assert.equal(canRespondToAssessInterview(context({ consentStatus: "ACCEPTED" })), false);
  assert.equal(canStartAssessInterview(context({ role: "HR", hostUserId: 10, status: "SCHEDULED" })), true);
  assert.equal(canStartAssessInterview(context({ role: "HR", status: "SCHEDULED", consentAt: null })), false);
  assert.equal(canJoinAssessInterview(context()), true);
  assert.equal(canJoinAssessInterview(context({ status: "SCHEDULED" })), false);
  assert.equal(canSendAssessInterviewMessage(context({ status: "SCHEDULED" })), true);
  assert.equal(canSendAssessInterviewMessage(context({ status: "COMPLETED" })), false);
  assert.equal(canControlAssessInterview(context({ role: "HR", hostUserId: 10 })), true);
  assert.equal(canControlAssessInterview(context({ role: "HR", hostUserId: 10, consentAt: null })), false);
  assert.equal(canControlAssessInterview(context({ role: "HR" })), false);
  assert.equal(canEndAssessInterview(context({ role: "HR", hostUserId: 10, status: "LIVE" })), true);
  assert.equal(canEndAssessInterview(context({ role: "HR", hostUserId: 10, status: "COMPLETED", consentAt: null })), true);
  assert.equal(canCancelAssessInterview(context({ role: "HR", hostUserId: 10, status: "SCHEDULED" })), true);
  assert.equal(canCancelAssessInterview(context({ role: "HR", status: "LIVE" })), false);
});
