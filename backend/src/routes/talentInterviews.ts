import { Router, type Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authRequired, type AuthRequest } from "../middleware/authMiddleware";
import { BUILTIN_INTERVIEW_KITS, gradeInterviewQuiz, interviewFiles, interviewKitSchema, publicInterviewKit, talentHash, talentJson, type InterviewKit } from "../services/talentInterviewKit";
import { canReadInterviewWorkspace, interviewAccess, interviewCalendar, type InterviewAccess } from "../services/talentInterviewAccess";
import { closeTalentMediaRoom, talentMediaEnabled, talentMediaToken } from "../services/talentInterviewMedia";
import { cancelGrowthProjectJob, wakeGrowthProjectQueue } from "../services/growthProjectQueue";
import { growthJudgeTests } from "../data/growthProjects";
import type { JudgeFile } from "../services/judgeWorker/types";
import { logger } from "../utils/logger";

export const talentInterviewsRouter = Router();
class InterviewError extends Error { constructor(public status: number, message: string) { super(message); } }
const reject = (status: number, code: string): never => { throw new InterviewError(status, code); };
const handle = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
  try { return await fn(req, res); } catch (error) {
    if (error instanceof InterviewError) return res.status(error.status).json({ code: error.message, message: error.message });
    logger.error("[talent-interviews] request failed", { error: error instanceof Error ? error.message : "UNKNOWN" });
    return res.status(500).json({ code: "INTERVIEW_REQUEST_FAILED", message: "INTERVIEW_REQUEST_FAILED" });
  }
};
talentInterviewsRouter.use(authRequired, (req: AuthRequest, res, next) => {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") return res.status(403).json({ code: "PERSONAL_USER_REQUIRED" });
  next();
});
async function memberRole(companyId: string, userId: number) {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return reject(404, "COMPANY_NOT_FOUND");
  const rows = await AppDataSource.query("SELECT role FROM growth_company_members WHERE company_id=? AND user_id=? AND status='ACTIVE' LIMIT 1", [companyId, userId]) as Array<{ role: string }>;
  return rows[0]?.role ?? reject(404, "COMPANY_NOT_FOUND");
}
async function accessFor(req: AuthRequest): Promise<InterviewAccess> {
  return await interviewAccess(req.params.interviewId, req.userId!) ?? reject(404, "INTERVIEW_NOT_FOUND");
}
function kitFor(row: Record<string, any>): InterviewKit { return talentJson<InterviewKit>(row.kit_snapshot, BUILTIN_INTERVIEW_KITS[0].kit); }
function publicSession(access: InterviewAccess, knownRevision?: number) {
  const { row, role, userId, canHost, consented } = access;
  const workspaceAllowed = canReadInterviewWorkspace(access);
  return {
    id: row.id, companyId: row.company_id, companyName: row.company_name, assessmentId: row.assessment_id,
    candidateId: Number(row.candidate_id), candidateName: row.candidate_username, hostId: Number(row.host_user_id), hostName: row.host_username,
    title: row.title, status: row.status, phase: row.phase, scheduledAt: row.scheduled_utc ?? row.scheduled_at,
    durationMinutes: row.duration_minutes, startedAt: row.started_at, completedAt: row.completed_at,
    runtime: row.runtime, role, userId, canHost, consented, editorUserId: Number(row.editor_user_id),
    revision: Number(row.draft_revision), sourceVersionId: row.source_version_id,
    canEdit: workspaceAllowed && row.status === "LIVE" && Number(row.editor_user_id) === userId,
    canRun: workspaceAllowed && row.status === "LIVE" && (role !== "CANDIDATE" || Number(row.editor_user_id) === userId),
    ...(workspaceAllowed && knownRevision !== Number(row.draft_revision) ? { files: talentJson<{ files: JudgeFile[] }>(row.draft_json, { files: [] }).files } : {}),
    mediaEnabled: talentMediaEnabled(), documentationAllowed: true, builtInAi: false, recording: false,
  };
}
type Runner = { query: (sql: string, params?: any[]) => Promise<any> };
async function artifactFor(runner: Runner, ownerId: number, files: JudgeFile[]) {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const contentHash = talentHash({ files: sorted, examples: [] });
  await runner.query("INSERT IGNORE INTO growth_project_artifacts(id,owner_id,content_hash,files_json,examples_json,total_bytes) VALUES(?,?,?,?,?,?)", [randomUUID(), ownerId, contentHash, JSON.stringify(sorted), "[]", Buffer.byteLength(JSON.stringify({ files: sorted, examples: [] }), "utf8")]);
  const rows = await runner.query("SELECT id FROM growth_project_artifacts WHERE owner_id=? AND content_hash=? LIMIT 1", [ownerId, contentHash]) as Array<{ id: string }>;
  if (!rows[0]) throw new Error("ARTIFACT_STORE_FAILED");
  return { id: rows[0].id, contentHash };
}
async function notice(recipientId: number, actorId: number, path: string) {
  if (recipientId === actorId) return;
  try {
    const actors = await AppDataSource.query("SELECT username FROM users WHERE id=? LIMIT 1", [actorId]) as Array<{ username: string }>;
    await AppDataSource.query("INSERT INTO notifications(recipient_type,recipient_id,type,actor_name,related_path) VALUES('USER',?,'COMPANY_ASSESSMENT_UPDATED',?,?)", [recipientId, actors[0]?.username ?? null, path]);
  } catch (error) { logger.warn("[talent-interviews] notification failed", { error }); }
}

talentInterviewsRouter.get("/kits", handle(async (req, res) => {
  const companyId = String(req.query.companyId ?? "");
  await memberRole(companyId, req.userId!);
  const rows = await AppDataSource.query("SELECT id,snapshot_json FROM growth_interview_kits WHERE company_id=? ORDER BY created_at DESC LIMIT 100", [companyId]) as Array<{ id: string; snapshot_json: string }>;
  return res.json({ kits: [...BUILTIN_INTERVIEW_KITS.map(item => ({ ...item, builtIn: true })), ...rows.map(row => ({ id: row.id, kit: talentJson(row.snapshot_json, null), builtIn: false }))] });
}));
talentInterviewsRouter.post("/companies/:companyId/kits", handle(async (req, res) => {
  await memberRole(req.params.companyId, req.userId!);
  const parsed = interviewKitSchema.safeParse(req.body?.kit);
  if (!parsed.success) return reject(400, "INVALID_INTERVIEW_KIT");
  const contentHash = talentHash(parsed.data);
  const id = randomUUID();
  await AppDataSource.query("INSERT IGNORE INTO growth_interview_kits(id,company_id,created_by,title,snapshot_json,content_hash) VALUES(?,?,?,?,?,?)", [id, req.params.companyId, req.userId, parsed.data.title, JSON.stringify(parsed.data), contentHash]);
  const rows = await AppDataSource.query("SELECT id FROM growth_interview_kits WHERE company_id=? AND content_hash=? LIMIT 1", [req.params.companyId, contentHash]) as Array<{ id: string }>;
  return res.status(201).json({ id: rows[0]?.id });
}));

talentInterviewsRouter.get("/interviews", handle(async (req, res) => {
  const companyId = String(req.query.companyId ?? "");
  if (companyId) await memberRole(companyId, req.userId!);
  const rows = await AppDataSource.query(`SELECT DISTINCT i.id,i.company_id,c.name AS company_name,i.assessment_id,i.title,i.status,i.phase,
    DATE_FORMAT(i.scheduled_at,'%Y-%m-%dT%H:%i:%s.000Z') AS scheduled_at,i.duration_minutes,
    a.candidate_id,u.username AS candidate_name,i.host_user_id,h.username AS host_name,
    IF(a.candidate_id=?,'CANDIDATE',m.role) AS my_role,a.status AS consent_status
    FROM growth_interviews i JOIN growth_company_assessments a ON a.id=i.assessment_id
    JOIN growth_companies c ON c.id=i.company_id JOIN users u ON u.id=a.candidate_id JOIN users h ON h.id=i.host_user_id
    LEFT JOIN growth_company_members m ON m.company_id=i.company_id AND m.user_id=? AND m.status='ACTIVE'
    WHERE (a.candidate_id=? OR m.role='OWNER' OR (m.user_id=? AND (i.host_user_id=? OR JSON_CONTAINS(i.interviewer_ids_json,JSON_ARRAY(?)))))
    AND a.status NOT IN ('WITHDRAWN','DECLINED','CLOSED') ${companyId ? "AND i.company_id=?" : ""}
    ORDER BY (i.status='LIVE') DESC,(i.status='SCHEDULED') DESC,i.scheduled_at ASC LIMIT 100`,
    [req.userId, req.userId, req.userId, req.userId, req.userId, req.userId, ...(companyId ? [companyId] : [])]);
  return res.json({ interviews: rows, mediaEnabled: talentMediaEnabled() });
}));

talentInterviewsRouter.post("/companies/:companyId/interviews", handle(async (req, res) => {
  await memberRole(req.params.companyId, req.userId!);
  const parsed = z.object({
    candidateUsername: z.string().trim().min(1).max(80).optional(), assessmentId: z.string().uuid().optional(),
    kitId: z.string().min(1).max(100), title: z.string().trim().min(3).max(160), scheduledAt: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(180), interviewerIds: z.array(z.number().int().positive()).max(3).default([]),
    useSelectedProject: z.boolean().default(false), idempotencyKey: z.string().min(8).max(128),
  }).safeParse(req.body ?? {});
  if (!parsed.success || !parsed.data.assessmentId && !parsed.data.candidateUsername) return reject(400, "INVALID_INTERVIEW");
  const data = parsed.data; const companyId = req.params.companyId;
  const scheduled = new Date(data.scheduledAt);
  if (scheduled.getTime() < Date.now() - 86_400_000 || scheduled.getTime() > Date.now() + 366 * 86_400_000) return reject(400, "INVALID_INTERVIEW_DATE");
  let kit = BUILTIN_INTERVIEW_KITS.find(item => item.id === data.kitId)?.kit;
  if (!kit) {
    const rows = await AppDataSource.query("SELECT snapshot_json FROM growth_interview_kits WHERE id=? AND company_id=? LIMIT 1", [data.kitId, companyId]) as Array<{ snapshot_json: string }>;
    const valid = interviewKitSchema.safeParse(talentJson(rows[0]?.snapshot_json, null));
    if (!valid.success) return reject(404, "INTERVIEW_KIT_NOT_FOUND");
    kit = valid.data;
  }
  const snapshot: InterviewKit = { ...kit, durationMinutes: data.durationMinutes };
  let candidateId: number; let assessmentId = data.assessmentId; let caseRow: Record<string, any> | null = null;
  if (assessmentId) {
    const rows = await AppDataSource.query("SELECT id,candidate_id,status,version_id FROM growth_company_assessments WHERE id=? AND company_id=? LIMIT 1", [assessmentId, companyId]) as Array<Record<string, any>>;
    if (!rows[0] || ["WITHDRAWN", "DECLINED", "CLOSED"].includes(rows[0].status)) return reject(404, "ASSESSMENT_NOT_FOUND");
    caseRow = rows[0]; candidateId = Number(caseRow.candidate_id);
  } else {
    const candidates = await AppDataSource.query("SELECT id FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [data.candidateUsername]) as Array<{ id: number }>;
    if (!candidates[0]) return reject(404, "PERSONAL_CANDIDATE_NOT_FOUND");
    candidateId = candidates[0].id;
  }
  if (candidateId === req.userId) return reject(400, "SELF_ASSESSMENT_NOT_ALLOWED");
  const interviewerIds = [...new Set([req.userId!, ...data.interviewerIds])];
  const staff = await AppDataSource.query(`SELECT user_id FROM growth_company_members WHERE company_id=? AND status='ACTIVE' AND user_id IN (${interviewerIds.map(() => "?").join(",")})`, [companyId, ...interviewerIds]) as Array<{ user_id: number }>;
  if (staff.length !== interviewerIds.length || interviewerIds.includes(candidateId)) return reject(400, "INVALID_INTERVIEW_TEAM");
  let files = snapshot.files; let sourceVersionId: string | null = null;
  if (data.useSelectedProject) {
    if (!caseRow?.version_id || caseRow.status === "INVITED") return reject(409, "CANDIDATE_PROJECT_REQUIRED");
    const sources = await AppDataSource.query("SELECT v.id,p.runtime,a.files_json FROM growth_project_versions v JOIN growth_projects p ON p.id=v.project_id JOIN growth_project_artifacts a ON a.id=v.artifact_id WHERE v.id=? AND v.owner_id=? LIMIT 1", [caseRow.version_id, candidateId]) as Array<{ id: string; runtime: string; files_json: string }>;
    if (!sources[0] || sources[0].runtime !== snapshot.runtime) return reject(409, "PROJECT_RUNTIME_MISMATCH");
    files = interviewFiles(talentJson(sources[0].files_json, [])) ?? reject(409, "INVALID_PROJECT_FILES"); sourceVersionId = sources[0].id;
  }
  const requestHash = talentHash(data); const id = randomUUID();
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    await runner.query("SELECT id FROM growth_companies WHERE id=? FOR UPDATE", [companyId]);
    const previous = await runner.query("SELECT id,request_hash FROM growth_interviews WHERE company_id=? AND idempotency_key=? LIMIT 1", [companyId, data.idempotencyKey]) as Array<{ id: string; request_hash: string }>;
    if (previous[0]) {
      if (previous[0].request_hash !== requestHash) return reject(409, "IDEMPOTENCY_CONFLICT");
      await runner.commitTransaction(); return res.json({ id: previous[0].id, existing: true });
    }
    if (!assessmentId) {
      assessmentId = randomUUID();
      const questions = snapshot.questions.map((text, index) => ({ id: `interview-${index + 1}`, text }));
      await runner.query("INSERT INTO growth_company_assessments(id,company_id,created_by,candidate_id,idempotency_key,role_title,introduction,questions_json,status) VALUES(?,?,?,?,?,?,?,?,'INVITED')", [assessmentId, companyId, req.userId, candidateId, `interview:${id}`, data.title, snapshot.prompt || data.title, JSON.stringify(questions)]);
    }
    await runner.query(`INSERT INTO growth_interviews(id,company_id,assessment_id,host_user_id,interviewer_ids_json,title,scheduled_at,duration_minutes,runtime,kit_snapshot,kit_hash,source_version_id,draft_json,editor_user_id,room_name,idempotency_key,request_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, companyId, assessmentId, req.userId, JSON.stringify(interviewerIds), data.title, scheduled.toISOString().slice(0, 23).replace("T", " "), data.durationMinutes, snapshot.runtime, JSON.stringify(snapshot), talentHash(snapshot), sourceVersionId, JSON.stringify({ files }), candidateId, `talent_${id.replace(/-/g, "")}`, data.idempotencyKey, requestHash]);
    await runner.commitTransaction();
  } catch (error) { await runner.rollbackTransaction(); throw error; } finally { await runner.release(); }
  await notice(candidateId, req.userId!, `/companies/interviews/${id}`);
  for (const participant of interviewerIds) if (participant !== req.userId) await notice(participant, req.userId!, `/companies/interviews/${id}`);
  return res.status(201).json({ id, assessmentId });
}));

talentInterviewsRouter.get("/interviews/:interviewId", handle(async (req, res) => {
  const access = await accessFor(req); const { row, role } = access;
  const [notes, released, quizzes, staff, jobs] = await Promise.all([
    role === "CANDIDATE" ? [] : AppDataSource.query("SELECT revision,private_text,scores_json,feedback_text,practice_text,released_at FROM growth_interview_notes WHERE interview_id=? AND user_id=? LIMIT 1", [row.id, req.userId]),
    AppDataSource.query("SELECT n.released_json,u.username FROM growth_interview_notes n JOIN users u ON u.id=n.user_id WHERE n.interview_id=? AND n.released_at IS NOT NULL", [row.id]),
    access.consented ? AppDataSource.query("SELECT result_json,answers_json,submitted_at FROM growth_interview_quizzes WHERE interview_id=? LIMIT 1", [row.id]) : [],
    AppDataSource.query("SELECT m.user_id AS id,u.username,m.role FROM growth_company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND m.status='ACTIVE'", [row.company_id]),
    canReadInterviewWorkspace(access) ? AppDataSource.query("SELECT id,state,execution_kind,interview_draft_revision,result_json,error_code,created_at FROM growth_project_jobs WHERE interview_id=? ORDER BY created_at DESC LIMIT 10", [row.id]) : [],
  ]) as [Array<Record<string, any>>, Array<Record<string, any>>, Array<Record<string, any>>, Array<Record<string, any>>, Array<Record<string, any>>];
  const assigned = talentJson<number[]>(row.interviewer_ids_json, []);
  return res.json({
    interview: { ...publicSession(access), kit: publicInterviewKit(kitFor(row)), participants: [
      { id: Number(row.candidate_id), username: row.candidate_username, role: "CANDIDATE" },
      ...staff.filter(item => assigned.includes(Number(item.id))).map(item => ({ id: Number(item.id), username: item.username, role: item.role })),
    ] },
    ownNote: notes[0] ? { revision: notes[0].revision, privateText: notes[0].private_text, scores: talentJson(notes[0].scores_json, []), feedback: notes[0].feedback_text, practice: notes[0].practice_text, releasedAt: notes[0].released_at } : null,
    feedback: released.map(item => ({ ...talentJson<Record<string, unknown>>(item.released_json, {}), reviewer: item.username })),
    quizResult: quizzes[0] ? { ...talentJson<Record<string, unknown>>(quizzes[0].result_json, {}), submittedAt: quizzes[0].submitted_at, ...(role === "CANDIDATE" ? { answers: talentJson(quizzes[0].answers_json, {}) } : {}) } : null,
    executions: jobs.map(job => ({ id: job.id, state: job.state, kind: job.execution_kind, revision: job.interview_draft_revision, result: talentJson(job.result_json, null), errorCode: job.error_code, createdAt: job.created_at })),
  });
}));

talentInterviewsRouter.get("/interviews/:interviewId/state", handle(async (req, res) => {
  const access = await accessFor(req); const { row } = access;
  const after = /^\d{1,18}$/.test(String(req.query.chatAfter ?? "")) ? String(req.query.chatAfter) : "0";
  const messages = access.consented ? await AppDataSource.query(`SELECT m.id,m.user_id,u.username,m.message_text,m.created_at FROM growth_interview_messages m JOIN users u ON u.id=m.user_id WHERE m.interview_id=? AND m.id>? ORDER BY m.id ASC LIMIT 50`, [row.id, after]) : [];
  const job = canReadInterviewWorkspace(access) && row.last_job_id ? await AppDataSource.query("SELECT id,state,execution_kind,interview_draft_revision,result_json,error_code FROM growth_project_jobs WHERE id=? AND interview_id=? LIMIT 1", [row.last_job_id, row.id]) as Array<Record<string, any>> : [];
  return res.json({ interview: publicSession(access, Number(req.query.revision)), messages, execution: job[0] ? { id: job[0].id, state: job[0].state, kind: job[0].execution_kind, revision: job[0].interview_draft_revision, result: talentJson(job[0].result_json, null), errorCode: job[0].error_code } : null });
}));

talentInterviewsRouter.get("/interviews/:interviewId/calendar", handle(async (req, res) => {
  const { row } = await accessFor(req);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="studycod-interview.ics"');
  return res.send(interviewCalendar(row, "https://studycod.space"));
}));

talentInterviewsRouter.post("/interviews/:interviewId/respond", handle(async (req, res) => {
  const access = await accessFor(req);
  if (access.role !== "CANDIDATE" || access.row.consent_status !== "INVITED") return reject(409, "INVITATION_ALREADY_RESPONDED");
  const parsed = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]), consent: z.boolean() }).safeParse(req.body);
  if (!parsed.success || parsed.data.decision === "ACCEPT" && !parsed.data.consent) return reject(400, "EXPLICIT_CONSENT_REQUIRED");
  await AppDataSource.query("UPDATE growth_company_assessments SET status=?,consent_at=IF(?='ACCEPT',UTC_TIMESTAMP(3),NULL) WHERE id=? AND candidate_id=? AND status='INVITED'", [parsed.data.decision === "ACCEPT" ? "ACCEPTED" : "DECLINED", parsed.data.decision, access.row.assessment_id, req.userId]);
  if (parsed.data.decision === "DECLINE") await AppDataSource.query("UPDATE growth_interviews SET status='CANCELLED',completed_at=UTC_TIMESTAMP(3) WHERE assessment_id=? AND status='SCHEDULED'", [access.row.assessment_id]);
  await notice(Number(access.row.host_user_id), req.userId!, `/companies/interviews/${access.row.id}`);
  return res.json({ accepted: parsed.data.decision === "ACCEPT" });
}));

talentInterviewsRouter.post("/interviews/:interviewId/start", handle(async (req, res) => {
  const access = await accessFor(req);
  if (!access.canHost) return reject(403, "INTERVIEW_HOST_REQUIRED");
  if (!access.consented) return reject(409, "CANDIDATE_CONSENT_REQUIRED");
  const result = await AppDataSource.query("UPDATE growth_interviews SET status='LIVE',started_at=UTC_TIMESTAMP(3) WHERE id=? AND status='SCHEDULED'", [access.row.id]);
  if (!result.affectedRows && access.row.status !== "LIVE") return reject(409, "INTERVIEW_NOT_SCHEDULED");
  return res.json({ status: "LIVE" });
}));
talentInterviewsRouter.post("/interviews/:interviewId/join", handle(async (req, res) => {
  const access = await accessFor(req);
  if (!access.consented || access.row.status !== "LIVE") return reject(409, "INTERVIEW_NOT_LIVE");
  const names = await AppDataSource.query("SELECT username FROM users WHERE id=? LIMIT 1", [req.userId]) as Array<{ username: string }>;
  const connection = await talentMediaToken(access.row.room_name, req.userId!, names[0]?.username ?? "StudyCod");
  if (!connection) return reject(503, "INTERVIEW_MEDIA_UNAVAILABLE");
  return res.json(connection);
}));

talentInterviewsRouter.put("/interviews/:interviewId/draft", handle(async (req, res) => {
  const access = await accessFor(req);
  if (!access.consented || access.row.status !== "LIVE" || Number(access.row.editor_user_id) !== req.userId) return reject(403, "INTERVIEW_EDITOR_REQUIRED");
  const files = interviewFiles(req.body?.files); const revision = Number(req.body?.expectedRevision);
  if (!files || !Number.isInteger(revision) || revision < 1) return reject(400, "INVALID_INTERVIEW_DRAFT");
  const result = await AppDataSource.query("UPDATE growth_interviews SET draft_json=?,draft_revision=draft_revision+1 WHERE id=? AND status='LIVE' AND editor_user_id=? AND draft_revision=?", [JSON.stringify({ files }), access.row.id, req.userId, revision]);
  if (!result.affectedRows) return reject(409, "DRAFT_REVISION_CONFLICT");
  return res.json({ revision: revision + 1 });
}));

talentInterviewsRouter.post("/interviews/:interviewId/control", handle(async (req, res) => {
  const access = await accessFor(req); if (!access.canHost) return reject(403, "INTERVIEW_HOST_REQUIRED");
  if (access.row.status !== "LIVE" || !access.consented) return reject(409, "INTERVIEW_NOT_LIVE");
  const target = Number(req.body?.editorUserId); const revision = Number(req.body?.expectedRevision);
  if (target !== Number(access.row.candidate_id)) {
    const assigned = talentJson<number[]>(access.row.interviewer_ids_json, []);
    const roles = await AppDataSource.query("SELECT role FROM growth_company_members WHERE company_id=? AND user_id=? AND status='ACTIVE' LIMIT 1", [access.row.company_id, target]) as Array<{ role: string }>;
    if (!assigned.includes(target) || !["OWNER", "ENGINEER"].includes(roles[0]?.role)) return reject(400, "INVALID_INTERVIEW_EDITOR");
  }
  const result = await AppDataSource.query("UPDATE growth_interviews SET editor_user_id=? WHERE id=? AND status='LIVE' AND draft_revision=?", [target, access.row.id, revision]);
  if (!result.affectedRows) return reject(409, "DRAFT_REVISION_CONFLICT");
  return res.json({ editorUserId: target });
}));
talentInterviewsRouter.post("/interviews/:interviewId/phase", handle(async (req, res) => {
  const access = await accessFor(req); if (!access.canHost) return reject(403, "INTERVIEW_HOST_REQUIRED");
  const phase = z.enum(["INTRO", "DISCUSSION", "CODE", "REVIEW", "PAUSE"]).safeParse(req.body?.phase);
  if (!phase.success || access.row.status !== "LIVE") return reject(409, "INTERVIEW_NOT_LIVE");
  await AppDataSource.query("UPDATE growth_interviews SET phase=? WHERE id=? AND status='LIVE'", [phase.data, access.row.id]);
  return res.json({ phase: phase.data });
}));

talentInterviewsRouter.post("/interviews/:interviewId/messages", handle(async (req, res) => {
  const access = await accessFor(req);
  if (!access.consented || !["SCHEDULED", "LIVE"].includes(access.row.status)) return reject(409, "INTERVIEW_CHAT_CLOSED");
  const parsed = z.object({ text: z.string().trim().min(1).max(2000), clientKey: z.string().min(8).max(64) }).safeParse(req.body);
  if (!parsed.success) return reject(400, "INVALID_INTERVIEW_MESSAGE");
  const rate = await AppDataSource.query("SELECT COUNT(*) AS count FROM growth_interview_messages WHERE interview_id=? AND user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)", [access.row.id, req.userId]) as Array<{ count: number }>;
  if (Number(rate[0]?.count) >= 30) return reject(429, "INTERVIEW_CHAT_RATE_LIMIT");
  await AppDataSource.query("INSERT IGNORE INTO growth_interview_messages(interview_id,user_id,client_key,message_text) VALUES(?,?,?,?)", [access.row.id, req.userId, parsed.data.clientKey, parsed.data.text]);
  const stored = await AppDataSource.query("SELECT message_text FROM growth_interview_messages WHERE interview_id=? AND user_id=? AND client_key=? LIMIT 1", [access.row.id, req.userId, parsed.data.clientKey]) as Array<{ message_text: string }>;
  if (stored[0]?.message_text !== parsed.data.text) return reject(409, "IDEMPOTENCY_CONFLICT");
  return res.json({ saved: true });
}));

talentInterviewsRouter.post("/interviews/:interviewId/quiz", handle(async (req, res) => {
  const access = await accessFor(req);
  if (access.role !== "CANDIDATE" || !access.consented || !["SCHEDULED", "LIVE"].includes(access.row.status)) return reject(403, "CANDIDATE_QUIZ_REQUIRED");
  const answers = z.record(z.string(), z.number().int().min(0).max(4)).safeParse(req.body?.answers);
  const kit = kitFor(access.row); if (!answers.success || !kit.quiz.length) return reject(400, "INVALID_QUIZ_ANSWERS");
  const result = gradeInterviewQuiz(kit, answers.data); if (!result) return reject(400, "INVALID_QUIZ_ANSWERS");
  const canonical = Object.fromEntries(kit.quiz.map(question => [question.id, answers.data[question.id]]));
  await AppDataSource.query("INSERT IGNORE INTO growth_interview_quizzes(interview_id,candidate_id,kit_hash,answers_json,result_json) VALUES(?,?,?,?,?)", [access.row.id, req.userId, access.row.kit_hash, JSON.stringify(canonical), JSON.stringify(result)]);
  const stored = await AppDataSource.query("SELECT answers_json,result_json FROM growth_interview_quizzes WHERE interview_id=? LIMIT 1", [access.row.id]) as Array<{ answers_json: string; result_json: string }>;
  if (stored[0]) {
    const previous = talentJson<Record<string, number>>(stored[0].answers_json, {});
    if (kit.quiz.some(question => previous[question.id] !== canonical[question.id])) return reject(409, "QUIZ_ALREADY_SUBMITTED");
    return res.json({ result: talentJson(stored[0].result_json, null) });
  }
  throw new Error("QUIZ_STORE_FAILED");
}));

talentInterviewsRouter.put("/interviews/:interviewId/notes", handle(async (req, res) => {
  const access = await accessFor(req); if (access.role === "CANDIDATE") return reject(403, "INTERVIEWER_NOTES_REQUIRED");
  const parsed = z.object({ expectedRevision: z.number().int().min(0), privateText: z.string().max(8000), scores: z.array(z.number().int().min(0).max(3).nullable()).min(2).max(6), feedback: z.string().max(4000), practice: z.string().max(2000) }).safeParse(req.body);
  if (!parsed.success || parsed.data.scores.length !== kitFor(access.row).rubric.length) return reject(400, "INVALID_INTERVIEW_NOTES");
  const data = parsed.data;
  const update = data.expectedRevision === 0
    ? await AppDataSource.query("INSERT IGNORE INTO growth_interview_notes(interview_id,user_id,private_text,scores_json,feedback_text,practice_text) VALUES(?,?,?,?,?,?)", [access.row.id, req.userId, data.privateText, JSON.stringify(data.scores), data.feedback, data.practice])
    : await AppDataSource.query("UPDATE growth_interview_notes SET private_text=?,scores_json=?,feedback_text=?,practice_text=?,revision=revision+1 WHERE interview_id=? AND user_id=? AND revision=?", [data.privateText, JSON.stringify(data.scores), data.feedback, data.practice, access.row.id, req.userId, data.expectedRevision]);
  if (!update.affectedRows) return reject(409, "NOTE_REVISION_CONFLICT");
  return res.json({ revision: data.expectedRevision + 1 });
}));
talentInterviewsRouter.post("/interviews/:interviewId/release-feedback", handle(async (req, res) => {
  const access = await accessFor(req); if (access.role === "CANDIDATE" || access.row.status !== "COMPLETED") return reject(403, "COMPLETED_INTERVIEW_REQUIRED");
  const rows = await AppDataSource.query("SELECT revision,feedback_text,practice_text,released_json FROM growth_interview_notes WHERE interview_id=? AND user_id=? LIMIT 1", [access.row.id, req.userId]) as Array<Record<string, any>>;
  const note = rows[0]; if (!note || note.revision !== Number(req.body?.expectedRevision) || note.feedback_text.trim().length < 12) return reject(409, "SAVED_FEEDBACK_REQUIRED");
  if (note.released_json) return res.json({ feedback: talentJson(note.released_json, null) });
  const feedback = { text: note.feedback_text, practice: note.practice_text, publishedAt: new Date().toISOString() };
  const update = await AppDataSource.query("UPDATE growth_interview_notes SET released_json=?,released_at=UTC_TIMESTAMP(3) WHERE interview_id=? AND user_id=? AND revision=? AND released_at IS NULL", [JSON.stringify(feedback), access.row.id, req.userId, note.revision]);
  if (!update.affectedRows) return reject(409, "NOTE_REVISION_CONFLICT");
  await notice(Number(access.row.candidate_id), req.userId!, `/companies/interviews/${access.row.id}`);
  return res.json({ feedback });
}));

talentInterviewsRouter.post("/interviews/:interviewId/executions", handle(async (req, res) => {
  const access = await accessFor(req);
  if (!access.consented || access.row.status !== "LIVE" || access.role === "CANDIDATE" && Number(access.row.editor_user_id) !== req.userId) return reject(403, "INTERVIEW_RUN_UNAVAILABLE");
  const parsed = z.object({ kind: z.enum(["RUN", "CHECK"]), input: z.string().max(8192).default(""), expectedRevision: z.number().int().positive(), idempotencyKey: z.string().min(8).max(128) }).safeParse(req.body);
  if (!parsed.success) return reject(400, "INVALID_INTERVIEW_EXECUTION");
  const data = parsed.data; const kit = kitFor(access.row);
  const tests = data.kind === "CHECK" ? growthJudgeTests(kit.tests, true, "interview-") : [{ id: "interview-run", input: data.input, output: "", hidden: false, group: "run", weight: 1 }];
  if (!tests.length) return reject(409, "INTERVIEW_HAS_NO_CODE_TESTS");
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction(); let jobId = randomUUID();
  try {
    await runner.query("SELECT id FROM users WHERE id=? FOR UPDATE", [req.userId]);
    await runner.query("SELECT id FROM growth_project_queue_guard WHERE id=1 FOR UPDATE");
    const sessions = await runner.query("SELECT draft_json,draft_revision,status,editor_user_id FROM growth_interviews WHERE id=? FOR UPDATE", [access.row.id]) as Array<Record<string, any>>;
    const session = sessions[0];
    if (!session || session.status !== "LIVE" || Number(session.draft_revision) !== data.expectedRevision) return reject(409, "DRAFT_REVISION_CONFLICT");
    if (access.role === "CANDIDATE" && Number(session.editor_user_id) !== req.userId) return reject(403, "INTERVIEW_EDITOR_REQUIRED");
    const files = interviewFiles(talentJson<{ files: JudgeFile[] }>(session.draft_json, { files: [] }).files) ?? reject(400, "INVALID_INTERVIEW_DRAFT");
    const artifact = await artifactFor(runner, req.userId!, files); const testsHash = talentHash(tests);
    const previous = await runner.query("SELECT id,artifact_id,tests_hash,context_key,state FROM growth_project_jobs WHERE owner_id=? AND idempotency_key=? LIMIT 1", [req.userId, data.idempotencyKey]) as Array<Record<string, any>>;
    if (previous[0]) {
      if (previous[0].artifact_id !== artifact.id || previous[0].tests_hash !== testsHash || previous[0].context_key !== `interview:${access.row.id}`) return reject(409, "IDEMPOTENCY_CONFLICT");
      await runner.commitTransaction(); return res.status(202).json({ jobId: previous[0].id, state: previous[0].state });
    }
    const active = await runner.query("SELECT id FROM growth_project_jobs WHERE (owner_id=? OR interview_id=?) AND state IN ('QUEUED','RUNNING') LIMIT 1 FOR UPDATE", [req.userId, access.row.id]) as Array<{ id: string }>;
    if (active[0]) return reject(409, "ACTIVE_EXECUTION_EXISTS");
    const queue = await runner.query("SELECT id FROM growth_project_jobs WHERE state IN ('QUEUED','RUNNING') LIMIT 20 FOR UPDATE") as Array<{ id: string }>;
    if (queue.length >= 20) return reject(429, "PROJECT_EXECUTION_QUEUE_FULL");
    const rate = await runner.query("SELECT id FROM growth_project_jobs WHERE owner_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 SECOND) LIMIT 1", [req.userId]) as Array<{ id: string }>;
    if (rate[0]) return reject(429, "PROJECT_EXECUTION_RATE_LIMIT");
    await runner.query(`INSERT INTO growth_project_jobs(id,project_id,interview_id,owner_id,context_key,artifact_id,blueprint_revision,tests_hash,tests_json,idempotency_key,runtime_override,execution_kind,interview_draft_revision,state)
      VALUES(?,NULL,?,?,?,?,?,?,?,?,?,?,?,'QUEUED')`, [jobId, access.row.id, req.userId, `interview:${access.row.id}`, artifact.id, "talent-interview-v1", testsHash, JSON.stringify(tests), data.idempotencyKey, access.row.runtime, data.kind, data.expectedRevision]);
    await runner.query("UPDATE growth_interviews SET last_job_id=? WHERE id=?", [jobId, access.row.id]);
    await runner.commitTransaction();
  } catch (error) { await runner.rollbackTransaction(); throw error; } finally { await runner.release(); }
  wakeGrowthProjectQueue(); return res.status(202).json({ jobId, state: "QUEUED" });
}));

talentInterviewsRouter.post("/interviews/:interviewId/executions/:jobId/cancel", handle(async (req, res) => {
  const access = await accessFor(req); const jobs = await AppDataSource.query("SELECT owner_id FROM growth_project_jobs WHERE id=? AND interview_id=? LIMIT 1", [req.params.jobId, access.row.id]) as Array<{ owner_id: number }>;
  if (!jobs[0] || access.role === "CANDIDATE" && jobs[0].owner_id !== req.userId) return reject(404, "EXECUTION_NOT_FOUND");
  return res.json({ status: await cancelGrowthProjectJob(req.params.jobId, jobs[0].owner_id) });
}));

talentInterviewsRouter.post("/interviews/:interviewId/end", handle(async (req, res) => {
  const access = await accessFor(req); if (!access.canHost) return reject(403, "INTERVIEW_HOST_REQUIRED");
  if (access.row.status === "COMPLETED") return res.json({ status: "COMPLETED" });
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    const rows = await runner.query("SELECT draft_json,draft_revision,status FROM growth_interviews WHERE id=? FOR UPDATE", [access.row.id]) as Array<Record<string, any>>;
    const row = rows[0]; if (!row || row.status !== "LIVE" || Number(req.body?.expectedRevision) !== Number(row.draft_revision)) return reject(409, "DRAFT_REVISION_CONFLICT");
    const files = interviewFiles(talentJson<{ files: JudgeFile[] }>(row.draft_json, { files: [] }).files) ?? reject(409, "INVALID_INTERVIEW_DRAFT");
    const artifact = await artifactFor(runner, Number(access.row.candidate_id), files);
    await runner.query("UPDATE growth_interviews SET status='COMPLETED',completed_at=UTC_TIMESTAMP(3),final_artifact_id=? WHERE id=? AND status='LIVE'", [artifact.id, access.row.id]);
    await runner.commitTransaction();
  } catch (error) { await runner.rollbackTransaction(); throw error; } finally { await runner.release(); }
  void closeTalentMediaRoom(access.row.room_name);
  return res.json({ status: "COMPLETED" });
}));

talentInterviewsRouter.post("/interviews/:interviewId/cancel", handle(async (req, res) => {
  const access = await accessFor(req); if (!access.canHost) return reject(403, "INTERVIEW_HOST_REQUIRED");
  const update = await AppDataSource.query("UPDATE growth_interviews SET status='CANCELLED',completed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='SCHEDULED'", [access.row.id]);
  if (!update.affectedRows) return reject(409, "INTERVIEW_NOT_SCHEDULED");
  await notice(Number(access.row.candidate_id), req.userId!, `/companies/interviews/${access.row.id}`);
  return res.json({ status: "CANCELLED" });
}));
