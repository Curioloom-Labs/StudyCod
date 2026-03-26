import { api } from "./client";

export type ContestVisibility = "PUBLIC" | "PRIVATE_CODE" | "CLASS";

export type ContestListItem = {
  id: number;
  title: string;
  description: string | null;
  visibility: ContestVisibility;
  startsAt: string | null;
  endsAt: string | null;
  isPublished: boolean;
  allowUpsolve: boolean;
  createdAt: string | null;
  createdBy: { id: number; username: string } | null;
  classId: number | null;
  canAccessContent?: boolean;
  joinRequired?: boolean;
};

export type ContestProblemListItem = {
  id: number;
  order: number;
  label: string;
  points?: number | null;
  title: string;
  libraryTaskId: number | null;
};

export type ContestDetails = {
  contest: {
    id: number;
    title: string;
    description: string | null;
    visibility: ContestVisibility;
    startsAt: string | null;
    endsAt: string | null;
    isPublished: boolean;
    allowUpsolve: boolean;
    createdBy: { id: number; username: string } | null;
    classId: number | null;
  };
  access: {
    canAccessContent: boolean;
    isJoined: boolean;
    joinRequired: boolean;
    canManage?: boolean;
    isPaused?: boolean;
  };
  problems: ContestProblemListItem[];
  serverTime: string;
  phase: { started: boolean; finished: boolean };
};

export type CreateContestRequest = {
  title: string;
  description?: string;
  visibility?: ContestVisibility;
  joinCode?: string;
  classId?: number;
  startsAt?: string;
  endsAt?: string;
  isPublished?: boolean;
  allowUpsolve?: boolean;
};

export type UpdateContestRequest = {
  title?: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isPublished?: boolean;
  allowUpsolve?: boolean;
};

export type JudgeLanguage = "java" | "python" | "cpp" | "c" | "csharp" | "kotlin";

export type ContestProblemStatement = {
  problem: { id: number; order: number; label: string };
  task: {
    id: number;
    title: string;
    description: string;
    template: string;
    templatesByLanguage: Record<string, string> | null;
    allowedLanguages: JudgeLanguage[];
    timeLimitMs: number | null;
    memoryLimitMb: number | null;
    outputLimitKb: number | null;
    checkerSpec: unknown | null;
  };
};

export type CodeFile = { path: string; content: string };

export type ContestCheckResult = {
  submissionId: number;
  phase: "CONTEST" | "UPSOLVE";
  verdict: string | null;
  testsPassed: number;
  testsTotal: number;
  score: number;
  maxScore: number;
  compileError: string | null;
  compileErrorKind: string | null;
};

export type ContestRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

export type ScoreboardProblem = { id: number; order: number; label: string };
export type ScoreboardRow = {
  rank: number;
  participantId: number;
  displayName: string;
  totalScore: number;
  lastImprovementAt: string | null;
  problems: Array<{ problemId: number; score: number; bestAt: string | null }>;
};

export type ContestSubmissionListItem = {
  id: number;
  createdAt: string | null;
  phase: "CONTEST" | "UPSOLVE";
  language: string;
  verdict: string | null;
  score: number | null;
  maxScore: number | null;
  testsPassed: number | null;
  testsTotal: number | null;
  compileErrorKind: string | null;
};

export type ContestAdminParticipant = {
  id: number;
  displayName: string;
  principalType: "USER" | "STUDENT";
  joinedAt: string | null;
  contestAccountHandle?: string | null;
  contestAccountNote?: string | null;
  isDisqualified: boolean;
  disqualificationReason: string | null;
  disqualifiedAt: string | null;
};

export type ContestGeneratedAccount = {
  fullName: string | null;
  email: string | null;
  userId: number;
  username: string;
  password: string;
  participantId: number;
};

export type ContestAccountRecipient = {
  fullName: string;
  email: string;
  username: string;
  password: string;
};

export type ContestAccount = {
  handle: string | null;
  note: string | null;
};

export type ContestAdminSubmission = {
  id: number;
  createdAt: string | null;
  phase: "CONTEST" | "UPSOLVE";
  language: string;
  verdict: string | null;
  score: number | null;
  maxScore: number | null;
  testsPassed: number | null;
  testsTotal: number | null;
  compileErrorKind: string | null;
  submittedCode: string;
  problem: { id: number; order: number; label: string };
};

export type ContestMyProgressProblem = {
  problemId: number;
  order: number;
  label: string;
  title: string;
  maxScore: number | null;
  bestContestScore: number;
  bestContestAt: string | null;
  last:
    | {
        id: number;
        problemId: number;
        createdAt: string | null;
        phase: "CONTEST" | "UPSOLVE";
        language: string;
        verdict: string | null;
        score: number | null;
        maxScore: number | null;
        testsPassed: number | null;
        testsTotal: number | null;
      }
    | null;
};

export type ContestCommunityQuestion = {
  id: number;
  participantId?: number | null;
  author: string;
  text: string;
  createdAt: string;
  answer: string | null;
  answeredAt: string | null;
  status?: "OPEN" | "ANSWERED";
};

export type ContestCommunityAnnouncement = {
  id: number;
  author: string;
  text: string;
  createdAt: string;
};

export type ContestCommunityData = {
  contestId: number;
  questions: ContestCommunityQuestion[];
  announcements: ContestCommunityAnnouncement[];
};

export type ContestOrganizerListItem = {
  userId: number;
  username: string;
  addedAt: string | null;
};

export type ContestAnnulmentItem = {
  id: number;
  problemId: number;
  participantId: number | null;
  reason: string | null;
  isActive: boolean;
  createdByUserId: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function listContests(): Promise<{ contests: ContestListItem[] }> {
  const res = await api.get("/contests");
  return res.data;
}

export async function getContestDetails(contestId: number): Promise<ContestDetails> {
  const res = await api.get(`/contests/${contestId}`);
  return res.data;
}

export async function joinContest(contestId: number, code?: string): Promise<{ joined: boolean; participantId: number }> {
  const res = await api.post(`/contests/${contestId}/join`, code != null ? { code } : {});
  return res.data;
}

export async function joinContestByCode(code: string): Promise<{ joined: boolean; contestId: number; participantId: number }> {
  const res = await api.post(`/contests/join-by-code`, { code });
  return res.data;
}

export async function getContestProblemStatement(contestId: number, problemId: number): Promise<ContestProblemStatement> {
  const res = await api.get(`/contests/${contestId}/problems/${problemId}`);
  return res.data;
}

export async function checkContestProblem(params: {
  contestId: number;
  problemId: number;
  language: JudgeLanguage;
  code?: string;
  files?: CodeFile[];
  turnstileToken?: string;
}): Promise<ContestCheckResult> {
  const res = await api.post(`/contests/${params.contestId}/problems/${params.problemId}/check`, {
    language: params.language,
    code: params.code,
    files: params.files,
    turnstileToken: params.turnstileToken,
  });
  return res.data;
}

export async function runContestProblem(params: {
  contestId: number;
  problemId: number;
  language: JudgeLanguage;
  input?: string;
  code?: string;
  files?: CodeFile[];
}): Promise<ContestRunResult> {
  const res = await api.post(`/contests/${params.contestId}/problems/${params.problemId}/run`, {
    language: params.language,
    input: params.input,
    code: params.code,
    files: params.files,
  });
  return res.data;
}

export async function getContestScoreboard(contestId: number): Promise<{ contestId: number; problems: ScoreboardProblem[]; rows: ScoreboardRow[]; disqualifiedCount?: number }> {
  const res = await api.get(`/contests/${contestId}/scoreboard`);
  return res.data;
}

export async function listContestAdminParticipants(contestId: number): Promise<{ contestId: number; participants: ContestAdminParticipant[] }> {
  const res = await api.get(`/contests/${contestId}/admin/participants`);
  return res.data;
}

export async function setContestParticipantDisqualified(
  contestId: number,
  participantId: number,
  payload: { disqualified: boolean; reason?: string | null }
): Promise<{
  participant: { id: number; isDisqualified: boolean; disqualificationReason: string | null; disqualifiedAt: string | null };
  notification?: {
    attempted: boolean;
    sent: boolean;
    recipientEmail: string | null;
    reason: string | null;
  };
}> {
  const res = await api.patch(`/contests/${contestId}/admin/participants/${participantId}/disqualify`, payload);
  return res.data;
}

export async function listContestParticipantSubmissionsForAdmin(
  contestId: number,
  participantId: number,
  limit: number = 100
): Promise<{
  contestId: number;
  participant: {
    id: number;
    displayName: string;
    principalType: "USER" | "STUDENT";
    contestAccountHandle?: string | null;
    contestAccountNote?: string | null;
    isDisqualified: boolean;
  };
  submissions: ContestAdminSubmission[];
}> {
  const res = await api.get(`/contests/${contestId}/admin/participants/${participantId}/submissions`, { params: { limit } });
  return res.data;
}

export async function getContestAccount(contestId: number): Promise<{ contestId: number; account: ContestAccount }> {
  const res = await api.get(`/contests/${contestId}/account`);
  return res.data;
}

export async function updateContestAccount(
  contestId: number,
  payload: { handle?: string | null; note?: string | null }
): Promise<{ contestId: number; account: ContestAccount }> {
  const res = await api.put(`/contests/${contestId}/account`, payload);
  return res.data;
}

export async function createContest(payload: CreateContestRequest): Promise<{ id: number }> {
  const res = await api.post(`/contests`, payload);
  return res.data;
}

export async function updateContest(contestId: number, payload: UpdateContestRequest): Promise<{
  id: number;
  isPublished: boolean;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  allowUpsolve: boolean;
}> {
  const res = await api.patch(`/contests/${contestId}`, payload);
  return res.data;
}

export async function addContestProblem(
  contestId: number,
  payload:
    | {
        mode: "CREATE";
        title: string;
        description: string;
        template: string;
        maxAttempts?: number;
        difficulty?: "EASY" | "MEDIUM" | "HARD";
        tests?: Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }>;
      }
    | { mode: "COPY"; libraryTaskId: number }
): Promise<{ problemId: number; libraryTaskId: number; order: number; label: string; points: number | null }> {
  const res = await api.post(`/contests/${contestId}/problems`, payload);
  return res.data;
}

export async function updateContestProblemSettings(
  contestId: number,
  problemId: number,
  payload: { label?: string | null; points?: number | null; order?: number }
): Promise<{ problem: { id: number; order: number; label: string; points: number | null } }> {
  const res = await api.patch(`/contests/${contestId}/problems/${problemId}`, payload);
  return res.data;
}

export async function getContestProblemSubmissions(
  contestId: number,
  problemId: number,
  limit: number = 20
): Promise<{ contestId: number; problemId: number; participantId: number; submissions: ContestSubmissionListItem[] }> {
  const res = await api.get(`/contests/${contestId}/problems/${problemId}/submissions`, { params: { limit } });
  return res.data;
}

export async function getContestMyProgress(contestId: number): Promise<{ contestId: number; participantId: number; problems: ContestMyProgressProblem[] }> {
  const res = await api.get(`/contests/${contestId}/my-progress`);
  return res.data;
}

export async function getContestCommunity(contestId: number): Promise<ContestCommunityData> {
  const res = await api.get(`/contests/${contestId}/community`);
  return res.data;
}

export async function postContestCommunityQuestion(
  contestId: number,
  text: string
): Promise<{ question: ContestCommunityQuestion }> {
  const res = await api.post(`/contests/${contestId}/community/questions`, { text });
  return res.data;
}

export async function answerContestCommunityQuestion(
  contestId: number,
  questionId: number,
  answer: string
): Promise<{ question: ContestCommunityQuestion }> {
  const res = await api.patch(`/contests/${contestId}/community/questions/${questionId}/answer`, { answer });
  return res.data;
}

export async function postContestCommunityAnnouncement(
  contestId: number,
  text: string
): Promise<{ announcement: ContestCommunityAnnouncement }> {
  const res = await api.post(`/contests/${contestId}/community/announcements`, { text });
  return res.data;
}

export async function setContestPaused(contestId: number, paused: boolean): Promise<{ contestId: number; isPaused: boolean }> {
  const res = await api.patch(`/contests/${contestId}/admin/pause`, { paused });
  return res.data;
}

export async function listContestOrganizers(contestId: number): Promise<{
  contestId: number;
  isPaused: boolean;
  owner: { userId: number; username: string } | null;
  organizers: ContestOrganizerListItem[];
}> {
  const res = await api.get(`/contests/${contestId}/admin/organizers`);
  return res.data;
}

export async function addContestOrganizer(contestId: number, userId: number): Promise<{ organizer: { userId: number; username: string } }> {
  const res = await api.post(`/contests/${contestId}/admin/organizers`, { userId });
  return res.data;
}

export async function removeContestOrganizer(contestId: number, userId: number): Promise<{ removed: boolean; userId: number }> {
  const res = await api.delete(`/contests/${contestId}/admin/organizers/${userId}`);
  return res.data;
}

export async function generateContestAccounts(
  contestId: number,
  payload: {
    entries: Array<{ fullName: string; email: string }>;
    count?: number;
    usernamePrefix?: string;
  }
): Promise<{ contestId: number; created: ContestGeneratedAccount[] }> {
  const res = await api.post(`/contests/${contestId}/admin/accounts/generate`, payload);
  return res.data;
}

export async function sendContestAccountsEmails(
  contestId: number,
  payload: {
    recipients: ContestAccountRecipient[];
    includeContestInfo?: boolean;
    customMessage?: string;
  }
): Promise<{ contestId: number; total: number; sentCount: number; failedCount: number; failed: Array<{ email: string; reason: string }> }> {
  const res = await api.post(`/contests/${contestId}/admin/accounts/send-emails`, payload);
  return res.data;
}

export async function listContestAnnulments(contestId: number): Promise<{ contestId: number; annulments: ContestAnnulmentItem[] }> {
  const res = await api.get(`/contests/${contestId}/admin/annulments`);
  return res.data;
}

export async function setContestAnnulment(
  contestId: number,
  payload: { problemId: number; participantId?: number | null; annulled: boolean; reason?: string | null }
): Promise<{ annulment: ContestAnnulmentItem }> {
  const res = await api.patch(`/contests/${contestId}/admin/annulments`, payload);
  return res.data;
}
