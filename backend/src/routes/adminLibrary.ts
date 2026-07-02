import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { LibraryTask, type LibraryTaskStatus } from "../entities/LibraryTask";
import { TestData } from "../entities/TestData";
import { TaskTheory } from "../entities/TaskTheory";
import { LibraryTaskRevision } from "../entities/LibraryTaskRevision";
import { encodeSnapshot, parseSnapshot } from "../utils/revisionSnapshot";
import { logger } from "../utils/logger";
import type { CheckerSpec } from "../services/judgeWorker/types";
import { chooseDefaultCheckerFromExpectedOutputs } from "../utils/checkerSpec";

const adminLibraryRouter = Router();

const libraryRepo = () => AppDataSource.getRepository(LibraryTask);
const testDataRepo = () => AppDataSource.getRepository(TestData);
const theoryRepo = () => AppDataSource.getRepository(TaskTheory);
const revisionRepo = () => AppDataSource.getRepository(LibraryTaskRevision);

const ALL_JUDGE_LANGS = ["java", "python", "cpp", "c", "csharp", "kotlin"] as const;

type JudgeLanguage = typeof ALL_JUDGE_LANGS[number];

function parseDisabledJudgeLanguagesEnv(): Set<JudgeLanguage> {
  const raw = String(process.env.JUDGE_DISABLED_LANGUAGES ?? process.env.DISABLED_JUDGE_LANGUAGES ?? "").trim();
  if (!raw) return new Set();
  const parts = raw
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const disabled = new Set<JudgeLanguage>();
  for (const p of parts) {
    if ((ALL_JUDGE_LANGS as readonly string[]).includes(p)) disabled.add(p as JudgeLanguage);
  }
  return disabled;
}

const DISABLED_JUDGE_LANGS = parseDisabledJudgeLanguagesEnv();

function filterEnabledJudgeLanguages(langs: JudgeLanguage[]): JudgeLanguage[] {
  if (DISABLED_JUDGE_LANGS.size === 0) return langs;
  return langs.filter(l => !DISABLED_JUDGE_LANGS.has(l));
}

// Legacy: base language is not used to pick a default judge language anymore.

function getAllowedJudgeLanguages(task: LibraryTask): Array<"java" | "python" | "cpp" | "c" | "csharp" | "kotlin"> {
  const raw = Array.isArray((task as any).allowedLanguages) ? (task as any).allowedLanguages : null;
  const normalized = (raw || [])
    .map((x: any) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set<string>();
  for (const x of normalized) {
    if (["java", "python", "cpp", "c", "csharp", "kotlin"].includes(x)) allowed.add(x);
  }
  if (allowed.size > 0) {
    const filtered = filterEnabledJudgeLanguages(Array.from(allowed) as any);
    if (filtered.length > 0) return filtered as any;
    const fallback = filterEnabledJudgeLanguages(Array.from(ALL_JUDGE_LANGS) as any);
    return (fallback.length > 0 ? fallback : (["java"] as any)) as any;
  }
  // If task doesn't explicitly restrict languages, allow all supported languages.
  const filteredAll = filterEnabledJudgeLanguages(Array.from(ALL_JUDGE_LANGS) as any);
  return (filteredAll.length > 0 ? filteredAll : (["java"] as any)) as any;
}

function ensureJudgeConfigDefaults(task: LibraryTask, tests: TestData[]): boolean {
  let dirty = false;

  const defaultLimitsByLang: Record<
    "java" | "python" | "cpp" | "c" | "csharp" | "kotlin",
    { time_limit_ms: number; memory_limit_mb: number; output_limit_kb: number }
  > = {
    java: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
    python: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
    cpp: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
    c: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
    csharp: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
    kotlin: { time_limit_ms: 1400, memory_limit_mb: 384, output_limit_kb: 64 },
  };

  const langs = getAllowedJudgeLanguages(task);
  const maxTime = Math.max(...langs.map((l) => defaultLimitsByLang[l].time_limit_ms));
  const maxMem = Math.max(...langs.map((l) => defaultLimitsByLang[l].memory_limit_mb));
  const maxOut = Math.max(...langs.map((l) => defaultLimitsByLang[l].output_limit_kb));

  const curTime = Number((task as any).timeLimitMs);
  if (!Number.isFinite(curTime) || curTime <= 0) {
    (task as any).timeLimitMs = maxTime;
    dirty = true;
  }
  const curMem = Number((task as any).memoryLimitMb);
  if (!Number.isFinite(curMem) || curMem <= 0) {
    (task as any).memoryLimitMb = maxMem;
    dirty = true;
  }
  const curOut = Number((task as any).outputLimitKb);
  if (!Number.isFinite(curOut) || curOut <= 0) {
    (task as any).outputLimitKb = maxOut;
    dirty = true;
  }

  const checker = (task as any).checkerSpec as CheckerSpec | null | undefined;
  if (!checker || typeof checker !== "object" || typeof (checker as any).type !== "string") {
    (task as any).checkerSpec = chooseDefaultCheckerFromExpectedOutputs(tests.map((t) => t.expectedOutput || ""));
    dirty = true;
  }

  return dirty;
}

async function buildSnapshot(taskId: number) {
  const task = await libraryRepo().findOne({ where: { id: taskId } as any, relations: ["author"] });
  if (!task) return null;
  const theory = await theoryRepo().findOne({ where: { libraryTask: { id: taskId } } as any });
  const tests = await testDataRepo().find({
    where: { libraryTask: { id: taskId } } as any,
    order: { id: "ASC" } as any,
  });

  const snapshot = {
    task: {
      id: task.id,
      problemCode: (task as any).problemCode ?? null,
      slug: (task as any).slug ?? null,
      title: task.title,
      description: task.description,
      template: task.template,
      templatesByLanguage: (task as any).templatesByLanguage ?? null,
      lang: task.lang,
      difficulty: (task as any).difficulty ?? null,
      tags: (task as any).tags ?? null,
      section: (task as any).section ?? null,
      timeLimitMs: (task as any).timeLimitMs ?? null,
      memoryLimitMb: (task as any).memoryLimitMb ?? null,
      outputLimitKb: (task as any).outputLimitKb ?? null,
      // Always return a resolved list (and apply global disables), so the UI stays consistent.
      allowedLanguages: getAllowedJudgeLanguages(task),
      maxAttempts: task.maxAttempts,
      status: task.status,
      rejectionReason: task.rejectionReason ?? null,
      submittedAt: task.submittedAt ?? null,
      publishedAt: task.publishedAt ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      author: task.author ? { id: task.author.id, username: task.author.username, email: (task.author as any).email ?? null } : null,
    },
    theory: theory?.content ?? null,
    tests: tests.map((t) => ({
      id: t.id,
      input: t.input,
      expectedOutput: t.expectedOutput,
      isHidden: t.isHidden,
      kind: (t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE"),
      points: t.points,
      subtask: (t as any).subtask ?? null,
      createdAt: t.createdAt,
    })),
  };

  return snapshot;
}

async function getNextRevisionVersion(taskId: number): Promise<number> {
  const rows = (await AppDataSource.query(
    "SELECT MAX(version) as v FROM library_task_revisions WHERE library_task_id = ?",
    [taskId]
  )) as Array<any>;
  const v = Number(rows?.[0]?.v ?? 0);
  return (Number.isFinite(v) ? v : 0) + 1;
}

async function ensureStableIdentifiers(task: LibraryTask): Promise<boolean> {
  let dirty = false;
  const pc = String((task as any).problemCode ?? "").trim();
  if (!pc) {
    (task as any).problemCode = `LIB${task.id}`;
    dirty = true;
  }
  const slug = String((task as any).slug ?? "").trim();
  if (!slug) {
    const base = String(task.title || "task")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "task";
    (task as any).slug = `${base}-${task.id}`;
    dirty = true;
  }
  return dirty;
}

async function checkQualityGates(taskId: number) {
  const task = await libraryRepo().findOne({ where: { id: taskId } as any });
  if (!task) return { ok: false as const, message: "NOT_FOUND" as const, details: null as any };

  const problems: string[] = [];
  if (!String(task.title ?? "").trim()) problems.push("TITLE_REQUIRED");
  if (!String(task.description ?? "").trim()) problems.push("DESCRIPTION_REQUIRED");
  if (!String(task.template ?? "").trim()) problems.push("TEMPLATE_REQUIRED");

  const tests = await testDataRepo().find({ where: { libraryTask: { id: taskId } } as any });
  const sample = tests.filter((t) => ((t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE")) === "SAMPLE");
  const judge = tests.filter((t) => ((t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE")) === "JUDGE");
  if (sample.length < 1) problems.push("AT_LEAST_ONE_SAMPLE_TEST_REQUIRED");
  if (judge.length < 1) problems.push("AT_LEAST_ONE_JUDGE_TEST_REQUIRED");
  const bad = tests.find((t) => !String(t.expectedOutput ?? "").trim());
  if (bad) problems.push("EXPECTED_OUTPUT_REQUIRED");
  const pointsBad = tests.find((t) => !Number.isFinite(Number(t.points)) || Number(t.points) <= 0);
  if (pointsBad) problems.push("TEST_POINTS_MUST_BE_POSITIVE");

  // Judge configuration must be defined for a published (approved) task.
  const timeOk = Number.isFinite(Number((task as any).timeLimitMs)) && Number((task as any).timeLimitMs) > 0;
  const memOk = Number.isFinite(Number((task as any).memoryLimitMb)) && Number((task as any).memoryLimitMb) > 0;
  const outOk = Number.isFinite(Number((task as any).outputLimitKb)) && Number((task as any).outputLimitKb) > 0;
  if (!timeOk || !memOk || !outOk) problems.push("LIMITS_MISSING");

  const checker = (task as any).checkerSpec as any;
  if (!checker || typeof checker !== "object" || typeof checker.type !== "string") problems.push("CHECKER_SPEC_MISSING");

  // Optional: recommended but not required.
  const pc = String((task as any).problemCode ?? "").trim();
  const slug = String((task as any).slug ?? "").trim();
  if (!pc) problems.push("PROBLEM_CODE_MISSING");
  if (!slug) problems.push("SLUG_MISSING");

  if (problems.length > 0) {
    return { ok: false as const, message: "QUALITY_GATE_FAILED" as const, details: { problems, testsTotal: tests.length, sampleTests: sample.length, judgeTests: judge.length } };
  }
  return { ok: true as const, message: "OK" as const, details: { testsTotal: tests.length, sampleTests: sample.length, judgeTests: judge.length } };
}

function buildTaskDto(task: LibraryTask) {
  return {
    id: task.id,
    problemCode: (task as any).problemCode ?? null,
    slug: (task as any).slug ?? null,
    difficulty: (task as any).difficulty ?? null,
    tags: (task as any).tags ?? null,
    section: (task as any).section ?? null,
    timeLimitMs: (task as any).timeLimitMs ?? null,
    memoryLimitMb: (task as any).memoryLimitMb ?? null,
    outputLimitKb: (task as any).outputLimitKb ?? null,
    checkerSpec: (task as any).checkerSpec ?? null,
    // Always return a resolved list (and apply global disables), so the UI stays consistent.
    allowedLanguages: getAllowedJudgeLanguages(task),
    templatesByLanguage: (task as any).templatesByLanguage ?? null,
    title: task.title,
    description: task.description,
    template: task.template,
    lang: task.lang,
    maxAttempts: task.maxAttempts,
    status: task.status,
    rejectionReason: task.rejectionReason ?? null,
    submittedAt: task.submittedAt ?? null,
    publishedAt: task.publishedAt ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    author: (task as any)?.author
      ? {
          id: (task as any).author.id,
          username: (task as any).author.username,
          email: (task as any).author.email ?? null,
        }
      : null,
  };
}

adminLibraryRouter.get("/tasks", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const statusRaw = String(req.query.status ?? "PENDING").toUpperCase().trim();
    const status: LibraryTaskStatus = (statusRaw === "DRAFT" || statusRaw === "PENDING" || statusRaw === "APPROVED" || statusRaw === "REJECTED")
      ? (statusRaw as LibraryTaskStatus)
      : "PENDING";

    const tasks = await libraryRepo().find({
      where: { status } as any,
      relations: ["author"],
      order: { updatedAt: "DESC" },
      take: 500,
    });

    return res.json({ tasks: tasks.map(buildTaskDto) });
  } catch (error: any) {
    logger.error("[admin/library] GET /tasks error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

adminLibraryRouter.post("/tasks/:id/approve", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    if (task.status === "APPROVED") {
      return res.json({ task: buildTaskDto(task) });
    }
    if (task.status !== "PENDING") {
      return res.status(400).json({ message: "CANNOT_APPROVE_IN_STATUS", status: task.status });
    }

    // Ensure stable identifiers exist (best-effort auto-fill).
    if (await ensureStableIdentifiers(task)) {
      await libraryRepo().save(task);
    }

    // Ensure judge config defaults are present (limits + checkerSpec).
    const testsForDefaults = await testDataRepo().find({
      where: { libraryTask: { id: task.id } } as any,
      order: { id: "ASC" } as any,
    });
    if (ensureJudgeConfigDefaults(task, testsForDefaults)) {
      await libraryRepo().save(task);
    }

    // Quality gates
    const gate = await checkQualityGates(task.id);
    if (!gate.ok) {
      return res.status(400).json({ message: gate.message, ...gate.details });
    }

    // Store a revision snapshot BEFORE approval is finalized (so the snapshot includes full data).
    const snapshot = await buildSnapshot(task.id);
    if (!snapshot) return res.status(404).json({ message: "NOT_FOUND" });
    const version = await getNextRevisionVersion(task.id);
    await revisionRepo().save(
      revisionRepo().create({
        libraryTaskId: task.id,
        libraryTask: { id: task.id } as any,
        version,
        action: "APPROVE",
        comment: null,
        snapshot: encodeSnapshot(snapshot),
        createdByUserId: req.userId,
        createdByUser: { id: req.userId } as any,
      })
    );

    task.status = "APPROVED";
    task.rejectionReason = null;
    task.publishedAt = new Date();
    await libraryRepo().save(task);

    const full = await libraryRepo().findOne({ where: { id: task.id } as any, relations: ["author"] });
    return res.json({ task: full ? buildTaskDto(full) : buildTaskDto(task) });
  } catch (error: any) {
    logger.error("[admin/library] approve error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

adminLibraryRouter.get("/tasks/:id/revisions", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const rows = await revisionRepo().find({
      where: { libraryTaskId: id } as any,
      order: { version: "DESC" } as any,
      take: 200,
    });

    return res.json({
      revisions: rows.map((r) => ({
        id: r.id,
        version: r.version,
        action: r.action,
        comment: r.comment ?? null,
        createdAt: r.createdAt,
        createdByUserId: r.createdByUserId ?? null,
      })),
    });
  } catch (error: any) {
    logger.error("[admin/library] GET /tasks/:id/revisions error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

adminLibraryRouter.get("/tasks/:id/revisions/:version", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const version = parseInt(req.params.version, 10);
    if (isNaN(id) || isNaN(version)) return res.status(400).json({ message: "INVALID_ID" });

    const r = await revisionRepo().findOne({ where: { libraryTaskId: id, version } as any });
    if (!r) return res.status(404).json({ message: "NOT_FOUND" });

    let snapshot: any = null;
    try {
      snapshot = parseSnapshot(r.snapshot);
    } catch {
      snapshot = null;
    }

    return res.json({
      revision: {
        id: r.id,
        version: r.version,
        action: r.action,
        comment: r.comment ?? null,
        createdAt: r.createdAt,
        createdByUserId: r.createdByUserId ?? null,
      },
      snapshot,
    });
  } catch (error: any) {
    logger.error("[admin/library] GET /tasks/:id/revisions/:version error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

const rollbackSchema = z.object({
  comment: z.string().max(255).optional(),
});

adminLibraryRouter.post(
  "/tasks/:id/revisions/:version/rollback",
  authRequired,
  systemAdminGuard,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const version = parseInt(req.params.version, 10);
      if (isNaN(id) || isNaN(version)) return res.status(400).json({ message: "INVALID_ID" });

      const validated = rollbackSchema.safeParse(req.body ?? {});
      if (!validated.success) {
        return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
      }

      const r = await revisionRepo().findOne({ where: { libraryTaskId: id, version } as any });
      if (!r) return res.status(404).json({ message: "NOT_FOUND" });

      let snapshot: any;
      try {
        snapshot = parseSnapshot(r.snapshot);
      } catch {
        return res.status(500).json({ message: "CORRUPT_REVISION_SNAPSHOT" });
      }
      if (!snapshot?.task) return res.status(500).json({ message: "CORRUPT_REVISION_SNAPSHOT" });

      // Save current state as a rollback revision (audit).
      const currentSnapshot = await buildSnapshot(id);
      if (currentSnapshot) {
        const next = await getNextRevisionVersion(id);
        await revisionRepo().save(
          revisionRepo().create({
            libraryTaskId: id,
            libraryTask: { id } as any,
            version: next,
            action: "ROLLBACK",
            comment: validated.data.comment?.trim() || `rollback-to:${version}`,
            snapshot: encodeSnapshot(currentSnapshot),
            createdByUserId: req.userId,
            createdByUser: { id: req.userId } as any,
          })
        );
      }

      // Restore task fields (best-effort, keep author unchanged).
      const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
      if (!task) return res.status(404).json({ message: "NOT_FOUND" });

      const sTask = snapshot.task;
      task.title = String(sTask.title ?? task.title);
      task.description = String(sTask.description ?? task.description);
      task.template = String(sTask.template ?? task.template);
      (task as any).problemCode = String(sTask.problemCode ?? (task as any).problemCode ?? "") || (task as any).problemCode;
      (task as any).slug = String(sTask.slug ?? (task as any).slug ?? "") || (task as any).slug;
      (task as any).difficulty = sTask.difficulty ?? null;
      (task as any).tags = sTask.tags ?? null;
      (task as any).section = sTask.section ?? null;
      (task as any).timeLimitMs = sTask.timeLimitMs ?? null;
      (task as any).memoryLimitMb = sTask.memoryLimitMb ?? null;
      (task as any).outputLimitKb = sTask.outputLimitKb ?? null;
      (task as any).checkerSpec = sTask.checkerSpec ?? null;
      (task as any).allowedLanguages = sTask.allowedLanguages ?? null;
      (task as any).templatesByLanguage = sTask.templatesByLanguage ?? null;
      task.lang = sTask.lang ?? task.lang;
      task.maxAttempts = Number.isFinite(Number(sTask.maxAttempts)) ? Number(sTask.maxAttempts) : task.maxAttempts;

      // After rollback we publish immediately (admin action).
      task.status = "APPROVED";
      task.rejectionReason = null;
      task.publishedAt = new Date();
      await libraryRepo().save(task);

      // Restore theory
      const nextTheory = String(snapshot.theory ?? "").trim();
      const existingTheory = await theoryRepo().findOne({ where: { libraryTask: { id } } as any });
      if (!nextTheory) {
        if (existingTheory) await theoryRepo().remove(existingTheory);
      } else {
        if (existingTheory) {
          existingTheory.content = nextTheory;
          await theoryRepo().save(existingTheory);
        } else {
          await theoryRepo().save(theoryRepo().create({ libraryTask: { id } as any, content: nextTheory }));
        }
      }

      // Restore tests (replace all)
      await AppDataSource.query("DELETE FROM test_data WHERE library_task_id = ?", [id]);
      if (Array.isArray(snapshot.tests) && snapshot.tests.length > 0) {
        const rows = snapshot.tests.map((t: any) =>
          testDataRepo().create({
            libraryTask: { id } as any,
            input: String(t.input ?? ""),
            expectedOutput: String(t.expectedOutput ?? ""),
            isHidden: !!t.isHidden,
            kind: (t.kind === "SAMPLE" ? "SAMPLE" : "JUDGE") as any,
            points: Number.isFinite(Number(t.points)) ? Number(t.points) : 1,
            subtask: typeof t.subtask === "number" ? String(t.subtask) : t.subtask != null ? String(t.subtask) : null,
          })
        );
        await testDataRepo().save(rows);
      }

      const full = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
      return res.json({ task: full ? buildTaskDto(full) : buildTaskDto(task) });
    } catch (error: any) {
      logger.error("[admin/library] rollback error", { requestId: req.requestId, userId: req.userId, error });
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  }
);

const rejectSchema = z.object({
  reason: z.string().min(1).max(5000),
});

adminLibraryRouter.post("/tasks/:id/reject", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const validated = rejectSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    task.status = "REJECTED";
    task.rejectionReason = validated.data.reason.trim();
    await libraryRepo().save(task);

    const full = await libraryRepo().findOne({ where: { id: task.id } as any, relations: ["author"] });
    return res.json({ task: full ? buildTaskDto(full) : buildTaskDto(task) });
  } catch (error: any) {
    logger.error("[admin/library] reject error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default adminLibraryRouter;
