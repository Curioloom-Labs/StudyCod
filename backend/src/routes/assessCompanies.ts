import { Router, type Response } from "express";
import { createHash, createHmac, randomBytes, randomUUID } from "crypto";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { JWT_SECRET } from "../config";
import { User } from "../entities/User";
import { authRequired, type AuthRequest } from "../middleware/authMiddleware";
import { createRouteLimiter } from "../middleware/routeRateLimit";
import { growthFamilyFor, growthJudgeTests } from "../data/growthProjects";
import { cancelGrowthProjectJob } from "../services/growthProjectQueue";
import { revokeAssessInterviewAccess } from "../services/assessInterviewMedia";
import { revokeAssessInterviewMemberAccess } from "../services/assessInterviewMembership";
import { activeAssessCompanyRole } from "../services/assessCompanyAccess";
import { canAssessCompanyRole, type AssessCompanyRole } from "../services/assessAccessPolicy";
import { requirePersonalAccountPrincipal } from "../services/personalAccountAccess";
import { writeAudit } from "../services/audit/auditLog";
import { logger } from "../utils/logger";
import { emailService } from "../services/emailService";
import type { JudgeFile } from "../services/judgeWorker/types";
import { authenticateAssessApiKey, assessApiKeyScopes } from "../services/assessApiKeys";
import { assessWebhookEvents, enqueueAssessWebhookEvent, encryptAssessWebhookSecret, validateAssessWebhookUrl, type AssessWebhookEvent } from "../services/assessWebhookDelivery";
import { ASSESS_ROLE_PROFILE_KEYS, assessRubricForProfile, isAssessRoleProfile, legacyAssessRubric } from "../services/assessRoleRubric";

export const assessCompaniesRouter = Router();
export const assessApiRouter = Router();
assessApiRouter.use(createRouteLimiter({ windowMs: 60_000, limit: 120, namespace: "assess-api-v1" }));
const assessCompaniesLimiter = createRouteLimiter({ windowMs: 60_000, limit: 90, namespace: "assess-companies" });
// The app hydrates the authenticated principal before mounting this router;
// keep route-level auth checks below while applying one shared user/IP budget.
assessCompaniesRouter.use(assessCompaniesLimiter);

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
function reviewHistory(value: unknown): Array<Record<string, unknown>> {
  const parsed = parseJson<unknown>(value, null);
  const rows = Array.isArray(parsed) ? parsed : isObject(parsed) ? [parsed] : [];
  return rows.filter(isObject);
}
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const assessmentInviteToken = (companyId: string, idempotencyKey: string) => createHmac("sha256", JWT_SECRET).update(`assess-invite:v1:${companyId}:${idempotencyKey}`).digest("base64url");
const sendError = (res: Response, status: number, code: string) => res.status(status).json({ code, message: code });

function maskEmail(value: string): string {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "••••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

async function sendAssessmentInviteIfNeeded(input: {
  assessmentId: string;
  companyId: string;
  email: string;
  token: string;
  companyName: string;
  roleTitle: string;
  introduction: string;
  estimatedMinutes: number;
  deadlineAt: string | null;
  aiPolicy: string;
}): Promise<boolean> {
  const rows = await AppDataSource.query(
    "SELECT invitation_sent_at,invitation_token_hash FROM growth_company_assessments WHERE id=? AND company_id=? LIMIT 1",
    [input.assessmentId, input.companyId],
  ) as Array<{ invitation_sent_at: unknown; invitation_token_hash: string | null }>;
  if (!rows[0]) return false;
  if (rows[0].invitation_sent_at) return true;
  if (rows[0].invitation_token_hash !== sha(input.token)) return false;
  try {
    await emailService.sendAssessCandidateInvitationEmail({
      to: input.email,
      companyName: input.companyName,
      roleTitle: input.roleTitle,
      introduction: input.introduction,
      token: input.token,
      estimatedMinutes: input.estimatedMinutes,
      deadlineAt: input.deadlineAt,
      aiPolicy: input.aiPolicy,
    });
    await AppDataSource.query(
      "UPDATE growth_company_assessments SET invitation_sent_at=NOW(3) WHERE id=? AND invitation_token_hash=? AND invitation_sent_at IS NULL",
      [input.assessmentId, sha(input.token)],
    );
    return true;
  } catch (error) {
    logger.warn("[assess] candidate invitation email failed", { assessmentId: input.assessmentId, error });
    return false;
  }
}

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

type CaseAudience = AssessCompanyRole | "CANDIDATE";

async function emitAssessWebhookEvent(companyId: string, assessmentId: string, type: AssessWebhookEvent, status: string, data?: Record<string, unknown>): Promise<void> {
  try { await enqueueAssessWebhookEvent({ companyId, assessmentId, type, status, data }); }
  catch (error) { logger.error("[assess:webhooks] event could not be queued", { err: error, companyId, assessmentId, type }); }
}

function publicCase(row: Record<string, unknown>, audience: CaseAudience) {
  const base: Record<string, unknown> = {
    id: row.id, companyId: row.company_id, companyName: row.company_name,
    roleTitle: row.role_title, introduction: row.introduction,
    roleProfile: isAssessRoleProfile(row.role_profile) ? row.role_profile : "SOFTWARE_ENGINEERING",
    rubric: row.rubric_json ? parseJson(row.rubric_json, legacyAssessRubric) : legacyAssessRubric,
    questions: parseJson(row.questions_json, []), status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    consentAt: row.consent_at,
    answersSubmittedAt: row.answers_submitted_at ?? null,
  };
  if (row.status === "WITHDRAWN") return base;

  if (audience === "CANDIDATE") {
    if (row.status !== "INVITED") {
      base.answers = parseJson(row.answers_json, []);
      base.projectId = row.project_id;
      base.versionId = row.version_id;
      base.technicalAssessmentId = row.technical_assessment_id;
      base.taskTitle = row.task_title;
      base.taskPrompt = row.task_prompt;
      base.portfolioEvidence = parseJson(row.selected_portfolio_json, null);
      const hrReviews = reviewHistory(row.hr_review_json).map(({ reviewerId: _reviewerId, ...review }) => review);
      const technicalReviews = reviewHistory(row.technical_review_json).map(({ reviewerId: _reviewerId, ...review }) => review);
      base.hrReviews = hrReviews;
      base.technicalReviews = technicalReviews;
      base.hrReview = hrReviews[hrReviews.length - 1] ?? null;
      base.technicalReview = technicalReviews[technicalReviews.length - 1] ?? null;
      const finalDecision = parseJson<Record<string, unknown> | null>(row.decision_json, null);
      if (finalDecision?.releaseToCandidate === true) base.finalDecision = {
        outcome: finalDecision.outcome,
        rationale: finalDecision.rationale,
        decidedAt: finalDecision.decidedAt,
      };
    }
    return base;
  }

  if (canAssessCompanyRole(audience, "READ_CANDIDATE_DOSSIER")) {
    base.projectId = row.project_id;
    base.versionId = row.version_id;
    base.portfolioEvidence = parseJson(row.selected_portfolio_json, null);
  }
  if (canAssessCompanyRole(audience, "READ_CANDIDATE_ANSWERS")) base.answers = parseJson(row.answers_json, []);
  if (canAssessCompanyRole(audience, "READ_HR_REVIEW")) {
    const reviews = reviewHistory(row.hr_review_json);
    base.hrReviews = reviews;
    base.hrReview = reviews[reviews.length - 1] ?? null;
  }
  if (canAssessCompanyRole(audience, "READ_TECHNICAL_REVIEW")) {
    const reviews = reviewHistory(row.technical_review_json);
    base.technicalReviews = reviews;
    base.technicalReview = reviews[reviews.length - 1] ?? null;
  }
  if (canAssessCompanyRole(audience, "READ_TECHNICAL_TASK")) {
    base.technicalAssessmentId = row.technical_assessment_id;
    base.taskTitle = row.task_title;
    base.taskPrompt = row.task_prompt;
  }
  if (canAssessCompanyRole(audience, "REVIEW_HR")) base.finalDecision = parseJson(row.decision_json, null);
  return base;
}

function publicAssessApiRecord(row: Record<string, unknown>): Record<string, unknown> {
  const decision = parseJson<Record<string, unknown> | null>(row.decisionJson, null);
  const { decisionJson: _privateDecisionPayload, ...record } = row;
  return {
    ...record,
    finalDecision: decision ? {
      outcome: decision.outcome,
      releaseToCandidate: decision.releaseToCandidate === true,
      decidedAt: decision.decidedAt,
    } : null,
  };
}

const reviewSchema = z.object({
  scores: z.array(z.number().int().min(0).max(3).nullable()).min(1).max(8),
  comment: z.string().trim().min(12).max(6000),
  recommendation: z.enum(["READY_TO_CONTINUE", "NEEDS_WORK"]),
});
const decisionSchema = z.object({
  outcome: z.enum(["ADVANCE", "REJECT", "HOLD"]),
  rationale: z.string().trim().min(12).max(4000),
  releaseToCandidate: z.boolean().default(false),
});

async function appendReviewerReview(
  assessmentId: string,
  companyId: string,
  userId: number,
  kind: "HR" | "TECHNICAL",
  payload: z.infer<typeof reviewSchema> & { allowPortfolioEvidence?: boolean },
): Promise<{ review: Record<string, unknown> } | { error: string }> {
  const column = kind === "HR" ? "hr_review_json" : "technical_review_json";
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const rows = await runner.query(
      "SELECT a." + column + " AS review_json,a.status,a.answers_submitted_at,a.rubric_json,pa.status AS attempt_status " +
      "FROM growth_company_assessments a LEFT JOIN growth_project_assessments pa " +
      "ON pa.id=a.technical_assessment_id AND pa.company_assessment_id=a.id " +
      "WHERE a.id=? AND a.company_id=? FOR UPDATE",
      [assessmentId, companyId],
    ) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) {
      await runner.rollbackTransaction();
      return { error: "ASSESSMENT_NOT_REVIEWABLE" };
    }
    const rubric = row.rubric_json ? parseJson<Array<Record<string, unknown>>>(row.rubric_json, legacyAssessRubric) : legacyAssessRubric;
    if (payload.scores.length !== rubric.length) {
      await runner.rollbackTransaction();
      return { error: "INVALID_RUBRIC_SCORE_COUNT" };
    }
    if (kind === "HR" && ["INVITED", "DECLINED", "WITHDRAWN", "CLOSED"].includes(String(row.status))) {
      await runner.rollbackTransaction();
      return { error: "ASSESSMENT_NOT_REVIEWABLE" };
    }
    if (kind === "HR" && !row.answers_submitted_at) {
      await runner.rollbackTransaction();
      return { error: "INTERVIEW_ANSWERS_NOT_SUBMITTED" };
    }
    if (kind === "TECHNICAL" && !["TASK_SUBMITTED", "REVIEWED"].includes(String(row.status))) {
      await runner.rollbackTransaction();
      return { error: "TECHNICAL_TASK_NOT_SUBMITTED" };
    }
    if (kind === "TECHNICAL" && !["PASSED", "FAILED"].includes(String(row.attempt_status))) {
      await runner.rollbackTransaction();
      return { error: "TECHNICAL_TASK_NOT_SUBMITTED" };
    }

    const reviewers = await runner.query("SELECT username FROM users WHERE id=? LIMIT 1", [userId]) as Array<{ username: string | null }>;
    const review = { ...payload, submittedAt: new Date().toISOString(), reviewerId: userId, reviewerUsername: reviewers[0]?.username ?? null, ...(kind === "TECHNICAL" ? { automatedTests: row.attempt_status } : {}) };
    const history = reviewHistory(row.review_json).filter(item => Number(item.reviewerId) !== userId);
    history.push(review);
    await runner.query(
      "UPDATE growth_company_assessments SET " + column + "=? " + (kind === "TECHNICAL" ? ",status='REVIEWED' " : "") + "WHERE id=? AND company_id=?",
      [JSON.stringify(history), assessmentId, companyId],
    );
    await runner.commitTransaction();
    return { review };
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

assessCompaniesRouter.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
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
    candidateCases: candidateCases.map(row => ({ ...row, taskUrl: row.project_id && row.technical_assessment_id ? `/portfolio/projects?project=${row.project_id}` : null })),
  });
});

assessCompaniesRouter.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
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

assessCompaniesRouter.get("/candidate/assessments/:assessmentId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const row = await companyAssessmentForCandidate(req.params.assessmentId, userId);
  if (!row || ["WITHDRAWN", "CLOSED"].includes(String(row.status))) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  const response = publicCase(row, "CANDIDATE");
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

assessCompaniesRouter.post("/candidate/assessments/:assessmentId/respond", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const parsed = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]), consent: z.literal(true).optional() }).safeParse(req.body ?? {});
  if (!parsed.success || parsed.data.decision === "ACCEPT" && parsed.data.consent !== true) return sendError(res, 400, "EXPLICIT_CONSENT_REQUIRED");
  const status = parsed.data.decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  const result = await AppDataSource.query(
    "UPDATE growth_company_assessments SET status=?,consent_at=IF(?='ACCEPT',NOW(3),NULL) WHERE id=? AND candidate_id=? AND status='INVITED'",
    [status, parsed.data.decision, req.params.assessmentId, userId]
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_INVITED");
  if (parsed.data.decision === "DECLINE") await revokeAssessInterviewAccess(req.params.assessmentId);
  const company = await AppDataSource.query("SELECT created_by,company_id FROM growth_company_assessments WHERE id=?", [req.params.assessmentId]) as Array<{ created_by: number; company_id: string }>;
  if (company[0]) {
    await notifyCompanyUser(company[0].created_by, userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?company=${company[0].company_id}&assessment=${req.params.assessmentId}`);
    await emitAssessWebhookEvent(company[0].company_id, req.params.assessmentId, parsed.data.decision === "ACCEPT" ? "assessment.accepted" : "assessment.declined", status);
  }
  return res.json({ status });
});

assessCompaniesRouter.get("/candidate/assessments/:assessmentId/portfolio-options", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const row = await companyAssessmentForCandidate(req.params.assessmentId, userId);
  if (!row || !["ACCEPTED", "PORTFOLIO_SELECTED"].includes(String(row.status))) return sendError(res, 404, "ASSESSMENT_NOT_AVAILABLE");
  const rows = await AppDataSource.query(
    `SELECT p.id AS project_id,p.family_key,p.runtime,p.blueprint_revision,v.id AS version_id,v.stage_key,v.sequence_no,v.explanation,v.created_at
     FROM growth_projects p JOIN growth_project_versions v ON v.project_id=p.id AND v.owner_id=p.owner_id
     WHERE p.owner_id=? ORDER BY v.created_at DESC LIMIT 200`, [userId]
  ) as Array<Record<string, unknown>>;
  const works = await AppDataSource.query(
    `SELECT id,title,problem,solution,role,technologies_json AS technologiesJson,repository_url AS repositoryUrl,demo_url AS demoUrl,visibility
     FROM portfolio_works WHERE owner_id=? AND archived_at IS NULL ORDER BY sort_order ASC,created_at DESC LIMIT 100`,
    [userId],
  ) as Array<Record<string, unknown>>;
  return res.json({ versions: rows.filter(item => growthFamilyFor(String(item.family_key), String(item.blueprint_revision ?? "")) !== null).map(item => ({
    projectId: item.project_id, family: item.family_key, runtime: item.runtime, versionId: item.version_id,
    stage: item.stage_key, sequence: item.sequence_no, explanation: item.explanation, createdAt: item.created_at,
  })), works: works.map(item => ({
    id: item.id, title: item.title, problem: item.problem, solution: item.solution, role: item.role,
    technologies: parseJson(item.technologiesJson, []), repositoryUrl: item.repositoryUrl, demoUrl: item.demoUrl,
    visibility: item.visibility,
  })) });
});

assessCompaniesRouter.post("/candidate/assessments/:assessmentId/portfolio", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
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
    `UPDATE growth_company_assessments SET project_id=?,version_id=?,selected_portfolio_json=NULL,status='PORTFOLIO_SELECTED'
     WHERE id=? AND candidate_id=? AND status IN ('ACCEPTED','PORTFOLIO_SELECTED')`, [version.id, version.version_id, row.id, userId]
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_AVAILABLE");
  await notifyCompanyUser(Number(row.created_by), userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?company=${row.company_id}&assessment=${row.id}`);
  await emitAssessWebhookEvent(String(row.company_id), String(row.id), "assessment.evidence_selected", "PORTFOLIO_SELECTED");
  return res.json({ status: "PORTFOLIO_SELECTED", projectId: version.id, versionId: version.version_id });
});

assessCompaniesRouter.post("/candidate/assessments/:assessmentId/portfolio-evidence", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const parsed = z.discriminatedUnion("type", [
    z.object({ type: z.literal("PORTFOLIO_WORK"), workId: z.string().uuid() }),
    z.object({
      type: z.literal("NDA_SUMMARY"),
      title: z.string().trim().min(2).max(160),
      role: z.string().trim().min(2).max(120),
      summary: z.string().trim().min(30).max(4000),
      technologies: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    }),
  ]).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_PORTFOLIO_EVIDENCE");
  const row = await companyAssessmentForCandidate(req.params.assessmentId, userId);
  if (!row || !["ACCEPTED", "PORTFOLIO_SELECTED"].includes(String(row.status))) return sendError(res, 409, "ASSESSMENT_NOT_AVAILABLE");
  let evidence: Record<string, unknown>;
  if (parsed.data.type === "PORTFOLIO_WORK") {
    const works = await AppDataSource.query(
      `SELECT id,title,problem,solution,role,technologies_json AS technologiesJson,repository_url AS repositoryUrl,demo_url AS demoUrl
       FROM portfolio_works WHERE id=? AND owner_id=? AND archived_at IS NULL LIMIT 1`,
      [parsed.data.workId, userId],
    ) as Array<Record<string, unknown>>;
    const work = works[0];
    if (!work) return sendError(res, 404, "PORTFOLIO_WORK_NOT_FOUND");
    evidence = {
      type: parsed.data.type, title: work.title, role: work.role, problem: work.problem, solution: work.solution,
      technologies: parseJson(work.technologiesJson, []), repositoryUrl: work.repositoryUrl ?? null, demoUrl: work.demoUrl ?? null,
    };
  } else {
    evidence = {
      type: parsed.data.type, title: parsed.data.title, role: parsed.data.role, summary: parsed.data.summary,
      technologies: parsed.data.technologies,
    };
  }
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET project_id=NULL,version_id=NULL,selected_portfolio_json=?,status='PORTFOLIO_SELECTED'
     WHERE id=? AND candidate_id=? AND status IN ('ACCEPTED','PORTFOLIO_SELECTED')`,
    [JSON.stringify(evidence), row.id, userId],
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_AVAILABLE");
  await notifyCompanyUser(Number(row.created_by), userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?company=${row.company_id}&assessment=${row.id}`);
  await emitAssessWebhookEvent(String(row.company_id), String(row.id), "assessment.evidence_selected", "PORTFOLIO_SELECTED");
  return res.json({ status: "PORTFOLIO_SELECTED", portfolioEvidence: evidence });
});

assessCompaniesRouter.put("/candidate/assessments/:assessmentId/interview-answers", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const parsed = z.object({ answers: z.array(z.object({ questionId: z.string().min(1).max(40), answer: z.string().max(6000) })).max(8), submit: z.boolean().default(false) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_INTERVIEW_ANSWERS");
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET answers_json=?,answers_submitted_at=IF(?=1,COALESCE(answers_submitted_at,NOW(3)),answers_submitted_at)
     WHERE id=? AND candidate_id=? AND answers_submitted_at IS NULL AND hr_review_json IS NULL AND status IN ('ACCEPTED','PORTFOLIO_SELECTED','TASK_ASSIGNED')`,
    [JSON.stringify(parsed.data.answers), Number(parsed.data.submit), req.params.assessmentId, userId]
  );
  if (!result.affectedRows) {
    const existing = await AppDataSource.query("SELECT answers_submitted_at FROM growth_company_assessments WHERE id=? AND candidate_id=? AND status IN ('ACCEPTED','PORTFOLIO_SELECTED','TASK_ASSIGNED') LIMIT 1", [req.params.assessmentId, userId]) as Array<{ answers_submitted_at: string | null }>;
    if (existing[0]?.answers_submitted_at && !parsed.data.submit) return sendError(res, 409, "ANSWERS_ALREADY_SUBMITTED");
    if (!existing[0]) return sendError(res, 409, "ASSESSMENT_NOT_AVAILABLE");
  }
  const saved = await AppDataSource.query("SELECT answers_submitted_at FROM growth_company_assessments WHERE id=? AND candidate_id=? LIMIT 1", [req.params.assessmentId, userId]) as Array<{ answers_submitted_at: string | null }>;
  const recipients = await AppDataSource.query("SELECT created_by,company_id,status FROM growth_company_assessments WHERE id=?", [req.params.assessmentId]) as Array<{ created_by: number; company_id: string; status: string }>;
  if (parsed.data.submit && recipients[0]) {
    await notifyCompanyUser(recipients[0].created_by, userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?company=${recipients[0].company_id}&assessment=${req.params.assessmentId}`);
    await emitAssessWebhookEvent(recipients[0].company_id, req.params.assessmentId, "assessment.answers_submitted", recipients[0].status);
  }
  return res.json({ saved: true, submittedAt: saved[0]?.answers_submitted_at ?? null });
});

assessCompaniesRouter.post("/candidate/assessments/:assessmentId/withdraw", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const linked = await AppDataSource.query(
    "SELECT id,job_id FROM growth_project_assessments WHERE company_assessment_id=? AND owner_id=? AND status='ACTIVE' LIMIT 1",
    [req.params.assessmentId, userId]
  ) as Array<{ id: string; job_id: string | null }>;
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET status='WITHDRAWN',answers_json=NULL,hr_review_json=NULL,technical_review_json=NULL
     WHERE id=? AND candidate_id=? AND status NOT IN ('WITHDRAWN','CLOSED')`, [req.params.assessmentId, userId]
  );
  if (!result.affectedRows) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  await revokeAssessInterviewAccess(req.params.assessmentId);
  if (linked[0]) {
    await AppDataSource.query("UPDATE growth_project_assessments SET status='CANCELLED',completed_at=NOW(3) WHERE id=? AND owner_id=? AND status='ACTIVE'", [linked[0].id, userId]);
    if (linked[0].job_id) await cancelGrowthProjectJob(linked[0].job_id, userId);
  }
  const recipients = await AppDataSource.query("SELECT created_by,company_id FROM growth_company_assessments WHERE id=?", [req.params.assessmentId]) as Array<{ created_by: number; company_id: string }>;
  if (recipients[0]) {
    await notifyCompanyUser(recipients[0].created_by, userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?company=${recipients[0].company_id}&assessment=${req.params.assessmentId}`);
    await emitAssessWebhookEvent(recipients[0].company_id, req.params.assessmentId, "assessment.withdrawn", "WITHDRAWN");
  }
  return res.json({ withdrawn: true });
});

assessCompaniesRouter.post("/:companyId/members", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId)) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "MANAGE_MEMBERS")) return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  const parsed = z.object({ username: z.string().trim().min(1).max(80), role: z.enum(["HR", "ENGINEER"]) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_MEMBER");
  const users = await AppDataSource.query("SELECT id,username FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [parsed.data.username]) as Array<{ id: number; username: string }>;
  if (!users[0]) return sendError(res, 404, "PERSONAL_USER_NOT_FOUND");
  if (users[0].id === userId) return sendError(res, 400, "SELF_INVITE_NOT_ALLOWED");
  let id: string = randomUUID();
  const existing = await AppDataSource.query(
    "SELECT id,status FROM growth_company_members WHERE company_id=? AND user_id=? LIMIT 1", [req.params.companyId, users[0].id]
  ) as Array<{ id: string; status: string }>;
  if (existing[0]) {
    if (!['DECLINED', 'REVOKED'].includes(existing[0].status)) return sendError(res, 409, "MEMBERSHIP_ALREADY_EXISTS");
    const reopened = await AppDataSource.query(
      `UPDATE growth_company_members SET role=?,status='PENDING',invited_by=?,updated_at=UTC_TIMESTAMP(3)
       WHERE id=? AND company_id=? AND user_id=? AND status=?`,
      [parsed.data.role, userId, existing[0].id, req.params.companyId, users[0].id, existing[0].status]
    );
    if (!reopened.affectedRows) return sendError(res, 409, "MEMBERSHIP_CHANGED");
    id = existing[0].id;
  }
  try {
    if (!existing[0]) {
      await AppDataSource.query("INSERT INTO growth_company_members (id,company_id,user_id,role,status,invited_by) VALUES (?,?,?,?,'PENDING',?)", [id, req.params.companyId, users[0].id, parsed.data.role, userId]);
    }
    await notifyCompanyUser(users[0].id, userId, "COMPANY_TEAM_INVITATION", "/assess");
    await writeAudit({
      actorType: "USER", actorId: userId, action: existing[0] ? "assess.company-member.reinvited" : "assess.company-member.invited",
      targetType: "company_member", metadata: { companyId: req.params.companyId, membershipId: id, memberUserId: users[0].id, role: parsed.data.role },
      requestId: req.requestId, ip: req.ip,
    });
    return res.status(201).json({ membership: { id, username: users[0].username, role: parsed.data.role, status: "PENDING" } });
  } catch (error) {
    if (!existing[0]) {
      const raced = await AppDataSource.query("SELECT id,status FROM growth_company_members WHERE company_id=? AND user_id=? LIMIT 1", [req.params.companyId, users[0].id]) as Array<Record<string, unknown>>;
      if (raced[0]) return sendError(res, 409, "MEMBERSHIP_ALREADY_EXISTS");
    }
    throw error;
  }
});

assessCompaniesRouter.post("/members/:membershipId/respond", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const parsed = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_DECISION");
  const pending = await AppDataSource.query("SELECT invited_by FROM growth_company_members WHERE id=? AND user_id=? AND status='PENDING' LIMIT 1", [req.params.membershipId, userId]) as Array<{ invited_by: number }>;
  if (!pending[0]) return sendError(res, 404, "MEMBERSHIP_INVITATION_NOT_FOUND");
  const status = parsed.data.decision === "ACCEPT" ? "ACTIVE" : "DECLINED";
  const result = await AppDataSource.query("UPDATE growth_company_members SET status=? WHERE id=? AND user_id=? AND status='PENDING'", [status, req.params.membershipId, userId]);
  if (!result.affectedRows) return sendError(res, 404, "MEMBERSHIP_INVITATION_NOT_FOUND");
  await notifyCompanyUser(pending[0].invited_by, userId, "COMPANY_ASSESSMENT_UPDATED", "/assess");
  return res.json({ status });
});

assessCompaniesRouter.patch("/:companyId/members/:membershipId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId) || !UUID_RE.test(req.params.membershipId)) return sendError(res, 404, "MEMBERSHIP_NOT_FOUND");
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "MANAGE_MEMBERS")) return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  const parsed = z.object({ role: z.enum(["HR", "ENGINEER"]) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_MEMBER_ROLE");
  const members = await AppDataSource.query(
    "SELECT id,user_id,role,status FROM growth_company_members WHERE id=? AND company_id=? LIMIT 1",
    [req.params.membershipId, req.params.companyId]
  ) as Array<{ id: string; user_id: number; role: AssessCompanyRole; status: string }>;
  const member = members[0];
  if (!member) return sendError(res, 404, "MEMBERSHIP_NOT_FOUND");
  if (member.role === "OWNER") return sendError(res, 409, "COMPANY_OWNER_ROLE_IMMUTABLE");
  if (!['PENDING', 'ACTIVE'].includes(member.status)) return sendError(res, 409, "MEMBERSHIP_NOT_ACTIVE");
  if (member.role === parsed.data.role) return res.json({ membership: { id: member.id, role: member.role, status: member.status } });
  const updated = await AppDataSource.query(
    `UPDATE growth_company_members SET role=?,updated_at=UTC_TIMESTAMP(3)
     WHERE id=? AND company_id=? AND user_id=? AND role=? AND status=?`,
    [parsed.data.role, member.id, req.params.companyId, member.user_id, member.role, member.status]
  );
  if (!updated.affectedRows) return sendError(res, 409, "MEMBERSHIP_CHANGED");
  await writeAudit({
    actorType: "USER", actorId: userId, action: "assess.company-member.role-changed",
    targetType: "company_member", metadata: { companyId: req.params.companyId, membershipId: member.id, memberUserId: member.user_id, previousRole: member.role, role: parsed.data.role },
    requestId: req.requestId, ip: req.ip,
  });
  return res.json({ membership: { id: member.id, role: parsed.data.role, status: member.status } });
});

assessCompaniesRouter.delete("/:companyId/members/:membershipId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId) || !UUID_RE.test(req.params.membershipId)) return sendError(res, 404, "MEMBERSHIP_NOT_FOUND");
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "MANAGE_MEMBERS")) return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  const members = await AppDataSource.query(
    "SELECT id,user_id,role,status FROM growth_company_members WHERE id=? AND company_id=? LIMIT 1",
    [req.params.membershipId, req.params.companyId]
  ) as Array<{ id: string; user_id: number; role: AssessCompanyRole; status: string }>;
  const member = members[0];
  if (!member) return sendError(res, 404, "MEMBERSHIP_NOT_FOUND");
  if (member.role === "OWNER") return sendError(res, 409, "COMPANY_OWNER_ROLE_IMMUTABLE");
  if (member.status === "REVOKED") return res.json({ membership: { id: member.id, status: "REVOKED" } });
  if (!['PENDING', 'ACTIVE', 'DECLINED'].includes(member.status)) return sendError(res, 409, "MEMBERSHIP_NOT_REVOCABLE");
  const revoked = await AppDataSource.query(
    `UPDATE growth_company_members SET status='REVOKED',updated_at=UTC_TIMESTAMP(3)
     WHERE id=? AND company_id=? AND user_id=? AND role=? AND status=?`,
    [member.id, req.params.companyId, member.user_id, member.role, member.status]
  );
  if (!revoked.affectedRows) return sendError(res, 409, "MEMBERSHIP_CHANGED");
  await revokeAssessInterviewMemberAccess(req.params.companyId, member.user_id);
  await writeAudit({
    actorType: "USER", actorId: userId, action: "assess.company-member.access-revoked",
    targetType: "company_member", metadata: { companyId: req.params.companyId, membershipId: member.id, memberUserId: member.user_id, previousRole: member.role, previousStatus: member.status },
    requestId: req.requestId, ip: req.ip,
  });
  return res.json({ membership: { id: member.id, status: "REVOKED" } });
});

assessCompaniesRouter.post("/:companyId/assessments", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId)) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "INVITE_CANDIDATES")) return sendError(res, 403, "HR_ACCESS_REQUIRED");
  const parsed = z.object({
    candidateUsername: z.string().trim().min(1).max(80).optional(),
    candidateEmail: z.string().trim().email().max(320).transform(value => value.toLowerCase()).optional(),
    roleTitle: z.string().trim().min(2).max(160),
    roleProfile: z.enum(ASSESS_ROLE_PROFILE_KEYS).default("SOFTWARE_ENGINEERING"),
    introduction: z.string().trim().min(10).max(4000),
    questions: z.array(z.object({ id: z.string().trim().min(1).max(40), text: z.string().trim().min(3).max(500) })).min(2).max(8),
    estimatedMinutes: z.number().int().min(5).max(360).default(45),
    deadlineAt: z.string().datetime().nullable().optional(),
    aiPolicy: z.enum(["ALLOWED", "NOT_ALLOWED", "DISCUSS"]).default("DISCUSS"),
    idempotencyKey: z.string().trim().min(8).max(128),
  }).refine(value => Boolean(value.candidateUsername) !== Boolean(value.candidateEmail)).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_CANDIDATE_ASSESSMENT");
  const candidateEmail = parsed.data.candidateEmail ?? null;
  const candidates = candidateEmail
    ? await AppDataSource.query("SELECT id,username,email FROM users WHERE LOWER(email)=? AND user_mode='PERSONAL' LIMIT 1", [candidateEmail]) as Array<{ id: number; username: string; email: string }>
    : await AppDataSource.query("SELECT id,username,email FROM users WHERE username=? AND user_mode='PERSONAL' LIMIT 1", [parsed.data.candidateUsername]) as Array<{ id: number; username: string; email: string | null }>;
  if (parsed.data.candidateUsername && !candidates[0]) return sendError(res, 404, "PERSONAL_CANDIDATE_NOT_FOUND");
  if (candidates[0]?.id === userId) return sendError(res, 400, "SELF_ASSESSMENT_NOT_ALLOWED");
  const candidateId = candidates[0]?.id ?? null;
  const companies = await AppDataSource.query("SELECT name FROM growth_companies WHERE id=? LIMIT 1", [req.params.companyId]) as Array<{ name: string }>;
  if (!companies[0]) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const questionsJson = JSON.stringify(parsed.data.questions);
  const deadlineAt = parsed.data.deadlineAt ?? null;
  const invitationToken = candidateEmail ? assessmentInviteToken(req.params.companyId, parsed.data.idempotencyKey) : null;
  const invitationTokenHash = invitationToken ? sha(invitationToken) : null;
  const sameRequest = (row: Record<string, unknown>) => Number(row.candidate_id ?? 0) === Number(candidateId ?? 0)
    && String(row.candidate_email ?? "").toLowerCase() === (candidateEmail ?? "")
    && row.role_title === parsed.data.roleTitle && row.introduction === parsed.data.introduction
    && row.questions_json === questionsJson && Number(row.estimated_minutes ?? 45) === parsed.data.estimatedMinutes
    && (row.deadline_at == null ? deadlineAt == null : deadlineAt != null && new Date(row.deadline_at as string | Date).getTime() === new Date(deadlineAt).getTime())
    && String(row.ai_policy ?? "DISCUSS") === parsed.data.aiPolicy
    && String(row.role_profile ?? "SOFTWARE_ENGINEERING") === parsed.data.roleProfile;
  const deliverEmail = async (assessmentId: string) => {
    if (!candidateEmail || !invitationToken) return true;
    return sendAssessmentInviteIfNeeded({
      assessmentId, companyId: req.params.companyId, email: candidateEmail, token: invitationToken,
      companyName: companies[0].name, roleTitle: parsed.data.roleTitle, introduction: parsed.data.introduction,
      estimatedMinutes: parsed.data.estimatedMinutes, deadlineAt, aiPolicy: parsed.data.aiPolicy,
    });
  };
  const duplicate = await AppDataSource.query(
    "SELECT id,candidate_id,candidate_email,role_title,role_profile,introduction,questions_json,estimated_minutes,deadline_at,ai_policy,status FROM growth_company_assessments WHERE company_id=? AND idempotency_key=? LIMIT 1",
    [req.params.companyId, parsed.data.idempotencyKey],
  ) as Array<Record<string, unknown>>;
  if (duplicate[0]) {
    if (!sameRequest(duplicate[0])) return sendError(res, 409, "IDEMPOTENCY_CONFLICT");
    if (!await deliverEmail(String(duplicate[0].id))) return sendError(res, 502, "INVITATION_EMAIL_NOT_SENT");
    return res.json({ assessment: { id: duplicate[0].id, status: duplicate[0].status } });
  }
  const id = randomUUID();
  try {
    await AppDataSource.query(
      `INSERT INTO growth_company_assessments
       (id,company_id,created_by,candidate_id,candidate_email,idempotency_key,role_title,role_profile,introduction,questions_json,status,
        invitation_token_hash,invitation_expires_at,estimated_minutes,deadline_at,ai_policy,rubric_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,'INVITED',?,DATE_ADD(NOW(3),INTERVAL 14 DAY),?,?,?,?)`,
      [id, req.params.companyId, userId, candidateId, candidateEmail, parsed.data.idempotencyKey, parsed.data.roleTitle, parsed.data.roleProfile,
        parsed.data.introduction, questionsJson, invitationTokenHash, parsed.data.estimatedMinutes, deadlineAt, parsed.data.aiPolicy,
        JSON.stringify(assessRubricForProfile(parsed.data.roleProfile))]
    );
  } catch (error) {
    const raced = await AppDataSource.query(
      "SELECT id,candidate_id,candidate_email,role_title,role_profile,introduction,questions_json,estimated_minutes,deadline_at,ai_policy,status FROM growth_company_assessments WHERE company_id=? AND idempotency_key=? LIMIT 1",
      [req.params.companyId, parsed.data.idempotencyKey],
    ) as Array<Record<string, unknown>>;
    if (!raced[0]) throw error;
    if (!sameRequest(raced[0])) return sendError(res, 409, "IDEMPOTENCY_CONFLICT");
    if (!await deliverEmail(String(raced[0].id))) return sendError(res, 502, "INVITATION_EMAIL_NOT_SENT");
    return res.json({ assessment: { id: raced[0].id, status: raced[0].status } });
  }
  await emitAssessWebhookEvent(req.params.companyId, id, "assessment.invited", "INVITED");
  if (!await deliverEmail(id)) return sendError(res, 502, "INVITATION_EMAIL_NOT_SENT");
  if (candidateId) await notifyCompanyUser(candidateId, userId, "COMPANY_ASSESSMENT_INVITATION", `/assess?case=${id}`);
  return res.status(201).json({ assessment: { id, candidateUsername: candidates[0]?.username ?? candidateEmail, candidateEmail, roleTitle: parsed.data.roleTitle, status: "INVITED" } });
});

assessCompaniesRouter.get("/invitations/:token", async (req: AuthRequest, res: Response) => {
  const token = req.params.token;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return sendError(res, 404, "ASSESSMENT_INVITATION_NOT_FOUND");
  const rows = await AppDataSource.query(
    `SELECT c.name AS company_name,a.role_title,a.role_profile,a.rubric_json,a.introduction,a.candidate_email,a.estimated_minutes,a.deadline_at,a.ai_policy
     FROM growth_company_assessments a JOIN growth_companies c ON c.id=a.company_id
     WHERE a.invitation_token_hash=? AND a.status='INVITED' AND a.invitation_expires_at>NOW(3) LIMIT 1`,
    [sha(token)],
  ) as Array<Record<string, unknown>>;
  const invite = rows[0];
  if (!invite || typeof invite.candidate_email !== "string") return sendError(res, 404, "ASSESSMENT_INVITATION_NOT_FOUND");
  return res.json({
    companyName: invite.company_name,
    roleTitle: invite.role_title,
    roleProfile: isAssessRoleProfile(invite.role_profile) ? invite.role_profile : "SOFTWARE_ENGINEERING",
    rubric: invite.rubric_json ? parseJson(invite.rubric_json, legacyAssessRubric) : legacyAssessRubric,
    introduction: invite.introduction,
    recipientHint: maskEmail(invite.candidate_email),
    estimatedMinutes: Number(invite.estimated_minutes ?? 45),
    deadlineAt: invite.deadline_at ?? null,
    aiPolicy: invite.ai_policy ?? "DISCUSS",
  });
});

assessCompaniesRouter.post("/invitations/:token/claim", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const token = req.params.token;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return sendError(res, 404, "ASSESSMENT_INVITATION_NOT_FOUND");
  const account = await AppDataSource.getRepository(User).findOneBy({ id: userId });
  if (!account || account.userMode !== "PERSONAL") return sendError(res, 403, "PERSONAL_USER_REQUIRED");
  if (!account.emailVerified) return sendError(res, 403, "INVITATION_EMAIL_UNVERIFIED");
  const inviteRows = await AppDataSource.query(
    `SELECT id,company_id,created_by,candidate_id,candidate_email
     FROM growth_company_assessments
     WHERE invitation_token_hash=? AND status='INVITED' AND invitation_expires_at>NOW(3) LIMIT 1`,
    [sha(token)],
  ) as Array<Record<string, unknown>>;
  const invite = inviteRows[0];
  if (!invite || typeof invite.candidate_email !== "string") return sendError(res, 404, "ASSESSMENT_INVITATION_NOT_FOUND");
  if (String(account.email ?? "").trim().toLowerCase() !== invite.candidate_email.toLowerCase()) return sendError(res, 403, "INVITATION_EMAIL_MISMATCH");
  if (invite.candidate_id != null && Number(invite.candidate_id) !== userId) return sendError(res, 403, "INVITATION_EMAIL_MISMATCH");
  const claimed = await AppDataSource.query(
    `UPDATE growth_company_assessments SET candidate_id=?,invitation_token_hash=NULL
     WHERE id=? AND status='INVITED' AND invitation_token_hash=? AND invitation_expires_at>NOW(3)
       AND (candidate_id IS NULL OR candidate_id=?)`,
    [userId, invite.id, sha(token), userId],
  );
  if (!claimed.affectedRows) return sendError(res, 409, "ASSESSMENT_INVITATION_ALREADY_CLAIMED");
  await notifyCompanyUser(Number(invite.created_by), userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?company=${invite.company_id}&assessment=${invite.id}`);
  await emitAssessWebhookEvent(String(invite.company_id), String(invite.id), "assessment.claimed", "INVITED");
  return res.json({ assessmentId: invite.id });
});

assessCompaniesRouter.get("/:companyId/integrations", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (role !== "OWNER") return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  const [apiKeys, webhooks] = await Promise.all([
    AppDataSource.query(
      `SELECT id,name,key_prefix AS keyPrefix,scopes_json AS scopesJson,last_used_at AS lastUsedAt,revoked_at AS revokedAt,created_at AS createdAt
       FROM growth_assess_api_keys WHERE company_id=? ORDER BY created_at DESC`, [req.params.companyId],
    ) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query(
      `SELECT w.id,w.name,w.target_url AS url,w.events_json AS eventsJson,w.enabled,w.created_at AS createdAt,
              (SELECT d.status FROM growth_assess_webhook_deliveries d WHERE d.webhook_id=w.id ORDER BY d.created_at DESC LIMIT 1) AS lastDeliveryStatus
       FROM growth_assess_webhooks w WHERE w.company_id=? ORDER BY w.created_at DESC`, [req.params.companyId],
    ) as Promise<Array<Record<string, unknown>>>,
  ]);
  return res.json({
    apiKeys: apiKeys.map(row => ({ ...row, scopes: parseJson(row.scopesJson, []), revoked: Boolean(row.revokedAt) })),
    webhooks: webhooks.map(row => ({ ...row, events: parseJson(row.eventsJson, []), enabled: Boolean(row.enabled) })),
    webhookEvents: assessWebhookEvents,
    api: { basePath: "/api/v1/assess", listAssessments: "GET /assessments", createAssessment: "POST /assessments", idempotencyHeader: "Idempotency-Key" },
    webhookSigning: { timestampHeader: "X-StudyCod-Timestamp", signatureHeader: "X-StudyCod-Signature", signedValue: "HMAC-SHA256(secret, timestamp + '.' + rawBody)", deliveryHeader: "X-StudyCod-Delivery" },
  });
});

assessCompaniesRouter.post("/:companyId/integrations/api-keys", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (role !== "OWNER") return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    scopes: z.array(z.enum(assessApiKeyScopes)).min(1).max(2).default(["assessments:read", "assessments:write"]),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_ASSESS_API_KEY");
  const existing = await AppDataSource.query("SELECT COUNT(*) AS total FROM growth_assess_api_keys WHERE company_id=? AND revoked_at IS NULL", [req.params.companyId]) as Array<{ total: number | string }>;
  if (Number(existing[0]?.total ?? 0) >= 20) return sendError(res, 409, "ASSESS_API_KEY_LIMIT_REACHED");
  const id = randomUUID();
  const token = `sc_assess_live_${randomBytes(32).toString("base64url")}`;
  await AppDataSource.query(
    `INSERT INTO growth_assess_api_keys(id,company_id,created_by,name,key_prefix,token_hash,scopes_json)
     VALUES(?,?,?,?,?,?,?)`,
    [id, req.params.companyId, userId, parsed.data.name, token.slice(0, 20), sha(token), JSON.stringify(parsed.data.scopes)],
  );
  return res.status(201).json({ id, name: parsed.data.name, keyPrefix: token.slice(0, 20), scopes: parsed.data.scopes, token });
});

assessCompaniesRouter.delete("/:companyId/integrations/api-keys/:keyId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (role !== "OWNER") return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  if (!UUID_RE.test(req.params.keyId)) return sendError(res, 404, "ASSESS_API_KEY_NOT_FOUND");
  const result = await AppDataSource.query(
    "UPDATE growth_assess_api_keys SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND company_id=? AND revoked_at IS NULL",
    [req.params.keyId, req.params.companyId],
  ) as { affectedRows?: number };
  if (!result.affectedRows) return sendError(res, 404, "ASSESS_API_KEY_NOT_FOUND");
  return res.json({ revoked: true });
});

assessCompaniesRouter.post("/:companyId/integrations/webhooks", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (role !== "OWNER") return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    url: z.string().trim().url().max(2048),
    events: z.array(z.enum(assessWebhookEvents)).min(1).max(assessWebhookEvents.length),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_ASSESS_WEBHOOK");
  const target = await validateAssessWebhookUrl(parsed.data.url);
  if (!target) return sendError(res, 400, "WEBHOOK_URL_MUST_BE_PUBLIC_HTTPS");
  const existing = await AppDataSource.query("SELECT COUNT(*) AS total FROM growth_assess_webhooks WHERE company_id=? AND enabled=1", [req.params.companyId]) as Array<{ total: number | string }>;
  if (Number(existing[0]?.total ?? 0) >= 20) return sendError(res, 409, "ASSESS_WEBHOOK_LIMIT_REACHED");
  const id = randomUUID();
  const secret = `sc_whsec_${randomBytes(32).toString("base64url")}`;
  await AppDataSource.query(
    `INSERT INTO growth_assess_webhooks(id,company_id,created_by,name,target_url,encrypted_secret,events_json)
     VALUES(?,?,?,?,?,?,?)`,
    [id, req.params.companyId, userId, parsed.data.name, target.toString(), encryptAssessWebhookSecret(secret), JSON.stringify(parsed.data.events)],
  );
  return res.status(201).json({ webhook: { id, name: parsed.data.name, url: target.toString(), events: parsed.data.events, enabled: true }, secret });
});

assessCompaniesRouter.patch("/:companyId/integrations/webhooks/:webhookId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (role !== "OWNER") return sendError(res, 403, "COMPANY_OWNER_REQUIRED");
  if (!UUID_RE.test(req.params.webhookId)) return sendError(res, 404, "ASSESS_WEBHOOK_NOT_FOUND");
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_ASSESS_WEBHOOK");
  const result = await AppDataSource.query(
    "UPDATE growth_assess_webhooks SET enabled=? WHERE id=? AND company_id=?",
    [parsed.data.enabled ? 1 : 0, req.params.webhookId, req.params.companyId],
  ) as { affectedRows?: number };
  if (!result.affectedRows) return sendError(res, 404, "ASSESS_WEBHOOK_NOT_FOUND");
  if (!parsed.data.enabled) await AppDataSource.query(
    "UPDATE growth_assess_webhook_deliveries SET status='SKIPPED',completed_at=UTC_TIMESTAMP(3) WHERE webhook_id=? AND status IN ('PENDING','DELIVERING')",
    [req.params.webhookId],
  );
  return res.json({ enabled: parsed.data.enabled });
});

assessCompaniesRouter.get("/:companyId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  if (!UUID_RE.test(req.params.companyId)) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "READ_WORKSPACE")) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const companies = await AppDataSource.query("SELECT id,name,created_at,updated_at FROM growth_companies WHERE id=? LIMIT 1", [req.params.companyId]) as Array<Record<string, unknown>>;
  if (!companies[0]) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const page = Math.min(Math.max(Number.parseInt(String(req.query.page ?? "1"), 10) || 1, 1), 100_000);
  const pageSize = 50;
  const search = cleanText(req.query.search, 120);
  const statusValues = ["INVITED", "ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED", "DECLINED", "WITHDRAWN", "CLOSED"];
  const requestedStatus = typeof req.query.status === "string" && statusValues.includes(req.query.status) ? req.query.status : "";
  const technicalOnly = req.query.technical === "true";
  const filters = ["a.company_id=?"];
  const filterParams: unknown[] = [req.params.companyId];
  if (technicalOnly) filters.push("a.status IN ('PORTFOLIO_SELECTED','TASK_ASSIGNED','TASK_SUBMITTED','REVIEWED')");
  if (requestedStatus) { filters.push("a.status=?"); filterParams.push(requestedStatus); }
  if (search) {
    filters.push("(COALESCE(u.username,a.candidate_email,'') LIKE ? OR a.role_title LIKE ? OR COALESCE(a.task_title,'') LIKE ?)");
    const term = `%${search}%`;
    filterParams.push(term, term, term);
  }
  const where = filters.join(" AND ");
  const offset = (page - 1) * pageSize;
  const [members, assessments, countRows, statusCounts] = await Promise.all([
    AppDataSource.query("SELECT m.id,m.user_id,u.username,m.role,m.status,m.created_at FROM growth_company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY m.created_at", [req.params.companyId]) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query(
      `SELECT a.id,a.candidate_id,a.candidate_email,COALESCE(u.username,a.candidate_email) AS candidate_username,a.role_title,a.status,a.created_at,a.updated_at,
              a.project_id,a.version_id,a.task_title,a.technical_assessment_id
       FROM growth_company_assessments a LEFT JOIN users u ON u.id=a.candidate_id
       WHERE ${where} ORDER BY a.updated_at DESC,a.id DESC LIMIT ? OFFSET ?`,
      [...filterParams, pageSize, offset],
    ) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query(
      `SELECT COUNT(*) AS total FROM growth_company_assessments a LEFT JOIN users u ON u.id=a.candidate_id WHERE ${where}`,
      filterParams,
    ) as Promise<Array<{ total: number | string }>>,
    AppDataSource.query("SELECT status,COUNT(*) AS total FROM growth_company_assessments WHERE company_id=? GROUP BY status", [req.params.companyId]) as Promise<Array<{ status: string; total: number | string }>>,
  ]);
  const assessmentStatusCounts = Object.fromEntries(statusCounts.map(row => [row.status, Number(row.total)]));
  const assessmentTotal = statusCounts.reduce((sum, row) => sum + Number(row.total), 0);
  const technicalAssessmentTotal = ["PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"].reduce((sum, status) => sum + (assessmentStatusCounts[status] ?? 0), 0);
  await writeAudit({
    actorType: "USER", actorId: userId, action: "assess.company-assessments.list.read",
    targetType: "company_assessment_list", metadata: { companyId: req.params.companyId, role, resultCount: assessments.length, assessmentTotal },
    requestId: req.requestId, ip: req.ip,
  });
  return res.json({
    company: { ...companies[0], role }, members,
    assessments: assessments.map(row => row.status === "WITHDRAWN"
      ? (({ project_id: _projectId, version_id: _versionId, task_title: _taskTitle, technical_assessment_id: _taskId, ...summary }) => summary)(row)
      : row),
    assessmentPage: page,
    assessmentPageSize: pageSize,
    assessmentMatchCount: Number(countRows[0]?.total ?? 0),
    assessmentTotal,
    technicalAssessmentTotal,
    assessmentStatusCounts,
  });
});

assessCompaniesRouter.get("/:companyId/assessments/:assessmentId", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "READ_CANDIDATE_DOSSIER")) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  const rows = await AppDataSource.query(
    `SELECT a.*,c.name AS company_name,COALESCE(u.username,a.candidate_email) AS candidate_username,v.stage_key,v.sequence_no,v.explanation AS portfolio_explanation,p.family_key,p.runtime,p.blueprint_revision,art.files_json,art.examples_json,
            pa.status AS task_status,pa.explanation AS task_explanation,pa.draft_json AS task_draft,pa.job_id,j.state AS job_state,j.result_json
     FROM growth_company_assessments a
     JOIN growth_companies c ON c.id=a.company_id LEFT JOIN users u ON u.id=a.candidate_id
     LEFT JOIN growth_project_versions v ON v.id=a.version_id
     LEFT JOIN growth_projects p ON p.id=a.project_id
     LEFT JOIN growth_project_artifacts art ON art.id=v.artifact_id
     LEFT JOIN growth_project_assessments pa ON pa.id=a.technical_assessment_id
     LEFT JOIN growth_project_jobs j ON j.id=pa.job_id
     WHERE a.id=? AND a.company_id=? LIMIT 1`, [req.params.assessmentId, req.params.companyId]
  ) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  await writeAudit({
    actorType: "USER", actorId: userId, action: "assess.candidate-result.read",
    targetType: "candidate_assessment", targetId: Number(row.candidate_id),
    metadata: { assessmentId: req.params.assessmentId, companyId: req.params.companyId, role, status: row.status },
    requestId: req.requestId, ip: req.ip,
  });
  const response = publicCase(row, role);
  response.candidateUsername = row.candidate_username;
  if (canAssessCompanyRole(role, "READ_HR_REVIEW")) response.ownHrReview = reviewHistory(row.hr_review_json).find(review => Number(review.reviewerId) === userId) ?? null;
  if (canAssessCompanyRole(role, "READ_TECHNICAL_REVIEW")) response.ownTechnicalReview = reviewHistory(row.technical_review_json).find(review => Number(review.reviewerId) === userId) ?? null;
  if (row.status !== "WITHDRAWN" && row.status !== "INVITED" && row.project_id && row.version_id) {
    response.portfolio = {
      projectId: row.project_id, versionId: row.version_id, family: row.family_key,
      runtime: row.runtime, stage: row.stage_key, sequence: row.sequence_no,
      explanation: row.portfolio_explanation ?? null,
      files: parseJson<JudgeFile[]>(row.files_json, []),
    };
  }
  if (row.status !== "WITHDRAWN" && row.status !== "INVITED" && response.portfolioEvidence) response.portfolioEvidence = parseJson(row.selected_portfolio_json, null);
  if (row.status !== "WITHDRAWN" && canAssessCompanyRole(role, "READ_TECHNICAL_TASK") && row.technical_assessment_id) {
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
  return res.json({ assessment: response, role });
});

assessCompaniesRouter.post("/:companyId/assessments/:assessmentId/interview-review", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "REVIEW_HR")) return sendError(res, 403, "HR_ACCESS_REQUIRED");
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_HR_REVIEW");
  const result = await appendReviewerReview(req.params.assessmentId, req.params.companyId, userId, "HR", parsed.data);
  if ("error" in result) return sendError(res, 409, result.error);
  const candidates = await AppDataSource.query("SELECT candidate_id,status FROM growth_company_assessments WHERE id=? AND company_id=?", [req.params.assessmentId, req.params.companyId]) as Array<{ candidate_id: number; status: string }>;
  if (candidates[0]) await notifyCompanyUser(candidates[0].candidate_id, userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?case=${req.params.assessmentId}`);
  await emitAssessWebhookEvent(req.params.companyId, req.params.assessmentId, "assessment.review_saved", candidates[0]?.status ?? "UNKNOWN");
  return res.json({ review: result.review });
});

assessCompaniesRouter.post("/:companyId/assessments/:assessmentId/technical-task", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "MANAGE_TECHNICAL_TASK")) return sendError(res, 403, "ENGINEER_ACCESS_REQUIRED");
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
  await notifyCompanyUser(Number(row.candidate_id), userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?case=${req.params.assessmentId}`);
  await emitAssessWebhookEvent(req.params.companyId, req.params.assessmentId, "assessment.task_assigned", "TASK_ASSIGNED");
  return res.status(201).json({ assessmentId: id, status: "TASK_ASSIGNED", runtime: runtime.data, tests: tests.length });
});

assessCompaniesRouter.post("/:companyId/assessments/:assessmentId/technical-review", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "REVIEW_TECHNICAL")) return sendError(res, 403, "ENGINEER_ACCESS_REQUIRED");
  const parsed = reviewSchema.extend({ allowPortfolioEvidence: z.boolean().default(false) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_TECHNICAL_REVIEW");
  const result = await appendReviewerReview(req.params.assessmentId, req.params.companyId, userId, "TECHNICAL", parsed.data);
  if ("error" in result) return sendError(res, 409, result.error);
  const candidates = await AppDataSource.query("SELECT candidate_id,status FROM growth_company_assessments WHERE id=? AND company_id=?", [req.params.assessmentId, req.params.companyId]) as Array<{ candidate_id: number; status: string }>;
  if (candidates[0]) await notifyCompanyUser(candidates[0].candidate_id, userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?case=${req.params.assessmentId}`);
  await emitAssessWebhookEvent(req.params.companyId, req.params.assessmentId, "assessment.review_saved", candidates[0]?.status ?? "UNKNOWN");
  return res.json({ review: result.review, status: "REVIEWED" });
});

assessCompaniesRouter.put("/:companyId/assessments/:assessmentId/decision", authRequired, async (req: AuthRequest, res: Response) => {
  const userId = requirePersonalAccountPrincipal(req, res); if (!userId) return;
  const role = await activeAssessCompanyRole(req.params.companyId, userId);
  if (!canAssessCompanyRole(role, "REVIEW_HR")) return sendError(res, 403, "HR_ACCESS_REQUIRED");
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_HIRING_DECISION");
  const rows = await AppDataSource.query(
    `SELECT candidate_id,status,consent_at,hr_review_json,technical_review_json,decision_json
     FROM growth_company_assessments WHERE id=? AND company_id=? LIMIT 1`,
    [req.params.assessmentId, req.params.companyId],
  ) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  if (!row.consent_at || !["ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED"].includes(String(row.status))) return sendError(res, 409, "ASSESSMENT_NOT_ACTIVE");
  if (!row.candidate_id) return sendError(res, 409, "CANDIDATE_NOT_CLAIMED");
  if (reviewHistory(row.hr_review_json).length + reviewHistory(row.technical_review_json).length === 0) return sendError(res, 409, "REVIEW_REQUIRED");
  const previousDecision = parseJson<Record<string, unknown> | null>(row.decision_json, null);
  if (previousDecision && Number(previousDecision.decidedById) === userId
    && previousDecision.outcome === parsed.data.outcome
    && previousDecision.rationale === parsed.data.rationale
    && previousDecision.releaseToCandidate === parsed.data.releaseToCandidate) {
    return res.json({ decision: previousDecision });
  }
  const usernames = await AppDataSource.query("SELECT username FROM users WHERE id=? LIMIT 1", [userId]) as Array<{ username: string }>;
  const decidedAt = new Date().toISOString();
  const decision = {
    ...parsed.data,
    decidedById: userId,
    decidedByUsername: usernames[0]?.username ?? null,
    decidedAt,
  };
  const result = await AppDataSource.query(
    `UPDATE growth_company_assessments SET decision_json=?
     WHERE id=? AND company_id=? AND consent_at IS NOT NULL
       AND status IN ('ACCEPTED','PORTFOLIO_SELECTED','TASK_ASSIGNED','TASK_SUBMITTED','REVIEWED')`,
    [JSON.stringify(decision), req.params.assessmentId, req.params.companyId],
  );
  if (!result.affectedRows) return sendError(res, 409, "ASSESSMENT_NOT_ACTIVE");
  await writeAudit({
    actorType: "USER", actorId: userId, action: "assess.hiring-decision.saved",
    targetType: "candidate_assessment", targetId: Number(row.candidate_id ?? 0),
    metadata: { assessmentId: req.params.assessmentId, companyId: req.params.companyId, outcome: decision.outcome, releaseToCandidate: decision.releaseToCandidate },
    requestId: req.requestId, ip: req.ip,
  });
  if (decision.releaseToCandidate && row.candidate_id) {
    await notifyCompanyUser(Number(row.candidate_id), userId, "COMPANY_ASSESSMENT_UPDATED", `/assess?case=${req.params.assessmentId}`);
  }
  await emitAssessWebhookEvent(req.params.companyId, req.params.assessmentId, "assessment.decision_saved", String(row.status), {
    outcome: decision.outcome, releaseToCandidate: decision.releaseToCandidate, decidedAt,
  });
  return res.json({ decision });
});

assessApiRouter.get("/assessments", async (req, res) => {
  const principal = await authenticateAssessApiKey(req, res, "assessments:read");
  if (!principal) return;
  const page = Math.min(Math.max(Number.parseInt(String(req.query.page ?? "1"), 10) || 1, 1), 100_000);
  const pageSize = Math.min(Math.max(Number.parseInt(String(req.query.pageSize ?? "50"), 10) || 50, 1), 100);
  const search = cleanText(req.query.search, 120);
  const requestedStatus = cleanText(req.query.status, 32).toUpperCase();
  const allowedStatuses = ["INVITED", "ACCEPTED", "PORTFOLIO_SELECTED", "TASK_ASSIGNED", "TASK_SUBMITTED", "REVIEWED", "DECLINED", "WITHDRAWN", "CLOSED"];
  if (requestedStatus && !allowedStatuses.includes(requestedStatus)) return sendError(res, 400, "INVALID_ASSESSMENT_STATUS");
  const updatedSince = String(req.query.updatedSince ?? "").trim();
  const updatedDate = updatedSince ? new Date(updatedSince) : null;
  if (updatedSince && (!updatedDate || Number.isNaN(updatedDate.getTime()))) return sendError(res, 400, "INVALID_UPDATED_SINCE");
  const filters = ["a.company_id=?"];
  const values: Array<string | number | Date> = [principal.companyId];
  if (requestedStatus) { filters.push("a.status=?"); values.push(requestedStatus); }
  if (search) {
    filters.push("(LOWER(COALESCE(u.username,'')) LIKE ? OR LOWER(COALESCE(a.candidate_email,'')) LIKE ? OR LOWER(a.role_title) LIKE ?)");
    const term = `%${search.toLowerCase()}%`; values.push(term, term, term);
  }
  if (updatedDate) { filters.push("a.updated_at>=?"); values.push(updatedDate); }
  const where = filters.join(" AND ");
  const [rows, totals] = await Promise.all([
    AppDataSource.query(
      `SELECT a.id,a.candidate_email AS candidateEmail,COALESCE(u.username,a.candidate_email) AS candidate,
              a.role_title AS roleTitle,a.role_profile AS roleProfile,a.status,a.answers_submitted_at AS answersSubmittedAt,a.estimated_minutes AS estimatedMinutes,
              a.deadline_at AS deadlineAt,a.ai_policy AS aiPolicy,a.decision_json AS decisionJson,a.created_at AS createdAt,a.updated_at AS updatedAt
       FROM growth_company_assessments a LEFT JOIN users u ON u.id=a.candidate_id
       WHERE ${where} ORDER BY a.updated_at DESC,a.id LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    ) as Promise<Array<Record<string, unknown>>>,
    AppDataSource.query(`SELECT COUNT(*) AS total FROM growth_company_assessments a LEFT JOIN users u ON u.id=a.candidate_id WHERE ${where}`, values) as Promise<Array<{ total: number | string }>>,
  ]);
  return res.json({ version: "v1", assessments: rows.map(publicAssessApiRecord), page, pageSize, total: Number(totals[0]?.total ?? 0) });
});

assessApiRouter.get("/assessments/:assessmentId", async (req, res) => {
  const principal = await authenticateAssessApiKey(req, res, "assessments:read");
  if (!principal) return;
  if (!UUID_RE.test(req.params.assessmentId)) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  const rows = await AppDataSource.query(
    `SELECT a.id,a.candidate_email AS candidateEmail,COALESCE(u.username,a.candidate_email) AS candidate,
            a.role_title AS roleTitle,a.role_profile AS roleProfile,a.status,a.answers_submitted_at AS answersSubmittedAt,a.estimated_minutes AS estimatedMinutes,
            a.deadline_at AS deadlineAt,a.ai_policy AS aiPolicy,a.decision_json AS decisionJson,a.created_at AS createdAt,a.updated_at AS updatedAt
     FROM growth_company_assessments a LEFT JOIN users u ON u.id=a.candidate_id WHERE a.company_id=? AND a.id=? LIMIT 1`,
    [principal.companyId, req.params.assessmentId],
  ) as Array<Record<string, unknown>>;
  if (!rows[0]) return sendError(res, 404, "ASSESSMENT_NOT_FOUND");
  return res.json({ version: "v1", assessment: publicAssessApiRecord(rows[0]) });
});

assessApiRouter.post("/assessments", async (req, res) => {
  const principal = await authenticateAssessApiKey(req, res, "assessments:write");
  if (!principal) return;
  const parsed = z.object({
    candidateEmail: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
    roleTitle: z.string().trim().min(2).max(160),
    roleProfile: z.enum(ASSESS_ROLE_PROFILE_KEYS).default("SOFTWARE_ENGINEERING"),
    introduction: z.string().trim().min(10).max(4000),
    questions: z.array(z.object({ id: z.string().trim().min(1).max(40), text: z.string().trim().min(3).max(500) })).min(2).max(8)
      .refine(questions => new Set(questions.map(item => item.id)).size === questions.length, "Duplicate question id"),
    estimatedMinutes: z.number().int().min(5).max(360).default(45),
    deadlineAt: z.string().datetime().nullable().optional(),
    aiPolicy: z.enum(["ALLOWED", "NOT_ALLOWED", "DISCUSS"]).default("DISCUSS"),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_CANDIDATE_ASSESSMENT");
  const idempotencyKey = String(req.get("Idempotency-Key") ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) return sendError(res, 400, "IDEMPOTENCY_KEY_REQUIRED");
  const candidates = await AppDataSource.query(
    "SELECT id,username,email FROM users WHERE LOWER(email)=? AND user_mode='PERSONAL' LIMIT 1",
    [parsed.data.candidateEmail],
  ) as Array<{ id: number; username: string; email: string | null }>;
  if (Number(candidates[0]?.id ?? 0) === principal.createdBy) return sendError(res, 400, "SELF_ASSESSMENT_NOT_ALLOWED");
  const companies = await AppDataSource.query("SELECT name FROM growth_companies WHERE id=? LIMIT 1", [principal.companyId]) as Array<{ name: string }>;
  if (!companies[0]) return sendError(res, 404, "COMPANY_NOT_FOUND");
  const candidateId = candidates[0]?.id ?? null;
  const candidateEmail = parsed.data.candidateEmail;
  const questionsJson = JSON.stringify(parsed.data.questions);
  const deadlineAt = parsed.data.deadlineAt ?? null;
  const invitationToken = assessmentInviteToken(principal.companyId, idempotencyKey);
  const invitationTokenHash = sha(invitationToken);
  const sameRequest = (row: Record<string, unknown>) => Number(row.candidate_id ?? 0) === Number(candidateId ?? 0)
    && String(row.candidate_email ?? "").toLowerCase() === candidateEmail
    && row.role_title === parsed.data.roleTitle && row.introduction === parsed.data.introduction
    && row.questions_json === questionsJson && Number(row.estimated_minutes ?? 45) === parsed.data.estimatedMinutes
    && (row.deadline_at == null ? deadlineAt == null : deadlineAt != null && new Date(row.deadline_at as string | Date).getTime() === new Date(deadlineAt).getTime())
    && String(row.ai_policy ?? "DISCUSS") === parsed.data.aiPolicy
    && String(row.role_profile ?? "SOFTWARE_ENGINEERING") === parsed.data.roleProfile;
  const existing = await AppDataSource.query(
    `SELECT id,candidate_id,candidate_email,role_title,role_profile,introduction,questions_json,estimated_minutes,deadline_at,ai_policy,status
     FROM growth_company_assessments WHERE company_id=? AND idempotency_key=? LIMIT 1`,
    [principal.companyId, idempotencyKey],
  ) as Array<Record<string, unknown>>;
  if (existing[0]) {
    if (!sameRequest(existing[0])) return sendError(res, 409, "IDEMPOTENCY_CONFLICT");
    const sent = await sendAssessmentInviteIfNeeded({ assessmentId: String(existing[0].id), companyId: principal.companyId, email: candidateEmail,
      token: invitationToken, companyName: companies[0].name, roleTitle: parsed.data.roleTitle, introduction: parsed.data.introduction,
      estimatedMinutes: parsed.data.estimatedMinutes, deadlineAt, aiPolicy: parsed.data.aiPolicy });
    if (!sent) return sendError(res, 502, "INVITATION_EMAIL_NOT_SENT");
    return res.json({ assessment: { id: existing[0].id, status: existing[0].status } });
  }
  const id = randomUUID();
  try {
    await AppDataSource.query(
      `INSERT INTO growth_company_assessments
       (id,company_id,created_by,candidate_id,candidate_email,idempotency_key,role_title,role_profile,introduction,questions_json,status,
        invitation_token_hash,invitation_expires_at,estimated_minutes,deadline_at,ai_policy,rubric_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,'INVITED',?,DATE_ADD(NOW(3),INTERVAL 14 DAY),?,?,?,?)`,
      [id, principal.companyId, principal.createdBy, candidateId, candidateEmail, idempotencyKey, parsed.data.roleTitle, parsed.data.roleProfile,
        parsed.data.introduction, questionsJson, invitationTokenHash, parsed.data.estimatedMinutes, deadlineAt, parsed.data.aiPolicy,
        JSON.stringify(assessRubricForProfile(parsed.data.roleProfile))],
    );
  } catch (error) {
    const raced = await AppDataSource.query(
      "SELECT id,candidate_id,candidate_email,role_title,role_profile,introduction,questions_json,estimated_minutes,deadline_at,ai_policy,status FROM growth_company_assessments WHERE company_id=? AND idempotency_key=? LIMIT 1",
      [principal.companyId, idempotencyKey],
    ) as Array<Record<string, unknown>>;
    if (!raced[0]) throw error;
    if (!sameRequest(raced[0])) return sendError(res, 409, "IDEMPOTENCY_CONFLICT");
    const sent = await sendAssessmentInviteIfNeeded({ assessmentId: String(raced[0].id), companyId: principal.companyId, email: candidateEmail,
      token: invitationToken, companyName: companies[0].name, roleTitle: parsed.data.roleTitle, introduction: parsed.data.introduction,
      estimatedMinutes: parsed.data.estimatedMinutes, deadlineAt, aiPolicy: parsed.data.aiPolicy });
    if (!sent) return sendError(res, 502, "INVITATION_EMAIL_NOT_SENT");
    return res.json({ assessment: { id: raced[0].id, status: raced[0].status } });
  }
  try { await enqueueAssessWebhookEvent({ companyId: principal.companyId, type: "assessment.invited", assessmentId: id, status: "INVITED" }); }
  catch (error) { logger.error("[assess:webhooks] could not enqueue API invitation event", { err: error, assessmentId: id }); }
  const sent = await sendAssessmentInviteIfNeeded({ assessmentId: id, companyId: principal.companyId, email: candidateEmail, token: invitationToken,
    companyName: companies[0].name, roleTitle: parsed.data.roleTitle, introduction: parsed.data.introduction,
    estimatedMinutes: parsed.data.estimatedMinutes, deadlineAt, aiPolicy: parsed.data.aiPolicy });
  if (!sent) return sendError(res, 502, "INVITATION_EMAIL_NOT_SENT");
  if (candidateId) await notifyCompanyUser(candidateId, principal.createdBy, "COMPANY_ASSESSMENT_INVITATION", `/assess?case=${id}`);
  return res.status(201).json({ assessment: { id, candidate: candidates[0]?.username ?? candidateEmail, candidateEmail, roleTitle: parsed.data.roleTitle, roleProfile: parsed.data.roleProfile, status: "INVITED" } });
});
