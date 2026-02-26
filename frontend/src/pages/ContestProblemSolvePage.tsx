import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FilePlus2, PlayCircle, Trophy } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { CodeEditor } from "../components/CodeEditor";
import { MultiFileEditor } from "../components/MultiFileEditor";
import { MarkdownView } from "../components/MarkdownView";
import { Skeleton } from "../components/ui/Skeleton";
import {
  checkContestProblem,
  getContestProblemStatement,
  getContestProblemSubmissions,
  runContestProblem,
  type CodeFile,
  type ContestCheckResult,
  type ContestProblemStatement,
  type ContestRunResult,
  type ContestSubmissionListItem,
  type JudgeLanguage,
} from "../lib/api/contests";

const FRIENDLY_LANG: Record<JudgeLanguage, string> = {
  java: "Java",
  python: "Python",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  kotlin: "Kotlin",
};

function entryFileForJudgeLanguage(lang: JudgeLanguage): string {
  switch (lang) {
    case "java":
      return "Main.java";
    case "python":
      return "main.py";
    case "cpp":
      return "main.cpp";
    case "c":
      return "main.c";
    case "kotlin":
      return "Main.kt";
    case "csharp":
      return "Program.cs";
    default:
      return "Main.java";
  }
}

function normalizeFiles(fs: CodeFile[]): CodeFile[] {
  const m = new Map<string, string>();
  for (const f of fs || []) {
    const p = String((f as any)?.path ?? "").trim();
    if (!p) continue;
    m.set(p, String((f as any)?.content ?? ""));
  }
  return Array.from(m.entries())
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function templateForLanguage(task: { template: string; templatesByLanguage: Record<string, string> | null }, lang: JudgeLanguage) {
  const by = task.templatesByLanguage || null;
  const t = by && typeof by[lang] === "string" ? String(by[lang] ?? "") : "";
  return t.trim() ? t : task.template;
}

function safeJsonParse<T>(raw: string | null): T | null {
  try {
    if (!raw) return null;
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

function draftScopeFromToken(token: string | null): string {
  const p = decodeJwtPayload(token);
  if (typeof p?.userId === "number") return `user:${p.userId}`;
  if (typeof p?.studentId === "number") return `student:${p.studentId}`;
  if (typeof p?.type === "string" && p.type.trim()) return `type:${String(p.type).trim().toUpperCase()}`;
  return "anon";
}

function fmtWhen(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export const ContestProblemSolvePage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);
  const navigate = useNavigate();
  const params = useParams();

  const contestId = React.useMemo(() => {
    const v = Number((params as any)?.id);
    return Number.isFinite(v) ? v : null;
  }, [params]);

  const problemId = React.useMemo(() => {
    const v = Number((params as any)?.problemId);
    return Number.isFinite(v) ? v : null;
  }, [params]);

  const storageBase = React.useMemo(() => {
    if (!contestId || !problemId) return null;
    let scope = "anon";
    if (typeof window !== "undefined") {
      try {
        scope = draftScopeFromToken(localStorage.getItem("token"));
      } catch {
        scope = "anon";
      }
    }
    return `contest:${contestId}:problem:${problemId}:${scope}`;
  }, [contestId, problemId]);

  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<ContestProblemStatement | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [judgeLanguage, setJudgeLanguage] = React.useState<JudgeLanguage>("java");
  const [useFiles, setUseFiles] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [files, setFiles] = React.useState<CodeFile[]>([]);

  const [checking, setChecking] = React.useState(false);
  const [checkResult, setCheckResult] = React.useState<ContestCheckResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const [runInput, setRunInput] = React.useState("");
  const [runResult, setRunResult] = React.useState<ContestRunResult | null>(null);

  const [subsLoading, setSubsLoading] = React.useState(false);
  const [subsError, setSubsError] = React.useState<string | null>(null);
  const [subs, setSubs] = React.useState<ContestSubmissionListItem[]>([]);

  const hasToken = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem("token");
    } catch {
      return false;
    }
  }, []);

  const persistDraft = React.useCallback(
    (next: { lang: JudgeLanguage; useFiles: boolean; code: string; files: CodeFile[] }) => {
      if (!storageBase) return;
      try {
        localStorage.setItem(`${storageBase}:lang`, next.lang);
        localStorage.setItem(`${storageBase}:useFiles`, next.useFiles ? "1" : "0");
        localStorage.setItem(`${storageBase}:draft:${next.lang}:code`, next.code);
        localStorage.setItem(`${storageBase}:draft:${next.lang}:files`, JSON.stringify(normalizeFiles(next.files)));
      } catch {
        // ignore
      }
    },
    [storageBase]
  );

  const hydrateDraft = React.useCallback(
    (stmt: ContestProblemStatement) => {
      if (!storageBase) return;
      const allowed = (stmt.task.allowedLanguages || []).filter(Boolean);
      const fallbackLang = (allowed[0] ?? "java") as JudgeLanguage;

      try {
        const savedLang = (localStorage.getItem(`${storageBase}:lang`) as JudgeLanguage | null) ?? null;
        const lang = savedLang && allowed.includes(savedLang) ? savedLang : fallbackLang;
        setJudgeLanguage(lang);

        const savedUseFiles = localStorage.getItem(`${storageBase}:useFiles`) === "1";
        setUseFiles(savedUseFiles);

        const savedCode = localStorage.getItem(`${storageBase}:draft:${lang}:code`);
        const savedFiles = safeJsonParse<CodeFile[]>(localStorage.getItem(`${storageBase}:draft:${lang}:files`));

        const tpl = templateForLanguage({ template: stmt.task.template, templatesByLanguage: stmt.task.templatesByLanguage }, lang);

        if (savedUseFiles) {
          const entry = entryFileForJudgeLanguage(lang);
          const nextFiles = normalizeFiles(savedFiles && savedFiles.length ? savedFiles : [{ path: entry, content: tpl }]);
          setFiles(nextFiles);
          setCode(savedCode != null ? savedCode : tpl);
        } else {
          setCode(savedCode != null ? savedCode : tpl);
          setFiles(savedFiles && savedFiles.length ? normalizeFiles(savedFiles) : []);
        }
      } catch {
        // ignore
      }
    },
    [storageBase]
  );

  const load = React.useCallback(() => {
    if (!contestId || !problemId) return;
    setLoading(true);
    setError(null);
    getContestProblemStatement(contestId, problemId)
      .then((r) => {
        setData(r);
        hydrateDraft(r);
      })
      .catch((e: any) => {
        const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
        setError(msg || tr("Не вдалося завантажити задачу", "Failed to load problem"));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [contestId, problemId, hydrateDraft, tr]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    // Persist draft on changes.
    if (!data) return;
    persistDraft({ lang: judgeLanguage, useFiles, code, files });
  }, [data, judgeLanguage, useFiles, code, files, persistDraft]);

  const loadSubmissions = React.useCallback(async () => {
    if (!contestId || !problemId) return;
    if (!hasToken) return;
    setSubsLoading(true);
    setSubsError(null);
    try {
      const r = await getContestProblemSubmissions(contestId, problemId, 20);
      setSubs(Array.isArray((r as any)?.submissions) ? ((r as any).submissions as ContestSubmissionListItem[]) : []);
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setSubsError(msg || tr("Не вдалося завантажити подачі", "Failed to load submissions"));
      setSubs([]);
    } finally {
      setSubsLoading(false);
    }
  }, [contestId, problemId, hasToken, tr]);

  React.useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const allowedLangs = React.useMemo(() => {
    const langs = (data?.task.allowedLanguages || []).filter(Boolean);
    return (langs.length ? langs : (Object.keys(FRIENDLY_LANG) as JudgeLanguage[])) as JudgeLanguage[];
  }, [data]);

  const applyTemplateForLang = (lang: JudgeLanguage) => {
    if (!data || !storageBase) return;

    setJudgeLanguage(lang);

    try {
      const savedCode = localStorage.getItem(`${storageBase}:draft:${lang}:code`);
      const savedFiles = safeJsonParse<CodeFile[]>(localStorage.getItem(`${storageBase}:draft:${lang}:files`));
      if (savedCode != null || (savedFiles && savedFiles.length)) {
        if (savedCode != null) setCode(savedCode);
        if (savedFiles) setFiles(normalizeFiles(savedFiles));
        return;
      }
    } catch {
      // ignore
    }

    const tpl = templateForLanguage({ template: data.task.template, templatesByLanguage: data.task.templatesByLanguage }, lang);
    setCode(tpl);
    if (useFiles) {
      setFiles([{ path: entryFileForJudgeLanguage(lang), content: tpl }]);
    } else {
      setFiles([]);
    }
  };

  const doCheck = async () => {
    if (!contestId || !problemId) return;
    if (!data) return;

    setChecking(true);
    try {
      if (!hasToken) {
        setError(tr("Потрібно увійти, щоб відправляти розв’язки.", "Please log in to submit."));
        return;
      }

      const entry = entryFileForJudgeLanguage(judgeLanguage);
      const normalized = normalizeFiles(files);
      const effectiveFiles = useFiles
        ? (normalized.some((f) => f.path === entry) ? normalized : [...normalized, { path: entry, content: code }])
        : undefined;

      const res = await checkContestProblem({
        contestId,
        problemId,
        language: judgeLanguage,
        ...(useFiles ? { files: effectiveFiles } : { code }),
      });
      setCheckResult(res);
      setError(null);
      loadSubmissions();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setError(msg || tr("Помилка перевірки", "Check failed"));
    } finally {
      setChecking(false);
    }
  };

  const doRun = async () => {
    if (!contestId || !problemId) return;
    if (!data) return;

    setRunning(true);
    try {
      if (!hasToken) {
        setError(tr("Потрібно увійти, щоб запускати код.", "Please log in to run code."));
        return;
      }

      const entry = entryFileForJudgeLanguage(judgeLanguage);
      const normalized = normalizeFiles(files);
      const effectiveFiles = useFiles
        ? (normalized.some((f) => f.path === entry) ? normalized : [...normalized, { path: entry, content: code }])
        : undefined;

      const res = await runContestProblem({
        contestId,
        problemId,
        language: judgeLanguage,
        input: runInput,
        ...(useFiles ? { files: effectiveFiles } : { code }),
      });
      setRunResult(res);
      setError(null);
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setError(msg || tr("Помилка запуску", "Run failed"));
      setRunResult(null);
    } finally {
      setRunning(false);
    }
  };

  const header = (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <div className="text-lg font-mono text-text-primary truncate">
            {data ? `${data.problem.label}. ${data.task.title}` : tr("Задача", "Problem")}
          </div>
        </div>
        <div className="text-xs text-text-secondary mt-1">
          {tr("Задача контесту", "Contest problem")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
          value={judgeLanguage}
          onChange={(e) => applyTemplateForLang(e.target.value as JudgeLanguage)}
          disabled={!data || checking}
        >
          {allowedLangs.map((l) => (
            <option key={l} value={l}>
              {FRIENDLY_LANG[l] ?? l}
            </option>
          ))}
        </select>

        {!useFiles ? (
          <Button
            variant="secondary"
            onClick={() => {
              const entry = entryFileForJudgeLanguage(judgeLanguage);
              setUseFiles(true);
              setFiles([{ path: entry, content: code }]);
            }}
            disabled={!data || checking}
            title={tr("Додати файл (multi-file)", "Add file (multi-file)")}
          >
            <FilePlus2 className="w-4 h-4 mr-2" />
            {tr("Файл", "File")}
          </Button>
        ) : null}

        <Button variant="secondary" onClick={doRun} disabled={running || checking || !data}>
          <PlayCircle className="w-4 h-4 mr-2" />
          {running ? tr("Виконання...", "Running...") : tr("Запустити", "Run")}
        </Button>

        <Button onClick={doCheck} disabled={checking || running || !data}>
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {checking ? tr("Перевірка...", "Checking...") : tr("Відправити", "Submit")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => navigate(`/contests/${contestId ?? ""}`)} disabled={!contestId}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {tr("До контесту", "Back to contest")}
        </Button>
      </div>

      {loading ? (
        <Card className="p-4">
          <Skeleton className="h-8 w-2/3 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-6" />
          <Skeleton className="h-64 w-full" />
        </Card>
      ) : error && !data ? (
        <Card className="p-4">
          <div className="text-sm text-accent-error">{error}</div>
        </Card>
      ) : !data ? null : (
        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            {header}

            {error ? <div className="text-sm text-accent-error">{error}</div> : null}

            {checkResult ? (
              <div className="border border-border p-3 bg-bg-base">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-text-secondary">
                  <span className="px-2 py-0.5 border border-border">{tr("Вердикт", "Verdict")}: {checkResult.verdict ?? "-"}</span>
                  <span className="px-2 py-0.5 border border-border">{tr("Тести", "Tests")}: {checkResult.testsPassed}/{checkResult.testsTotal}</span>
                  <span className="px-2 py-0.5 border border-border">{tr("Бали", "Score")}: {checkResult.score}/{checkResult.maxScore}</span>
                  {checkResult.phase === "UPSOLVE" ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : <Badge color="success">{tr("Контест", "Contest")}</Badge>}
                </div>

                {checkResult.compileError ? (
                  <div className="mt-3">
                    <div className="text-xs text-accent-error mb-2">
                      {tr("Помилка компіляції", "Compilation error")}
                      {checkResult.compileErrorKind ? <span className="ml-2 opacity-80">kind: {checkResult.compileErrorKind}</span> : null}
                    </div>
                    <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[260px]">{checkResult.compileError}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="border border-border p-3 bg-bg-base">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("Запуск (без відправки)", "Run (without submission)")}</div>
              <textarea
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                rows={4}
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-3 py-2 font-mono focus:outline-none"
                placeholder={tr("Введіть stdin для запуску (необов'язково)", "Enter stdin for run (optional)")}
              />

              <div className="mt-3 text-xs text-text-secondary">
                {tr("Run не створює подачу, не змінює таблицю і не впливає на бали.", "Run does not create a submission, does not affect standings, and does not change score.")}
              </div>

              {runResult ? (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-text-secondary mb-1">stdout</div>
                    <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[220px]">{runResult.stdout || ""}</pre>
                  </div>
                  <div>
                    <div className="text-xs text-text-secondary mb-1">stderr</div>
                    <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[220px]">{runResult.stderr || ""}</pre>
                  </div>
                  <div className="md:col-span-2 text-xs font-mono text-text-secondary">
                    exit={runResult.exitCode} · {tr("успіх", "success")}: {runResult.success ? tr("так", "yes") : tr("ні", "no")}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border border-border p-3 bg-bg-base">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-sm font-mono text-text-primary">{tr("Останні подачі", "Recent submissions")}</div>
                <Button variant="secondary" onClick={loadSubmissions} disabled={!hasToken || subsLoading}>
                  {tr("Оновити", "Refresh")}
                </Button>
              </div>

              {!hasToken ? (
                <div className="text-xs text-text-secondary">
                  {tr("Увійдіть, щоб бачити ваші подачі.", "Log in to see your submissions.")}
                </div>
              ) : subsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : subsError ? (
                <div className="text-sm text-accent-error">{subsError}</div>
              ) : subs.length === 0 ? (
                <div className="text-xs text-text-secondary">{tr("Поки що немає подач.", "No submissions yet.")}</div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-[680px] w-full text-xs font-mono border border-border">
                    <thead className="bg-bg-hover">
                      <tr>
                        <th className="p-2 border-b border-border text-left">#</th>
                        <th className="p-2 border-b border-border text-left">{tr("Час", "Time")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Фаза", "Phase")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Вердикт", "Verdict")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Бали", "Score")}</th>
                        <th className="p-2 border-b border-border text-left">{tr("Мова", "Lang")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s, idx) => (
                        <tr key={s.id} className="odd:bg-bg-base even:bg-bg-surface" title={`#${s.id}`}>
                          <td className="p-2 border-b border-border">{idx + 1}</td>
                          <td className="p-2 border-b border-border">{fmtWhen(s.createdAt, i18n.language)}</td>
                          <td className="p-2 border-b border-border text-center">
                            {s.phase === "UPSOLVE" ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : <Badge color="success">{tr("Контест", "Contest")}</Badge>}
                          </td>
                          <td className="p-2 border-b border-border text-center">{s.verdict ?? "-"}</td>
                          <td className="p-2 border-b border-border text-center">
                            {s.score != null && s.maxScore != null ? `${s.score}/${s.maxScore}` : s.score != null ? String(s.score) : "—"}
                          </td>
                          <td className="p-2 border-b border-border">{s.language}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-[11px] text-text-secondary mt-2">
                    {tr("Показуються лише ваші подачі для цієї задачі.", "Only your submissions for this problem are shown.")}
                  </div>
                </div>
              )}
            </div>

            {!hasToken ? (
              <div className="text-xs text-text-secondary">
                {tr(
                  "Перегляд умови доступний без входу. Для відправки розв’язків потрібно увійти.",
                  "You can read the statement without logging in. To submit solutions, please log in."
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="min-w-0">
                <div className="text-sm font-mono text-text-primary mb-2">{tr("Умова", "Statement")}</div>
                <div className="border border-border bg-bg-base p-3 overflow-auto max-h-[520px]">
                  <MarkdownView content={data.task.description} />
                </div>
              </div>

              <div className="min-w-0">
                <div className="text-sm font-mono text-text-primary mb-2">{tr("Розв’язок", "Solution")}</div>
                <div className="border border-border overflow-hidden h-[520px] min-h-[420px]">
                  {useFiles ? (
                    <MultiFileEditor
                      language={judgeLanguage}
                      entryFile={entryFileForJudgeLanguage(judgeLanguage)}
                      files={files}
                      onChange={(next) => setFiles(normalizeFiles(next))}
                    />
                  ) : (
                    <CodeEditor language={judgeLanguage} value={code} onChange={setCode} />
                  )}
                </div>
                {useFiles ? (
                  <div className="mt-2 text-xs text-text-secondary">
                    {tr(
                      "Multi-file: на сервер відправляється набір файлів. Вхідний файл має відповідати мові (Main.java, main.py, ...).",
                      "Multi-file: a set of files is submitted. Entry file must match the language (Main.java, main.py, ...)."
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
