import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, FlaskConical, Play, Microscope, Link2, Terminal, Clock } from "lucide-react";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { CodeEditor } from "../../components/CodeEditor";
import ErrorExplainButton from "../../components/ErrorExplainButton";
import { showToast } from "../../lib/toast";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";
import {
  runPlayground,
  tracePlayground,
  savePlaygroundSnippet,
  getPlaygroundSnippet,
  getVisualizerLanguages,
  getMyPlaygroundSnippets,
  normalizePlaygroundLanguage,
  type PlaygroundLanguage,
  type PlaygroundRunResult,
  type PlaygroundSnippetSummary,
  type TraceResult,
} from "../../lib/api/playground";
import {
  JUDGE_LANGUAGE_LABELS,
  JUDGE_ENTRY_FILES,
  enabledJudgeLanguages,
  compilersForFamily,
  defaultCompilerForFamily,
} from "../../lib/judgeLanguages";

// Starter snippets for the common families; others start from an empty buffer.
const STARTERS: Partial<Record<PlaygroundLanguage, string>> = {
  python: "n = 5\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n",
  java: "public class Main {\n  public static void main(String[] args) {\n    int total = 0;\n    for (int i = 1; i <= 5; i++) total += i;\n    System.out.println(total);\n  }\n}\n",
  cpp: "#include <iostream>\nint main(){\n  int total=0;\n  for(int i=1;i<=5;i++) total+=i;\n  std::cout<<total<<std::endl;\n}\n",
  c: "#include <stdio.h>\nint main(){\n  int total=0;\n  for(int i=1;i<=5;i++) total+=i;\n  printf(\"%d\\n\", total);\n  return 0;\n}\n",
  js: "let total = 0;\nfor (let i = 1; i <= 5; i++) total += i;\nconsole.log(total);\n",
  go: "package main\nimport \"fmt\"\nfunc main(){\n  total := 0\n  for i := 1; i <= 5; i++ { total += i }\n  fmt.Println(total)\n}\n",
  rust: "fn main(){\n  let mut total = 0;\n  for i in 1..=5 { total += i; }\n  println!(\"{}\", total);\n}\n",
  ruby: "total = 0\n(1..5).each { |i| total += i }\nputs total\n",
  // Full class form so the starter works under both .NET and Mono.
  csharp: "using System;\nclass Program {\n  static void Main() {\n    int total = 0;\n    for (int i = 1; i <= 5; i++) total += i;\n    Console.WriteLine(total);\n  }\n}\n",
  kotlin: "fun main() {\n  var total = 0\n  for (i in 1..5) total += i\n  println(total)\n}\n",
  pascal: "var i, total: integer;\nbegin\n  total := 0;\n  for i := 1 to 5 do total := total + i;\n  writeln(total);\nend.\n",
  php: "<?php\n$total = 0;\nfor ($i = 1; $i <= 5; $i++) $total += $i;\necho $total, \"\\n\";\n",
  swift: "var total = 0\nfor i in 1...5 { total += i }\nprint(total)\n",
  dart: "void main() {\n  var total = 0;\n  for (var i = 1; i <= 5; i++) total += i;\n  print(total);\n}\n",
};

const starterFor = (lang: PlaygroundLanguage): string => STARTERS[lang] ?? "";

const PANEL = "rounded-xl border border-border bg-bg-surface";
const PANEL_HEAD = "px-5 py-3 border-b border-border text-xs font-mono font-medium uppercase tracking-[0.04em] text-text-secondary flex items-center gap-2";

const PLAYGROUND_LANGS = enabledJudgeLanguages();
const LANG_FILE = JUDGE_ENTRY_FILES;

export const PlaygroundPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ shareId?: string }>();
  const prefersReducedMotion = useReducedMotion();
  const [language, setLanguage] = useState<PlaygroundLanguage>("python");
  const [compiler, setCompiler] = useState<string>(defaultCompilerForFamily("python"));
  const [code, setCode] = useState<string>(starterFor("python"));
  const compilerOptions = compilersForFamily(language);
  const [stdin, setStdin] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [tracing, setTracing] = useState(false);
  const [run, setRun] = useState<PlaygroundRunResult | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [vizLangs, setVizLangs] = useState<string[]>(["python"]);
  const canVisualize = vizLangs.includes(language);
  const [showHistory, setShowHistory] = useState(false);
  const [mySnippets, setMySnippets] = useState<PlaygroundSnippetSummary[] | null>(null);

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && mySnippets === null) setMySnippets(await getMyPlaygroundSnippets());
  };

  useEffect(() => {
    let cancelled = false;
    getVisualizerLanguages().then((l) => { if (!cancelled && l.length) setVizLangs(l); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const shareId = params.shareId;
    if (!shareId) return;
    let cancelled = false;
    getPlaygroundSnippet(shareId)
      .then((s) => {
        if (cancelled) return;
        setLanguage(normalizePlaygroundLanguage(s.language));
        setCode(s.code);
        setStdin(s.stdin ?? "");
      })
      .catch(() => showToast({ type: "error", message: tr("Не вдалося завантажити сніпет.", "Couldn't load the snippet.") }));
    return () => { cancelled = true; };
  }, [params.shareId]);

  const onLanguageChange = (lang: PlaygroundLanguage) => {
    setLanguage(lang);
    setCompiler(defaultCompilerForFamily(lang));
    setTrace(null);
    // Swap in the new starter only if the buffer is empty or still an untouched starter.
    if (!code.trim() || Object.values(STARTERS).includes(code)) setCode(starterFor(lang));
  };

  const doRun = async () => {
    setRunning(true);
    setTrace(null);
    try {
      setRun(await runPlayground({ language, compiler, code, stdin }));
    } catch (e: any) {
      showToast({ type: "error", message: e?.response?.data?.message || tr("Помилка запуску.", "Run failed.") });
    } finally {
      setRunning(false);
    }
  };

  const doTrace = async () => {
    setTracing(true);
    try {
      const t = await tracePlayground({ language, code, stdin });
      setTrace(t);
      setStepIdx(0);
      setRun({ stdout: t.programOutput, stderr: t.stderr, exitCode: t.ok ? 0 : 1, success: t.ok });
    } catch (e: any) {
      showToast({ type: "error", message: e?.response?.data?.message || tr("Не вдалося трасувати.", "Trace failed.") });
    } finally {
      setTracing(false);
    }
  };

  const doShare = async () => {
    try {
      const { shareId } = await savePlaygroundSnippet({ language, code, stdin });
      const url = `${window.location.origin}/playground/${shareId}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      setMySnippets(null); // invalidate history cache so the new snippet shows next open
      showToast({ type: "success", message: tr("Лінк скопійовано: ", "Link copied: ") + url });
    } catch {
      showToast({ type: "error", message: tr("Не вдалося поділитися.", "Couldn't share.") });
    }
  };

  const codeLines = useMemo(() => code.replace(/\r\n?/g, "\n").split("\n"), [code]);
  const currentStep = trace && trace.steps.length ? trace.steps[Math.min(stepIdx, trace.steps.length - 1)] : null;

  // Render a trace value to a short string, resolving heap references (Python heap model).
  // `{ref:id}` → the heap object's compact form, with a #id badge so aliasing is visible.
  // Non-Python tracers inline values directly, so those just stringify.
  const renderValue = (v: unknown, heap: Record<string, any> | undefined, depth = 0): string => {
    if (v === null || v === undefined) return "None";
    if (typeof v === "object" && v !== null && "ref" in (v as any)) {
      const id = String((v as any).ref);
      const obj = heap?.[id];
      if (!obj || depth > 2) return `#${id}`;
      const tag = `#${id}`;
      const child = (x: unknown) => renderValue(x, heap, depth + 1);
      if (obj.kind === "list" || obj.kind === "tuple" || obj.kind === "set") {
        const open = obj.kind === "list" ? "[" : obj.kind === "set" ? "{" : "(";
        const close = obj.kind === "list" ? "]" : obj.kind === "set" ? "}" : ")";
        return `${open}${(obj.items || []).map(child).join(", ")}${close} ${tag}`;
      }
      if (obj.kind === "dict") {
        return `{${(obj.entries || []).map(([k, val]: [string, unknown]) => `${k}: ${child(val)}`).join(", ")}} ${tag}`;
      }
      if (obj.repr) return `${obj.repr} ${tag}`;
      return `${obj.type || "object"}(${(obj.attrs || []).map(([k, val]: [string, unknown]) => `${k}=${child(val)}`).join(", ")}) ${tag}`;
    }
    if (typeof v === "string") return JSON.stringify(v);
    return String(v);
  };

  const selectCls = "bg-bg-base border border-border text-text-primary px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary";

  return (
    <div className="px-4 md:px-8 pt-8 pb-6 max-w-6xl mx-auto space-y-8">
      {/* Hero */}
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <PageEyebrow label={tr("Пісочниця", "Playground")} />
          <div className="mt-2 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{tr("Пісочниця коду", "Code Playground")}</h1>
          </div>
          <p className="mt-1.5 text-sm text-text-secondary max-w-xl">
            {tr("Запускай код, візуалізуй виконання покроково і ділись лінком.", "Run code, step through execution, and share a link.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={language} onChange={(e) => onLanguageChange(e.target.value as PlaygroundLanguage)} className={selectCls}>
            {PLAYGROUND_LANGS.map((l) => (
              <option key={l} value={l}>{JUDGE_LANGUAGE_LABELS[l]}</option>
            ))}
          </select>
          {compilerOptions.length > 1 && (
            <select value={compiler} onChange={(e) => setCompiler(e.target.value)} className={selectCls} aria-label={tr("Компілятор / версія", "Compiler / version")}>
              {compilerOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          )}
          <Button variant="primary" onClick={doRun} disabled={running || tracing}>
            <Play className="w-4 h-4 mr-2" />
            {running ? tr("Запуск…", "Running…") : tr("Запустити", "Run")}
          </Button>
          {canVisualize && (
            <Button variant="secondary" onClick={doTrace} disabled={running || tracing}>
              <Microscope className="w-4 h-4 mr-2" />
              {tracing ? tr("Трасування…", "Tracing…") : tr("Візуалізувати", "Visualize")}
            </Button>
          )}
          <Button variant="ghost" onClick={doShare}>
            <Link2 className="w-4 h-4 mr-2" />
            {tr("Поділитися", "Share")}
          </Button>
          <div className="relative">
            <Button variant="ghost" onClick={toggleHistory}>
              <Clock className="w-4 h-4 mr-2" />
              {tr("Історія", "History")}
            </Button>
            {showHistory && (
              <div className="absolute right-0 z-20 mt-2 w-72 max-h-80 overflow-auto rounded-xl border border-border bg-bg-surface shadow-lg p-2">
                {mySnippets === null ? (
                  <div className="text-sm text-text-secondary p-2">{tr("Завантаження…", "Loading…")}</div>
                ) : mySnippets.length === 0 ? (
                  <div className="text-sm text-text-secondary p-2">{tr("Ще немає збережених сніпетів.", "No saved snippets yet.")}</div>
                ) : (
                  mySnippets.map((s) => (
                    <button
                      key={s.shareId}
                      onClick={() => { setShowHistory(false); navigate(`/playground/${s.shareId}`); }}
                      className="w-full text-left px-2 py-2 rounded-lg hover:bg-bg-hover flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-sm text-text-primary">{s.title || tr("Без назви", "Untitled")}</span>
                      <span className="text-[10px] font-mono uppercase text-text-muted shrink-0">{JUDGE_LANGUAGE_LABELS[s.language as PlaygroundLanguage] || s.language}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      {/* Editor + IO */}
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? undefined : "initial"}
        animate={prefersReducedMotion ? undefined : "animate"}
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-5"
      >
        <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className={`${PANEL} overflow-hidden h-[480px]`}>
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-bg-hover/40">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
            </span>
            <span className="ml-2 text-xs font-mono text-text-secondary">{LANG_FILE[language]}</span>
            <span className="ml-auto text-[10px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Редактор", "Editor")}</span>
          </div>
          <div className="h-[calc(480px-41px)]">
            <CodeEditor language={language} value={code} onChange={setCode} />
          </div>
        </motion.div>

        <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="flex flex-col gap-5">
          <div className={PANEL}>
            <div className={PANEL_HEAD}>{tr("Ввід (stdin)", "Input (stdin)")}</div>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              className="w-full bg-bg-base text-text-primary px-4 py-3 font-mono text-sm min-h-[110px] focus:outline-none resize-y rounded-b-xl"
              placeholder={tr("Дані, які отримає програма…", "Data the program will read…")}
            />
          </div>

          <div className={`${PANEL} flex-1 overflow-hidden`}>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-bg-hover/40">
              <Terminal className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Вивід", "Output")}</span>
              {run && (
                <span className="ml-auto font-mono text-xs text-text-secondary flex items-center gap-2">
                  {typeof run.timeMs === "number" && (
                    <span title={tr("Час виконання", "Run time")}>{run.timeMs} ms</span>
                  )}
                  {typeof run.memoryKb === "number" && (
                    <span title={tr("Пік пам'яті", "Peak memory")}>
                      {run.memoryKb >= 1024 ? `${(run.memoryKb / 1024).toFixed(1)} MB` : `${run.memoryKb} KB`}
                    </span>
                  )}
                  <span>exit={run.exitCode} {run.success ? <span className="text-accent-success">✓</span> : <span className="text-accent-error">✗</span>}</span>
                </span>
              )}
            </div>
            <div className="p-4 min-h-[110px] bg-bg-code font-mono">
              {!run && <div className="text-sm text-text-secondary">{tr("Натисни «Запустити», щоб побачити результат.", "Press “Run” to see the result.")}</div>}
              {run?.stdout && <pre className="text-sm text-text-primary whitespace-pre-wrap break-words">{run.stdout}</pre>}
              {run?.stderr && <pre className="text-sm text-accent-error whitespace-pre-wrap break-words mt-2">{run.stderr}</pre>}
              {run && !run.stdout && !run.stderr && <div className="text-sm text-text-secondary">{tr("(порожній вивід)", "(empty output)")}</div>}
              {run && !run.success && (run.stderr || run.exitCode !== 0) && (
                <div className="mt-3">
                  <ErrorExplainButton
                    language={language.toUpperCase()}
                    code={code}
                    verdict={run.success ? "AC" : "RE"}
                    stderr={run.stderr}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Visualizer */}
      {trace && (
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: easeOutQuint }}
          className={PANEL}
        >
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-[0.04em] text-text-secondary">
              <Microscope className="w-4 h-4 text-primary" />
              {tr("Візуалізатор виконання", "Execution visualizer")}
              <span className="normal-case tracking-normal">· {tr("крок", "step")} {trace.steps.length ? stepIdx + 1 : 0}/{trace.steps.length}{trace.truncated ? tr(" (обрізано)", " (truncated)") : ""}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx <= 0}>◀</Button>
              <input
                type="range"
                min={0}
                max={Math.max(0, trace.steps.length - 1)}
                value={Math.min(stepIdx, Math.max(0, trace.steps.length - 1))}
                onChange={(e) => setStepIdx(Number(e.target.value))}
                className="w-44 accent-primary"
              />
              <Button variant="ghost" size="sm" onClick={() => setStepIdx((i) => Math.min(trace.steps.length - 1, i + 1))} disabled={stepIdx >= trace.steps.length - 1}>▶</Button>
            </div>
          </div>

          {trace.steps.length === 0 ? (
            <div className="p-5 text-sm font-mono text-text-secondary">{tr("Кроків не зафіксовано (можлива помилка до виконання).", "No steps recorded (maybe an error before execution).")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5">
              <pre className="text-sm font-mono leading-relaxed overflow-auto max-h-80 bg-bg-code p-3 rounded-lg border border-border">
                {codeLines.map((ln, i) => {
                  const isCur = currentStep?.line === i + 1;
                  return (
                    <div key={i} className={isCur ? "bg-primary/15 text-text-primary" : "text-text-secondary"}>
                      <span className="inline-block w-8 text-right pr-2 opacity-50">{i + 1}</span>
                      {isCur ? "▶ " : "  "}{ln || " "}
                    </div>
                  );
                })}
              </pre>
              <div className="text-sm font-mono">
                <div className="text-text-secondary mb-2 text-xs uppercase tracking-[0.04em]">{tr("Стек викликів", "Call stack")}</div>
                <div className="border border-border bg-bg-code rounded-lg p-3 max-h-80 overflow-auto space-y-3">
                  {(() => {
                    // Prefer the call stack; fall back to flat locals (older traces).
                    const frames = currentStep?.stack && currentStep.stack.length
                      ? currentStep.stack
                      : currentStep
                        ? [{ func: "<module>", line: currentStep.line, locals: currentStep.locals }]
                        : [];
                    if (!frames.length) return <div className="text-text-secondary">{tr("(немає кадрів)", "(no frames)")}</div>;
                    // Top frame (current) first.
                    return [...frames].reverse().map((fr, idx) => {
                      const isTop = idx === 0;
                      const entries = Object.entries(fr.locals || {});
                      return (
                        <div key={idx} className={`rounded-lg border ${isTop ? "border-primary/50 bg-primary/5" : "border-border/50"} p-2`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={isTop ? "text-primary font-medium" : "text-text-secondary"}>
                              {fr.func === "<module>" ? tr("(модуль)", "(module)") : `${fr.func}()`}
                            </span>
                            <span className="text-[10px] text-text-muted">{tr("рядок", "line")} {fr.line}</span>
                          </div>
                          {entries.length > 0 ? (
                            entries.map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-3 border-b border-border/30 py-1 last:border-b-0">
                                <span className="text-primary/90">{k}</span>
                                <span className="text-text-primary break-all text-right">{renderValue(v, currentStep?.heap)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-text-secondary text-xs">{tr("(немає локальних)", "(no locals)")}</div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default PlaygroundPage;
