import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { authRequired, authOptional, AuthRequest } from "../middleware/authMiddleware";
import { submissionRateLimitMiddleware } from "../middleware/submissionRateLimit";
import { PlaygroundSnippet } from "../entities/PlaygroundSnippet";
import { executeCodeWithInput, COMPILER_CATALOGUE, type ExecLanguage } from "../services/codeExecutionService";
import { generateShareId, isValidShareId } from "../services/playground/shareId";
import { parseTraceOutput, DEFAULT_MAX_STEPS } from "../services/visualizer/trace";
import { buildTracer, visualizerLanguages, isGdbTraceLanguage } from "../services/visualizer";
import { judgeWithSemaphore } from "../services/judgeWorker";
import type { JudgeRequest as WorkerJudgeRequest } from "../services/judgeWorker/types";
import { logger } from "../utils/logger";

const router = Router();
const snippetRepo = () => AppDataSource.getRepository(PlaygroundSnippet);

const MAX_CODE = 100_000;
const MAX_STDIN = 100_000;

// Languages runnable via the playground "/run" endpoint. Accepts the legacy uppercase
// trio (JAVA/PYTHON/CPP) and every lower-case judge family. Snippet storage stays on the
// legacy trio to avoid a DB enum migration.
const RUN_LANGUAGES = new Set<ExecLanguage>([
  "JAVA", "PYTHON", "CPP",
  "java", "python", "cpp", "c", "csharp", "kotlin", "js", "go", "rust", "pascal",
  "d", "dart", "haskell", "lisp", "lua", "perl", "php", "ruby", "swift"
]);

function normRunLang(raw: unknown): ExecLanguage | null {
  const s = String(raw ?? "").trim();
  if (RUN_LANGUAGES.has(s.toUpperCase() as ExecLanguage)) return s.toUpperCase() as ExecLanguage;
  if (RUN_LANGUAGES.has(s.toLowerCase() as ExecLanguage)) return s.toLowerCase() as ExecLanguage;
  return null;
}

function normCompiler(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  // Keep it conservative: short, identifier-ish ids only. The judge validates the rest.
  return /^[a-z0-9_+-]{1,32}$/i.test(s) ? s : undefined;
}

// Public catalogue of selectable compilers/versions (picker source).
router.get("/compilers", authOptional, (_req: AuthRequest, res: Response) => {
  return res.json({ compilers: COMPILER_CATALOGUE });
});

// Run arbitrary code through the judge sandbox. Rate-limited.
router.post("/run", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const language = normRunLang(b.language);
    if (!language) return res.status(400).json({ message: "INVALID_LANGUAGE" });
    const compiler = normCompiler(b.compiler);
    const code = String(b.code ?? "");
    if (!code.trim()) return res.status(400).json({ message: "CODE_REQUIRED" });
    if (code.length > MAX_CODE) return res.status(413).json({ message: "CODE_TOO_LARGE" });
    const stdin = String(b.stdin ?? "").slice(0, MAX_STDIN);

    const result = await executeCodeWithInput(code, language, stdin, 10_000, { compiler });
    return res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.success,
      timeMs: result.timeMs ?? null,
      memoryKb: result.memoryKb ?? null,
    });
  } catch (error: any) {
    const status = Number(error?.statusCode ?? error?.status ?? 503);
    logger.warn("[playground] run failed", { requestId: req.requestId, error: error?.message });
    return res.status(Number.isFinite(status) ? status : 503).json({ message: error?.message || "RUN_FAILED" });
  }
});

// Public: which languages support step visualization (gates the Visualize button).
router.get("/visualizer-languages", authOptional, (_req: AuthRequest, res: Response) => {
  return res.json({ languages: visualizerLanguages() });
});

// Execution visualizer: run code under an in-language tracer in the sandbox and return
// per-step call stack + locals for step-through visualization. Supports any language with
// a Tier-A tracer (Python, Ruby, ...); others get TRACE_UNSUPPORTED_LANGUAGE.
router.post("/trace", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const language = normRunLang(b.language);
    if (!language) return res.status(400).json({ message: "INVALID_LANGUAGE" });
    const code = String(b.code ?? "");
    if (!code.trim()) return res.status(400).json({ message: "CODE_REQUIRED" });
    if (code.length > 50_000) return res.status(413).json({ message: "CODE_TOO_LARGE" });
    const stdin = String(b.stdin ?? "").slice(0, MAX_STDIN);
    const MAX_ALLOWED_STEPS = 2000;
    const maxSteps = Math.min(MAX_ALLOWED_STEPS, Number.isFinite(Number(b.maxSteps)) ? Number(b.maxSteps) : DEFAULT_MAX_STEPS);

    // normRunLang may return legacy uppercase (JAVA/PYTHON/CPP); lower-case for the tracer.
    const family = String(language).toLowerCase();

    let traceStdout = "";
    let traceStderr = "";
    const plan = buildTracer(family, code, maxSteps);
    if (plan) {
      // Tier-A: in-language wrapper runs as ordinary source.
      const result = await executeCodeWithInput(plan.source, plan.judgeLanguage, stdin, 10_000);
      traceStdout = result.stdout;
      traceStderr = result.stderr;
    } else if (isGdbTraceLanguage(family)) {
      // Tier-B: compiled language step-traced by gdb inside the judge. Stepping is slow, so
      // give a generous per-test time budget.
      const judgeReq: WorkerJudgeRequest = {
        submission_id: `pg_trace_${family}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        language: family as any,
        source: code,
        tests: [{ id: 1, input: stdin, output: "", hidden: false, group: "trace", weight: 1 }],
        limits: { time_limit_ms: 20_000, memory_limit_mb: 512, output_limit_kb: 1024 },
        checker: { type: "exact" },
        debug: true,
        run_all: true,
        trace: { mode: "step", maxSteps },
      };
      const jr = await judgeWithSemaphore(judgeReq);
      if (jr.verdict === "CE" && jr.compile) {
        const combined = [jr.compile.stderr, jr.compile.stdout].filter(Boolean).join("\n").trim();
        return res.json({ ok: false, steps: [], truncated: false, programOutput: "", stderr: combined || "Compilation error" });
      }
      const t0: any = jr.tests?.[0];
      traceStdout = String(t0?.actual ?? "");
      traceStderr = String(t0?.stderr ?? "");
    } else {
      return res.status(400).json({ message: "TRACE_UNSUPPORTED_LANGUAGE" });
    }

    const trace = parseTraceOutput(traceStdout);
    const result = { stdout: traceStdout, stderr: traceStderr };

    if (!trace) {
      // No trace block → the program errored before tracing completed.
      return res.json({ ok: false, steps: [], truncated: false, programOutput: result.stdout, stderr: result.stderr });
    }
    return res.json({
      ok: true,
      steps: trace.steps,
      truncated: trace.truncated,
      programOutput: trace.programOutput,
      stderr: result.stderr,
    });
  } catch (error: any) {
    const status = Number(error?.statusCode ?? error?.status ?? 503);
    logger.warn("[playground] trace failed", { requestId: req.requestId, error: error?.message });
    return res.status(Number.isFinite(status) ? status : 503).json({ message: error?.message || "TRACE_FAILED" });
  }
});

// List the current principal's saved snippets (newest first). "My snippets" history.
router.get("/snippets", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const principalType = req.userType === "STUDENT" ? "STUDENT" : "USER";
    const principalId = req.principalId ?? (req.userType === "STUDENT" ? req.studentId : req.userId) ?? null;
    if (principalId == null) return res.json({ snippets: [] });
    const rows = await snippetRepo().find({
      where: { principalType, principalId: Number(principalId) } as any,
      order: { createdAt: "DESC" } as any,
      take: 100,
      select: { shareId: true, language: true, title: true, createdAt: true } as any,
    });
    return res.json({
      snippets: rows.map(r => ({ shareId: r.shareId, language: r.language, title: r.title ?? null, createdAt: r.createdAt })),
    });
  } catch (error: any) {
    logger.warn("[playground] snippet list failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "LIST_FAILED" });
  }
});

// Save a shareable snippet → returns its share id.
router.post("/snippets", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    // Snippets accept any runnable judge language (stored as the lowercase family id).
    const language = normRunLang(b.language);
    if (!language) return res.status(400).json({ message: "INVALID_LANGUAGE" });
    const code = String(b.code ?? "");
    if (!code.trim()) return res.status(400).json({ message: "CODE_REQUIRED" });
    if (code.length > MAX_CODE) return res.status(413).json({ message: "CODE_TOO_LARGE" });

    const principalType = req.userType === "STUDENT" ? "STUDENT" : "USER";
    const principalId = req.principalId ?? (req.userType === "STUDENT" ? req.studentId : req.userId) ?? null;

    const snippet = snippetRepo().create({
      shareId: generateShareId(),
      language: String(language).toLowerCase(),
      code,
      stdin: b.stdin == null ? null : String(b.stdin).slice(0, MAX_STDIN),
      title: b.title == null ? null : String(b.title).slice(0, 120),
      principalType,
      principalId: principalId != null ? Number(principalId) : null,
    });
    await snippetRepo().save(snippet);
    return res.status(201).json({ shareId: snippet.shareId });
  } catch (error: any) {
    logger.warn("[playground] snippet save failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "SAVE_FAILED" });
  }
});

// Public: load a shared snippet by id (anyone with the link).
router.get("/snippets/:shareId", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const shareId = String(req.params.shareId ?? "");
    if (!isValidShareId(shareId)) return res.status(400).json({ message: "INVALID_SHARE_ID" });
    const snippet = await snippetRepo().findOne({ where: { shareId } as any });
    if (!snippet) return res.status(404).json({ message: "NOT_FOUND" });
    return res.json({
      shareId: snippet.shareId,
      language: snippet.language,
      code: snippet.code,
      stdin: snippet.stdin ?? "",
      title: snippet.title ?? null,
      createdAt: snippet.createdAt,
    });
  } catch (error: any) {
    logger.warn("[playground] snippet load failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "LOAD_FAILED" });
  }
});

export default router;
