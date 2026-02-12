import { api } from "./client";

export type LibraryTaskStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type LibraryTaskLang = "JAVA" | "PYTHON";
export type LibraryTaskDifficulty = "EASY" | "MEDIUM" | "HARD";
export type JudgeLanguage = "java" | "python" | "cpp" | "c" | "csharp" | "kotlin";
export type LibraryCheckerSpec = { type: "exact" } | { type: "whitespace" } | { type: "float"; epsilon: number };

export type CodeFile = { path: string; content: string };
type CodeOrFiles = string | { code?: string; files?: CodeFile[] };

function toPayload(input: CodeOrFiles): { code?: string; files?: CodeFile[] } {
  if (typeof input === "string") return { code: input };
  return { code: input.code, files: input.files };
}

export type LibraryTaskAttemptSummary = {
  solved: boolean;
  lastTestsPassed: number | null;
  lastTestsTotal: number | null;
  lastScore: number | null;
  lastMaxScore: number | null;
  submissionsCount: number;
  lastCheckedAt: string | null;
};

export type LibraryTaskListItem = {
  id: number;
  problemCode?: string | null;
  slug?: string | null;
  title: string;
  description: string;
  template: string;
  templatesByLanguage?: Record<string, string> | null;
  lang: LibraryTaskLang;
  difficulty?: LibraryTaskDifficulty | null;
  tags?: string[] | null;
  section?: string | null;
  maxAttempts: number;
  timeLimitMs?: number | null;
  memoryLimitMb?: number | null;
  outputLimitKb?: number | null;
  checkerSpec?: LibraryCheckerSpec | null;
  allowedLanguages?: JudgeLanguage[] | null;
  status: LibraryTaskStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: number; username: string } | null;
  attempt?: LibraryTaskAttemptSummary | null;
};

export type LibraryTaskTest = {
  id: number;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  kind?: "SAMPLE" | "JUDGE";
  points: number;
};

export type LibraryTaskAttempt = {
  draftCode: string;
  draftFiles?: CodeFile[];
  draftEntryFile?: string;
  lastSubmittedCode: string | null;
  lastSubmittedFiles?: CodeFile[];
  lastSubmittedEntryFile?: string;
  lastVerdict: string | null;
  lastScore: number | null;
  lastMaxScore: number | null;
  lastTestsPassed: number | null;
  lastTestsTotal: number | null;
  submissionsCount: number;
  lastCheckedAt: string | null;
  updatedAt: string;
};

export type LibraryRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

type StudentLibraryAttemptV1 = {
  v: 1;
  updatedAt: string;
  byLang: Record<
    JudgeLanguage,
    {
      draft?: { code?: string; files?: CodeFile[] };
      last?: {
        verdict: string | null;
        score: number | null;
        maxScore: number | null;
        testsPassed: number | null;
        testsTotal: number | null;
        checkedAt: string | null;
      };
      submissionsCount?: number;
    }
  >;
};

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string | null): any | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isStudentToken(): boolean {
  if (typeof window === "undefined") return false;
  const token = localStorage.getItem("token");
  const p = decodeJwtPayload(token);
  return p?.type === "STUDENT" || typeof p?.studentId === "number";
}

function studentAttemptKey(taskId: number): string {
  return `library:studentAttempt:v1:${taskId}`;
}

function readStudentAttempt(taskId: number): StudentLibraryAttemptV1 | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(studentAttemptKey(taskId));
  const parsed = safeJsonParse<StudentLibraryAttemptV1>(raw);
  if (!parsed || parsed.v !== 1 || typeof parsed.byLang !== "object" || !parsed.byLang) return null;
  return parsed;
}

function writeStudentAttempt(taskId: number, attempt: StudentLibraryAttemptV1) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(studentAttemptKey(taskId), JSON.stringify(attempt));
  } catch {
    // ignore quota / privacy mode
  }
}

function upsertStudentAttempt(taskId: number, lang: JudgeLanguage, patch: Partial<StudentLibraryAttemptV1["byLang"][JudgeLanguage]>) {
  const now = new Date().toISOString();
  const current = readStudentAttempt(taskId) ?? ({ v: 1, updatedAt: now, byLang: {} as any } satisfies StudentLibraryAttemptV1);
  const prevLang = (current.byLang as any)[lang] ?? {};
  (current.byLang as any)[lang] = { ...prevLang, ...patch };
  current.updatedAt = now;
  writeStudentAttempt(taskId, current);
}

export function getStudentLibraryAttemptSummary(taskId: number): LibraryTaskAttemptSummary | null {
  const a = readStudentAttempt(taskId);
  if (!a) return null;
  // Pick "best" across languages: prefer one with last check.
  const langs = Object.keys(a.byLang || {}) as JudgeLanguage[];
  let best: any = null;
  for (const l of langs) {
    const x = (a.byLang as any)[l];
    if (!x) continue;
    if (!best) best = x;
    else if (x?.last?.checkedAt && !best?.last?.checkedAt) best = x;
    else if (x?.last?.checkedAt && best?.last?.checkedAt && String(x.last.checkedAt) > String(best.last.checkedAt)) best = x;
  }
  const last = best?.last ?? null;
  const passed = typeof last?.testsPassed === "number" ? last.testsPassed : null;
  const total = typeof last?.testsTotal === "number" ? last.testsTotal : null;
  const solved = typeof passed === "number" && typeof total === "number" && total > 0 && passed >= total;
  return {
    solved,
    lastTestsPassed: passed,
    lastTestsTotal: total,
    lastScore: typeof last?.score === "number" ? last.score : null,
    lastMaxScore: typeof last?.maxScore === "number" ? last.maxScore : null,
    submissionsCount: typeof best?.submissionsCount === "number" ? best.submissionsCount : 0,
    lastCheckedAt: typeof last?.checkedAt === "string" ? last.checkedAt : null,
  };
}

export type LibraryCheckResult = {
  verdict: string | null;
  testsPassed: number;
  testsTotal: number;
  score: number;
  maxScore: number;
  compileError?: string | null;
  compileErrorKind?: string | null;
  publicTestResultsTotal?: number;
  publicTestResultsTruncated?: boolean;
  publicTestResultsDetailedLimit?: number;
  publicTestResultsCompact?: Array<{
    testId: number;
    passed: boolean;
    verdict?: string | null;
    errorKind?: string | null;
  }>;
  publicTestResultsCompactTruncated?: boolean;
  publicTestResultsCompactLimit?: number;
  hidden: { passed: number; total: number };
  publicTestResults: Array<{
    testId: number;
    input?: string;
    actualOutput?: string;
    passed: boolean;
    verdict?: string | null;
    error?: string | null;
    errorKind?: string | null;
  }>;
};

export async function listApprovedLibraryTasks(params?: { lang?: LibraryTaskLang; judgeLanguage?: JudgeLanguage; q?: string; page?: number; pageSize?: number }) {
  const res = await api.get("/library/tasks", { params });
  const data = res.data as { tasks: LibraryTaskListItem[]; total?: number; page?: number; pageSize?: number };
  if (isStudentToken()) {
    data.tasks = (data.tasks || []).map(t => ({
      ...t,
      attempt: t.attempt ?? getStudentLibraryAttemptSummary(t.id)
    }));
  }
  return data;
}

export async function listMyLibraryTasks() {
  const res = await api.get("/library/tasks/mine");
  return res.data as { tasks: LibraryTaskListItem[] };
}

export async function getLibraryTask(id: number) {
  const res = await api.get(`/library/tasks/${id}`);
  return res.data as { task: LibraryTaskListItem; theory: string | null; tests: LibraryTaskTest[] };
}

export async function getLibraryTaskByKey(key: string) {
  const res = await api.get(`/library/tasks/by/${encodeURIComponent(key)}`);
  return res.data as { task: LibraryTaskListItem; theory: string | null; tests: LibraryTaskTest[] };
}

export async function getLibraryTaskAttempt(id: number, params?: { language?: JudgeLanguage }) {
  if (isStudentToken()) {
    const lang = (params?.language ?? "java") as JudgeLanguage;
    const stored = readStudentAttempt(id);
    const per = stored?.byLang?.[lang] ?? null;
    const draftFiles = Array.isArray(per?.draft?.files) ? per!.draft!.files : undefined;
    const draftCode = typeof per?.draft?.code === "string" ? per!.draft!.code! : "";
    const last = per?.last ?? null;
    const attempt: LibraryTaskAttempt = {
      draftCode,
      draftFiles,
      lastSubmittedCode: null,
      lastSubmittedFiles: undefined,
      lastVerdict: last?.verdict ?? null,
      lastScore: typeof last?.score === "number" ? last!.score! : null,
      lastMaxScore: typeof last?.maxScore === "number" ? last!.maxScore! : null,
      lastTestsPassed: typeof last?.testsPassed === "number" ? last!.testsPassed! : null,
      lastTestsTotal: typeof last?.testsTotal === "number" ? last!.testsTotal! : null,
      submissionsCount: typeof per?.submissionsCount === "number" ? per!.submissionsCount! : 0,
      lastCheckedAt: typeof last?.checkedAt === "string" ? last!.checkedAt! : null,
      updatedAt: stored?.updatedAt ?? new Date().toISOString(),
    };
    const hasDraft = (draftFiles && draftFiles.length) || (draftCode && draftCode.trim());
    const hasLast = last?.checkedAt || last?.testsTotal != null || last?.verdict != null;
    return { attempt: hasDraft || hasLast ? attempt : null };
  }

  const res = await api.get(`/library/tasks/${id}/attempt`, { params });
  return res.data as { attempt: LibraryTaskAttempt | null };
}

export async function saveLibraryTaskDraft(id: number, draftCodeOrFiles: string | { draftCode?: string; files?: CodeFile[] }, language?: JudgeLanguage) {
  const payload = typeof draftCodeOrFiles === "string" ? { draftCode: draftCodeOrFiles } : draftCodeOrFiles;
  const lang = (language ?? "java") as JudgeLanguage;

  if (isStudentToken()) {
    const files = Array.isArray((payload as any).files) ? ((payload as any).files as CodeFile[]) : undefined;
    const code = typeof (payload as any).draftCode === "string" ? String((payload as any).draftCode ?? "") : undefined;
    upsertStudentAttempt(id, lang, { draft: { code, files } });
    return { ok: true };
  }

  const res = await api.put(`/library/tasks/${id}/attempt`, { ...payload, language: lang });
  return res.data as { ok: true };
}

export async function runLibraryTask(id: number, payload: { input?: string; language?: JudgeLanguage } & ({ code: string } | { files: CodeFile[] } | { code?: string; files?: CodeFile[] })) {
  const res = await api.post(`/library/tasks/${id}/run`, payload);
  return res.data as LibraryRunResult;
}

export async function checkLibraryTask(id: number, payload: { language?: JudgeLanguage } & ({ code: string } | { files: CodeFile[] } | { code?: string; files?: CodeFile[] })) {
  const lang = (payload.language ?? "java") as JudgeLanguage;
  const res = await api.post(`/library/tasks/${id}/check`, { ...payload, language: lang });
  const data = res.data as LibraryCheckResult;

  if (isStudentToken()) {
    const now = new Date().toISOString();
    const prev = readStudentAttempt(id)?.byLang?.[lang];
    const prevCount = typeof prev?.submissionsCount === "number" ? prev!.submissionsCount! : 0;
    upsertStudentAttempt(id, lang, {
      last: {
        verdict: data.verdict ?? null,
        score: typeof data.score === "number" ? data.score : null,
        maxScore: typeof data.maxScore === "number" ? data.maxScore : null,
        testsPassed: typeof data.testsPassed === "number" ? data.testsPassed : null,
        testsTotal: typeof data.testsTotal === "number" ? data.testsTotal : null,
        checkedAt: now,
      },
      submissionsCount: prevCount + 1,
    });
  }

  return data;
}

export async function createLibraryTask(payload: {
  title: string;
  problemCode?: string;
  slug?: string;
  difficulty?: LibraryTaskDifficulty;
  tags?: string[];
  section?: string;
  description: string;
  template: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  outputLimitKb?: number;
  checkerSpec?: LibraryCheckerSpec;
  allowedLanguages?: JudgeLanguage[];
  lang?: LibraryTaskLang;
  maxAttempts?: number;
  theory?: string;
  tests?: Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }>;
}) {
  const res = await api.post("/library/tasks", payload);
  return res.data as { task: LibraryTaskListItem };
}

export async function updateLibraryTask(
  id: number,
  payload: Partial<{
    title: string;
    problemCode: string;
    slug: string;
    difficulty: LibraryTaskDifficulty | null;
    tags: string[] | null;
    section: string | null;
    description: string;
    template: string;
    lang: LibraryTaskLang;
    maxAttempts: number;
    timeLimitMs: number | null;
    memoryLimitMb: number | null;
    outputLimitKb: number | null;
    checkerSpec: LibraryCheckerSpec | null;
    allowedLanguages: JudgeLanguage[] | null;
    theory: string;
    tests: Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }>;
  }>
) {
  const res = await api.patch(`/library/tasks/${id}`, payload);
  return res.data as { task: LibraryTaskListItem };
}

export async function submitLibraryTask(id: number) {
  const res = await api.post(`/library/tasks/${id}/submit`, {});
  return res.data as { task: LibraryTaskListItem };
}

export async function importLibraryTaskArchive(file: File) {
  const form = new FormData();
  form.append("archive", file);
  const res = await api.post("/library/tasks/import-archive", form);
  return res.data as { task: LibraryTaskListItem };
}

function parseFilenameFromContentDisposition(v: string | undefined): string | null {
  if (!v) return null;
  const m = v.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i);
  const raw = (m?.[1] || m?.[2] || m?.[3] || "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function downloadLibraryTaskArchive(id: number): Promise<{ blob: Blob; filename: string }>
{
  const res = await api.get(`/library/tasks/${id}/export-archive`, { responseType: "blob" });
  const cd = (res.headers as any)?.["content-disposition"] as string | undefined;
  const filename = parseFilenameFromContentDisposition(cd) || `library_task_${id}.zip`;
  return { blob: res.data as Blob, filename };
}
