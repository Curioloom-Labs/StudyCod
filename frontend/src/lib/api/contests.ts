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
    checkerSpec: any | null;
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
  isDisqualified: boolean;
  disqualificationReason: string | null;
  disqualifiedAt: string | null;
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
}): Promise<ContestCheckResult> {
  const res = await api.post(`/contests/${params.contestId}/problems/${params.problemId}/check`, {
    language: params.language,
    code: params.code,
    files: params.files,
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
): Promise<{ participant: { id: number; isDisqualified: boolean; disqualificationReason: string | null; disqualifiedAt: string | null } }> {
  const res = await api.patch(`/contests/${contestId}/admin/participants/${participantId}/disqualify`, payload);
  return res.data;
}

export async function listContestParticipantSubmissionsForAdmin(
  contestId: number,
  participantId: number,
  limit: number = 100
): Promise<{ contestId: number; participant: { id: number; displayName: string; principalType: "USER" | "STUDENT"; isDisqualified: boolean }; submissions: ContestAdminSubmission[] }> {
  const res = await api.get(`/contests/${contestId}/admin/participants/${participantId}/submissions`, { params: { limit } });
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
