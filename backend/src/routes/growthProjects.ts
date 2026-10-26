import { Router, type Response } from "express";
import { randomBytes, randomUUID, createHash } from "crypto";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authRequired, type AuthRequest } from "../middleware/authMiddleware";
import {
  CURRENT_GROWTH_PROJECT_BLUEPRINT_REVISION, GROWTH_PROJECT_FAMILIES, GROWTH_PROJECT_RUNTIME_INFO, growthFamilyFor,
  growthJudgeTests, growthProjectFiles, growthTestsThroughStage, type GrowthProjectRuntime, type GrowthProjectStageKey,
} from "../data/growthProjects";
import { cancelGrowthProjectJob, wakeGrowthProjectQueue } from "../services/growthProjectQueue";
import type { JudgeFile, JudgeTestCase } from "../services/judgeWorker/types";
import { logger } from "../utils/logger";

export const growthProjectsRouter = Router();
export const growthProjectPublicRouter = Router();

const UUID_RE = /^[0-9a-f-]{36}$/i;
const runtimeSchema = z.enum(["PYTHON", "JAVA", "CPP"]);
const stageSchema = z.enum(["V1", "V2", "V3"]);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const json = <T>(value: unknown, fallback: T): T => {
  try { return typeof value === "string" ? JSON.parse(value) as T : (value as T) ?? fallback; } catch { return fallback; }
};
function publicAssessmentCard(value: unknown): Record<string, unknown> {
  const card = json<Record<string, unknown>>(value, {});
  const { tests: _hiddenTests, ...publicCard } = card;
  return publicCard;
}
function v3NextAction(byKind?: Map<string, Set<string>>): string {
  const defense = byKind?.get("DEFENSE");
  if (!defense?.has("PASSED")) return defense?.has("ACTIVE") ? "CONTINUE_DEFENSE" : "DEFENSE";
  const transfer = byKind?.get("TRANSFER");
  if (!transfer?.has("PASSED")) return transfer?.has("ACTIVE") ? "CONTINUE_TRANSFER" : "TRANSFER";
  return "PORTFOLIO";
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const bad = (res: Response, status: number, code: string) => res.status(status).json({ code, message: code });
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
type GrowthReviewNotice = "GROWTH_REVIEW_INVITATION" | "GROWTH_REVIEW_ASSIGNED" | "GROWTH_REVIEW_ASSIGNED_TO_AUTHOR" | "GROWTH_REVIEW_ACCEPTED" | "GROWTH_REVIEW_DECLINED" | "GROWTH_REVIEW_SUBMITTED" | "GROWTH_REVIEW_REQUESTED";
async function notifyGrowthReview(recipientId: number | null, actorId: number, type: GrowthReviewNotice, relatedPath: string): Promise<void> {
  if (!recipientId || recipientId === actorId) return;
  try {
    const actors = await AppDataSource.query("SELECT username FROM users WHERE id=? LIMIT 1", [actorId]) as Array<{ username: string | null }>;
    await AppDataSource.query("INSERT INTO notifications (recipient_type,recipient_id,type,actor_name,related_path) VALUES ('USER',?,?,?,?)", [recipientId, type, actors[0]?.username ?? null, relatedPath]);
  } catch (error) {
    logger.warn("[growth-projects] could not create in-app review notification", { recipientId, type, error });
  }
}

type Draft = { files: JudgeFile[]; examples: Array<{ input: string; output: string }>; explanation?: string };
type ProjectRow = { id: string; owner_id: number; family_key: string; runtime: GrowthProjectRuntime; current_stage: GrowthProjectStageKey; draft_json: string; draft_revision: number; blueprint_revision: string; archived: number; source_json?: string | null };
type LegacyKind = "PERSONAL_MINI_PROJECT" | "COURSE_PROJECT" | "LIBRARY_PROJECT";
type LegacySource = { kind: LegacyKind; sourceId: number; title: string; description: string; runtime: GrowthProjectRuntime; files: JudgeFile[] };

function cleanDraft(raw: unknown): Draft | null {
  if (!isObject(raw) || !Array.isArray(raw.files) || !Array.isArray(raw.examples)) return null;
  if (raw.files.length < 1 || raw.files.length > 16 || raw.examples.length > 10) return null;
  let total = 0;
  const seen = new Set<string>();
  const files: JudgeFile[] = [];
  for (const item of raw.files) {
    if (!isObject(item) || typeof item.path !== "string" || typeof item.content !== "string") return null;
    const path = item.path.replace(/\\/g, "/").trim();
    if (!path || path.length > 180 || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..") || !/^[A-Za-z0-9_.\-/]+$/.test(path) || seen.has(path)) return null;
    const bytes = Buffer.byteLength(item.content, "utf8");
    if (bytes > 65_536) return null;
    total += bytes;
    files.push({ path, content: item.content });
    seen.add(path);
  }
  if (total > 262_144) return null;
  const examples: Draft["examples"] = [];
  let exampleBytes = 0;
  for (const item of raw.examples) {
    if (!isObject(item) || typeof item.input !== "string" || typeof item.output !== "string") return null;
    exampleBytes += Buffer.byteLength(item.input, "utf8") + Buffer.byteLength(item.output, "utf8");
    examples.push({ input: item.input, output: item.output });
  }
  if (exampleBytes > 32_768) return null;
  return {
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    examples,
    explanation: text(raw.explanation, 8_000),
  };
}

function draftHash(draft: Draft): string {
  return hash(JSON.stringify({ files: [...draft.files].sort((a, b) => a.path.localeCompare(b.path)), examples: draft.examples }));
}

async function ownedProject(id: string, ownerId: number): Promise<ProjectRow | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await AppDataSource.query("SELECT * FROM growth_projects WHERE id=? AND owner_id=? LIMIT 1", [id, ownerId]) as ProjectRow[];
  return rows[0] ?? null;
}

async function ownerOnly(req: AuthRequest, res: Response): Promise<number | null> {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") {
    bad(res, 403, "PERSONAL_USER_REQUIRED");
    return null;
  }
  return req.userId;
}

async function artifactFor(ownerId: number, draft: Draft, runner?: { query: (sql: string, parameters?: unknown[]) => Promise<unknown> }): Promise<string> {
  const query = runner ? runner.query.bind(runner) : AppDataSource.query.bind(AppDataSource);
  const contentHash = draftHash(draft);
  const id = randomUUID();
  await query(
    "INSERT IGNORE INTO growth_project_artifacts (id,owner_id,content_hash,files_json,examples_json,total_bytes) VALUES (?,?,?,?,?,?)",
    [id, ownerId, contentHash, JSON.stringify(draft.files), JSON.stringify(draft.examples), Buffer.byteLength(JSON.stringify({ files: draft.files, examples: draft.examples }), "utf8")]
  );
  const rows = await query("SELECT id FROM growth_project_artifacts WHERE owner_id=? AND content_hash=? LIMIT 1", [ownerId, contentHash]) as Array<{ id: string }>;
  if (!rows[0]) throw new Error("ARTIFACT_STORE_FAILED");
  return rows[0].id;
}

async function findLegacySource(ownerId: number, kind: LegacyKind, sourceId: number): Promise<LegacySource | null> {
  const entryFor = (runtime: GrowthProjectRuntime) => GROWTH_PROJECT_RUNTIME_INFO[runtime].entryFile;
  if (kind === "PERSONAL_MINI_PROJECT") {
    const rows = await AppDataSource.query("SELECT id,title,description,lang,draft_code,final_code FROM tasks WHERE id=? AND user_id=? AND completed=1 AND subtitle LIKE 'MPJ:%' LIMIT 1", [sourceId, ownerId]) as Array<Record<string, unknown>>;
    const row = rows[0]; if (!row) return null;
    const runtime = runtimeSchema.safeParse(String(row.lang ?? "").toUpperCase());
    if (!runtime.success) return null;
    const code = String(row.final_code || row.draft_code || "");
    if (!code.trim()) return null;
    return { kind, sourceId, title: String(row.title || "Мініпроєкт"), description: String(row.description || ""), runtime: runtime.data, files: [{ path: entryFor(runtime.data), content: code }] };
  }
  if (kind === "COURSE_PROJECT") {
    const sql = "SELECT p.project_data,ci.title,cm.title AS module_title,c.title AS course_title,v.runtime " +
      "FROM course_item_progress p JOIN user_course_enrollments e ON e.id=p.enrollment_id " +
      "JOIN course_variants v ON v.id=e.variant_id JOIN course_items ci ON ci.id=p.item_id " +
      "JOIN course_modules cm ON cm.id=ci.module_id JOIN courses c ON c.id=cm.course_id " +
      "WHERE p.item_id=? AND e.user_id=? AND c.organization_id IS NULL AND p.status='COMPLETED' " +
      "AND JSON_EXTRACT(ci.content,'$.projectSpec') IS NOT NULL LIMIT 1";
    const rows = await AppDataSource.query(sql, [sourceId, ownerId]) as Array<Record<string, unknown>>;
    const row = rows[0]; if (!row) return null;
    const runtime = runtimeSchema.safeParse(String(row.runtime ?? "").toUpperCase()); if (!runtime.success) return null;
    const data = json<Record<string, unknown>>(row.project_data, {});
    const files = Array.isArray(data.files) ? data.files.filter(isObject).filter(file => typeof file.path === "string" && typeof file.content === "string").map(file => ({ path: String(file.path), content: String(file.content) })) : [];
    if (!files.length && typeof data.draft === "string") files.push({ path: entryFor(runtime.data), content: data.draft });
    if (!files.length) return null;
    return { kind, sourceId, title: String(row.title || "Проєкт курсу"), description: String(row.course_title || row.module_title || ""), runtime: runtime.data, files };
  }
  const librarySql = "SELECT a.library_task_id AS sourceId,t.title,t.description,t.project_spec,t.allowed_languages," +
    "a.last_submitted_code,a.last_submitted_code_by_language,a.draft_code,a.draft_code_by_language " +
    "FROM library_task_attempts a JOIN library_tasks t ON t.id=a.library_task_id " +
    "WHERE a.library_task_id=? AND a.user_id=? AND t.project_spec IS NOT NULL LIMIT 1";
  const rows = await AppDataSource.query(librarySql, [sourceId, ownerId]) as Array<Record<string, unknown>>;
  const row = rows[0]; if (!row) return null;
  const spec = json<Record<string, unknown>>(row.project_spec, {});
  if (spec.kind !== "MINI_PROJECT") return null;
  const codeByLanguage = json<Record<string, string>>(row.last_submitted_code_by_language, {});
  const draftByLanguage = json<Record<string, string>>(row.draft_code_by_language, {});
  const allowed = json<unknown[]>(row.allowed_languages, []);
  const supported = new Set(["JAVA", "PYTHON", "CPP"]);
  const mappedRuntime = [...Object.entries(codeByLanguage), ...Object.entries(draftByLanguage)]
    .find(([language, code]) => supported.has(language.toUpperCase()) && Boolean(String(code ?? "").trim()))?.[0];
  const allowedRuntime = allowed.find(value => supported.has(String(value).toUpperCase()));
  const runtime = runtimeSchema.safeParse(String(mappedRuntime ?? allowedRuntime ?? "PYTHON").toUpperCase());
  if (!runtime.success) return null;
  const submittedCode = Object.entries(codeByLanguage).find(([language]) => language.toUpperCase() === runtime.data)?.[1];
  const draftCode = Object.entries(draftByLanguage).find(([language]) => language.toUpperCase() === runtime.data)?.[1];
  const code = String(submittedCode || draftCode || row.last_submitted_code || row.draft_code || "");
  if (!code.trim()) return null;
  return { kind, sourceId, title: String(row.title || "Проєкт бібліотеки"), description: String(row.description || ""), runtime: runtime.data, files: [{ path: entryFor(runtime.data), content: code }] };
}

function contextTests(project: ProjectRow, draft: Draft, contextKey: string): JudgeTestCase[] | null {
  const family = growthFamilyFor(project.family_key, project.blueprint_revision);
  if (!family) return null;
  if (/^assessment:[0-9a-f-]{36}$/i.test(contextKey)) return null;
  const stageKey = contextKey as GrowthProjectStageKey;
  if (!stageSchema.safeParse(stageKey).success || stageKey !== project.current_stage) return null;
  const tests = growthTestsThroughStage(family, stageKey, true);
  for (const [index, example] of draft.examples.entries()) tests.push({
    id: `own-${index + 1}`, input: example.input, output: example.output, hidden: false, group: "author-examples", weight: 0,
  });
  return tests;
}

async function assessmentTests(project: ProjectRow, assessmentId: string): Promise<{ tests: JudgeTestCase[]; row: Record<string, unknown>; draft: Draft } | null> {
  const rows = await AppDataSource.query("SELECT * FROM growth_project_assessments WHERE id=? AND project_id=? AND owner_id=? LIMIT 1", [assessmentId, project.id, project.owner_id]) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row || row.status !== "ACTIVE") return null;
  const draft = cleanDraft(json(row.draft_json, null));
  if (!draft) return null;
  const family = growthFamilyFor(project.family_key, project.blueprint_revision);
  if (!family) return null;
  const card = json<{ tests?: Array<{ input: string; output: string; group: string; hidden?: boolean }> }>(row.card_snapshot, {});
  const coreTests = row.kind === "DEFENSE"
    ? growthTestsThroughStage(family, "V3", true)
    : [];
  const extra = growthJudgeTests(card.tests ?? [], true, "card-");
  const tests = [...coreTests, ...extra];
  for (const [index, example] of draft.examples.entries()) tests.push({ id: `own-${index + 1}`, input: example.input, output: example.output, group: "author-examples", hidden: false, weight: 0 });
  return { tests, row, draft };
}

growthProjectsRouter.get("/catalog", authRequired, async (req: AuthRequest, res: Response) => {
  if (!await ownerOnly(req, res)) return;
  const en = String(req.query.uiLang ?? req.headers["accept-language"] ?? "uk").toLowerCase().startsWith("en");
  return res.json({ revision: CURRENT_GROWTH_PROJECT_BLUEPRINT_REVISION, families: GROWTH_PROJECT_FAMILIES.map(family => ({
    key: family.key,
    title: en ? family.titleEn : family.titleUk,
    summary: en ? family.summaryEn : family.summaryUk,
    recommendedPrep: en ? family.recommendedPrepEn : family.recommendedPrepUk,
    skills: en ? family.skillsEn : family.skillsUk,
    runtimes: ["PYTHON", "JAVA", "CPP"],
    stages: Object.values(family.stages).map(stage => ({ key: stage.key, title: en ? stage.titleEn : stage.titleUk, description: en ? stage.descriptionEn : stage.descriptionUk, examples: stage.tests.filter(item => !item.hidden).map(({ input, output }) => ({ input, output })) })),
  })) });
});

growthProjectsRouter.get("/legacy", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const personal = await AppDataSource.query("SELECT id,title,description,lang FROM tasks WHERE user_id=? AND completed=1 AND subtitle LIKE 'MPJ:%' ORDER BY created_at DESC LIMIT 50", [ownerId]) as Array<Record<string, unknown>>;
  const courseSql = "SELECT DISTINCT p.item_id AS sourceId,ci.title,c.title AS courseTitle,v.runtime FROM course_item_progress p " +
    "JOIN user_course_enrollments e ON e.id=p.enrollment_id JOIN course_variants v ON v.id=e.variant_id " +
    "JOIN course_items ci ON ci.id=p.item_id JOIN course_modules cm ON cm.id=ci.module_id JOIN courses c ON c.id=cm.course_id " +
    "WHERE e.user_id=? AND c.org_id IS NULL AND p.status='COMPLETED' AND JSON_EXTRACT(ci.content,'$.projectSpec') IS NOT NULL " +
    "ORDER BY p.item_id DESC LIMIT 50";
  const courseRows = await AppDataSource.query(courseSql, [ownerId]) as Array<Record<string, unknown>>;
  const libraryRows = await AppDataSource.query("SELECT a.library_task_id AS sourceId,t.title,t.description,t.allowed_languages,a.updated_at FROM library_task_attempts a JOIN library_tasks t ON t.id=a.library_task_id WHERE a.user_id=? AND t.project_spec IS NOT NULL ORDER BY a.updated_at DESC LIMIT 50", [ownerId]) as Array<Record<string, unknown>>;
  const imported = await AppDataSource.query("SELECT source_json FROM growth_projects WHERE owner_id=? AND source_json IS NOT NULL", [ownerId]) as Array<{ source_json: string }>;
  const importedKeys = new Set(imported.map(row => { const source = json<{ kind?: string; sourceId?: number }>(row.source_json, {}); return String(source.kind) + ":" + String(source.sourceId); }));
  const projects = [
    ...personal.map(row => ({ kind: "PERSONAL_MINI_PROJECT", sourceId: Number(row.id), title: String(row.title || ""), description: String(row.description || ""), runtime: String(row.lang || ""), imported: importedKeys.has("PERSONAL_MINI_PROJECT:" + row.id) })),
    ...courseRows.map(row => ({ kind: "COURSE_PROJECT", sourceId: Number(row.sourceId), title: String(row.title || "Проєкт курсу"), description: String(row.courseTitle || ""), runtime: String(row.runtime || ""), imported: importedKeys.has("COURSE_PROJECT:" + row.sourceId) })),
    ...libraryRows.map(row => ({ kind: "LIBRARY_PROJECT", sourceId: Number(row.sourceId), title: String(row.title || "Проєкт бібліотеки"), description: String(row.description || ""), runtime: String((json<unknown[]>(row.allowed_languages, []).find(value => ["JAVA", "PYTHON", "CPP"].includes(String(value).toUpperCase())) ?? "PYTHON")).toUpperCase(), imported: importedKeys.has("LIBRARY_PROJECT:" + row.sourceId) })),
  ];
  return res.json({ projects });
});

growthProjectsRouter.post("/import", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const parsed = z.object({ kind: z.enum(["PERSONAL_MINI_PROJECT", "COURSE_PROJECT", "LIBRARY_PROJECT"]), sourceId: z.number().int().positive() }).safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, 400, "INVALID_LEGACY_SOURCE");
  const source = await findLegacySource(ownerId, parsed.data.kind, parsed.data.sourceId);
  if (!source) return bad(res, 404, "LEGACY_SOURCE_NOT_FOUND");
  const importedDraft = cleanDraft({ files: source.files, examples: [] });
  if (!importedDraft) return bad(res, 413, "LEGACY_PROJECT_TOO_LARGE_OR_INVALID");
  const legacyTag = source.kind === "PERSONAL_MINI_PROJECT" ? "mpj" : source.kind === "COURSE_PROJECT" ? "course" : "library";
  const familyKey = "legacy-" + legacyTag + "-" + source.sourceId;
  const existing = await AppDataSource.query("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=? LIMIT 1", [ownerId, familyKey, source.runtime]) as Array<{ id: string }>;
  if (existing[0]) return res.json({ id: existing[0].id, existing: true });
  const id = randomUUID();
  const draft: Draft = { ...importedDraft, explanation: "" };
  const artifactId = await artifactFor(ownerId, draft);
  const jobId = randomUUID(); const versionId = randomUUID();
  const sourceSnapshot = { kind: source.kind, sourceId: source.sourceId, title: source.title, description: source.description, importedLabel: "ADDED_FROM_PRIOR_LEARNING" };
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    const raced = await runner.query("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=? LIMIT 1 FOR UPDATE", [ownerId, familyKey, source.runtime]) as Array<{ id: string }>;
    if (raced[0]) { await runner.commitTransaction(); return res.json({ id: raced[0].id, existing: true }); }
    await runner.query("INSERT INTO growth_projects (id,owner_id,family_key,runtime,blueprint_revision,current_stage,draft_json,draft_revision,source_json) VALUES (?,?,?,?,?,'V1',?,1,?)", [id, ownerId, familyKey, source.runtime, "legacy-import-v1", JSON.stringify(draft), JSON.stringify(sourceSnapshot)]);
    await runner.query("INSERT INTO growth_project_jobs (id,project_id,owner_id,context_key,artifact_id,blueprint_revision,tests_hash,tests_json,idempotency_key,state,result_json,completed_at) VALUES (?,?,?,?,?,?,?,?,?,'COMPLETED',?,NOW(3))", [jobId, id, ownerId, "LEGACY", artifactId, "legacy-import-v1", hash("[]"), "[]", "import:" + source.kind + ":" + source.sourceId, JSON.stringify({ passed: false, verdict: "IMPORTED", testsPassed: 0, testsTotal: 0, legacy: true })]);
    await runner.query("INSERT INTO growth_project_versions (id,project_id,owner_id,stage_key,sequence_no,artifact_id,check_job_id,blueprint_revision,explanation) VALUES (?,?,?,'V1',1,?,?,?,?)", [versionId, id, ownerId, artifactId, jobId, "legacy-import-v1", "Додано з попереднього навчання. Нові автотести для цієї роботи не запускалися."]);
    await runner.commitTransaction();
  } catch (error) { await runner.rollbackTransaction(); throw error; }
  finally { await runner.release(); }
  return res.status(201).json({ id, existing: false, label: sourceSnapshot.importedLabel });
});

growthProjectsRouter.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const rows = await AppDataSource.query("SELECT id,family_key,runtime,current_stage,draft_revision,archived,source_json,updated_at FROM growth_projects WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100", [ownerId]) as Array<Record<string, unknown>>;
  const [latestJobs, latestVersions, recentAssessments] = await Promise.all([
    AppDataSource.query("SELECT j.id,j.project_id,j.context_key,j.state,j.result_json FROM growth_project_jobs j JOIN growth_projects p ON p.id=j.project_id WHERE p.owner_id=? AND j.context_key=p.current_stage AND NOT EXISTS (SELECT 1 FROM growth_project_jobs newer WHERE newer.project_id=j.project_id AND newer.context_key=j.context_key AND (newer.created_at>j.created_at OR (newer.created_at=j.created_at AND newer.id>j.id)))", [ownerId]) as Promise<Array<{ id: string; project_id: string; context_key: string; state: string; result_json: string | null }>>,
    AppDataSource.query(`SELECT v.project_id,v.stage_key,v.id,v.check_job_id FROM growth_project_versions v
      JOIN (SELECT project_id,stage_key,MAX(sequence_no) AS sequence_no FROM growth_project_versions WHERE owner_id=? GROUP BY project_id,stage_key) latest
      ON latest.project_id=v.project_id AND latest.stage_key=v.stage_key AND latest.sequence_no=v.sequence_no
      WHERE v.owner_id=?`, [ownerId, ownerId]) as Promise<Array<{ project_id: string; stage_key: string; id: string; check_job_id: string }>>,
    AppDataSource.query("SELECT project_id,kind,source_version_id,status FROM growth_project_assessments WHERE owner_id=? ORDER BY created_at DESC LIMIT 500", [ownerId]) as Promise<Array<{ project_id: string; kind: string; source_version_id: string; status: string }>>,
  ]);
  const latestByProject = new Map(latestJobs.map(job => [job.project_id, job]));
  const versionByStage = new Map(latestVersions.map(version => [`${version.project_id}:${version.stage_key}`, version]));
  const assessmentBySource = new Map<string, Map<string, Set<string>>>();
  for (const assessment of recentAssessments) {
    const key = `${assessment.project_id}:${assessment.source_version_id}`;
    const byKind = assessmentBySource.get(key) ?? new Map<string, Set<string>>();
    const statuses = byKind.get(assessment.kind) ?? new Set<string>();
    statuses.add(assessment.status);
    byKind.set(assessment.kind, statuses);
    assessmentBySource.set(key, byKind);
  }
  const projects = rows.map(row => {
    const projectId = String(row.id);
    const currentStage = String(row.current_stage);
    const latest = latestByProject.get(projectId);
    const stageVersion = versionByStage.get(`${projectId}:${currentStage}`);
    let nextAction = "CONTINUE";
    if (json(row.source_json, null)) nextAction = "PORTFOLIO";
    else if (Boolean(row.archived)) nextAction = "ARCHIVED";
    else if (!latest) nextAction = currentStage === "V3" && stageVersion ? "DEFENSE" : "CONTINUE";
    else if (["QUEUED", "RUNNING"].includes(latest.state)) nextAction = "WAIT";
    else if (latest.state === "COMPLETED" && json<{ passed?: boolean }>(latest.result_json, {}).passed) {
      if (!stageVersion || stageVersion.check_job_id !== latest.id) nextAction = "SUBMIT";
      else if (currentStage === "V3") nextAction = v3NextAction(assessmentBySource.get(`${projectId}:${stageVersion.id}`));
      else nextAction = "CONTINUE";
    } else if (currentStage === "V3" && stageVersion && latest.id === stageVersion.check_job_id) nextAction = v3NextAction(assessmentBySource.get(`${projectId}:${stageVersion.id}`));
    else nextAction = "CHECK";
    return { ...row, source: json(row.source_json, null), latestCheck: latest ? { state: latest.state, result: json(latest.result_json, null) } : null, nextAction };
  });
  return res.json({ projects });
});

growthProjectsRouter.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const parsed = z.object({ family: z.enum(["contacts", "inventory", "logs"]), runtime: runtimeSchema }).safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, 400, "INVALID_PROJECT");
  const family = growthFamilyFor(parsed.data.family, CURRENT_GROWTH_PROJECT_BLUEPRINT_REVISION)!;
  const existing = await AppDataSource.query("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=? LIMIT 1", [ownerId, family.key, parsed.data.runtime]) as Array<{ id: string }>;
  if (existing[0]) return res.status(200).json({ id: existing[0].id, existing: true });
  const id = randomUUID();
  const draft: Draft = { files: growthProjectFiles(family, parsed.data.runtime, "V1"), examples: [] };
  try {
    await AppDataSource.query("INSERT INTO growth_projects (id,owner_id,family_key,runtime,blueprint_revision,current_stage,draft_json,draft_revision) VALUES (?,?,?,?,?,'V1',?,1)", [id, ownerId, family.key, parsed.data.runtime, CURRENT_GROWTH_PROJECT_BLUEPRINT_REVISION, JSON.stringify(draft)]);
  } catch {
    const raced = await AppDataSource.query("SELECT id FROM growth_projects WHERE owner_id=? AND family_key=? AND runtime=? LIMIT 1", [ownerId, family.key, parsed.data.runtime]) as Array<{ id: string }>;
    if (raced[0]) return res.status(200).json({ id: raced[0].id, existing: true });
    throw new Error("PROJECT_CREATE_FAILED");
  }
  return res.status(201).json({ id, project: { id, family: family.key, runtime: parsed.data.runtime, stage: "V1", draft, revision: 1 } });
});

growthProjectsRouter.get("/:projectId", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId);
  if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const [versionRows, executionRows, attempts, publications, reviews] = await Promise.all([
    AppDataSource.query("SELECT id,stage_key,sequence_no,previous_version_id,check_job_id,created_at FROM growth_project_versions WHERE project_id=? AND owner_id=? ORDER BY created_at DESC,id DESC LIMIT 21", [project.id, ownerId]) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query("SELECT id,context_key,state,result_json,error_code,created_at,started_at,completed_at FROM growth_project_jobs WHERE project_id=? AND owner_id=? ORDER BY created_at DESC,id DESC LIMIT 21", [project.id, ownerId]) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query("SELECT id,kind,card_id,source_version_id,status,created_at,completed_at FROM growth_project_assessments WHERE project_id=? ORDER BY created_at DESC LIMIT 20", [project.id]),
    AppDataSource.query("SELECT id,version_id,channel,public_id,title,review_visible,revoked,created_at FROM growth_project_publications WHERE project_id=? ORDER BY created_at DESC LIMIT 20", [project.id]),
    AppDataSource.query("SELECT id,kind,status,author_public,created_at,responded_at FROM growth_project_reviews WHERE project_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 20", [project.id, ownerId]),
  ]);
  const versions = versionRows.slice(0, 20);
  const executions = executionRows.slice(0, 20).map(row => ({
    id: row.id, context: row.context_key, state: row.state, result: json(row.result_json, null), errorCode: row.error_code,
    createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at,
  }));
  return res.json({ project: { id: project.id, family: project.family_key, runtime: project.runtime, stage: project.current_stage, revision: project.draft_revision, draft: json(project.draft_json, null), blueprintRevision: project.blueprint_revision, source: json(project.source_json, null), archived: Boolean(project.archived), versions, versionsHasMore: versionRows.length > 20, executions, executionsHasMore: executionRows.length > 20, attempts, publications, reviews } });
});

growthProjectsRouter.get("/:projectId/versions", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const beforeCreatedAt = text(req.query.beforeCreatedAt, 40);
  const beforeId = text(req.query.beforeId, 36);
  if (Boolean(beforeCreatedAt) !== Boolean(beforeId)) return bad(res, 400, "INVALID_VERSION_CURSOR");
  const cursorDate = beforeCreatedAt ? new Date(beforeCreatedAt) : null;
  if (cursorDate && !Number.isFinite(cursorDate.getTime())) return bad(res, 400, "INVALID_VERSION_CURSOR");
  const limitRaw = Number(req.query.limit ?? 20);
  const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(20, limitRaw)) : 20;
  const sql = `SELECT id,stage_key,sequence_no,previous_version_id,check_job_id,created_at FROM growth_project_versions
    WHERE project_id=? AND owner_id=? ${cursorDate ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
    ORDER BY created_at DESC,id DESC LIMIT ${limit + 1}`;
  const params = cursorDate ? [project.id, ownerId, cursorDate, cursorDate, beforeId] : [project.id, ownerId];
  const rows = await AppDataSource.query(sql, params) as Array<Record<string, unknown>>;
  const versions = rows.slice(0, limit);
  const last = versions[versions.length - 1];
  return res.json({
    versions,
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit && last ? { beforeCreatedAt: last.created_at, beforeId: last.id } : null,
  });
});

growthProjectsRouter.patch("/:projectId/archive", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  if (typeof req.body?.archived !== "boolean") return bad(res, 400, "INVALID_ARCHIVE_STATE");
  await AppDataSource.query("UPDATE growth_projects SET archived=? WHERE id=? AND owner_id=?", [req.body.archived ? 1 : 0, project.id, ownerId]);
  return res.json({ archived: req.body.archived });
});

growthProjectsRouter.get("/:projectId/draft", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const attemptId = String(req.query.assessmentId ?? "");
  if (attemptId) {
    const rows = await AppDataSource.query("SELECT draft_json,draft_revision,status FROM growth_project_assessments WHERE id=? AND project_id=? AND owner_id=?", [attemptId, project.id, ownerId]) as Array<Record<string, unknown>>;
    if (!rows[0]) return bad(res, 404, "ASSESSMENT_NOT_FOUND");
    return res.json({ draft: json(rows[0].draft_json, null), revision: rows[0].draft_revision, status: rows[0].status });
  }
  return res.json({ draft: json(project.draft_json, null), revision: project.draft_revision, stage: project.current_stage });
});

growthProjectsRouter.put("/:projectId/draft", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const expectedRevision = Number(req.body?.expectedRevision);
  const draft = cleanDraft(req.body?.draft);
  if (!Number.isInteger(expectedRevision) || !draft) return bad(res, 400, "INVALID_DRAFT");
  const assessmentId = String(req.body?.assessmentId ?? "");
  if (assessmentId) {
    const result = await AppDataSource.query("UPDATE growth_project_assessments SET draft_json=?,draft_revision=draft_revision+1 WHERE id=? AND project_id=? AND owner_id=? AND status='ACTIVE' AND draft_revision=?", [JSON.stringify(draft), assessmentId, project.id, ownerId, expectedRevision]);
    if (!result.affectedRows) return bad(res, 409, "DRAFT_REVISION_CONFLICT");
    const next = await AppDataSource.query("SELECT draft_revision FROM growth_project_assessments WHERE id=?", [assessmentId]) as Array<{ draft_revision: number }>;
    return res.json({ revision: next[0]?.draft_revision ?? expectedRevision + 1 });
  }
  const result = await AppDataSource.query("UPDATE growth_projects SET draft_json=?,draft_revision=draft_revision+1 WHERE id=? AND owner_id=? AND draft_revision=?", [JSON.stringify(draft), project.id, ownerId, expectedRevision]);
  if (!result.affectedRows) return bad(res, 409, "DRAFT_REVISION_CONFLICT");
  const next = await AppDataSource.query("SELECT draft_revision FROM growth_projects WHERE id=?", [project.id]) as Array<{ draft_revision: number }>;
  return res.json({ revision: next[0]?.draft_revision ?? expectedRevision + 1 });
});

growthProjectsRouter.post("/:projectId/executions", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const idempotencyKey = text(req.header("Idempotency-Key") ?? req.body?.idempotencyKey, 128);
  if (!idempotencyKey) return bad(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
  const contextKey = text(req.body?.assessmentId ? `assessment:${req.body.assessmentId}` : req.body?.stageKey, 64);
  let draft: Draft | null = null;
  let tests: JudgeTestCase[] | null = null;
  let draftRevision = -1;
  let assessment: Record<string, unknown> | null = null;
  if (contextKey.startsWith("assessment:")) {
    const assessmentId = contextKey.slice("assessment:".length);
    const loaded = await assessmentTests(project, assessmentId);
    if (!loaded) return bad(res, 409, "ASSESSMENT_NOT_ACTIVE");
    draft = loaded.draft; tests = loaded.tests; assessment = loaded.row; draftRevision = Number(loaded.row.draft_revision);
    if (String(req.body?.assessmentId) !== assessmentId) return bad(res, 400, "INVALID_ASSESSMENT");
  } else {
    if (contextKey !== project.current_stage) return bad(res, 409, "STAGE_NOT_CURRENT");
    draft = cleanDraft(json(project.draft_json, null));
    draftRevision = project.draft_revision;
    tests = draft ? contextTests(project, draft, contextKey) : null;
  }
  if (!draft || !tests) return bad(res, 409, "PROJECT_CONTEXT_INVALID");
  if (Number(req.body?.draftRevision) !== draftRevision) return bad(res, 409, "DRAFT_REVISION_CONFLICT");
  const isAssessment = Boolean(assessment);
  if (!isAssessment && contextKey !== "V1" && draft.examples.length < 2) return bad(res, 400, "TWO_OWN_EXAMPLES_REQUIRED");
  if (isAssessment && draft.examples.length < 1) return bad(res, 400, "OWN_EXAMPLE_REQUIRED");
  const artifactContentHash = draftHash(draft);
  const testsHash = hash(JSON.stringify(tests));
  const previous = await AppDataSource.query("SELECT j.id,a.content_hash,j.tests_hash,j.state FROM growth_project_jobs j JOIN growth_project_artifacts a ON a.id=j.artifact_id WHERE j.owner_id=? AND j.idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
  if (previous[0]) {
    if (previous[0].content_hash !== artifactContentHash || previous[0].tests_hash !== testsHash || previous[0].state === "CANCELLED") return bad(res, 409, "IDEMPOTENCY_CONFLICT");
    return res.status(202).json({ jobId: previous[0].id, state: previous[0].state });
  }
  const jobId = randomUUID();
  const runner = AppDataSource.createQueryRunner();
  await runner.connect(); await runner.startTransaction();
  try {
    await runner.query("SELECT id FROM users WHERE id=? FOR UPDATE", [ownerId]);
    await runner.query("SELECT id FROM growth_project_queue_guard WHERE id=1 FOR UPDATE");
    const repeated = await runner.query("SELECT j.id,a.content_hash,j.tests_hash,j.state FROM growth_project_jobs j JOIN growth_project_artifacts a ON a.id=j.artifact_id WHERE j.owner_id=? AND j.idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
    if (repeated[0]) {
      if (repeated[0].content_hash !== artifactContentHash || repeated[0].tests_hash !== testsHash || repeated[0].state === "CANCELLED") throw new Error("IDEMPOTENCY_CONFLICT");
      await runner.commitTransaction();
      return res.status(202).json({ jobId: repeated[0].id, state: repeated[0].state });
    }
    const active = await runner.query("SELECT id FROM growth_project_jobs WHERE owner_id=? AND state IN ('QUEUED','RUNNING') LIMIT 1 FOR UPDATE", [ownerId]) as Array<{ id: string }>;
    if (active[0]) throw new Error("ACTIVE_EXECUTION_EXISTS");
    const queue = await runner.query("SELECT id FROM growth_project_jobs WHERE state IN ('QUEUED','RUNNING') ORDER BY created_at LIMIT 20 FOR UPDATE") as Array<{ id: string }>;
    if (queue.length >= 20) throw new Error("PROJECT_EXECUTION_QUEUE_FULL");
    const rate = await runner.query("SELECT id FROM growth_project_jobs WHERE owner_id=? AND created_at>DATE_SUB(NOW(3),INTERVAL 5 SECOND) LIMIT 1", [ownerId]) as Array<{ id: string }>;
    if (rate[0]) throw new Error("PROJECT_EXECUTION_RATE_LIMIT");
    const artifactId = await artifactFor(ownerId, draft, runner);
    await runner.query("INSERT INTO growth_project_jobs (id,project_id,owner_id,context_key,artifact_id,blueprint_revision,tests_hash,tests_json,idempotency_key,state) VALUES (?,?,?,?,?,?,?,?,?,'QUEUED')", [jobId, project.id, ownerId, contextKey, artifactId, project.blueprint_revision, testsHash, JSON.stringify(tests), idempotencyKey]);
    if (assessment) await runner.query("UPDATE growth_project_assessments SET job_id=? WHERE id=? AND status='ACTIVE'", [jobId, assessment.id]);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    const code = error instanceof Error ? error.message : "PROJECT_EXECUTION_QUEUE_ERROR";
    const status = code === "PROJECT_EXECUTION_QUEUE_FULL" || code === "PROJECT_EXECUTION_RATE_LIMIT" ? 429 : 409;
    if (["IDEMPOTENCY_CONFLICT", "ACTIVE_EXECUTION_EXISTS", "PROJECT_EXECUTION_QUEUE_FULL", "PROJECT_EXECUTION_RATE_LIMIT"].includes(code)) return bad(res, status, code);
    const raced = await AppDataSource.query("SELECT j.id,a.content_hash,j.tests_hash,j.state FROM growth_project_jobs j JOIN growth_project_artifacts a ON a.id=j.artifact_id WHERE j.owner_id=? AND j.idempotency_key=?", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
    if (raced[0] && raced[0].content_hash === artifactContentHash && raced[0].tests_hash === testsHash && raced[0].state !== "CANCELLED") return res.status(202).json({ jobId: raced[0].id, state: raced[0].state });
    throw error;
  } finally { await runner.release(); }
  wakeGrowthProjectQueue();
  return res.status(202).json({ jobId, state: "QUEUED" });
});

growthProjectsRouter.get("/executions/:jobId", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  if (!UUID_RE.test(req.params.jobId)) return bad(res, 404, "JOB_NOT_FOUND");
  const rows = await AppDataSource.query("SELECT id,state,result_json,error_code,context_key,created_at,started_at,completed_at FROM growth_project_jobs WHERE id=? AND owner_id=?", [req.params.jobId, ownerId]) as Array<Record<string, unknown>>;
  const row = rows[0]; if (!row) return bad(res, 404, "JOB_NOT_FOUND");
  return res.json({ job: { id: row.id, state: row.state, context: row.context_key, result: json(row.result_json, null), errorCode: row.error_code, createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at } });
});

growthProjectsRouter.get("/:projectId/executions", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const beforeCreatedAt = text(req.query.beforeCreatedAt, 40);
  const beforeId = text(req.query.beforeId, 36);
  if (Boolean(beforeCreatedAt) !== Boolean(beforeId)) return bad(res, 400, "INVALID_EXECUTION_CURSOR");
  const cursorDate = beforeCreatedAt ? new Date(beforeCreatedAt) : null;
  if (cursorDate && !Number.isFinite(cursorDate.getTime())) return bad(res, 400, "INVALID_EXECUTION_CURSOR");
  const limitRaw = Number(req.query.limit ?? 20);
  const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(20, limitRaw)) : 20;
  const sql = `SELECT id,context_key,state,result_json,error_code,created_at,started_at,completed_at FROM growth_project_jobs
    WHERE project_id=? AND owner_id=? ${cursorDate ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
    ORDER BY created_at DESC,id DESC LIMIT ${limit + 1}`;
  const params = cursorDate ? [project.id, ownerId, cursorDate, cursorDate, beforeId] : [project.id, ownerId];
  const rows = await AppDataSource.query(sql, params) as Array<Record<string, unknown>>;
  const executions = rows.slice(0, limit).map(row => ({
    id: row.id, context: row.context_key, state: row.state, result: json(row.result_json, null), errorCode: row.error_code,
    createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at,
  }));
  const last = rows[Math.min(limit, rows.length) - 1];
  return res.json({
    executions,
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit && last ? { beforeCreatedAt: last.created_at, beforeId: last.id } : null,
  });
});

growthProjectsRouter.post("/:projectId/executions/:jobId/cancel", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  if (!UUID_RE.test(req.params.jobId)) return bad(res, 404, "JOB_NOT_FOUND");
  const rows = await AppDataSource.query("SELECT id FROM growth_project_jobs WHERE id=? AND project_id=? AND owner_id=? LIMIT 1", [req.params.jobId, project.id, ownerId]) as Array<{ id: string }>;
  if (!rows[0]) return bad(res, 404, "JOB_NOT_FOUND");
  const result = await cancelGrowthProjectJob(req.params.jobId, ownerId);
  if (result === "NOT_CANCELLABLE") return bad(res, 409, "EXECUTION_NOT_CANCELLABLE");
  if (result === "NOT_FOUND") return bad(res, 404, "JOB_NOT_FOUND");
  return res.json({ state: result });
});

growthProjectsRouter.post("/:projectId/versions", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const parsed = z.object({ jobId: z.string().uuid(), expectedRevision: z.number().int().positive(), explanation: z.string().trim().min(12).max(8_000) }).safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, 400, "VERSION_EXPLANATION_REQUIRED");
  const idempotencyKey = text(req.header("Idempotency-Key") ?? req.body?.idempotencyKey, 128);
  if (!idempotencyKey) return bad(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
  const replayRows = await AppDataSource.query("SELECT id,project_id,stage_key,sequence_no,previous_version_id,check_job_id,explanation FROM growth_project_versions WHERE owner_id=? AND idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
  const replay = replayRows[0];
  if (replay) {
    if (replay.project_id !== project.id || replay.check_job_id !== parsed.data.jobId || replay.explanation !== parsed.data.explanation) return bad(res, 409, "IDEMPOTENCY_CONFLICT");
    const stage = String(replay.stage_key);
    const nextStage = stage === "V1" ? "V2" : stage === "V2" ? "V3" : "V3";
    return res.status(200).json({ version: { id: replay.id, stage, sequence: replay.sequence_no, previousVersionId: replay.previous_version_id }, nextStage, defenseAvailable: stage === "V3" });
  }
  const priorVersion = await AppDataSource.query("SELECT id FROM growth_project_versions WHERE owner_id=? AND check_job_id=? LIMIT 1", [ownerId, parsed.data.jobId]) as Array<{ id: string }>;
  if (priorVersion[0]) return bad(res, 409, "CHECK_ALREADY_SUBMITTED");
  if (parsed.data.expectedRevision !== project.draft_revision) return bad(res, 409, "DRAFT_REVISION_CONFLICT");
  const draft = cleanDraft(json(project.draft_json, null));
  if (!draft || (project.current_stage !== "V1" && draft.examples.length < 2)) return bad(res, 400, project.current_stage === "V1" ? "INVALID_DRAFT" : "TWO_OWN_EXAMPLES_REQUIRED");
  const expectedTests = contextTests(project, draft, project.current_stage);
  const testsHash = expectedTests ? hash(JSON.stringify(expectedTests)) : "";
  const jobs = await AppDataSource.query("SELECT id,context_key,artifact_id,tests_hash,state,result_json,blueprint_revision FROM growth_project_jobs WHERE id=? AND project_id=? AND owner_id=?", [parsed.data.jobId, project.id, ownerId]) as Array<Record<string, unknown>>;
  const job = jobs[0];
  const currentArtifact = await artifactFor(ownerId, draft);
  if (!job || job.state !== "COMPLETED" || job.context_key !== project.current_stage || job.artifact_id !== currentArtifact || job.tests_hash !== testsHash || job.blueprint_revision !== project.blueprint_revision) return bad(res, 409, "CHECK_STALE");
  const result = json<{ passed?: boolean }>(job.result_json, {});
  if (!result.passed) return bad(res, 409, "CHECK_NOT_PASSED");
  const nextStage = project.current_stage === "V1" ? "V2" : project.current_stage === "V2" ? "V3" : "V3";
  const id = randomUUID();
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    const locked = await runner.query("SELECT current_stage,draft_revision FROM growth_projects WHERE id=? AND owner_id=? FOR UPDATE", [project.id, ownerId]) as Array<{ current_stage: string; draft_revision: number }>;
    const repeated = await runner.query("SELECT id,project_id,stage_key,sequence_no,previous_version_id,check_job_id,explanation FROM growth_project_versions WHERE owner_id=? AND idempotency_key=? LIMIT 1 FOR UPDATE", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
    if (repeated[0]) {
      const row = repeated[0];
      if (row.project_id !== project.id || row.check_job_id !== parsed.data.jobId || row.explanation !== parsed.data.explanation) throw new Error("IDEMPOTENCY_CONFLICT");
      await runner.commitTransaction();
      const stage = String(row.stage_key);
      const replayNextStage = stage === "V1" ? "V2" : stage === "V2" ? "V3" : "V3";
      return res.status(200).json({ version: { id: row.id, stage, sequence: row.sequence_no, previousVersionId: row.previous_version_id }, nextStage: replayNextStage, defenseAvailable: stage === "V3" });
    }
    if (!locked[0] || locked[0].current_stage !== project.current_stage || Number(locked[0].draft_revision) !== project.draft_revision) throw new Error("DRAFT_REVISION_CONFLICT");
    const seqRows = await runner.query("SELECT COALESCE(MAX(sequence_no),0)+1 AS next FROM growth_project_versions WHERE project_id=? AND stage_key=?", [project.id, project.current_stage]) as Array<{ next: number }>;
    const sequence = Number(seqRows[0]?.next ?? 1);
    let previousVersionId: string | null = null;
    if (project.current_stage === "V2") {
      const prior = await runner.query("SELECT id FROM growth_project_versions WHERE project_id=? AND stage_key='V1' ORDER BY sequence_no DESC LIMIT 1", [project.id]) as Array<{ id: string }>;
      previousVersionId = prior[0]?.id ?? null;
    } else if (project.current_stage === "V3") {
      const sameStage = await runner.query("SELECT id FROM growth_project_versions WHERE project_id=? AND stage_key='V3' ORDER BY sequence_no DESC LIMIT 1", [project.id]) as Array<{ id: string }>;
      if (sameStage[0]) previousVersionId = sameStage[0].id;
      else {
        const prior = await runner.query("SELECT id FROM growth_project_versions WHERE project_id=? AND stage_key='V2' ORDER BY sequence_no DESC LIMIT 1", [project.id]) as Array<{ id: string }>;
        previousVersionId = prior[0]?.id ?? null;
      }
    }
    await runner.query("INSERT INTO growth_project_versions (id,project_id,owner_id,stage_key,sequence_no,artifact_id,check_job_id,previous_version_id,blueprint_revision,idempotency_key,explanation) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [id, project.id, ownerId, project.current_stage, sequence, currentArtifact, job.id, previousVersionId, project.blueprint_revision, idempotencyKey, parsed.data.explanation]);
    if (project.current_stage !== "V3") {
      const family = growthFamilyFor(project.family_key, project.blueprint_revision)!;
      const nextFiles = [...draft.files];
      const paths = new Set(nextFiles.map(file => file.path));
      for (const file of growthProjectFiles(family, project.runtime, nextStage).filter(file => !paths.has(file.path))) nextFiles.push(file);
      const nextDraft: Draft = { ...draft, files: nextFiles.sort((a, b) => a.path.localeCompare(b.path)), examples: [], explanation: "" };
      await runner.query("UPDATE growth_projects SET current_stage=?,draft_json=?,draft_revision=draft_revision+1 WHERE id=?", [nextStage, JSON.stringify(nextDraft), project.id]);
    }
    await runner.commitTransaction();
    return res.status(201).json({ version: { id, stage: project.current_stage, sequence, previousVersionId }, nextStage, defenseAvailable: project.current_stage === "V3" });
  } catch (error) {
    await runner.rollbackTransaction();
    if (error instanceof Error && ["DRAFT_REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(error.message)) return bad(res, 409, error.message);
    const raced = await AppDataSource.query("SELECT id,project_id,stage_key,sequence_no,previous_version_id,check_job_id,explanation FROM growth_project_versions WHERE owner_id=? AND idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
    if (raced[0] && raced[0].project_id === project.id && raced[0].check_job_id === parsed.data.jobId && raced[0].explanation === parsed.data.explanation) {
      const stage = String(raced[0].stage_key);
      const replayNextStage = stage === "V1" ? "V2" : stage === "V2" ? "V3" : "V3";
      return res.status(200).json({ version: { id: raced[0].id, stage, sequence: raced[0].sequence_no, previousVersionId: raced[0].previous_version_id }, nextStage: replayNextStage, defenseAvailable: stage === "V3" });
    }
    const usedCheck = await AppDataSource.query("SELECT id FROM growth_project_versions WHERE owner_id=? AND check_job_id=? LIMIT 1", [ownerId, parsed.data.jobId]) as Array<{ id: string }>;
    if (usedCheck[0]) return bad(res, 409, "CHECK_ALREADY_SUBMITTED");
    throw error;
  } finally { await runner.release(); }
});

growthProjectsRouter.get("/:projectId/versions/:versionId", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const rows = await AppDataSource.query(`SELECT v.id,v.stage_key,v.sequence_no,v.previous_version_id,v.blueprint_revision,v.explanation,v.created_at,a.files_json,a.examples_json,j.result_json
    FROM growth_project_versions v JOIN growth_project_artifacts a ON a.id=v.artifact_id
    JOIN growth_project_jobs j ON j.id=v.check_job_id WHERE v.id=? AND v.project_id=? AND v.owner_id=?`, [req.params.versionId, req.params.projectId, ownerId]) as Array<Record<string, unknown>>;
  if (!rows[0]) return bad(res, 404, "VERSION_NOT_FOUND");
  const row = rows[0];
  return res.json({ version: { id: row.id, stage: row.stage_key, sequence: row.sequence_no, previousVersionId: row.previous_version_id, blueprintRevision: row.blueprint_revision, explanation: row.explanation, createdAt: row.created_at, files: json(row.files_json, []), examples: json(row.examples_json, []), check: json(row.result_json, null) } });
});

growthProjectsRouter.post("/:projectId/versions/:versionId/restore", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const expectedRevision = Number(req.body?.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) return bad(res, 400, "INVALID_DRAFT_REVISION");
  const rows = await AppDataSource.query(`SELECT a.files_json,a.examples_json,v.explanation
    FROM growth_project_versions v JOIN growth_project_artifacts a ON a.id=v.artifact_id
    WHERE v.id=? AND v.project_id=? AND v.owner_id=? LIMIT 1`, [req.params.versionId, project.id, ownerId]) as Array<Record<string, unknown>>;
  if (!rows[0]) return bad(res, 404, "VERSION_NOT_FOUND");
  const restored = cleanDraft({ files: json(rows[0].files_json, []), examples: json(rows[0].examples_json, []), explanation: rows[0].explanation });
  if (!restored) return bad(res, 409, "VERSION_ARTIFACT_INVALID");
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    const locked = await runner.query("SELECT draft_revision FROM growth_projects WHERE id=? AND owner_id=? FOR UPDATE", [project.id, ownerId]) as Array<{ draft_revision: number }>;
    if (!locked[0] || Number(locked[0].draft_revision) !== expectedRevision) throw new Error("DRAFT_REVISION_CONFLICT");
    await runner.query("UPDATE growth_projects SET draft_json=?,draft_revision=draft_revision+1 WHERE id=? AND owner_id=?", [JSON.stringify(restored), project.id, ownerId]);
    await runner.commitTransaction();
    return res.json({ draft: restored, revision: expectedRevision + 1, currentStage: project.current_stage });
  } catch (error) {
    await runner.rollbackTransaction();
    if (error instanceof Error && error.message === "DRAFT_REVISION_CONFLICT") return bad(res, 409, "DRAFT_REVISION_CONFLICT");
    throw error;
  } finally { await runner.release(); }
});

growthProjectsRouter.post("/:projectId/assessments", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const kind = req.body?.kind === "TRANSFER" ? "TRANSFER" : req.body?.kind === "DEFENSE" ? "DEFENSE" : null;
  if (!kind) return bad(res, 400, "INVALID_ASSESSMENT_KIND");
  const idempotencyKey = text(req.header("Idempotency-Key") ?? req.body?.idempotencyKey, 128);
  if (!idempotencyKey) return bad(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
  const replayRows = await AppDataSource.query("SELECT id,project_id,kind,source_version_id,card_snapshot,draft_json,draft_revision,status FROM growth_project_assessments WHERE owner_id=? AND idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
  const replay = replayRows[0];
  if (replay) {
    if (replay.project_id !== project.id || replay.kind !== kind) return bad(res, 409, "IDEMPOTENCY_CONFLICT");
    return res.status(200).json({ assessment: { id: replay.id, kind: replay.kind, sourceVersionId: replay.source_version_id, card: publicAssessmentCard(replay.card_snapshot), draft: json(replay.draft_json, null), revision: replay.draft_revision, status: replay.status, builtInAi: false, externalHelpAudited: false } });
  }
  const family = growthFamilyFor(project.family_key, project.blueprint_revision);
  if (!family) return bad(res, 409, "BLUEPRINT_REVISION_UNAVAILABLE");
  const language = String(req.headers["accept-language"] ?? "uk").toLowerCase().startsWith("en") ? "en" : "uk";
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    await runner.query("SELECT id FROM growth_projects WHERE id=? AND owner_id=? FOR UPDATE", [project.id, ownerId]);
    const repeated = await runner.query("SELECT id,project_id,kind,source_version_id,card_snapshot,draft_json,draft_revision,status FROM growth_project_assessments WHERE owner_id=? AND idempotency_key=? LIMIT 1 FOR UPDATE", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
    if (repeated[0]) {
      if (repeated[0].project_id !== project.id || repeated[0].kind !== kind) throw new Error("IDEMPOTENCY_CONFLICT");
      await runner.commitTransaction();
      const row = repeated[0];
      return res.status(200).json({ assessment: { id: row.id, kind: row.kind, sourceVersionId: row.source_version_id, card: publicAssessmentCard(row.card_snapshot), draft: json(row.draft_json, null), revision: row.draft_revision, status: row.status, builtInAi: false, externalHelpAudited: false } });
    }
    const active = await runner.query("SELECT id FROM growth_project_assessments WHERE project_id=? AND owner_id=? AND kind=? AND status='ACTIVE' LIMIT 1 FOR UPDATE", [project.id, ownerId, kind]) as Array<{ id: string }>;
    if (active[0]) throw new Error("ACTIVE_ASSESSMENT_EXISTS");
    const versions = await runner.query("SELECT id,artifact_id FROM growth_project_versions WHERE project_id=? AND owner_id=? AND stage_key='V3' ORDER BY sequence_no DESC LIMIT 1", [project.id, ownerId]) as Array<{ id: string; artifact_id: string }>;
    if (!versions[0]) throw new Error("V3_REQUIRED");
    if (kind === "TRANSFER") {
      const passed = await runner.query("SELECT id FROM growth_project_assessments WHERE project_id=? AND owner_id=? AND source_version_id=? AND kind='DEFENSE' AND status='PASSED' LIMIT 1", [project.id, ownerId, versions[0].id]) as Array<{ id: string }>;
      if (!passed[0]) throw new Error("DEFENSE_REQUIRED");
    }
    const countRows = await runner.query("SELECT COUNT(*) AS count FROM growth_project_assessments WHERE project_id=? AND kind=?", [project.id, kind]) as Array<{ count: number }>;
    const cards = kind === "DEFENSE" ? family.cards : family.transferCards;
    const cardIndex = Number(countRows[0]?.count ?? 0) % cards.length;
    const card = cards[cardIndex];
    const cardSnapshot = { id: card.id, title: language === "en" ? card.titleEn : card.titleUk, prompt: language === "en" ? card.promptEn : card.promptUk, tests: card.tests };
    const versionFiles = await runner.query("SELECT files_json FROM growth_project_artifacts WHERE id=? AND owner_id=?", [versions[0].artifact_id, ownerId]) as Array<{ files_json: string }>;
    const draft: Draft = kind === "DEFENSE" ? { files: json(versionFiles[0]?.files_json, []), examples: [] } : { files: growthProjectFiles(family, project.runtime, "V1"), examples: [] };
    const id = randomUUID();
    await runner.query("INSERT INTO growth_project_assessments (id,project_id,owner_id,kind,source_version_id,card_id,idempotency_key,card_snapshot,draft_json,status) VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE')", [id, project.id, ownerId, kind, versions[0].id, cardSnapshot.id, idempotencyKey, JSON.stringify(cardSnapshot), JSON.stringify(draft)]);
    await runner.commitTransaction();
    return res.status(201).json({ assessment: { id, kind, sourceVersionId: versions[0].id, card: publicAssessmentCard(cardSnapshot), draft, revision: 1, status: "ACTIVE", builtInAi: false, externalHelpAudited: false } });
  } catch (error) {
    await runner.rollbackTransaction();
    const code = error instanceof Error ? error.message : "ASSESSMENT_CREATE_FAILED";
    if (["IDEMPOTENCY_CONFLICT", "ACTIVE_ASSESSMENT_EXISTS", "V3_REQUIRED", "DEFENSE_REQUIRED"].includes(code)) return bad(res, code === "V3_REQUIRED" || code === "DEFENSE_REQUIRED" ? 409 : 409, code);
    const raced = await AppDataSource.query("SELECT id,project_id,kind,source_version_id,card_snapshot,draft_json,draft_revision,status FROM growth_project_assessments WHERE owner_id=? AND idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
    if (raced[0] && raced[0].project_id === project.id && raced[0].kind === kind) {
      const row = raced[0];
      return res.status(200).json({ assessment: { id: row.id, kind: row.kind, sourceVersionId: row.source_version_id, card: publicAssessmentCard(row.card_snapshot), draft: json(row.draft_json, null), revision: row.draft_revision, status: row.status, builtInAi: false, externalHelpAudited: false } });
    }
    throw error;
  } finally { await runner.release(); }
});

growthProjectsRouter.get("/:projectId/assessments/:assessmentId", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const rows = await AppDataSource.query("SELECT id,kind,card_id,card_snapshot,draft_json,draft_revision,status,completed_at FROM growth_project_assessments WHERE id=? AND project_id=? AND owner_id=? LIMIT 1", [req.params.assessmentId, project.id, ownerId]) as Array<Record<string, unknown>>;
  if (!rows[0]) return bad(res, 404, "ASSESSMENT_NOT_FOUND");
  const row = rows[0];
  return res.json({ assessment: { id: row.id, kind: row.kind, card: publicAssessmentCard(row.card_snapshot), draft: json(row.draft_json, null), revision: row.draft_revision, status: row.status, completedAt: row.completed_at, builtInAi: false } });
});

growthProjectsRouter.delete("/:projectId/assessments/:assessmentId", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const rows = await AppDataSource.query("SELECT id,job_id,status FROM growth_project_assessments WHERE id=? AND project_id=? AND owner_id=? LIMIT 1", [req.params.assessmentId, project.id, ownerId]) as Array<{ id: string; job_id: string | null; status: string }>;
  if (!rows[0]) return bad(res, 404, "ASSESSMENT_NOT_FOUND");
  if (rows[0].status !== "ACTIVE") return bad(res, 409, "ASSESSMENT_NOT_ACTIVE");
  const update = await AppDataSource.query("UPDATE growth_project_assessments SET status='CANCELLED',completed_at=NOW(3) WHERE id=? AND owner_id=? AND status='ACTIVE'", [rows[0].id, ownerId]);
  if (!update.affectedRows) return bad(res, 409, "ASSESSMENT_NOT_ACTIVE");
  if (rows[0].job_id) await cancelGrowthProjectJob(rows[0].job_id, ownerId);
  return res.json({ cancelled: true });
});

growthProjectsRouter.post("/:projectId/assessments/:assessmentId/finish", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const explanation = text(req.body?.explanation, 8_000);
  if (explanation.length < 12) return bad(res, 400, "EXPLANATION_REQUIRED");
  const loaded = await assessmentTests(project, req.params.assessmentId);
  if (!loaded || !loaded.row.job_id) return bad(res, 409, "ASSESSMENT_CHECK_REQUIRED");
  const draft = loaded.draft;
  const artifactId = await artifactFor(ownerId, draft);
  const testsHash = hash(JSON.stringify(loaded.tests));
  const jobs = await AppDataSource.query("SELECT state,artifact_id,tests_hash,result_json FROM growth_project_jobs WHERE id=? AND owner_id=? AND project_id=?", [loaded.row.job_id, ownerId, project.id]) as Array<Record<string, unknown>>;
  const job = jobs[0];
  if (!job || job.state !== "COMPLETED" || job.artifact_id !== artifactId || job.tests_hash !== testsHash) return bad(res, 409, "CHECK_STALE");
  const result = json<{ passed?: boolean }>(job.result_json, {});
  const status = result.passed ? "PASSED" : "FAILED";
  await AppDataSource.query("UPDATE growth_project_assessments SET status=?,explanation=?,completed_at=NOW(3),duration_seconds=? WHERE id=? AND owner_id=? AND status='ACTIVE'", [status, explanation, Math.max(0, Math.min(86_400, Number(req.body?.durationSeconds) || 0)), req.params.assessmentId, ownerId]);
  return res.json({ assessment: { id: req.params.assessmentId, status, result } });
});

async function reviewSnapshot(ownerId: number, projectId: string, versionId: string, assessmentIds: string[]) {
  const versions = await AppDataSource.query(`SELECT v.id,v.stage_key,v.sequence_no,v.explanation,v.created_at,a.files_json,a.examples_json,j.result_json
    FROM growth_project_versions v JOIN growth_project_artifacts a ON a.id=v.artifact_id
    JOIN growth_project_jobs j ON j.id=v.check_job_id WHERE v.id=? AND v.project_id=? AND v.owner_id=?`, [versionId, projectId, ownerId]) as Array<Record<string, unknown>>;
  if (!versions[0]) return null;
  const version = versions[0];
  const assessments: Array<Record<string, unknown>> = [];
  if (assessmentIds.length) {
    const placeholders = assessmentIds.map(() => "?").join(",");
    const rows = await AppDataSource.query(`SELECT id,kind,status,card_id,card_snapshot,draft_json,explanation,completed_at,(SELECT result_json FROM growth_project_jobs WHERE id=job_id) AS result_json
      FROM growth_project_assessments WHERE id IN (${placeholders}) AND project_id=? AND owner_id=? AND source_version_id=?`, [...assessmentIds, projectId, ownerId, versionId]) as Array<Record<string, unknown>>;
    if (rows.length !== assessmentIds.length || rows.some(row => row.status !== "PASSED")) return null;
    assessments.push(...rows.map(row => ({
      id: row.id, kind: row.kind, status: row.status, card: publicAssessmentCard(row.card_snapshot),
      files: json(cleanDraft(json(row.draft_json, null))?.files, []), explanation: row.explanation, completedAt: row.completed_at, check: json(row.result_json, null),
    })));
  }
  return {
    version: {
      id: version.id, stage: version.stage_key, sequence: version.sequence_no, explanation: version.explanation,
      createdAt: version.created_at, files: json(version.files_json, []), examples: json(version.examples_json, []),
      check: json<{ passed?: boolean; publicTests?: Array<{ input: string; output: string; passed: boolean }>; ownExampleOutputs?: Array<{ input: string; output: string; passed: boolean }> }>(version.result_json, {}),
    },
    assessments,
  };
}

growthProjectsRouter.post("/:projectId/publications", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const parsed = z.object({
    versionId: z.string().uuid(), channel: z.enum(["LINK", "PROFILE"]), title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4_000).default(""), assessmentIds: z.array(z.string().uuid()).max(2).default([]),
    demoIndex: z.number().int().min(0).max(9).optional(), includeReviews: z.boolean().default(false),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, 400, "INVALID_PUBLICATION");
  const idempotencyKey = text(req.header("Idempotency-Key") ?? req.body?.idempotencyKey, 128);
  if (!idempotencyKey) return bad(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
  const snapshot = await reviewSnapshot(ownerId, project.id, parsed.data.versionId, parsed.data.assessmentIds);
  const legacyImport = Boolean(project.source_json);
  if (!snapshot || snapshot.version.check?.passed !== true && !legacyImport) return bad(res, 409, "PUBLISHED_VERSION_REQUIRED");
  const examples = snapshot.version.examples as Draft["examples"];
  let demo: { input: string; output: string } | null = null;
  if (parsed.data.demoIndex !== undefined && !legacyImport) {
    const candidates = [
      ...(snapshot.version.check?.publicTests ?? []).filter((item: any) => item.passed).map((item: any) => ({ input: item.input, output: item.output })),
      ...(snapshot.version.check?.ownExampleOutputs ?? []).filter((item: any) => item.passed).map((item: any) => ({ input: item.input, output: item.output })),
    ];
    const selected = candidates[parsed.data.demoIndex];
    if (!selected) return bad(res, 400, "DEMO_NOT_VERIFIED");
    demo = { input: selected.input, output: selected.output };
  }
  const evidenceJson = JSON.stringify({ assessmentIds: parsed.data.assessmentIds });
  const demoJson = demo ? JSON.stringify(demo) : null;
  const matchesRequest = (row: Record<string, unknown>) =>
    row.project_id === project.id && row.version_id === parsed.data.versionId && row.channel === parsed.data.channel &&
    row.title === parsed.data.title && row.description === parsed.data.description &&
    String(row.evidence_json) === evidenceJson && (row.demo_json == null ? null : String(row.demo_json)) === demoJson &&
    Number(row.review_visible) === Number(parsed.data.includeReviews);
  const existing = await AppDataSource.query("SELECT * FROM growth_project_publications WHERE owner_id=? AND idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
  if (existing[0]) {
    if (!matchesRequest(existing[0])) return bad(res, 409, "IDEMPOTENCY_CONFLICT");
    return res.status(200).json({ publication: { id: existing[0].id, channel: existing[0].channel, publicId: existing[0].public_id, url: existing[0].channel === "LINK" ? `/portfolio/${existing[0].public_id}` : null, versionId: existing[0].version_id, title: existing[0].title } });
  }
  const token = randomBytes(24).toString("base64url");
  const id = randomUUID();
  try {
    await AppDataSource.query(`INSERT INTO growth_project_publications
      (id,project_id,owner_id,version_id,channel,public_id,idempotency_key,title,description,evidence_json,demo_json,review_visible,revoked)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`, [id, project.id, ownerId, parsed.data.versionId, parsed.data.channel, token, idempotencyKey, parsed.data.title, parsed.data.description, evidenceJson, demoJson, parsed.data.includeReviews ? 1 : 0]);
  } catch (error) {
    const raced = await AppDataSource.query("SELECT * FROM growth_project_publications WHERE owner_id=? AND idempotency_key=? LIMIT 1", [ownerId, idempotencyKey]) as Array<Record<string, unknown>>;
    if (!raced[0]) throw error;
    if (!matchesRequest(raced[0])) return bad(res, 409, "IDEMPOTENCY_CONFLICT");
    return res.status(200).json({ publication: { id: raced[0].id, channel: raced[0].channel, publicId: raced[0].public_id, url: raced[0].channel === "LINK" ? `/portfolio/${raced[0].public_id}` : null, versionId: raced[0].version_id, title: raced[0].title } });
  }
  return res.status(201).json({ publication: { id, channel: parsed.data.channel, publicId: token, url: parsed.data.channel === "LINK" ? `/portfolio/${token}` : null, versionId: parsed.data.versionId, title: parsed.data.title } });
});

growthProjectsRouter.put("/:projectId/publications/:publicationId/version", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const parsed = z.object({ versionId: z.string().uuid(), assessmentIds: z.array(z.string().uuid()).max(2).default([]), demoIndex: z.number().int().min(0).max(9).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, 400, "INVALID_PUBLICATION_VERSION");
  const currentRows = await AppDataSource.query("SELECT id,channel FROM growth_project_publications WHERE id=? AND project_id=? AND owner_id=? AND revoked=0 LIMIT 1", [req.params.publicationId, project.id, ownerId]) as Array<{ id: string; channel: string }>;
  if (!currentRows[0]) return bad(res, 404, "PUBLICATION_NOT_FOUND");
  const snapshot = await reviewSnapshot(ownerId, project.id, parsed.data.versionId, parsed.data.assessmentIds);
  const legacyImport = Boolean(project.source_json);
  if (!snapshot || snapshot.version.check?.passed !== true && !legacyImport) return bad(res, 409, "PUBLISHED_VERSION_REQUIRED");
  let demo: { input: string; output: string } | null = null;
  if (parsed.data.demoIndex !== undefined && !legacyImport) {
    const candidates = [
      ...(snapshot.version.check?.publicTests ?? []).filter((item: any) => item.passed).map((item: any) => ({ input: item.input, output: item.output })),
      ...(snapshot.version.check?.ownExampleOutputs ?? []).filter((item: any) => item.passed).map((item: any) => ({ input: item.input, output: item.output })),
    ];
    const candidate = candidates[parsed.data.demoIndex];
    if (!candidate) return bad(res, 400, "DEMO_NOT_VERIFIED");
    demo = { input: candidate.input, output: candidate.output };
  }
  const result = await AppDataSource.query("UPDATE growth_project_publications SET version_id=?,evidence_json=?,demo_json=? WHERE id=? AND project_id=? AND owner_id=? AND revoked=0", [parsed.data.versionId, JSON.stringify({ assessmentIds: parsed.data.assessmentIds }), demo ? JSON.stringify(demo) : null, req.params.publicationId, project.id, ownerId]);
  if (!result.affectedRows) return bad(res, 404, "PUBLICATION_NOT_FOUND");
  return res.json({ versionId: parsed.data.versionId, evidence: parsed.data.assessmentIds, demo });
});

growthProjectsRouter.delete("/:projectId/publications/:publicationId", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const result = await AppDataSource.query("UPDATE growth_project_publications SET revoked=1 WHERE id=? AND project_id=? AND owner_id=?", [req.params.publicationId, req.params.projectId, ownerId]);
  if (!result.affectedRows) return bad(res, 404, "PUBLICATION_NOT_FOUND");
  return res.json({ revoked: true });
});

growthProjectsRouter.put("/:projectId/publications/:publicationId/reviews", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const visible = req.body?.visible === true;
  const result = await AppDataSource.query("UPDATE growth_project_publications SET review_visible=? WHERE id=? AND project_id=? AND owner_id=? AND revoked=0", [visible ? 1 : 0, req.params.publicationId, req.params.projectId, ownerId]);
  if (!result.affectedRows) return bad(res, 404, "PUBLICATION_NOT_FOUND");
  return res.json({ visible });
});

growthProjectsRouter.post("/:projectId/publications/:publicationId/rotate-link", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const rows = await AppDataSource.query("SELECT id,channel FROM growth_project_publications WHERE id=? AND project_id=? AND owner_id=? AND revoked=0", [req.params.publicationId, req.params.projectId, ownerId]) as Array<{ id: string; channel: string }>;
  if (!rows[0] || rows[0].channel !== "LINK") return bad(res, 404, "PUBLIC_LINK_NOT_FOUND");
  const token = randomBytes(24).toString("base64url");
  await AppDataSource.query("UPDATE growth_project_publications SET public_id=? WHERE id=? AND owner_id=?", [token, rows[0].id, ownerId]);
  return res.json({ publicId: token, url: `/portfolio/${token}` });
});

growthProjectsRouter.post("/:projectId/reviews", authRequired, async (req: AuthRequest, res: Response) => {
  const ownerId = await ownerOnly(req, res); if (!ownerId) return;
  const project = await ownedProject(req.params.projectId, ownerId); if (!project) return bad(res, 404, "PROJECT_NOT_FOUND");
  const parsed = z.object({ versionId: z.string().uuid(), reviewerUsername: z.string().trim().min(1).max(80).optional(), assessmentIds: z.array(z.string().uuid()).max(2).default([]) }).safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, 400, "INVALID_REVIEW_REQUEST");
  const snapshot = await reviewSnapshot(ownerId, project.id, parsed.data.versionId, parsed.data.assessmentIds);
  if (!snapshot) return bad(res, 409, "REVIEW_PACKAGE_INVALID");
  let kind = "OFFICIAL"; let reviewerId: number | null = null; let status = "REQUESTED";
  if (parsed.data.reviewerUsername) {
    const users = await AppDataSource.query("SELECT id FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [parsed.data.reviewerUsername]) as Array<{ id: number }>;
    if (!users[0]) return bad(res, 404, "REVIEWER_NOT_FOUND");
    if (users[0].id === ownerId) return bad(res, 400, "SELF_REVIEW_FORBIDDEN");
    reviewerId = users[0].id; kind = "INVITED"; status = "INVITED";
  }
  const id = randomUUID();
  await AppDataSource.query("INSERT INTO growth_project_reviews (id,project_id,owner_id,reviewer_id,kind,status,snapshot_json,invite_token) VALUES (?,?,?,?,?,?,?,?)", [id, project.id, ownerId, reviewerId, kind, status, JSON.stringify({ versionId: parsed.data.versionId, ...snapshot }), kind === "INVITED" ? randomBytes(24).toString("base64url") : null]);
  if (kind === "INVITED" && reviewerId) await notifyGrowthReview(reviewerId, ownerId, "GROWTH_REVIEW_INVITATION", `/projects/reviews?review=${id}`);
  if (kind === "OFFICIAL") {
    const admins = await AppDataSource.query("SELECT id FROM users WHERE role='SYSTEM_ADMIN' LIMIT 50") as Array<{ id: number }>;
    for (const admin of admins) await notifyGrowthReview(admin.id, ownerId, "GROWTH_REVIEW_REQUESTED", "/projects/admin/reviews");
  }
  return res.status(201).json({ review: { id, kind, status } });
});

growthProjectsRouter.get("/reviews/inbox", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") return bad(res, 403, "PERSONAL_USER_REQUIRED");
  const rows = await AppDataSource.query("SELECT id,project_id,owner_id,kind,status,created_at FROM growth_project_reviews WHERE reviewer_id=? AND status IN ('INVITED','PENDING') ORDER BY created_at ASC LIMIT 50", [req.userId]);
  return res.json({ reviews: rows });
});

growthProjectsRouter.get("/reviews/:reviewId", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") return bad(res, 403, "PERSONAL_USER_REQUIRED");
  const rows = await AppDataSource.query("SELECT * FROM growth_project_reviews WHERE id=? AND (owner_id=? OR reviewer_id=?) LIMIT 1", [req.params.reviewId, req.userId, req.userId]) as Array<Record<string, unknown>>;
  if (!rows[0]) return bad(res, 404, "REVIEW_NOT_FOUND");
  const row = rows[0];
  if (row.owner_id !== req.userId && row.status === "INVITED") return res.json({ review: { id: row.id, kind: row.kind, status: row.status, projectId: row.project_id } });
  if (row.owner_id !== req.userId && !["PENDING", "SUBMITTED"].includes(String(row.status))) return bad(res, 404, "REVIEW_NOT_FOUND");
  if (row.owner_id !== req.userId && row.kind === "OFFICIAL") {
    const grant = await AppDataSource.query("SELECT id FROM growth_project_reviewer_grants WHERE user_id=? AND revoked_at IS NULL LIMIT 1", [req.userId]);
    if (!grant.length) return bad(res, 403, "REVIEWER_GRANT_REVOKED");
  }
  return res.json({ review: { id: row.id, kind: row.kind, status: row.status, snapshot: json(row.snapshot_json, {}), scores: json(row.scores_json, null), comment: row.comment, recommendation: row.recommendation, reviewerNamePublic: Boolean(row.reviewer_name_public), authorPublic: Boolean(row.author_public) } });
});

growthProjectsRouter.delete("/reviews/:reviewId", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") return bad(res, 403, "PERSONAL_USER_REQUIRED");
  const result = await AppDataSource.query("UPDATE growth_project_reviews SET status='CANCELLED',reviewer_id=NULL,invite_token=NULL WHERE id=? AND owner_id=? AND status IN ('REQUESTED','INVITED','PENDING')", [req.params.reviewId, req.userId]);
  if (!result.affectedRows) return bad(res, 404, "REVIEW_REQUEST_NOT_CANCELLABLE");
  return res.json({ cancelled: true });
});

growthProjectsRouter.post("/reviews/:reviewId/respond", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") return bad(res, 403, "PERSONAL_USER_REQUIRED");
  const decision = req.body?.decision;
  if (decision !== "ACCEPT" && decision !== "DECLINE") return bad(res, 400, "INVALID_REVIEW_DECISION");
  const before = await AppDataSource.query("SELECT owner_id,project_id FROM growth_project_reviews WHERE id=? AND reviewer_id=? AND kind='INVITED' AND status='INVITED' LIMIT 1", [req.params.reviewId, req.userId]) as Array<{ owner_id: number; project_id: string }>;
  const result = await AppDataSource.query("UPDATE growth_project_reviews SET status=?,responded_at=NOW(3) WHERE id=? AND reviewer_id=? AND kind='INVITED' AND status='INVITED'", [decision === "ACCEPT" ? "PENDING" : "DECLINED", req.params.reviewId, req.userId]);
  if (!result.affectedRows) return bad(res, 409, "REVIEW_INVITATION_UNAVAILABLE");
  if (before[0]) await notifyGrowthReview(before[0].owner_id, Number(req.userId), decision === "ACCEPT" ? "GROWTH_REVIEW_ACCEPTED" : "GROWTH_REVIEW_DECLINED", `/projects?project=${before[0].project_id}`);
  return res.json({ status: decision === "ACCEPT" ? "PENDING" : "DECLINED" });
});

growthProjectsRouter.post("/reviews/:reviewId/submit", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") return bad(res, 403, "PERSONAL_USER_REQUIRED");
  const parsed = z.object({ scores: z.array(z.number().int().min(0).max(3)).length(4), comment: z.string().trim().min(1).max(8_000), recommendation: z.enum(["READY_TO_PUBLISH", "NEEDS_WORK"]), reviewerNamePublic: z.boolean().default(false) }).safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, 400, "INVALID_REVIEW");
  const rows = await AppDataSource.query("SELECT kind,status,reviewer_id,owner_id FROM growth_project_reviews WHERE id=? LIMIT 1", [req.params.reviewId]) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row || row.status !== "PENDING" || row.reviewer_id !== req.userId || row.owner_id === req.userId) return bad(res, 403, "REVIEW_ACCESS_DENIED");
  if (row.kind === "OFFICIAL") {
    const grants = await AppDataSource.query("SELECT id FROM growth_project_reviewer_grants WHERE user_id=? AND revoked_at IS NULL", [req.userId]);
    if (!grants.length) return bad(res, 403, "REVIEWER_GRANT_REQUIRED");
  }
  const saved = await AppDataSource.query("UPDATE growth_project_reviews SET status='SUBMITTED',scores_json=?,comment=?,recommendation=?,reviewer_name_public=?,responded_at=NOW(3) WHERE id=? AND status='PENDING'", [JSON.stringify(parsed.data.scores), parsed.data.comment, parsed.data.recommendation, parsed.data.reviewerNamePublic ? 1 : 0, req.params.reviewId]);
  if (!saved.affectedRows) return bad(res, 409, "REVIEW_ALREADY_SUBMITTED");
  const reviewProject = await AppDataSource.query("SELECT project_id FROM growth_project_reviews WHERE id=?", [req.params.reviewId]) as Array<{ project_id: string }>;
  if (reviewProject[0]) await notifyGrowthReview(Number(row.owner_id), Number(req.userId), "GROWTH_REVIEW_SUBMITTED", `/projects?project=${reviewProject[0].project_id}`);
  return res.json({ status: "SUBMITTED" });
});

growthProjectsRouter.post("/reviews/:reviewId/public-visibility", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") return bad(res, 403, "PERSONAL_USER_REQUIRED");
  const visible = req.body?.visible === true;
  const result = await AppDataSource.query("UPDATE growth_project_reviews SET author_public=? WHERE id=? AND owner_id=? AND status='SUBMITTED'", [visible ? 1 : 0, req.params.reviewId, req.userId]);
  if (!result.affectedRows) return bad(res, 404, "REVIEW_NOT_FOUND");
  return res.json({ visible });
});

growthProjectsRouter.post("/admin/reviewer-grants", authRequired, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "SYSTEM_ADMIN" || req.userType !== "USER") return bad(res, 403, "ADMIN_REQUIRED");
  let userId = Number(req.body?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    const username = text(req.body?.username, 80);
    if (!username) return bad(res, 400, "INVALID_REVIEWER");
    const named = await AppDataSource.query("SELECT id FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [username]) as Array<{ id: number }>;
    userId = Number(named[0]?.id);
  }
  if (!Number.isInteger(userId) || userId <= 0 || userId === req.userId) return bad(res, 400, "INVALID_REVIEWER");
  const users = await AppDataSource.query("SELECT id FROM users WHERE id=? AND user_mode='PERSONAL' LIMIT 1", [userId]);
  if (!users.length) return bad(res, 400, "PERSONAL_REVIEWER_REQUIRED");
  const existing = await AppDataSource.query("SELECT id FROM growth_project_reviewer_grants WHERE user_id=?", [userId]) as Array<{ id: number }>;
  if (existing[0]) await AppDataSource.query("UPDATE growth_project_reviewer_grants SET granted_by=?,revoked_at=NULL WHERE id=?", [req.userId, existing[0].id]);
  else await AppDataSource.query("INSERT INTO growth_project_reviewer_grants (user_id,granted_by) VALUES (?,?)", [userId, req.userId]);
  await AppDataSource.query("INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)", [req.userId, "GROWTH_PROJECT_REVIEWER_GRANTED", JSON.stringify({ userId })]).catch(() => undefined);
  return res.json({ granted: true, userId });
});

growthProjectsRouter.get("/admin/reviewers", authRequired, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "SYSTEM_ADMIN" || req.userType !== "USER") return bad(res, 403, "ADMIN_REQUIRED");
  const rows = await AppDataSource.query("SELECT g.user_id AS id,u.username,g.granted_by,g.created_at FROM growth_project_reviewer_grants g JOIN users u ON u.id=g.user_id WHERE g.revoked_at IS NULL ORDER BY u.username LIMIT 200");
  return res.json({ reviewers: rows });
});

growthProjectsRouter.delete("/admin/reviewer-grants/:userId", authRequired, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "SYSTEM_ADMIN" || req.userType !== "USER") return bad(res, 403, "ADMIN_REQUIRED");
  const userId = Number(req.params.userId);
  await AppDataSource.query("UPDATE growth_project_reviewer_grants SET revoked_at=NOW(3) WHERE user_id=?", [userId]);
  await AppDataSource.query("INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)", [req.userId, "GROWTH_PROJECT_REVIEWER_REVOKED", JSON.stringify({ userId })]).catch(() => undefined);
  return res.json({ revoked: true });
});

growthProjectsRouter.get("/admin/review-requests", authRequired, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "SYSTEM_ADMIN" || req.userType !== "USER") return bad(res, 403, "ADMIN_REQUIRED");
  const rows = await AppDataSource.query("SELECT r.id,r.project_id,r.owner_id,r.kind,r.status,r.created_at,u.username AS owner_username,p.family_key,p.runtime FROM growth_project_reviews r JOIN users u ON u.id=r.owner_id JOIN growth_projects p ON p.id=r.project_id WHERE r.kind='OFFICIAL' AND r.status='REQUESTED' ORDER BY r.created_at LIMIT 100");
  return res.json({ requests: rows });
});

growthProjectsRouter.post("/admin/reviews/:reviewId/assign", authRequired, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "SYSTEM_ADMIN" || req.userType !== "USER") return bad(res, 403, "ADMIN_REQUIRED");
  const reviewerId = Number(req.body?.reviewerId);
  const grants = await AppDataSource.query("SELECT id FROM growth_project_reviewer_grants WHERE user_id=? AND revoked_at IS NULL", [reviewerId]);
  if (!Number.isInteger(reviewerId) || !grants.length) return bad(res, 400, "ACTIVE_REVIEWER_REQUIRED");
  const result = await AppDataSource.query("UPDATE growth_project_reviews SET reviewer_id=?,status='PENDING',responded_at=NOW(3) WHERE id=? AND kind='OFFICIAL' AND status='REQUESTED'", [reviewerId, req.params.reviewId]);
  if (!result.affectedRows) return bad(res, 404, "REVIEW_REQUEST_NOT_FOUND");
  const requestRows = await AppDataSource.query("SELECT owner_id,project_id FROM growth_project_reviews WHERE id=?", [req.params.reviewId]) as Array<{ owner_id: number; project_id: string }>;
  if (requestRows[0]) {
    await notifyGrowthReview(reviewerId, Number(req.userId), "GROWTH_REVIEW_ASSIGNED", `/projects/reviews?review=${req.params.reviewId}`);
    await notifyGrowthReview(requestRows[0].owner_id, Number(req.userId), "GROWTH_REVIEW_ASSIGNED_TO_AUTHOR", `/projects?project=${requestRows[0].project_id}`);
  }
  await AppDataSource.query("INSERT INTO audit_logs (user_id,action,details) VALUES (?,?,?)", [req.userId, "GROWTH_PROJECT_REVIEW_ASSIGNED", JSON.stringify({ reviewId: req.params.reviewId, reviewerId })]).catch(() => undefined);
  return res.json({ assigned: true });
});

growthProjectPublicRouter.get("/share/:publicId", async (req, res) => servePublicPublication(req.params.publicId, res));
growthProjectPublicRouter.get("/profile/:username", async (req, res) => {
  const users = await AppDataSource.query("SELECT id,username,first_name AS firstName,last_name AS lastName FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [req.params.username]) as Array<Record<string, unknown>>;
  if (!users[0]) return bad(res, 404, "PROFILE_NOT_FOUND");
  const rows = await AppDataSource.query("SELECT public_id FROM growth_project_publications WHERE owner_id=? AND channel='PROFILE' AND revoked=0 ORDER BY created_at DESC LIMIT 100", [users[0].id]) as Array<{ public_id: string }>;
  const projects = [];
  for (const row of rows) {
    const publication = await loadPublicPublication(row.public_id);
    if (publication) projects.push(publication);
  }
  return res.json({ profile: { username: users[0].username, displayName: [users[0].firstName, users[0].lastName].filter(Boolean).join(" ") }, projects });
});

async function loadPublicPublication(publicId: string): Promise<Record<string, unknown> | null> {
  const rows = await AppDataSource.query(`SELECT p.id,p.project_id,p.owner_id,p.version_id,p.channel,p.title,p.description,p.evidence_json,p.demo_json,p.review_visible,
    u.username,u.first_name AS firstName,u.last_name AS lastName,g.family_key,g.runtime,g.source_json,
    v.stage_key,v.sequence_no,v.explanation,v.created_at,a.files_json,j.result_json
    FROM growth_project_publications p JOIN users u ON u.id=p.owner_id
    JOIN growth_projects g ON g.id=p.project_id JOIN growth_project_versions v ON v.id=p.version_id
    JOIN growth_project_artifacts a ON a.id=v.artifact_id JOIN growth_project_jobs j ON j.id=v.check_job_id
    WHERE p.public_id=? AND p.revoked=0 LIMIT 1`, [publicId]) as Array<Record<string, unknown>>;
  const row = rows[0]; if (!row) return null;
  const evidence = json<{ assessmentIds?: string[] }>(row.evidence_json, {});
  const includedAssessments: Array<Record<string, unknown>> = [];
  for (const assessmentId of evidence.assessmentIds ?? []) {
    const attempts = await AppDataSource.query("SELECT id,kind,status FROM growth_project_assessments WHERE id=? AND project_id=? AND source_version_id=? AND status='PASSED'", [assessmentId, row.project_id, row.version_id]) as Array<Record<string, unknown>>;
    if (attempts[0]) includedAssessments.push(attempts[0]);
  }
  const result = json<{ passed?: boolean }>(row.result_json, {});
  const badges = ["Опубліковано автором"];
  if (row.source_json) badges.push("Додано з попереднього навчання");
  if (result.passed) badges.push("Автотести пройдено");
  if (includedAssessments.some(item => item.kind === "DEFENSE")) badges.push("Зміну вимог перевірено");
  if (includedAssessments.some(item => item.kind === "TRANSFER")) badges.push("Перенесення: автотести пройдено");
  let reviews: Array<Record<string, unknown>> = [];
  if (row.review_visible) {
    const all = await AppDataSource.query("SELECT r.kind,r.snapshot_json,r.scores_json,r.comment,r.recommendation,r.reviewer_name_public,r.author_public,u.username AS reviewer_username FROM growth_project_reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.owner_id=? AND r.project_id=? AND r.status='SUBMITTED' AND r.author_public=1", [row.owner_id, row.project_id]) as Array<Record<string, unknown>>;
    reviews = all.filter(review => json<{ versionId?: string }>(review.snapshot_json, {}).versionId === row.version_id).map(review => ({ kind: review.kind, scores: json(review.scores_json, []), comment: review.comment, recommendation: review.recommendation, reviewerName: review.reviewer_name_public ? review.reviewer_username : null }));
    if (reviews.length) badges.push(reviews.some(review => review.kind === "OFFICIAL") ? "Рецензія призначеного рецензента" : "Відгук запрошеного користувача");
  }
  return {
    id: row.id, publicId, title: row.title, description: row.description,
    author: { username: row.username, displayName: [row.firstName, row.lastName].filter(Boolean).join(" ") },
    family: row.family_key, runtime: row.runtime, stage: row.stage_key, sequence: row.sequence_no,
    explanation: row.explanation, files: json(row.files_json, []), demo: json(row.demo_json, null),
    badges, reviews, createdAt: row.created_at,
  };
}

async function servePublicPublication(publicId: string, res: Response) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(publicId)) return bad(res, 404, "PORTFOLIO_NOT_FOUND");
  const publication = await loadPublicPublication(publicId);
  if (!publication) return bad(res, 404, "PORTFOLIO_NOT_FOUND");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.json({ publication });
}
