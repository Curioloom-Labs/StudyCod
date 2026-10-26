import { Router, type Response } from "express";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authRequired, type AuthRequest } from "../middleware/authMiddleware";
import { growthFamilyFor, growthJudgeTests } from "../data/growthProjects";
import { cancelGrowthProjectJob } from "../services/growthProjectQueue";
import { revokeTalentInterviewAccess } from "../services/talentInterviewMedia";
import { logger } from "../utils/logger";
import type { JudgeFile } from "../services/judgeWorker/types";

export const projectCompaniesRouter = Router();

const UUID_RE = /^[0-9a-f-]{36}$/i;
const runtimes = z.enum(["PYTHON", "JAVA", "CPP"]);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const parseJson = <T,>(value: unknown, fallback: T): T => {
  try { return typeof value === "string" ? JSON.parse(value) as T : (value as T) ?? fallback; } catch { return fallback; }
};
function submittedFiles(value: unknown): JudgeFile[] {
  const draft = parseJson<Record<string, unknown>>(value, {});
  if (!isObject(draft) || !Array.isArray(draft.files)) return [];
  return draft.files.filter(isObject).filter(file => typeof file.path === "string" && typeof file.content === "string")
    .map(file => ({ path: String(file.path), content: String(file.content) }));
}
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sendError = (res: Response, status: number, code: string) => res.status(status).json({ code, message: code });

type CompanyNotice = "COMPANY_TEAM_INVITATION" | "COMPANY_ASSESSMENT_INVITATION" | "COMPANY_ASSESSMENT_UPDATED";
async function notifyCompanyUser(recipientId: number | null | undefined, actorId: number, type: CompanyNotice, relatedPath: string): Promise<void> {
  if (!recipientId || recipientId === actorId) return;
  try {
    const actors = await AppDataSource.query("SELECT username FROM users WHERE id=? LIMIT 1", [actorId]) as Array<{ username: string | null }>;
    await AppDataSource.query("INSERT INTO notifications (recipient_type,recipient_id,type,actor_name,related_path) VALUES ('USER',?,?,?,?)", [recipientId, type, actors[0]?.username ?? null, relatedPath]);
  } catch (error) {
    logger.warn("[project-companies] notification could not be created", { recipientId, type, error });
  }
}

async function personalUser(req: AuthRequest, res: Response): Promise<number | null> {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") {
    sendError(res, 403, "PERSONAL_USER_REQUIRED");
    return null;
  }
  return req.userId;
}

type CompanyRole = "OWNER" | "HR" | "ENGINEER";
async function companyRole(companyId: string, userId: number): Promise<CompanyRole | null> {
  const rows = await AppDataSource.query(
    "SELECT role FROM growth_company_members WHERE company_id=? AND user_id=? AND status='ACTIVE' LIMIT 1",
    [companyId, userId]
  ) as Array<{ role: CompanyRole }>;
  return rows[0]?.role ?? null;
}

async function companyAssessmentForCandidate(id: string, candidateId: number): Promise<Record<string, unknown> | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await AppDataSource.query(
    `SELECT a.*,c.name AS company_name,u.username AS creator_username
     FROM growth_company_assessments a
     JOIN growth_companies c ON c.id=a.company_id
     JOIN users u ON u.id=a.created_by
     WHERE a.id=? AND a.candidate_id=? LIMIT 1`, [id, candidateId]
  ) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

function publicCase(row: Record<string, unknown>, includeCandidatePrivate = false) {
  const base: Record<string, unknown> = {
    id: row.id, companyId: row.company_id, companyName: row.company_name,
    roleTitle: row.role_title, introduction: row.introduction,
    questions: parseJson(row.questions_json, []), status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    consentAt: row.consent_at, projectId: row.project_id, versionId: row.version_id,
    technicalAssessmentId: row.technical_assessment_id,
    taskTitle: row.task_title, taskPrompt: row.task_prompt,
    hrReview: parseJson(row.hr_review_json, null), technicalReview: parseJson(row.technical_review_json, null),
  };
  if (includeCandidatePrivate) base.answers = parseJson(row.answers_json, []);
  return base;
}

const reviewSchema = z.object({
  scores: z.array(z.number().int().min(0).max(3)).length(3),
  comment: z.string().trim().max(6000).default(""),
  recommendation: z.enum(["READY_TO_CONTINUE", "NEEDS_WORK"]),
});

projectCompaniesRouter.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const [companies, pendingMembers, candidateCases] = await Promise.all([
    AppDataSource.query(
      `SELECT c.id,c.name,m.role,m.status,c.created_at,c.updated_at
       FROM growth_company_members m JOIN growth_companies c ON c.id=m.company_id
       WHERE m.user_id=? AND m.status='ACTIVE' ORDER BY c.updated_at DESC LIMIT 100`, [userId]
    ) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query(
      `SELECT m.id,m.company_id,c.name AS company_name,m.role,m.created_at
       FROM growth_company_members m JOIN growth_companies c ON c.id=m.company_id
       WHERE m.user_id=? AND m.status='PENDING' ORDER BY m.created_at DESC LIMIT 100`, [userId]
    ) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query(
      `SELECT a.id,a.company_id,c.name AS company_name,a.role_title,a.introduction,a.status,a.created_at,a.updated_at,
              a.project_id,a.technical_assessment_id
       FROM growth_company_assessments a JOIN growth_companies c ON c.id=a.company_id
       WHERE a.candidate_id=? AND a.status NOT IN ('DECLINED','WITHDRAWN','CLOSED')
       ORDER BY a.updated_at DESC LIMIT 100`, [userId]
    ) as Promise<Array<Record<string, unknown>>>,
  ]);
  return res.json({
    companies: companies.map(row => ({ id: row.id, name: row.name, role: row.role, createdAt: row.created_at })),
    pendingMemberships: pendingMembers,
    candidateCases: candidateCases.map(row => ({ ...row, taskUrl: row.project_id && row.technical_assessment_id ? `/projects?project=${row.project_id}` : null })),
  });
});

projectCompaniesRouter.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const parsed = z.object({ name: z.string().trim().min(2).max(160) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_COMPANY_NAME");
  const id = randomUUID();
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    await runner.query("INSERT INTO growth_companies (id,owner_id,name) VALUES (?,?,?)", [id, userId, parsed.data.name]);
    await runner.query("INSERT INTO growth_company_members (id,company_id,user_id,role,status,invited_by) VALUES (?,?,?,'OWNER','ACTIVE',?)", [randomUUID(), id, userId, userId]);
    await runner.commitTransaction();
  } catch (error) { await runner.rollbackTransaction(); throw error; }
  finally { await runner.release(); }
  return res.status(201).json({ company: { id, name: parsed.data.name, role: "OWNER" } });
});

projectCompaniesRouter.get("/candidate/assessments/:assessmentId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const row = await companyAssessmentForCandidate(req.params.assessmentId, userId);
  if (!row || ["WITHDRAWN", "CLOSED"].includes(String(row.status))) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  const response = publicCase(row, true);
  if (row.status === "INVITED") {
    delete response.answers;
    delete response.projectId;
    delete response.versionId;
    delete response.technicalAssessmentId;
  }
  if (row.technical_assessment_id) {
    const taskRows = await AppDataSource.query(
      `SELECT a.id,a.status,a.card_snapshot,a.draft_json,a.draft_revision,a.job_id,j.state AS job_state,j.result_json
       FROM growth_project_assessments a LEFT JOIN growth_project_jobs j ON j.id=a.job_id
       WHERE a.id=? AND a.owner_id=? AND a.company_assessment_id=? LIMIT 1`, [row.technical_assessment_id, userId, row.id]
    ) as Array<Record<string, unknown>>;
    const task = taskRows[0];
    if (task) {
      response.task = {
        id: task.id, status: task.status, card: (() => { const card = parseJson<Record<string, unknown>>(task.card_snapshot, {}); const { tests: _hidden, ...publicCard } = card; return publicCard; })(),
        draft: parseJson(task.draft_json, null), revision: task.draft_revision,
        job: task.job_id ? { id: task.job_id, state: task.job_state, result: parseJson(task.result_json, null) } : null,
      };
    }
  }
  return res.json({ assessment: response });
});

projectCompaniesRouter.post("/candidate/assessments/:assessmentId/respond", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const parsed = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]), consent: z.literal(true).optional() }).safeParse(req.body ?? {});
  if (!parsed.success || parsed.data.decision === "ACCEPT" && parsed.data.consent !== true) return sendError(res, 400, "EXPLICIT_CONSENT_REQUIRED");
  const status = parsed.data.decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  const result = await AppDataSource.query(
    "UPDATE growth_company_assessments SET status=?,consent_at=IF(?='ACCEPT',NOW(3),NULL) WHERE id=? AND candidate_id=? AND status='INVITED'",
    [status, parsed.data.decision, req.params.assessmentId, userId]
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_INVITED");
  if (parsed.data.decision === "DECLINE") await revokeTalentInterviewAccess(req.params.assessmentId);
  const company = await AppDataSource.query("SELECT created_by,company_id FROM growth_company_assessments WHERE id=?", [req.params.assessmentId]) as Array<{ created_by: number; company_id: string }>;
  if (company[0]) await notifyCompanyUser(company[0].created_by, userId, "COMPANY_ASSESSMENT_UPDATED", `/companies?company=${company[0].company_id}&assessment=${req.params.assessmentId}`);
  return res.json({ status });
});

projectCompaniesRouter.get("/candidate/assessments/:assessmentId/portfolio-options", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const row = await companyAssessmentForCandidate(req.params.assessmentId, userId);
  if (!row || !["ACCEPTED", "PORTFOLIO_SELECTED"].includes(String(row.status))) return sendError(res, 404, "ASSESSMENT_NOT_AVAILABLE");
  const rows = await AppDataSource.query(
    `SELECT p.id AS project_id,p.family_key,p.runtime,p.blueprint_revision,v.id AS version_id,v.stage_key,v.sequence_no,v.explanation,v.created_at
     FROM growth_projects p JOIN growth_project_versions v ON v.project_id=p.id AND v.owner_id=p.owner_id
     WHERE p.owner_id=? ORDER BY v.created_at DESC LIMIT 200`, [userId]
  ) as Array<Record<string, unknown>>;
  return res.json({ versions: rows.filter(item => growthFamilyFor(String(item.family_key), String(item.blueprint_revision ?? "")) !== null).map(item => ({
    projectId: item.project_id, family: item.family_key, runtime: item.runtime, versionId: item.version_id,
    stage: item.stage_key, sequence: item.sequence_no, explanation: item.explanation, createdAt: item.created_at,
  })) });
});

projectCompaniesRouter.post("/candidate/assessments/:assessmentId/portfolio", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const parsed = z.object({ projectId: z.string().uuid(), versionId: z.string().uuid() }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_PROJECT_VERSION");
  const row = await companyAssessmentForCandidate(req.params.assessmentId, userId);
  if (!row || !["ACCEPTED", "PORTFOLIO_SELECTED"].includes(String(row.status))) return sendError(res, 409, "ASSESSMENT_NOT_AVAILABLE");
  const versions = await AppDataSource.query(
    `SELECT p.id,p.family_key,p.runtime,p.blueprint_revision,v.id AS version_id
     FROM growth_projects p JOIN growth_project_versions v ON v.project_id=p.id AND v.owner_id=p.owner_id
     WHERE p.id=? AND p.owner_id=? AND v.id=? LIMIT 1`, [parsed.data.projectId, userId, parsed.data.versionId]
  ) as Array<Record<string, unknown>>;
  const version = versions[0];
  if (!version || !growthFamilyFor(String(version.family_key), String(version.blueprint_revision))) return sendError(res, 404, "PROJECT_VERSION_NOT_FOUND");
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET project_id=?,version_id=?,status='PORTFOLIO_SELECTED'
     WHERE id=? AND candidate_id=? AND status IN ('ACCEPTED','PORTFOLIO_SELECTED')`, [version.id, version.version_id, row.id, userId]
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_AVAILABLE");
  await notifyCompanyUser(Number(row.created_by), userId, "COMPANY_ASSESSMENT_UPDATED", `/companies?company=${row.company_id}&assessment=${row.id}`);
  return res.json({ status: "PORTFOLIO_SELECTED", projectId: version.id, versionId: version.version_id });
});

projectCompaniesRouter.put("/candidate/assessments/:assessmentId/interview-answers", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const parsed = z.object({ answers: z.array(z.object({ questionId: z.string().min(1).max(40), answer: z.string().max(6000) })).max(8) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_INTERVIEW_ANSWERS");
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET answers_json=? WHERE id=? AND candidate_id=? AND hr_review_json IS NULL AND status IN ('ACCEPTED','PORTFOLIO_SELECTED','TASK_ASSIGNED')`,
    [JSON.stringify(parsed.data.answers), req.params.assessmentId, userId]
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_AVAILABLE");
  const recipients = await AppDataSource.query("SELECT created_by,company_id FROM growth_company_assessments WHERE id=?", [req.params.assessmentId]) as Array<{ created_by: number; company_id: string }>;
  if (recipients[0]) await notifyCompanyUser(recipients[0].created_by, userId, "COMPANY_ASSESSMENT_UPDATED", `/companies?company=${recipients[0].company_id}&assessment=${req.params.assessmentId}`);
  return res.json({ saved: true });
});

projectCompaniesRouter.post("/candidate/assessments/:assessmentId/withdraw", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const linked = await AppDataSource.query(
    "SELECT id,job_id FROM growth_project_assessments WHERE company_assessment_id=? AND owner_id=? AND status='ACTIVE' LIMIT 1",
    [req.params.assessmentId, userId]
  ) as Array<{ id: string; job_id: string | null }>;
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET status='WITHDRAWN',answers_json=NULL,hr_review_json=NULL,technical_review_json=NULL
     WHERE id=? AND candidate_id=? AND status NOT IN ('WITHDRAWN','CLOSED')`, [req.params.assessmentId, userId]
  );
  if (!result.affectedRows) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  await revokeTalentInterviewAccess(req.params.assessmentId);
  if (linked[0]) {
    await AppDataSource.query("UPDATE growth_project_assessments SET status='CANCELLED',completed_at=NOW(3) WHERE id=? AND owner_id=? AND status='ACTIVE'", [linked[0].id, userId]);
    if (linked[0].job_id) await cancelGrowthProjectJob(linked[0].job_id, userId);
  }
  const recipients = await AppDataSource.query("SELECT created_by,company_id FROM growth_company_assessments WHERE id=?", [req.params.assessmentId]) as Array<{ created_by: number; company_id: string }>;
  if (recipients[0]) await notifyCompanyUser(recipients[0].created_by, userId, "COMPANY_ASSESSMENT_UPDATED", `/companies?company=${recipients[0].company_id}&assessment=${req.params.assessmentId}`);
  return res.json({ withdrawn: true });
});

projectCompaniesRouter.post("/:companyId/members", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId)) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const role = await companyRole(req.params.companyId, userId);
  if (role !== "OWNER") return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  const parsed = z.object({ username: z.string().trim().min(1).max(80), role: z.enum(["HR", "ENGINEER"]) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_MEMBER");
  const users = await AppDataSource.query("SELECT id,username FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [parsed.data.username]) as Array<{ id: number; username: string }>;
  if (!users[0]) return sendError(res, 404, "PERSONAL_USER_NOT_FOUND");
  if (users[0].id === userId) return sendError(res, 400, "SELF_INVITE_NOT_ALLOWED");
  try {
    const id = randomUUID();
    await AppDataSource.query("INSERT INTO growth_company_members (id,company_id,user_id,role,status,invited_by) VALUES (?,?,?,?,'PENDING',?)", [id, req.params.companyId, users[0].id, parsed.data.role, userId]);
    await notifyCompanyUser(users[0].id, userId, "COMPANY_TEAM_INVITATION", "/companies");
    return res.status(201).json({ membership: { id, username: users[0].username, role: parsed.data.role, status: "PENDING" } });
  } catch (error) {
    const existing = await AppDataSource.query("SELECT id,status FROM growth_company_members WHERE company_id=? AND user_id=? LIMIT 1", [req.params.companyId, users[0].id]) as Array<Record<string, unknown>>;
    if (existing[0]) return sendError(res, 409, "MEMBERSHIP_ALREADY_EXISTS");
    throw error;
  }
});

projectCompaniesRouter.post("/members/:membershipId/respond", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const parsed = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_DECISION");
  const pending = await AppDataSource.query("SELECT invited_by FROM growth_company_members WHERE id=? AND user_id=? AND status='PENDING' LIMIT 1", [req.params.membershipId, userId]) as Array<{ invited_by: number }>;
  if (!pending[0]) return sendError(res, 404, "MEMBERSHIP_INVITATION_NOT_FOUND");
  const status = parsed.data.decision === "ACCEPT" ? "ACTIVE" : "DECLINED";
  const result = await AppDataSource.query("UPDATE growth_company_members SET status=? WHERE id=? AND user_id=? AND status='PENDING'", [status, req.params.membershipId, userId]);
  if (!result.affectedRows) return sendError(res, 404, "MEMBERSHIP_INVITATION_NOT_FOUND");
  await notifyCompanyUser(pending[0].invited_by, userId, "COMPANY_ASSESSMENT_UPDATED", "/companies");
  return res.json({ status });
});

projectCompaniesRouter.post("/:companyId/assessments", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId)) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const role = await companyRole(req.params.companyId, userId);
  if (role !== "OWNER" && role !== "HR") return sendError(res, 403, "HR_ACCESS_REQUIRED");
  const parsed = z.object({
    candidateUsername: z.string().trim().min(1).max(80), roleTitle: z.string().trim().min(2).max(160),
    introduction: z.string().trim().min(10).max(4000),
    questions: z.array(z.object({ id: z.string().trim().min(1).max(40), text: z.string().trim().min(3).max(500) })).min(2).max(8),
    idempotencyKey: z.string().trim().min(8).max(128),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_CANDIDATE_ASSESSMENT");
  const candidates = await AppDataSource.query("SELECT id,username FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [parsed.data.candidateUsername]) as Array<{ id: number; username: string }>;
  if (!candidates[0]) return sendError(res, 404, "PERSONAL_CANDIDATE_NOT_FOUND");
  if (candidates[0].id === userId) return sendError(res, 400, "SELF_ASSESSMENT_NOT_ALLOWED");
  const questionsJson = JSON.stringify(parsed.data.questions);
  const sameRequest = (row: Record<string, unknown>) => Number(row.candidate_id) === candidates[0].id
    && row.role_title === parsed.data.roleTitle && row.introduction === parsed.data.introduction
    && row.questions_json === questionsJson;
  const duplicate = await AppDataSource.query("SELECT id,candidate_id,role_title,introduction,questions_json,status FROM growth_company_assessments WHERE company_id=? AND idempotency_key=? LIMIT 1", [req.params.companyId, parsed.data.idempotencyKey]) as Array<Record<string, unknown>>;
  if (duplicate[0]) {
    if (!sameRequest(duplicate[0])) return sendError(res, 409, "IDEMPOTENCY_CONFLICT");
    return res.json({ assessment: { id: duplicate[0].id, status: duplicate[0].status } });
  }
  const id = randomUUID();
  try {
    await AppDataSource.query(
      `INSERT INTO growth_company_assessments (id,company_id,created_by,candidate_id,idempotency_key,role_title,introduction,questions_json,status)
       VALUES (?,?,?,?,?,?,?,?,'INVITED')`,
      [id, req.params.companyId, userId, candidates[0].id, parsed.data.idempotencyKey, parsed.data.roleTitle, parsed.data.introduction, questionsJson]
    );
  } catch (error) {
    const raced = await AppDataSource.query("SELECT id,candidate_id,role_title,introduction,questions_json,status FROM growth_company_assessments WHERE company_id=? AND idempotency_key=? LIMIT 1", [req.params.companyId, parsed.data.idempotencyKey]) as Array<Record<string, unknown>>;
    if (!raced[0]) throw error;
    if (!sameRequest(raced[0])) return sendError(res, 409, "IDEMPOTENCY_CONFLICT");
    return res.json({ assessment: { id: raced[0].id, status: raced[0].status } });
  }
  await notifyCompanyUser(candidates[0].id, userId, "COMPANY_ASSESSMENT_INVITATION", `/companies?case=${id}`);
  return res.status(201).json({ assessment: { id, candidateUsername: candidates[0].username, roleTitle: parsed.data.roleTitle, status: "INVITED" } });
});

projectCompaniesRouter.get("/:companyId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId)) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const role = await companyRole(req.params.companyId, userId);
  if (!role) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const companies = await AppDataSource.query("SELECT id,name,created_at,updated_at FROM growth_companies WHERE id=? LIMIT 1", [req.params.companyId]) as Array<Record<string, unknown>>;
  if (!companies[0]) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const [members, assessments] = await Promise.all([
    AppDataSource.query("SELECT m.id,m.user_id,u.username,m.role,m.status,m.created_at FROM growth_company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY m.created_at", [req.params.companyId]) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query(
      `SELECT a.id,a.candidate_id,u.username AS candidate_username,a.role_title,a.status,a.created_at,a.updated_at,
              a.project_id,a.version_id,a.task_title,a.technical_assessment_id
       FROM growth_company_assessments a JOIN users u ON u.id=a.candidate_id
       WHERE a.company_id=? ORDER BY a.updated_at DESC LIMIT 200`, [req.params.companyId]
    ) as Promise<Array<Record<string, unknown>>>,
  ]);
  return res.json({
    company: { ...companies[0], role }, members,
    assessments: assessments.map(row => row.status === "WITHDRAWN"
      ? (({ project_id: _projectId, version_id: _versionId, task_title: _taskTitle, technical_assessment_id: _taskId, ...summary }) => summary)(row)
      : row),
  });
});

projectCompaniesRouter.get("/:companyId/assessments/:assessmentId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const role = await companyRole(req.params.companyId, userId);
  if (!role) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  const rows = await AppDataSource.query(
    `SELECT a.*,c.name AS company_name,u.username AS candidate_username,v.stage_key,v.sequence_no,v.explanation AS portfolio_explanation,p.family_key,p.runtime,p.blueprint_revision,art.files_json,art.examples_json,
            pa.status AS task_status,pa.explanation AS task_explanation,pa.draft_json AS task_draft,pa.job_id,j.state AS job_state,j.result_json
     FROM growth_company_assessments a
     JOIN growth_companies c ON c.id=a.company_id JOIN users u ON u.id=a.candidate_id
     LEFT JOIN growth_project_versions v ON v.id=a.version_id
     LEFT JOIN growth_projects p ON p.id=a.project_id
     LEFT JOIN growth_project_artifacts art ON art.id=v.artifact_id
     LEFT JOIN growth_project_assessments pa ON pa.id=a.technical_assessment_id
     LEFT JOIN growth_project_jobs j ON j.id=pa.job_id
     WHERE a.id=? AND a.company_id=? LIMIT 1`, [req.params.assessmentId, req.params.companyId]
  ) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  const response = publicCase(row, role === "OWNER" || role === "HR");
  response.candidateUsername = row.candidate_username;
  if (row.status !== "WITHDRAWN" && row.status !== "INVITED" && row.project_id && row.version_id) {
    response.portfolio = {
      projectId: row.project_id, versionId: row.version_id, family: row.family_key,
      runtime: row.runtime, stage: row.stage_key, sequence: row.sequence_no,
      explanation: row.portfolio_explanation ?? null,
      files: parseJson<JudgeFile[]>(row.files_json, []),
    };
  }
  if ((role === "OWNER" || role === "ENGINEER") && row.technical_assessment_id) {
    response.task = {
      id: row.technical_assessment_id, title: row.task_title, status: row.task_status,
      explanation: row.task_explanation,
      files: row.task_status === "PASSED" || row.task_status === "FAILED" ? submittedFiles(row.task_draft) : undefined,
      result: ["TASK_SUBMITTED", "REVIEWED"].includes(String(row.status)) && parseJson(row.result_json, null)
        ? (() => { const result = parseJson<Record<string, unknown>>(row.result_json, {}); return { passed: result.passed, testsPassed: result.testsPassed, testsTotal: result.testsTotal }; })()
        : null,
      executionState: row.job_state,
    };
  }
  if (row.status === "WITHDRAWN") {
    delete response.answers; delete response.hrReview; delete response.technicalReview; delete response.portfolio; delete response.task;
  }
  if (role === "ENGINEER") { delete response.answers; delete response.hrReview; }
  if (role === "HR") delete response.task;
  return res.json({ assessment: response, role });
});

projectCompaniesRouter.post("/:companyId/assessments/:assessmentId/interview-review", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const role = await companyRole(req.params.companyId, userId);
  if (role !== "OWNER" && role !== "HR") return sendError(res, 403, "HR_ACCESS_REQUIRED");
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_HR_REVIEW");
  const reviewers = await AppDataSource.query("SELECT username FROM users WHERE id=? LIMIT 1", [userId]) as Array<{ username: string }>;
  const review = { ...parsed.data, submittedAt: new Date().toISOString(), reviewerUsername: reviewers[0]?.username ?? null };
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET hr_review_json=? WHERE id=? AND company_id=? AND candidate_id IS NOT NULL AND status NOT IN ('INVITED','DECLINED','WITHDRAWN','CLOSED')`,
    [JSON.stringify(review), req.params.assessmentId, req.params.companyId]
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_REVIEWABLE");
  const candidates = await AppDataSource.query("SELECT candidate_id FROM growth_company_assessments WHERE id=? AND company_id=?", [req.params.assessmentId, req.params.companyId]) as Array<{ candidate_id: number }>;
  if (candidates[0]) await notifyCompanyUser(candidates[0].candidate_id, userId, "COMPANY_ASSESSMENT_UPDATED", `/companies?case=${req.params.assessmentId}`);
  return res.json({ review });
});

projectCompaniesRouter.post("/:companyId/assessments/:assessmentId/technical-task", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const role = await companyRole(req.params.companyId, userId);
  if (role !== "OWNER" && role !== "ENGINEER") return sendError(res, 403, "ENGINEER_ACCESS_REQUIRED");
  const parsed = z.object({
    title: z.string().trim().min(3).max(120), prompt: z.string().trim().min(20).max(5000),
    tests: z.array(z.object({ input: z.string().max(4096), output: z.string().max(4096), group: z.string().trim().min(1).max(80), hidden: z.boolean().default(false) })).min(2).max(10),
    idempotencyKey: z.string().trim().min(8).max(128),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_TECHNICAL_TASK");
  if (!parsed.data.tests.some(test => test.hidden) || !parsed.data.tests.some(test => !test.hidden)) return sendError(res, 400, "PUBLIC_AND_HIDDEN_TESTS_REQUIRED");
  const testBytes = parsed.data.tests.reduce((sum, test) => sum + Buffer.byteLength(test.input, "utf8") + Buffer.byteLength(test.output, "utf8"), 0);
  if (testBytes > 32_768) return sendError(res, 413, "TECHNICAL_TASK_TESTS_TOO_LARGE");
  const hash = sha(JSON.stringify({ title: parsed.data.title, prompt: parsed.data.prompt, tests: parsed.data.tests }));
  const cases = await AppDataSource.query(
    `SELECT a.id,a.candidate_id,a.status,a.project_id,a.version_id,a.technical_assessment_id,a.task_hash,a.task_idempotency_key,
            p.family_key,p.runtime,p.blueprint_revision,v.artifact_id,art.files_json,art.examples_json
     FROM growth_company_assessments a JOIN growth_projects p ON p.id=a.project_id
     JOIN growth_project_versions v ON v.id=a.version_id AND v.project_id=p.id
     JOIN growth_project_artifacts art ON art.id=v.artifact_id
     WHERE a.id=? AND a.company_id=? LIMIT 1`, [req.params.assessmentId, req.params.companyId]
  ) as Array<Record<string, unknown>>;
  const row = cases[0];
  if (!row || !["PORTFOLIO_SELECTED", "TASK_ASSIGNED"].includes(String(row.status))) return sendError(res, 409, "CANDIDATE_PORTFOLIO_REQUIRED");
  if (row.task_idempotency_key) {
    if (row.task_idempotency_key !== parsed.data.idempotencyKey || row.task_hash !== hash) return sendError(res, 409, "TASK_ALREADY_ASSIGNED");
    return res.json({ assessmentId: row.technical_assessment_id, status: "TASK_ASSIGNED", existing: true });
  }
  const runtime = runtimes.safeParse(row.runtime);
  if (!runtime.success || !growthFamilyFor(String(row.family_key), String(row.blueprint_revision))) return sendError(res, 409, "UNSUPPORTED_PROJECT_RUNTIME");
  const tests = growthJudgeTests(parsed.data.tests, true, "company-");
  const publicExamples = parsed.data.tests.filter(test => !test.hidden).slice(0, 3).map(({ input, output }) => ({ input, output }));
  const cardSnapshot = { id: `company-${req.params.assessmentId.slice(0, 40)}`, title: parsed.data.title, prompt: parsed.data.prompt, tests: parsed.data.tests, examples: publicExamples };
  const files = parseJson<JudgeFile[]>(row.files_json, []);
  if (!files.length || files.some(file => !isObject(file) || typeof file.path !== "string" || typeof file.content !== "string")) return sendError(res, 409, "PROJECT_VERSION_ARTIFACT_INVALID");
  const id = randomUUID();
  const idempotencyKey = `company:${row.id}:${parsed.data.idempotencyKey}`.slice(0, 128);
  const runner = AppDataSource.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    await runner.query("SELECT id FROM growth_company_assessments WHERE id=? AND company_id=? FOR UPDATE", [req.params.assessmentId, req.params.companyId]);
    const fresh = await runner.query("SELECT status,technical_assessment_id,task_hash,task_idempotency_key FROM growth_company_assessments WHERE id=? AND company_id=? FOR UPDATE", [req.params.assessmentId, req.params.companyId]) as Array<Record<string, unknown>>;
    if (!fresh[0] || !["PORTFOLIO_SELECTED", "TASK_ASSIGNED"].includes(String(fresh[0].status))) throw new Error("CANDIDATE_PORTFOLIO_REQUIRED");
    if (fresh[0].technical_assessment_id) {
      if (fresh[0].task_idempotency_key !== parsed.data.idempotencyKey || fresh[0].task_hash !== hash) throw new Error("TASK_ALREADY_ASSIGNED");
      await runner.commitTransaction();
      return res.json({ assessmentId: fresh[0].technical_assessment_id, status: "TASK_ASSIGNED", existing: true });
    }
    await runner.query(
      `INSERT INTO growth_project_assessments (id,project_id,owner_id,kind,source_version_id,card_id,idempotency_key,card_snapshot,draft_json,status,company_assessment_id)
       VALUES (?,?,?,'COMPANY_TASK',?,?,?,?,?,'ACTIVE',?)`,
      [id, row.project_id, row.candidate_id, row.version_id, cardSnapshot.id, idempotencyKey, JSON.stringify(cardSnapshot), JSON.stringify({ files, examples: [], explanation: "" }), req.params.assessmentId]
    );
    await runner.query(
      `UPDATE growth_company_assessments SET task_title=?,task_prompt=?,task_runtime=?,task_tests_json=?,task_idempotency_key=?,task_hash=?,technical_assessment_id=?,status='TASK_ASSIGNED'
       WHERE id=? AND company_id=?`,
      [parsed.data.title, parsed.data.prompt, runtime.data, JSON.stringify(parsed.data.tests), parsed.data.idempotencyKey, hash, id, req.params.assessmentId, req.params.companyId]
    );
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    const code = error instanceof Error ? error.message : "TASK_CREATE_FAILED";
    if (["CANDIDATE_PORTFOLIO_REQUIRED", "TASK_ALREADY_ASSIGNED"].includes(code)) return sendError(res, 409, code);
    throw error;
  } finally { await runner.release(); }
  await notifyCompanyUser(Number(row.candidate_id), userId, "COMPANY_ASSESSMENT_UPDATED", `/companies?case=${req.params.assessmentId}`);
  return res.status(201).json({ assessmentId: id, status: "TASK_ASSIGNED", runtime: runtime.data, tests: tests.length });
});

projectCompaniesRouter.post("/:companyId/assessments/:assessmentId/technical-review", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = await personalUser(req, res); if (!userId) return;
  const role = await companyRole(req.params.companyId, userId);
  if (role !== "OWNER" && role !== "ENGINEER") return sendError(res, 403, "ENGINEER_ACCESS_REQUIRED");
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_TECHNICAL_REVIEW");
  const rows = await AppDataSource.query(
    `SELECT a.status,pa.status AS attempt_status FROM growth_company_assessments a
     JOIN growth_project_assessments pa ON pa.id=a.technical_assessment_id AND pa.company_assessment_id=a.id
     WHERE a.id=? AND a.company_id=? LIMIT 1`, [req.params.assessmentId, req.params.companyId]
  ) as Array<Record<string, unknown>>;
  if (!rows[0] || !["TASK_SUBMITTED", "REVIEWED"].includes(String(rows[0].status)) || rows[0].attempt_status !== "PASSED" && rows[0].attempt_status !== "FAILED") return sendError(res, 409, "TECHNICAL_TASK_NOT_SUBMITTED");
  const reviewers = await AppDataSource.query("SELECT username FROM users WHERE id=? LIMIT 1", [userId]) as Array<{ username: string }>;
  const review = { ...parsed.data, submittedAt: new Date().toISOString(), reviewerUsername: reviewers[0]?.username ?? null, automatedTests: rows[0].attempt_status };
  const update = await AppDataSource.query(
    "UPDATE growth_company_assessments SET technical_review_json=?,status='REVIEWED' WHERE id=? AND company_id=? AND status IN ('TASK_SUBMITTED','REVIEWED')",
    [JSON.stringify(review), req.params.assessmentId, req.params.companyId]
  );
  if (!update.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_REVIEWABLE");
  const candidates = await AppDataSource.query("SELECT candidate_id FROM growth_company_assessments WHERE id=? AND company_id=?", [req.params.assessmentId, req.params.companyId]) as Array<{ candidate_id: number }>;
  if (candidates[0]) await notifyCompanyUser(candidates[0].candidate_id, userId, "COMPANY_ASSESSMENT_UPDATED", `/companies?case=${req.params.assessmentId}`);
  return res.json({ review, status: "REVIEWED" });
});
