import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { authRequired, authOptional, AuthRequest } from "../middleware/authMiddleware";
import { submissionRateLimitMiddleware } from "../middleware/submissionRateLimit";
import { PlaygroundSnippet } from "../entities/PlaygroundSnippet";
import { executeCodeWithInput, COMPILER_CATALOGUE, type ExecLanguage } from "../services/codeExecutionService";
import { generateShareId, isValidShareId } from "../services/playground/shareId";
import { buildPythonTracerScript, parseTraceOutput, DEFAULT_MAX_STEPS } from "../services/visualizer/pythonTracer";
import { logger } from "../utils/logger";

const router = Router();
const snippetRepo = () => AppDataSource.getRepository(PlaygroundSnippet);

const MAX_CODE = 100_000;
const MAX_STDIN = 100_000;

function normLang(raw: unknown): "JAVA" | "PYTHON" | "CPP" | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return s === "JAVA" || s === "PYTHON" || s === "CPP" ? s : null;
}

// Languages runnable via the playground "/run" endpoint. Accepts the legacy uppercase
// trio (JAVA/PYTHON/CPP) and every lower-case judge family. Snippet storage stays on the
// legacy trio (see normLang) to avoid a DB enum migration.
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
    });
  } catch (error: any) {
    const status = Number(error?.statusCode ?? error?.status ?? 503);
    logger.warn("[playground] run failed", { requestId: req.requestId, error: error?.message });
    return res.status(Number.isFinite(status) ? status : 503).json({ message: error?.message || "RUN_FAILED" });
  }
});

// Execution visualizer (Python only): run code under a line tracer in the
// sandbox and return per-step (line, locals) for step-through visualization.
router.post("/trace", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const language = normLang(b.language);
    if (language !== "PYTHON") return res.status(400).json({ message: "TRACE_PYTHON_ONLY" });
    const code = String(b.code ?? "");
    if (!code.trim()) return res.status(400).json({ message: "CODE_REQUIRED" });
    if (code.length > 50_000) return res.status(413).json({ message: "CODE_TOO_LARGE" });
    const stdin = String(b.stdin ?? "").slice(0, MAX_STDIN);
    const MAX_ALLOWED_STEPS = 2000;
    const maxSteps = Math.min(MAX_ALLOWED_STEPS, Number.isFinite(Number(b.maxSteps)) ? Number(b.maxSteps) : DEFAULT_MAX_STEPS);

    const script = buildPythonTracerScript(code, maxSteps);
    const result = await executeCodeWithInput(script, "PYTHON", stdin, 10_000);
    const trace = parseTraceOutput(result.stdout);

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
