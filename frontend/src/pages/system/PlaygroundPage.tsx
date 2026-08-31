import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, FlaskConical, Link2, Microscope, Play, Terminal } from "lucide-react";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { CodeEditor } from "../../components/CodeEditor";
import ErrorExplainButton from "../../components/ErrorExplainButton";
import { showToast } from "../../lib/toast";
import {
  getMyPlaygroundSnippets,
  getPlaygroundSnippet,
  getVisualizerLanguages,
  normalizePlaygroundLanguage,
  runPlayground,
  savePlaygroundSnippet,
  tracePlayground,
  type PlaygroundLanguage,
  type PlaygroundRunResult,
  type PlaygroundSnippetSummary,
  type TraceResult,
} from "../../lib/api/playground";
import {
  compilersForFamily,
  defaultCompilerForFamily,
  enabledJudgeLanguages,
  JUDGE_ENTRY_FILES,
  JUDGE_LANGUAGE_LABELS,
} from "../../lib/judgeLanguages";

const STARTERS: Partial<Record<PlaygroundLanguage, string>> = {
  python: "n = 5\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n",
  java: "public class Main {\n  public static void main(String[] args) {\n    int total = 0;\n    for (int i = 1; i <= 5; i++) total += i;\n    System.out.println(total);\n  }\n}\n",
  cpp: "#include <iostream>\nint main(){\n  int total=0;\n  for(int i=1;i<=5;i++) total+=i;\n  std::cout<<total<<std::endl;\n}\n",
  c: "#include <stdio.h>\nint main(){\n  int total=0;\n  for(int i=1;i<=5;i++) total+=i;\n  printf(\"%d\\n\", total);\n  return 0;\n}\n",
  js: "let total = 0;\nfor (let i = 1; i <= 5; i++) total += i;\nconsole.log(total);\n",
  go: "package main\nimport \"fmt\"\nfunc main(){\n  total := 0\n  for i := 1; i <= 5; i++ { total += i }\n  fmt.Println(total)\n}\n",
  rust: "fn main(){\n  let mut total = 0;\n  for i in 1..=5 { total += i; }\n  println!(\"{}\", total);\n}\n",
  ruby: "total = 0\n(1..5).each { |i| total += i }\nputs total\n",
  csharp: "using System;\nclass Program {\n  static void Main() {\n    int total = 0;\n    for (int i = 1; i <= 5; i++) total += i;\n    Console.WriteLine(total);\n  }\n}\n",
  kotlin: "fun main() {\n  var total = 0\n  for (i in 1..5) total += i\n  println(total)\n}\n",
  pascal: "var i, total: integer;\nbegin\n  total := 0;\n  for i := 1 to 5 do total := total + i;\n  writeln(total);\nend.\n",
  php: "<?php\n$total = 0;\nfor ($i = 1; $i <= 5; $i++) $total += $i;\necho $total, \"\\n\";\n",
  swift: "var total = 0\nfor i in 1...5 { total += i }\nprint(total)\n",
  dart: "void main() {\n  var total = 0;\n  for (var i = 1; i <= 5; i++) total += i;\n  print(total);\n}\n",
};

const PLAYGROUND_LANGS = enabledJudgeLanguages();
const starterFor = (lang: PlaygroundLanguage): string => STARTERS[lang] ?? "";
const isDevPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const previewSnippets: PlaygroundSnippetSummary[] = [
  { shareId: "spring-loop", language: "python", title: "Сума від 1 до n", createdAt: "2026-07-10T09:00:00.000Z" },
  { shareId: "palindrome", language: "python", title: "Перевірка паліндрому", createdAt: "2026-07-07T12:00:00.000Z" },
];

export const PlaygroundPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ shareId?: string }>();
  const [language, setLanguage] = useState<PlaygroundLanguage>("python");
  const [compiler, setCompiler] = useState<string>(defaultCompilerForFamily("python"));
  const [code, setCode] = useState<string>(starterFor("python"));
  const [stdin, setStdin] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [tracing, setTracing] = useState(false);
  const [run, setRun] = useState<PlaygroundRunResult | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [vizLangs, setVizLangs] = useState<string[]>(["python"]);
  const [showHistory, setShowHistory] = useState(false);
  const [mySnippets, setMySnippets] = useState<PlaygroundSnippetSummary[] | null>(null);

  const compilerOptions = compilersForFamily(language);
  const canVisualize = vizLangs.includes(language);
  const codeLines = useMemo(() => code.replace(/\r\n?/g, "\n").split("\n"), [code]);
  const currentStep = trace && trace.steps.length ? trace.steps[Math.min(stepIdx, trace.steps.length - 1)] : null;

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && mySnippets === null) {
      try {
        setMySnippets(isDevPreview() ? previewSnippets : await getMyPlaygroundSnippets());
      } catch {
        setMySnippets([]);
        showToast({ type: "error", message: tr("Не вдалося завантажити історію.", "Couldn't load history.") });
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (isDevPreview()) {
      setVizLangs(["python", "java", "cpp"]);
      return () => { cancelled = true; };
    }
    getVisualizerLanguages()
      .then((languages) => {
        if (!cancelled && languages.length) setVizLangs(languages);
      })
      .catch(() => showToast({ type: "error", message: tr("Не вдалося завантажити мови візуалізації.", "Couldn't load visualizer languages.") }));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const shareId = params.shareId;
    if (!shareId) return;
    let cancelled = false;
    if (isDevPreview()) {
      setLanguage("python");
      setCompiler(defaultCompilerForFamily("python"));
      setCode("text = input().strip().lower()\nprint(text == text[::-1])\n");
      setStdin("Level\n");
      return () => { cancelled = true; };
    }
    getPlaygroundSnippet(shareId)
      .then((snippet) => {
        if (cancelled) return;
        const normalized = normalizePlaygroundLanguage(snippet.language);
        setLanguage(normalized);
        setCompiler(defaultCompilerForFamily(normalized));
        setCode(snippet.code);
        setStdin(snippet.stdin ?? "");
      })
      .catch(() => showToast({ type: "error", message: tr("Не вдалося завантажити сніпет.", "Couldn't load the snippet.") }));
    return () => { cancelled = true; };
  }, [params.shareId]);

  const onLanguageChange = (lang: PlaygroundLanguage) => {
    setLanguage(lang);
    setCompiler(defaultCompilerForFamily(lang));
    setTrace(null);
    setStepIdx(0);
    if (!code.trim() || Object.values(STARTERS).includes(code)) setCode(starterFor(lang));
  };

  const doRun = async () => {
    setRunning(true);
    setTrace(null);
    if (isDevPreview()) {
      window.setTimeout(() => {
        setRun({ stdout: "15\n", stderr: "", exitCode: 0, success: true, timeMs: 18, memoryKb: 8240 });
        setRunning(false);
      }, 180);
      return;
    }
    try {
      setRun(await runPlayground({ language, compiler, code, stdin }));
    } catch (cause: any) {
      showToast({ type: "error", message: cause?.response?.data?.message || tr("Помилка запуску.", "Run failed.") });
    } finally {
      setRunning(false);
    }
  };

  const doTrace = async () => {
    setTracing(true);
    if (isDevPreview()) {
      const demoTrace: TraceResult = {
        ok: true,
        truncated: false,
        programOutput: "15\n",
        stderr: "",
        steps: [{ line: 1, event: "call", locals: {} }, { line: 3, event: "line", locals: { total: 15, n: 5 } }],
      };
      window.setTimeout(() => {
        setTrace(demoTrace);
        setStepIdx(0);
        setRun({ stdout: demoTrace.programOutput, stderr: "", exitCode: 0, success: true, timeMs: 18, memoryKb: 8240 });
        setTracing(false);
      }, 180);
      return;
    }
    try {
      const result = await tracePlayground({ language, code, stdin });
      setTrace(result);
      setStepIdx(0);
      setRun({ stdout: result.programOutput, stderr: result.stderr, exitCode: result.ok ? 0 : 1, success: result.ok });
    } catch (cause: any) {
      showToast({ type: "error", message: cause?.response?.data?.message || tr("Не вдалося трасувати.", "Trace failed.") });
    } finally {
      setTracing(false);
    }
  };

  const doShare = async () => {
    if (isDevPreview()) {
      const url = `${window.location.origin}/playground/spring-loop?preview=true`;
      try { await navigator.clipboard.writeText(url); } catch {}
      showToast({ type: "success", message: tr("Посилання скопійовано", "Link copied") });
      return;
    }
    try {
      const { shareId } = await savePlaygroundSnippet({ language, code, stdin });
      const url = `${window.location.origin}/playground/${shareId}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      setMySnippets(null);
      showToast({ type: "success", message: tr("Лінк скопійовано: ", "Link copied: ") + url });
    } catch {
      showToast({ type: "error", message: tr("Не вдалося поділитися.", "Couldn't share.") });
    }
  };

  const renderValue = (value: unknown, heap: Record<string, any> | undefined, depth = 0): string => {
    if (value === null || value === undefined) return "None";
    if (typeof value === "object" && "ref" in (value as any)) {
      const id = String((value as any).ref);
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
    if (typeof value === "string") return JSON.stringify(value);
    return String(value);
  };

  const selectCls = "w-full rounded-xl border border-border bg-bg-base/70 px-3 py-3 text-sm text-text-primary outline-none transition-[border-color,background-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/20";
  const statusLabel = running ? tr("Запуск", "Running") : tracing ? tr("Візуалізація", "Tracing") : run ? (run.success ? tr("Успішно", "Success") : tr("Помилка", "Error")) : tr("Готово", "Ready");
  const frames = currentStep?.stack && currentStep.stack.length
    ? currentStep.stack
    : currentStep
      ? [{ func: "<module>", line: currentStep.line, locals: currentStep.locals }]
      : [];

  return (
    <div className="min-h-[100dvh] bg-[#f3f5ef] px-3 py-4 text-[#101812] dark:bg-[#07100a] dark:text-[#ecf5ee] sm:px-5 lg:px-8">
      <div className="mx-auto flex max-w-[1900px] flex-col gap-5">
        <section className="relative overflow-visible rounded-[34px] border border-[#132019]/10 bg-[#101812] px-5 py-5 text-white shadow-[0_28px_90px_rgba(8,24,14,.18)] dark:border-white/10 sm:px-7">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#00d978]/15 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-2 text-sm text-text-secondary transition hover:text-text-primary">
                <ArrowLeft className="h-4 w-4" />
                {tr("Назад", "Back")}
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <FlaskConical className="h-3.5 w-3.5" />
                  {tr("Playground", "Playground")}
                </span>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-mono ${run?.success ? "border-accent-success/45 bg-accent-success/10 text-accent-success" : run ? "border-accent-error/45 bg-accent-error/10 text-accent-error" : "border-border/70 bg-bg-base/70 text-text-secondary"}`}>
                  {statusLabel}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary sm:text-3xl">
                {tr("Лабораторія коду", "Code laboratory")}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                {tr("Пиши, запускай, дивись stdout/stderr і покрокову трасу в одному екрані — без зайвої обкладинки.", "Write, run, inspect stdout/stderr and step traces on one screen — no extra cover page.")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="primary" onClick={doRun} disabled={running || tracing}>
                <Play className="mr-2 h-4 w-4" />
                {running ? tr("Запуск…", "Running…") : tr("Запустити", "Run")}
              </Button>
              {canVisualize && (
                <Button variant="secondary" onClick={doTrace} disabled={running || tracing}>
                  <Microscope className="mr-2 h-4 w-4" />
                  {tracing ? tr("Трасування…", "Tracing…") : tr("Візуалізувати", "Visualize")}
                </Button>
              )}
              <Button variant="ghost" onClick={doShare}>
                <Link2 className="mr-2 h-4 w-4" />
                {tr("Поділитися", "Share")}
              </Button>
              <div className="relative">
                <Button variant="ghost" onClick={toggleHistory}>
                  <Clock className="mr-2 h-4 w-4" />
                  {tr("Історія", "History")}
                </Button>
                {showHistory && (
                  <div className="absolute right-0 z-30 mt-2 max-h-80 w-80 overflow-auto rounded-2xl border border-border bg-bg-surface p-2 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
                    {mySnippets === null ? (
                      <div className="p-3 text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</div>
                    ) : mySnippets.length === 0 ? (
                      <div className="p-3 text-sm text-text-secondary">{tr("Ще немає збережених сніпетів.", "No saved snippets yet.")}</div>
                    ) : (
                      mySnippets.map((snippet) => (
                        <button type="button"
                          key={snippet.shareId}
                          onClick={() => { setShowHistory(false); navigate(`/playground/${snippet.shareId}`); }}
                          className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-bg-hover"
                        >
                          <span className="truncate text-sm text-text-primary">{snippet.title || tr("Без назви", "Untitled")}</span>
                          <span className="shrink-0 text-[10px] font-mono uppercase text-text-muted">{JUDGE_LANGUAGE_LABELS[snippet.language as PlaygroundLanguage] || snippet.language}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid min-h-[720px] grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)_460px]">
          <aside className="order-2 flex flex-col gap-4 rounded-[30px] border border-[#132019]/10 bg-white p-4 shadow-[0_18px_60px_rgba(18,32,23,.07)] dark:border-white/10 dark:bg-[#111a14] xl:order-1">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{tr("Мова", "Language")}</div>
              <label htmlFor="playground-language" className="sr-only">Language</label><select id="playground-language" name="language" value={language} onChange={(event) => onLanguageChange(event.target.value as PlaygroundLanguage)} className={selectCls}>
                {PLAYGROUND_LANGS.map((lang) => (
                  <option key={lang} value={lang}>{JUDGE_LANGUAGE_LABELS[lang]}</option>
                ))}
              </select>
            </div>

            {compilerOptions.length > 1 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{tr("Компілятор", "Compiler")}</div>
                <label htmlFor="playground-runtime" className="sr-only">Runtime</label><select id="playground-runtime" name="runtime" value={compiler} onChange={(event) => setCompiler(event.target.value)} className={selectCls}>
                  {compilerOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-2xl border border-border/70 bg-bg-base/55 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">stdin</span>
                <span className="text-[11px] text-text-secondary">{JUDGE_ENTRY_FILES[language]}</span>
              </div>
              <label htmlFor="playground-stdin" className="sr-only">{tr("Вхідні дані", "Input")}</label><textarea id="playground-stdin" name="stdin"
                value={stdin}
                onChange={(event) => setStdin(event.target.value)}
                className="min-h-[160px] w-full resize-y rounded-xl border border-border bg-bg-code/80 px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-primary"
                placeholder={tr("Дані, які програма читає з вводу…", "Data the program reads from input…")}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={doRun} disabled={running || tracing} className="h-12 justify-center rounded-xl px-4 text-base shadow-[0_10px_24px_-16px_rgba(0,217,120,.9)]">
                <Play className="mr-2 h-4 w-4" />
                Run
              </Button>
              <Button variant="secondary" onClick={doTrace} disabled={!canVisualize || running || tracing} className="h-12 justify-center rounded-xl border border-border bg-bg-hover text-base text-text-primary hover:bg-bg-surface dark:bg-[#16251b] dark:text-[#dcece0] dark:hover:bg-[#203429]">
                <Microscope className="mr-2 h-4 w-4" />
                Trace
              </Button>
            </div>

            <div className="mt-auto rounded-2xl border border-border/70 bg-bg-base/55 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Terminal className="h-4 w-4 text-primary" />
                {tr("Швидкий стан", "Quick status")}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-border/60 bg-bg-surface/70 p-2">
                  <div className="text-text-muted">exit</div>
                  <div className="mt-1 font-mono text-text-primary">{run ? run.exitCode : "—"}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-bg-surface/70 p-2">
                  <div className="text-text-muted">{tr("час", "time")}</div>
                  <div className="mt-1 font-mono text-text-primary">{typeof run?.timeMs === "number" ? `${run.timeMs} ms` : "—"}</div>
                </div>
              </div>
            </div>
          </aside>

          <main className="order-1 overflow-hidden rounded-[30px] border border-[#132019]/10 bg-white shadow-[0_18px_60px_rgba(18,32,23,.07)] dark:border-white/10 dark:bg-[#111a14] xl:order-2">
            <div className="flex items-center gap-2 border-b border-border/70 bg-bg-hover/35 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-accent-error/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-accent-warn/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-accent-success/70" />
              <span className="ml-2 truncate text-xs font-mono text-text-secondary">{JUDGE_ENTRY_FILES[language]}</span>
              <Button variant="primary" onClick={doRun} disabled={running || tracing} className="ml-auto h-9 shrink-0 px-3 text-xs md:hidden">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {running ? tr("Запуск…", "Running…") : tr("Запустити", "Run")}
              </Button>
              <span className="ml-auto hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted md:inline">{tr("Редактор", "Editor")}</span>
            </div>
            <div className="h-[calc(100%-49px)] min-h-[520px] sm:min-h-[620px]">
              <CodeEditor language={language} value={code} onChange={setCode} />
            </div>
          </main>

          <aside className="order-3 flex min-h-0 flex-col gap-4 xl:min-h-[720px] xl:order-3">
            <section className="overflow-hidden rounded-[30px] border border-[#132019]/10 bg-white shadow-[0_18px_60px_rgba(18,32,23,.07)] dark:border-white/10 dark:bg-[#111a14]">
              <div className="flex items-center gap-2 border-b border-border/70 bg-bg-hover/35 px-4 py-3">
                <Terminal className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{tr("Вивід", "Output")}</span>
                {run && (
                  <span className="ml-auto text-xs font-mono text-text-secondary">
                    {run.success ? "✓" : "✕"} exit={run.exitCode}
                  </span>
                )}
              </div>
              <div className="min-h-[190px] bg-bg-code/85 p-4 font-mono">
                {!run && <div className="text-sm text-text-secondary">{tr("Натисни «Запустити», щоб побачити результат.", "Press “Run” to see the result.")}</div>}
                {run?.stdout && <pre className="whitespace-pre-wrap break-words text-sm text-text-primary">{run.stdout}</pre>}
                {run?.stderr && <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-accent-error">{run.stderr}</pre>}
                {run && !run.stdout && !run.stderr && <div className="text-sm text-text-secondary">{tr("(порожній вивід)", "(empty output)")}</div>}
                {run && !run.success && (run.stderr || run.exitCode !== 0) && (
                  <div className="mt-3">
                    <ErrorExplainButton language={language.toUpperCase()} code={code} verdict={run.success ? "AC" : "RE"} stderr={run.stderr} />
                  </div>
                )}
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-[#132019]/10 bg-white shadow-[0_18px_60px_rgba(18,32,23,.07)] dark:border-white/10 dark:bg-[#111a14]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-bg-hover/35 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Microscope className="h-4 w-4 text-primary" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{tr("Візуалізація", "Visualizer")}</span>
                </div>
                {trace && (
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40" onClick={() => setStepIdx((index) => Math.max(0, index - 1))} disabled={stepIdx <= 0}>◀</button>
                    <label htmlFor="playground-trace-step" className="sr-only">{tr("Крок трасування", "Trace step")}</label>
                    <input
                      id="playground-trace-step"
                      name="traceStep"
                      type="range"
                      min={0}
                      max={Math.max(0, trace.steps.length - 1)}
                      value={Math.min(stepIdx, Math.max(0, trace.steps.length - 1))}
                      onChange={(event) => setStepIdx(Number(event.target.value))}
                      className="w-28 accent-primary"
                    />
                    <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40" onClick={() => setStepIdx((index) => Math.min(trace.steps.length - 1, index + 1))} disabled={stepIdx >= trace.steps.length - 1}>▶</button>
                  </div>
                )}
              </div>

              {!trace ? (
                <div className="grid flex-1 place-items-center p-6 text-center">
                  <div>
                    <Microscope className="mx-auto h-8 w-8 text-text-muted" />
                    <div className="mt-3 text-sm text-text-secondary">
                      {canVisualize ? tr("Натисни «Візуалізувати», щоб пройти код покроково.", "Press “Visualize” to step through code.") : tr("Для цієї мови покрокова візуалізація поки недоступна.", "Step visualization is not available for this language yet.")}
                    </div>
                  </div>
                </div>
              ) : trace.steps.length === 0 ? (
                <div className="p-5 text-sm font-mono text-text-secondary">{tr("Кроків не зафіксовано.", "No steps recorded.")}</div>
              ) : (
                <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,1fr)_minmax(180px,1fr)] gap-3 overflow-auto p-3">
                  <pre className="overflow-auto rounded-2xl border border-border bg-bg-code p-3 text-sm font-mono leading-relaxed">
                    {codeLines.map((line, index) => {
                      const isCurrent = currentStep?.line === index + 1;
                      return (
                        <div key={index} className={isCurrent ? "rounded bg-primary/15 text-text-primary" : "text-text-secondary"}>
                          <span className="inline-block w-8 pr-2 text-right opacity-50">{index + 1}</span>
                          {isCurrent ? "▶ " : "  "}{line || " "}
                        </div>
                      );
                    })}
                  </pre>
                  <div className="overflow-auto rounded-2xl border border-border bg-bg-code p-3 text-sm font-mono">
                    <div className="mb-2 text-xs uppercase tracking-[0.12em] text-text-muted">
                      {tr("Стек", "Stack")} · {tr("крок", "step")} {stepIdx + 1}/{trace.steps.length}{trace.truncated ? tr(" (обрізано)", " (truncated)") : ""}
                    </div>
                    <div className="space-y-3">
                      {[...frames].reverse().map((frame, index) => {
                        const entries = Object.entries(frame.locals || {});
                        return (
                          <div key={index} className={`rounded-xl border p-2 ${index === 0 ? "border-primary/50 bg-primary/5" : "border-border/50"}`}>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className={index === 0 ? "font-medium text-primary" : "text-text-secondary"}>
                                {frame.func === "<module>" ? tr("(модуль)", "(module)") : `${frame.func}()`}
                              </span>
                              <span className="text-[10px] text-text-muted">{tr("рядок", "line")} {frame.line}</span>
                            </div>
                            {entries.length ? entries.map(([key, value]) => (
                              <div key={key} className="flex justify-between gap-3 border-b border-border/30 py-1 last:border-b-0">
                                <span className="text-primary/90">{key}</span>
                                <span className="break-all text-right text-text-primary">{renderValue(value, currentStep?.heap)}</span>
                              </div>
                            )) : <div className="text-xs text-text-secondary">{tr("(немає локальних)", "(no locals)")}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default PlaygroundPage;
