import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, RotateCcw, Save, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { CodeEditor } from "../components/CodeEditor";
import { MultiFileEditor } from "../components/MultiFileEditor";
import { MarkdownView } from "../components/MarkdownView";
import {
  checkLibraryTask,
  getLibraryTask,
  getLibraryTaskByKey,
  getLibraryTaskAttempt,
  runLibraryTask,
  saveLibraryTaskDraft,
  type CodeFile,
  type LibraryCheckResult,
  type LibraryRunResult,
  type JudgeLanguage,
} from "../lib/api/library";

const FRIENDLY_LANG: Record<JudgeLanguage, string> = {
  java: "Java",
  python: "Python",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  kotlin: "Kotlin",
};

const BASE_JUDGE_LANGS: JudgeLanguage[] = ["java", "python", "cpp", "c", "csharp", "kotlin"];
const DISABLED_JUDGE_LANGS = (() => {
  const raw = String(import.meta.env.VITE_JUDGE_DISABLED_LANGUAGES ?? "").trim();
  if (!raw) return new Set<JudgeLanguage>();
  const parts = raw
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const disabled = new Set<JudgeLanguage>();
  for (const p of parts) {
    if ((BASE_JUDGE_LANGS as readonly string[]).includes(p)) disabled.add(p as JudgeLanguage);
  }
  return disabled;
})();

const ALL_JUDGE_LANGS: JudgeLanguage[] = (() => {
  const filtered = BASE_JUDGE_LANGS.filter(l => !DISABLED_JUDGE_LANGS.has(l));
  return filtered.length ? filtered : BASE_JUDGE_LANGS;
})();

const getAllowedJudgeLanguages = (task: { allowedLanguages?: JudgeLanguage[] | null }): JudgeLanguage[] => {
  const allowed = (task.allowedLanguages || []).filter(Boolean);
  if (allowed.length) return Array.from(new Set(allowed));
  // If task doesn't explicitly restrict languages, allow all supported languages.
  return ALL_JUDGE_LANGS;
};

const getTemplateForLanguage = (
  task: { template: string; templatesByLanguage?: Record<string, string> | null },
  language: JudgeLanguage
) => {
  const by = task.templatesByLanguage || null;
  const t = by && typeof by[language] === "string" ? String(by[language] ?? "") : "";
  return t.trim() ? t : task.template;
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

function filesEqual(a: CodeFile[], b: CodeFile[]): boolean {
  const aa = normalizeFiles(a);
  const bb = normalizeFiles(b);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i].path !== bb[i].path) return false;
    if (aa[i].content !== bb[i].content) return false;
  }
  return true;
}

function entryContentFromFiles(fs: CodeFile[], entryFile: string): string {
  const hit = (fs || []).find(f => f.path === entryFile);
  return hit?.content ?? "";
}

export const LibraryTaskSolvePage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const navigate = useNavigate();
  const hasToken = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem("token");
    } catch {
      return false;
    }
  }, []);
  const params = useParams();
  const taskKey = useMemo(() => String((params as any)?.taskKey ?? (params as any)?.taskId ?? (params as any)?.id ?? "").trim(), [params]);
  const taskId = useMemo(() => {
    const v = parseInt(taskKey, 10);
    return taskKey && String(v) === taskKey ? v : null;
  }, [taskKey]);

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Awaited<ReturnType<typeof getLibraryTask>>["task"] | null>(null);
  const [theory, setTheory] = useState<string | null>(null);

  // Always use a numeric id for run/check/drafts. When the route uses slug/problemCode,
  // taskId will be null, but loaded task will still have an id.
  const effectiveTaskId = task?.id ?? taskId;

  const [judgeLanguage, setJudgeLanguage] = useState<JudgeLanguage>("java");

  type DraftState = {
    useFiles: boolean;
    code: string;
    files: CodeFile[];
    lastSavedUseFiles: boolean;
    lastSavedCode: string;
    lastSavedFiles: CodeFile[];
  };
  const draftCacheRef = useRef<Partial<Record<JudgeLanguage, DraftState>>>({});

  const [code, setCode] = useState<string>("");
  const [lastSavedCode, setLastSavedCode] = useState<string>("");
  const [useFiles, setUseFiles] = useState<boolean>(false);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [lastSavedUseFiles, setLastSavedUseFiles] = useState<boolean>(false);
  const [lastSavedFiles, setLastSavedFiles] = useState<CodeFile[]>([]);
  const saveTimer = useRef<number | null>(null);

  const [stdin, setStdin] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<LibraryRunResult | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<LibraryCheckResult | null>(null);
  const [showCompactStatuses, setShowCompactStatuses] = useState(false);
  const [compactFailedOnly, setCompactFailedOnly] = useState(true);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsTab, setResultsTab] = useState<"run" | "check">("check");

  useEffect(() => {
    if (!taskKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const load = async () => {
      const d = taskId != null ? await getLibraryTask(taskId) : await getLibraryTaskByKey(taskKey);
      setTask(d.task);
      setTheory(d.theory);

      const allowed = getAllowedJudgeLanguages(d.task as any);
      const saved = (() => {
        try {
          const v = localStorage.getItem(`library_task_lang_${d.task.id}`);
          return v as JudgeLanguage | null;
        } catch {
          return null;
        }
      })();
      const initialLang = saved && allowed.includes(saved) ? saved : allowed[0];
      setJudgeLanguage(initialLang);

      if (!hasToken) {
        const initial = getTemplateForLanguage(d.task as any, initialLang);
        draftCacheRef.current[initialLang] = {
          useFiles: false,
          code: initial,
          files: [],
          lastSavedUseFiles: false,
          lastSavedCode: initial,
          lastSavedFiles: [],
        };
        setUseFiles(false);
        setFiles([]);
        setCode(initial);
        setLastSavedUseFiles(false);
        setLastSavedFiles([]);
        setLastSavedCode(initial);
        return;
      }
    };

    load()
      .catch((e) => {
        console.error("Failed to load library task", e);
        setTask(null);
        setTheory(null);
      })
      .finally(() => setLoading(false));
  }, [taskKey, taskId, hasToken]);

  // Load draft for selected language (and keep per-language in-memory cache to avoid losing edits)
  useEffect(() => {
    if (!task) return;
    const numericId = task.id;
    const lang = judgeLanguage;
    const entryFile = entryFileForJudgeLanguage(lang);

    // Persist language choice per task.
    try {
      localStorage.setItem(`library_task_lang_${numericId}`, lang);
    } catch {
      // ignore
    }

    // If we already have a local draft cached, prefer it.
    const cached = draftCacheRef.current[lang];
    if (cached) {
      setUseFiles(cached.useFiles);
      setFiles(cached.files);
      setCode(cached.code);
      setLastSavedUseFiles(cached.lastSavedUseFiles);
      setLastSavedFiles(cached.lastSavedFiles);
      setLastSavedCode(cached.lastSavedCode);
      return;
    }

    const template = getTemplateForLanguage(task as any, lang);
    if (!hasToken) {
      draftCacheRef.current[lang] = {
        useFiles: false,
        code: template,
        files: [],
        lastSavedUseFiles: false,
        lastSavedCode: template,
        lastSavedFiles: [],
      };
      setUseFiles(false);
      setFiles([]);
      setCode(template);
      setLastSavedUseFiles(false);
      setLastSavedFiles([]);
      setLastSavedCode(template);
      return;
    }

    getLibraryTaskAttempt(numericId, { language: lang })
      .then((a) => {
        const attempt = a.attempt;
        const serverFiles = Array.isArray(attempt?.draftFiles) ? normalizeFiles(attempt!.draftFiles!) : [];
        const serverUseFiles = serverFiles.length > 0;
        const draftCode = (attempt?.draftCode ?? "").trim() ? String(attempt?.draftCode ?? "") : template;
        const draftFiles = serverUseFiles
          ? (serverFiles.some(f => f.path === entryFile) ? serverFiles : [...serverFiles, { path: entryFile, content: draftCode }])
          : [];
        const resolvedCode = serverUseFiles ? entryContentFromFiles(draftFiles, entryFile) : draftCode;
        draftCacheRef.current[lang] = {
          useFiles: serverUseFiles,
          code: resolvedCode,
          files: draftFiles,
          lastSavedUseFiles: serverUseFiles,
          lastSavedCode: resolvedCode,
          lastSavedFiles: draftFiles,
        };
        setUseFiles(serverUseFiles);
        setFiles(draftFiles);
        setCode(resolvedCode);
        setLastSavedUseFiles(serverUseFiles);
        setLastSavedFiles(draftFiles);
        setLastSavedCode(resolvedCode);
      })
      .catch(() => {
        // fallback to template
        draftCacheRef.current[lang] = {
          useFiles: false,
          code: template,
          files: [],
          lastSavedUseFiles: false,
          lastSavedCode: template,
          lastSavedFiles: [],
        };
        setUseFiles(false);
        setFiles([]);
        setCode(template);
        setLastSavedUseFiles(false);
        setLastSavedFiles([]);
        setLastSavedCode(template);
      });
  }, [task, judgeLanguage, hasToken, taskId]);

  // Autosave draft (debounced)
  useEffect(() => {
    if (!effectiveTaskId) return;
    if (!task) return;
    if (!hasToken) return;

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    // Avoid spamming API on initial set
    const isDirty = useFiles
      ? !(lastSavedUseFiles === true && filesEqual(files, lastSavedFiles))
      : !(lastSavedUseFiles === false && code === lastSavedCode);
    if (!isDirty) return;

    saveTimer.current = window.setTimeout(() => {
      const payload = useFiles ? { files } : code;
      saveLibraryTaskDraft(effectiveTaskId, payload as any, judgeLanguage)
        .then(() => {
          const nextFiles = normalizeFiles(files);
          const nextCode = useFiles ? entryContentFromFiles(nextFiles, entryFileForJudgeLanguage(judgeLanguage)) : code;
          draftCacheRef.current[judgeLanguage] = {
            useFiles,
            code: nextCode,
            files: nextFiles,
            lastSavedUseFiles: useFiles,
            lastSavedCode: nextCode,
            lastSavedFiles: nextFiles,
          };
          setLastSavedUseFiles(useFiles);
          setLastSavedFiles(nextFiles);
          setLastSavedCode(nextCode);
        })
        .catch(() => {
          // ignore autosave errors
        });
    }, 900);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [code, files, useFiles, lastSavedCode, lastSavedFiles, lastSavedUseFiles, effectiveTaskId, task, hasToken, judgeLanguage]);

  // Keep per-language in-memory draft cache up-to-date.
  useEffect(() => {
    if (!task) return;
    draftCacheRef.current[judgeLanguage] = {
      useFiles,
      code,
      files: normalizeFiles(files),
      lastSavedUseFiles,
      lastSavedCode,
      lastSavedFiles: normalizeFiles(lastSavedFiles),
    };
  }, [code, files, useFiles, judgeLanguage, task, lastSavedCode, lastSavedFiles, lastSavedUseFiles]);

  const doRun = async () => {
    if (!effectiveTaskId || !task) return;
    if (!hasToken) {
      navigate("/auth");
      return;
    }
    setRunning(true);
    setRunResult(null);
    try {
      const payload = useFiles ? { files, input: stdin, language: judgeLanguage } : { code, input: stdin, language: judgeLanguage };
      const r = await runLibraryTask(effectiveTaskId, payload as any);
      setRunResult(r);
      setResultsTab("run");
      setResultsOpen(true);
    } catch (e: any) {
      console.error("Run failed", e);
      setRunResult({
        stdout: "",
        stderr: e?.response?.data?.message || tr("Помилка виконання", "Execution error"),
        exitCode: 1,
        success: false,
      });
      setResultsTab("run");
      setResultsOpen(true);
    } finally {
      setRunning(false);
    }
  };

  const doCheck = async () => {
    if (!effectiveTaskId || !task) return;
    if (!hasToken) {
      navigate("/auth");
      return;
    }
    setChecking(true);
    setCheckResult(null);
    try {
      const payload = useFiles ? { files, language: judgeLanguage } : { code, language: judgeLanguage };
      const r = await checkLibraryTask(effectiveTaskId, payload as any);
      setCheckResult(r);
      setShowCompactStatuses(false);
      setCompactFailedOnly(true);
      setResultsTab("check");
      setResultsOpen(true);
    } catch (e: any) {
      console.error("Check failed", e);
      const status = e?.response?.status;
      const data = e?.response?.data;
      const isHtml = typeof data === "string" && data.trim().toLowerCase().startsWith("<html");
      if (status === 502 || status === 503 || status === 504 || isHtml) {
        alert(
          tr(
            "Сервер перевірки тимчасово недоступний (помилка шлюзу). Спробуйте ще раз через кілька секунд.",
            "Check service is temporarily unavailable (gateway error). Please try again in a few seconds."
          )
        );
      } else {
        alert(data?.message || tr("Не вдалося перевірити", "Failed to check"));
      }
    } finally {
      setChecking(false);
    }
  };

  const manualSave = async () => {
    if (!effectiveTaskId) return;
    if (!hasToken) {
      navigate("/auth");
      return;
    }
    try {
      const payload = useFiles ? { files } : code;
      await saveLibraryTaskDraft(effectiveTaskId, payload as any, judgeLanguage);
      const nextFiles = normalizeFiles(files);
      const nextCode = useFiles ? entryContentFromFiles(nextFiles, entryFileForJudgeLanguage(judgeLanguage)) : code;
      setLastSavedUseFiles(useFiles);
      setLastSavedFiles(nextFiles);
      setLastSavedCode(nextCode);
      alert(tr("Збережено", "Saved"));
    } catch (e: any) {
      alert(e?.response?.data?.message || tr("Не вдалося зберегти", "Failed to save"));
    }
  };

  const resetToTemplate = () => {
    if (!task) return;
    if (!confirm(tr("Скинути код до шаблону?", "Reset code to template?"))) return;
    const next = getTemplateForLanguage(task as any, judgeLanguage);
    if (useFiles) {
      const entryFile = entryFileForJudgeLanguage(judgeLanguage);
      setFiles([{ path: entryFile, content: next }]);
      setCode(next);
    } else {
      setCode(next);
    }
  };

  if (!taskKey) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <Card className="p-4">
            <div className="text-sm text-text-secondary">{tr("Некоректне посилання", "Invalid link")}</div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-mono text-text-primary">
              {tr("Розв'язання: ", "Solve: ")}
              {task?.title || "..."}
            </h1>
            <div className="text-xs text-text-secondary mt-1">
              {tr("Це практика для себе — оцінки не змінюються.", "This is practice — it does not affect grades.")}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={resetToTemplate} disabled={!task || loading} title={tr("Скинути", "Reset")}
              >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={manualSave}
              disabled={loading}
              title={
                hasToken
                  ? tr("Зберегти чернетку", "Save draft")
                  : tr("Увійдіть, щоб зберегти чернетку", "Log in to save draft")
              }
              >
              <Save className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="p-4">
            <div className="text-sm text-text-secondary">{tr("Завантаження...", "Loading...")}</div>
          </Card>
        ) : !task ? (
          <Card className="p-4">
            <div className="text-sm text-text-secondary">{tr("Не вдалося завантажити завдання", "Failed to load task")}</div>
          </Card>
        ) : (
          <>
            <Card className="p-4 space-y-3">
              <div>
                <div className="text-sm font-mono text-text-primary mb-2">{tr("Умова", "Description")}</div>
                <MarkdownView content={task.description || ""} />
              </div>
              <div>
                <div className="text-sm font-mono text-text-primary mb-2">{tr("Теорія", "Theory")}</div>
                {theory ? <MarkdownView content={theory} /> : <div className="text-sm text-text-secondary">{tr("(немає)", "(none)")}</div>}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-sm font-mono text-text-primary">
                  {tr("Код", "Code")} ({FRIENDLY_LANG[judgeLanguage] || judgeLanguage})
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={judgeLanguage}
                    onChange={(e) => setJudgeLanguage(e.target.value as JudgeLanguage)}
                    className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                    title={tr("Мова розв'язку", "Solution language")}
                  >
                    {getAllowedJudgeLanguages(task as any).map((l) => (
                      <option key={l} value={l}>
                        {FRIENDLY_LANG[l] || l}
                      </option>
                    ))}
                  </select>
                <div className="flex gap-2">
                  {!useFiles ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const entryFile = entryFileForJudgeLanguage(judgeLanguage);
                        setUseFiles(true);
                        setFiles([{ path: entryFile, content: code }]);
                      }}
                      disabled={loading}
                      title={tr("Додати файл (multi-file)", "Add file (multi-file)")}
                    >
                      {tr("Додати файл", "Add file")}
                    </Button>
                  ) : null}
                  <Button onClick={doRun} disabled={running || checking}>
                    <Play className="w-4 h-4 mr-2" />
                    {running ? tr("Виконання...", "Running...") : tr("Запустити", "Run")}
                  </Button>
                  <Button onClick={doCheck} disabled={checking || running}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {checking ? tr("Перевірка...", "Checking...") : tr("Перевірити", "Check")}
                  </Button>
                </div>
                </div>
              </div>

              {(runResult || checkResult) ? (
                <div className="mb-3 p-3 border border-border bg-bg-base rounded flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                  <div className="text-xs font-mono text-text-secondary flex-1">
                    {runResult ? (
                      <span>
                        {tr("Останній запуск", "Last run")}: {runResult.success ? tr("успіх", "success") : tr("помилка", "error")} · exit={runResult.exitCode}
                      </span>
                    ) : (
                      <span>{tr("Запуск ще не виконували", "No run yet")}</span>
                    )}
                    <span className="mx-2">·</span>
                    {checkResult ? (
                      <span>
                        {tr("Остання перевірка", "Last check")}: {checkResult.verdict || "-"} · {checkResult.testsPassed}/{checkResult.testsTotal}
                      </span>
                    ) : (
                      <span>{tr("Перевірку ще не виконували", "No check yet")}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {runResult ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setResultsTab("run");
                          setResultsOpen(true);
                        }}
                      >
                        {tr("Результат запуску", "Run result")}
                      </Button>
                    ) : null}
                    {checkResult ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setResultsTab("check");
                          setResultsOpen(true);
                        }}
                      >
                        {tr("Результат перевірки", "Check result")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!hasToken ? (
                <div className="text-xs text-text-secondary mb-3">
                  {tr(
                    "Перегляд умови доступний без входу. Для запуску/перевірки та збереження чернетки потрібно увійти.",
                    "You can read the statement without logging in. To run/check and save drafts, please log in."
                  )}
                </div>
              ) : null}

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

              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-mono text-text-primary mb-2">{tr("Ввід (stdin)", "Input (stdin)")}</div>
                  <textarea
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[120px]"
                    placeholder={tr("Введіть дані для запуску...", "Enter input for running...")}
                  />
                </div>

                <div>
                  <div className="text-sm font-mono text-text-primary mb-2">{tr("Результат запуску", "Run output")}</div>
                  {!runResult ? (
                    <div className="text-sm text-text-secondary">{tr("Поки що немає", "Nothing yet")}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-text-secondary flex gap-3">
                        <span>
                          {tr("Код виходу", "Exit")}: {runResult.exitCode}
                        </span>
                        <span>
                          {tr("Успіх", "Success")}: {runResult.success ? tr("так", "yes") : tr("ні", "no")}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-text-primary mb-1">stdout</div>
                        <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[200px]">{runResult.stdout || ""}</pre>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                        <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[200px]">{runResult.stderr || ""}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("Перевірка (тести)", "Check (tests)")}</div>
              {!checkResult ? (
                <div className="text-sm text-text-secondary">{tr("Натисніть 'Перевірити'", "Click 'Check'")}</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                    <span className="px-2 py-0.5 border border-border">
                      {tr("Вердикт", "Verdict")}: {checkResult.verdict || "-"}
                    </span>
                    <span className="px-2 py-0.5 border border-border">
                      {tr("Тести", "Tests")}: {checkResult.testsPassed}/{checkResult.testsTotal}
                    </span>
                    <span className="px-2 py-0.5 border border-border">
                      {tr("Бали", "Score")}: {checkResult.score}/{checkResult.maxScore}
                    </span>
                    {checkResult.hidden.total > 0 ? (
                      <span className="px-2 py-0.5 border border-border">
                        {tr("Приховані", "Hidden")}: {checkResult.hidden.passed}/{checkResult.hidden.total}
                      </span>
                    ) : null}
                  </div>

                  {checkResult.compileError ? (
                    <div className="border border-border p-3">
                      <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                        <span className="text-accent-error">{tr("Помилка компіляції", "Compilation error")}</span>
                        {checkResult.compileErrorKind ? <span>kind: {checkResult.compileErrorKind}</span> : null}
                      </div>
                      <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[260px]">{checkResult.compileError}</pre>
                    </div>
                  ) : null}

                  {typeof checkResult.publicTestResultsTotal === "number" ? (
                    <div className="text-xs text-text-secondary">
                      {tr("Публічні тести", "Public tests")}: {checkResult.publicTestResults.length}/
                      {checkResult.publicTestResultsTotal}
                      {checkResult.publicTestResultsTruncated ? (
                        <span className="ml-2 text-accent-warning">
                          {tr("(обрізано для стабільності)", "(truncated for stability)")}
                        </span>
                      ) : null}
                      <div className="mt-1 text-[11px] opacity-80">
                        {tr(
                          "Ми показуємо лише статуси тестів (без input/output), щоб не зливати перевірочні дані.",
                          "We only show test statuses (no input/output) to avoid leaking judge data."
                        )}
                      </div>
                    </div>
                  ) : null}

                  {checkResult.publicTestResultsCompact?.length ? (
                    <div className="border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-text-secondary">
                          {tr("Статуси всіх публічних тестів (компактно)", "Statuses of all public tests (compact)")}: {checkResult.publicTestResultsCompact.length}
                          {checkResult.publicTestResultsCompactTruncated ? (
                            <span className="ml-2 text-accent-warning">
                              {tr("(обрізано)", "(truncated)")}
                              {typeof checkResult.publicTestResultsCompactLimit === "number" ? (
                                <span className="ml-1">limit={checkResult.publicTestResultsCompactLimit}</span>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                        <Button variant="ghost" onClick={() => setShowCompactStatuses(v => !v)}>
                          {showCompactStatuses ? tr("Сховати", "Hide") : tr("Показати", "Show")}
                        </Button>
                      </div>

                      {showCompactStatuses ? (
                        <div className="mt-2 space-y-2">
                          <label className="flex items-center gap-2 text-xs text-text-secondary select-none">
                            <input
                              type="checkbox"
                              checked={compactFailedOnly}
                              onChange={(e) => setCompactFailedOnly(e.target.checked)}
                            />
                            {tr("Показувати тільки помилки", "Show failed only")}
                          </label>

                          <div className="max-h-[220px] overflow-auto border border-border p-2">
                            <div className="flex flex-wrap gap-1">
                              {(compactFailedOnly
                                ? checkResult.publicTestResultsCompact.filter(t => !t.passed)
                                : checkResult.publicTestResultsCompact
                              ).map((t) => (
                                <span
                                  key={t.testId}
                                  className={
                                    "px-2 py-0.5 border text-[11px] font-mono " +
                                    (t.passed ? "border-accent-success text-accent-success" : "border-accent-error text-accent-error")
                                  }
                                  title={(t.verdict ? `verdict: ${t.verdict}` : "") + (t.errorKind ? ` kind: ${t.errorKind}` : "")}
                                >
                                  #{t.testId}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="text-[11px] text-text-secondary opacity-80">
                            {tr(
                              "Це компактний список статусів без великих input/output — підходить для сотень/тисяч тестів.",
                              "This compact list has no large input/output — suitable for hundreds/thousands of tests."
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {checkResult.publicTestResults.length === 0 ? (
                    <div className="text-sm text-text-secondary">{tr("Немає публічних тестів для показу", "No public tests to show")}</div>
                  ) : (
                    <div className="space-y-2">
                      {checkResult.publicTestResults.map((r) => (
                        <div key={r.testId} className="p-3 border border-border">
                          <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                            <span className={r.passed ? "text-accent-success" : "text-accent-error"}>
                              {r.passed ? tr("пройдено", "passed") : tr("не пройдено", "failed")}
                            </span>
                            <span>{tr("тест", "test")}: {r.testId}</span>
                            {r.verdict ? <span>verdict: {r.verdict}</span> : null}
                            {r.errorKind ? <span>kind: {r.errorKind}</span> : null}
                          </div>
                          {r.error ? (
                            <div className="mt-2">
                              <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                              <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[160px]">{r.error}</pre>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {resultsOpen ? (
              <Modal
                open={resultsOpen}
                onClose={() => setResultsOpen(false)}
                title={tr("Результати", "Results")}
                description={tr(
                  "Показуємо результати запуску та перевірки у зручному вікні, щоб не шукати їх внизу сторінки.",
                  "Run/check results in a convenient window so you don't have to hunt for them at the bottom."
                )}
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <Button
                      variant={resultsTab === "run" ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => setResultsTab("run")}
                      disabled={!runResult}
                      title={!runResult ? tr("Спочатку запустіть код", "Run code first") : undefined}
                    >
                      {tr("Запуск", "Run")}
                    </Button>
                    <Button
                      variant={resultsTab === "check" ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => setResultsTab("check")}
                      disabled={!checkResult}
                      title={!checkResult ? tr("Спочатку перевірте код", "Check code first") : undefined}
                    >
                      {tr("Перевірка", "Check")}
                    </Button>
                  </div>

                  {resultsTab === "run" ? (
                    !runResult ? (
                      <div className="text-sm text-text-secondary">{tr("Немає результату запуску", "No run result")}</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-text-secondary flex flex-wrap gap-3">
                          <span>
                            {tr("Код виходу", "Exit")}: {runResult.exitCode}
                          </span>
                          <span>
                            {tr("Успіх", "Success")}: {runResult.success ? tr("так", "yes") : tr("ні", "no")}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-mono text-text-primary mb-1">stdout</div>
                          <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[320px]">{runResult.stdout || ""}</pre>
                        </div>
                        <div>
                          <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                          <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[320px]">{runResult.stderr || ""}</pre>
                        </div>
                      </div>
                    )
                  ) : null}

                  {resultsTab === "check" ? (
                    !checkResult ? (
                      <div className="text-sm text-text-secondary">{tr("Немає результату перевірки", "No check result")}</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                          <span className="px-2 py-0.5 border border-border">
                            {tr("Вердикт", "Verdict")}: {checkResult.verdict || "-"}
                          </span>
                          <span className="px-2 py-0.5 border border-border">
                            {tr("Тести", "Tests")}: {checkResult.testsPassed}/{checkResult.testsTotal}
                          </span>
                          <span className="px-2 py-0.5 border border-border">
                            {tr("Бали", "Score")}: {checkResult.score}/{checkResult.maxScore}
                          </span>
                          {checkResult.hidden.total > 0 ? (
                            <span className="px-2 py-0.5 border border-border">
                              {tr("Приховані", "Hidden")}: {checkResult.hidden.passed}/{checkResult.hidden.total}
                            </span>
                          ) : null}
                        </div>

                        {checkResult.compileError ? (
                          <div className="border border-border p-3">
                            <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                              <span className="text-accent-error">{tr("Помилка компіляції", "Compilation error")}</span>
                              {checkResult.compileErrorKind ? <span>kind: {checkResult.compileErrorKind}</span> : null}
                            </div>
                            <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[360px]">{checkResult.compileError}</pre>
                          </div>
                        ) : null}

                        {typeof checkResult.publicTestResultsTotal === "number" ? (
                          <div className="text-xs text-text-secondary">
                            {tr("Публічні тести", "Public tests")}: {checkResult.publicTestResults.length}/
                            {checkResult.publicTestResultsTotal}
                            {checkResult.publicTestResultsTruncated ? (
                              <span className="ml-2 text-accent-warning">
                                {tr("(обрізано для стабільності)", "(truncated for stability)")}
                              </span>
                            ) : null}
                            <div className="mt-1 text-[11px] opacity-80">
                              {tr(
                                "Ми показуємо лише статуси тестів (без input/output), щоб не зливати перевірочні дані.",
                                "We only show test statuses (no input/output) to avoid leaking judge data."
                              )}
                            </div>
                          </div>
                        ) : null}

                        {checkResult.publicTestResultsCompact?.length ? (
                          <div className="border border-border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs text-text-secondary">
                                {tr("Статуси всіх публічних тестів (компактно)", "Statuses of all public tests (compact)")}: {checkResult.publicTestResultsCompact.length}
                                {checkResult.publicTestResultsCompactTruncated ? (
                                  <span className="ml-2 text-accent-warning">
                                    {tr("(обрізано)", "(truncated)")}
                                    {typeof checkResult.publicTestResultsCompactLimit === "number" ? (
                                      <span className="ml-1">limit={checkResult.publicTestResultsCompactLimit}</span>
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                              <Button variant="ghost" onClick={() => setShowCompactStatuses((v) => !v)}>
                                {showCompactStatuses ? tr("Сховати", "Hide") : tr("Показати", "Show")}
                              </Button>
                            </div>

                            {showCompactStatuses ? (
                              <div className="mt-2 space-y-2">
                                <label className="flex items-center gap-2 text-xs text-text-secondary select-none">
                                  <input
                                    type="checkbox"
                                    checked={compactFailedOnly}
                                    onChange={(e) => setCompactFailedOnly(e.target.checked)}
                                  />
                                  {tr("Показувати тільки помилки", "Show failed only")}
                                </label>

                                <div className="max-h-[320px] overflow-auto border border-border p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {(compactFailedOnly
                                      ? checkResult.publicTestResultsCompact.filter((t) => !t.passed)
                                      : checkResult.publicTestResultsCompact
                                    ).map((t) => (
                                      <span
                                        key={t.testId}
                                        className={
                                          "px-2 py-0.5 border text-[11px] font-mono " +
                                          (t.passed ? "border-accent-success text-accent-success" : "border-accent-error text-accent-error")
                                        }
                                        title={(t.verdict ? `verdict: ${t.verdict}` : "") + (t.errorKind ? ` kind: ${t.errorKind}` : "")}
                                      >
                                        #{t.testId}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="text-[11px] text-text-secondary opacity-80">
                                  {tr(
                                    "Це компактний список статусів без великих input/output — підходить для сотень/тисяч тестів.",
                                    "This compact list has no large input/output — suitable for hundreds/thousands of tests."
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {checkResult.publicTestResults.length === 0 ? (
                          <div className="text-sm text-text-secondary">{tr("Немає публічних тестів для показу", "No public tests to show")}</div>
                        ) : (
                          <div className="space-y-2">
                            {checkResult.publicTestResults.map((r) => (
                              <div key={r.testId} className="p-3 border border-border">
                                <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                                  <span className={r.passed ? "text-accent-success" : "text-accent-error"}>
                                    {r.passed ? tr("пройдено", "passed") : tr("не пройдено", "failed")}
                                  </span>
                                  <span>{tr("тест", "test")}: {r.testId}</span>
                                  {r.verdict ? <span>verdict: {r.verdict}</span> : null}
                                  {r.errorKind ? <span>kind: {r.errorKind}</span> : null}
                                </div>
                                {r.error ? (
                                  <div className="mt-2">
                                    <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                                    <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[240px]">{r.error}</pre>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  ) : null}

                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button variant="ghost" onClick={() => setResultsOpen(false)}>
                      {tr("Закрити", "Close")}
                    </Button>
                  </div>
                </div>
              </Modal>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default LibraryTaskSolvePage;
