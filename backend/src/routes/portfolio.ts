import { createHash, randomBytes, randomUUID } from "crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authRequired, type AuthRequest } from "../middleware/authMiddleware";
import { createRouteLimiter } from "../middleware/routeRateLimit";
import { parsePortfolioBirthDate, portfolioSharingAgeStatus, privatePortfolioBirthDate, type PortfolioSharingAgeStatus } from "../utils/portfolioAge";
import { PORTFOLIO_SKILL_IDS, PORTFOLIO_SKILLS } from "../data/portfolioSkills";
import {
  findPortfolioSourcedEvidenceSource,
  listPortfolioSourcedEvidenceSources,
  PORTFOLIO_SOURCED_EVIDENCE_TYPES,
  type PortfolioSourcedEvidenceType,
} from "../services/portfolioEvidenceSources";

export const portfolioRouter = Router();
export const publicPortfolioRouter = Router();

const UUID_RE = /^[0-9a-f-]{36}$/i;
const visibilitySchema = z.enum(["PRIVATE", "PUBLIC"]);
const safeHttpsUrl = z.union([z.string().trim().max(500).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "URL must use HTTPS"), z.literal(""), z.null()]).transform(value => value || null);
const profileSchema = z.object({
  displayName: z.string().trim().max(120),
  headline: z.string().trim().max(160),
  specialization: z.string().trim().max(120).default(""),
  technologies: z.array(z.string().trim().min(1).max(48)).max(16).default([]),
  summary: z.string().trim().max(4_000),
  githubUrl: safeHttpsUrl,
  websiteUrl: safeHttpsUrl,
  shareAvatar: z.boolean().default(false),
  visibility: visibilitySchema,
});
const workSchema = z.object({
  title: z.string().trim().min(1).max(160),
  problem: z.string().trim().max(4_000),
  solution: z.string().trim().max(4_000),
  role: z.string().trim().max(120),
  technologies: z.array(z.string().trim().min(1).max(48)).max(16),
  skillIds: z.array(z.string().min(1).max(48)).max(12),
  repositoryUrl: safeHttpsUrl,
  demoUrl: safeHttpsUrl,
  visibility: visibilitySchema,
  sourcePublicationId: z.string().uuid().nullable().optional(),
});
const workOrderSchema = z.object({ ids: z.array(z.string().uuid()).max(100) });
const evidenceOrderSchema = z.object({ ids: z.array(z.string().uuid()).max(5000) });
const evidenceFields = z.object({
  sourceGradeId: z.number().int().positive(),
  description: z.string().trim().max(1000),
  skillIds: z.array(z.string().min(1).max(48)).max(8),
  visibility: visibilitySchema,
});
const validSkillSelection = (value: { skillIds: string[] }) => new Set(value.skillIds).size === value.skillIds.length && value.skillIds.every(id => PORTFOLIO_SKILL_IDS.has(id));
function compareEvidenceOrder(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const position = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0);
  if (position) return position;
  const leftTime = new Date(String(left.updatedAt ?? left.submittedAt ?? left.verifiedAt ?? 0)).getTime();
  const rightTime = new Date(String(right.updatedAt ?? right.submittedAt ?? right.verifiedAt ?? 0)).getTime();
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}
const evidenceSchema = evidenceFields.refine(validSkillSelection, "Unknown or duplicate skill");
const evidenceUpdateSchema = evidenceFields.omit({ sourceGradeId: true }).refine(validSkillSelection, "Unknown or duplicate skill");
const sourcedEvidenceSchema = z.object({
  sourceType: z.enum(PORTFOLIO_SOURCED_EVIDENCE_TYPES),
  sourceKey: z.string().trim().min(1).max(128),
  description: z.string().trim().max(1000),
  skillIds: z.array(z.string().min(1).max(48)).max(8),
  visibility: visibilitySchema,
}).refine(validSkillSelection, "Unknown or duplicate skill");
const evidencePackSchema = z.object({
  title: z.string().trim().min(1).max(120),
  specialization: z.string().trim().max(120),
  includeProfile: z.boolean(),
  workIds: z.array(z.string().uuid()).max(50),
  evidenceIds: z.array(z.string().uuid()).max(50),
  skillIds: z.array(z.string().min(1).max(48)).max(12).default([]),
  expiresInDays: z.number().int().min(1).max(30),
}).refine(value => new Set(value.workIds).size === value.workIds.length && new Set(value.evidenceIds).size === value.evidenceIds.length, "Duplicate selection")
  .refine(value => new Set(value.skillIds).size === value.skillIds.length && value.skillIds.every(id => PORTFOLIO_SKILL_IDS.has(id)), "Unknown or duplicate skill")
  .refine(value => value.workIds.length + value.evidenceIds.length > 0, "At least one item is required");
const privateBirthDateSchema = z.string().refine(value => parsePortfolioBirthDate(value) !== null, "Invalid birth date");

type WorkInput = z.infer<typeof workSchema>;
type ProfileRow = {
  displayName: string; headline: string; specialization: string; technologiesJson?: unknown; technologies?: string[]; summary: string; githubUrl: string | null;
  websiteUrl: string | null; shareAvatar?: boolean | number; visibility: "PRIVATE" | "PUBLIC"; updatedAt?: Date | string;
};

const sendError = (res: Response, status: number, code: string) => res.status(status).json({ code, message: code });
function ageStatusFromRow(row?: Record<string, unknown>): PortfolioSharingAgeStatus {
  if (!row) return "UNKNOWN";
  return portfolioSharingAgeStatus({ birthDay: row.birthDay, birthMonth: row.birthMonth, birthYear: row.birthYear });
}
async function requireAdultPortfolioSharing(ownerId: number, res: Response): Promise<boolean> {
  const rows = await AppDataSource.query(
    "SELECT birth_day AS birthDay,birth_month AS birthMonth,birth_year AS birthYear FROM users WHERE id=? AND user_mode='PERSONAL' LIMIT 1",
    [ownerId]
  ) as Array<Record<string, unknown>>;
  if (ageStatusFromRow(rows[0]) !== "ADULT") {
    sendError(res, 403, "PUBLIC_SHARING_REQUIRES_ADULT_AGE");
    return false;
  }
  return true;
}
const parseJsonArray = (value: unknown, limit = 16): string[] => {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string").slice(0, limit) : [];
  } catch {
    return [];
  }
};
const shareableAvatarUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 2_000_000) return null;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};
const parseJsonObject = <T extends Record<string, unknown>>(value: unknown, fallback: T): T => {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
};

async function personalOwner(req: AuthRequest, res: Response): Promise<number | null> {
  if (!req.userId || req.userType !== "USER" || req.userMode !== "PERSONAL") {
    sendError(res, 403, "PERSONAL_USER_REQUIRED");
    return null;
  }
  return req.userId;
}

async function listWorks(ownerId: number): Promise<Array<Record<string, unknown>>> {
  const rows = await AppDataSource.query(
    `SELECT w.id,w.title,w.problem,w.solution,w.role,w.technologies_json AS technologiesJson,w.skill_ids_json AS skillIdsJson,
            w.repository_url AS repositoryUrl,w.demo_url AS demoUrl,w.source_publication_id AS sourcePublicationId,
            w.visibility,w.sort_order AS sortOrder,w.created_at AS createdAt,w.updated_at AS updatedAt,
            p.public_id AS sourcePublicId
     FROM portfolio_works w
     LEFT JOIN growth_project_publications p
       ON p.id=w.source_publication_id AND p.owner_id=w.owner_id AND p.revoked=0
     WHERE w.owner_id=? AND w.archived_at IS NULL
     ORDER BY w.sort_order ASC,w.created_at DESC`, [ownerId]
  ) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    problem: row.problem,
    solution: row.solution,
    role: row.role,
    technologies: parseJsonArray(row.technologiesJson),
    skillIds: parseJsonArray(row.skillIdsJson, 12),
    repositoryUrl: row.repositoryUrl,
    demoUrl: row.demoUrl,
    sourcePublicationId: row.sourcePublicationId,
    sourcePublicId: row.sourcePublicId,
    visibility: row.visibility,
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

async function loadProfile(ownerId: number): Promise<ProfileRow> {
  const rows = await AppDataSource.query(
    `SELECT display_name AS displayName,headline,specialization,technologies_json AS technologiesJson,summary,github_url AS githubUrl,website_url AS websiteUrl,
            share_avatar AS shareAvatar,visibility,updated_at AS updatedAt
     FROM portfolio_profiles WHERE owner_id=? LIMIT 1`, [ownerId]
  ) as ProfileRow[];
  const row = rows[0];
  return row ? {
    displayName: row.displayName, headline: row.headline, specialization: row.specialization,
    technologies: parseJsonArray(row.technologiesJson, 16), summary: row.summary, githubUrl: row.githubUrl,
    websiteUrl: row.websiteUrl, shareAvatar: Boolean(row.shareAvatar), visibility: row.visibility, updatedAt: row.updatedAt,
  } : {
    displayName: "", headline: "", specialization: "", technologies: [], summary: "", githubUrl: null, websiteUrl: null, shareAvatar: false, visibility: "PRIVATE",
  };
}

const eligibleEvidenceSourceSql = `g.user_id=? AND u.user_mode='PERSONAL' AND t.user_id=g.user_id
  AND t.task_mode='CODE' AND g.verification_method='ONLINE_JUDGE' AND g.judge_verdict='AC'
  AND g.tests_total>0 AND g.tests_passed=g.tests_total`;

async function listEvidenceSources(ownerId: number): Promise<Array<Record<string, unknown>>> {
  const rows = await AppDataSource.query(
    `SELECT g.id AS gradeId,t.title AS taskTitle,t.lang AS language,g.tests_passed AS testsPassed,
            g.tests_total AS testsTotal,g.created_at AS submittedAt
     FROM grades g JOIN tasks t ON t.id=g.task_id JOIN users u ON u.id=g.user_id
     LEFT JOIN portfolio_evidence e ON e.owner_id=g.user_id AND e.source_grade_id=g.id AND e.archived_at IS NULL
     WHERE ${eligibleEvidenceSourceSql} AND e.id IS NULL
     ORDER BY g.created_at DESC LIMIT 100`, [ownerId]
  ) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    sourceType: "ONLINE_JUDGE",
    sourceKey: String(row.gradeId),
    title: row.taskTitle,
    sourceLabel: "StudyCod Online Judge · accepted solution",
    detail: `${Number(row.testsPassed ?? 0)}/${Number(row.testsTotal ?? 0)} tests passed`,
    verifiedAt: row.submittedAt,
    ...row,
  }));
}

async function listEvidence(ownerId: number): Promise<Array<Record<string, unknown>>> {
  const rows = await AppDataSource.query(
    `SELECT e.id,e.source_grade_id AS sourceGradeId,e.description,e.skill_ids_json AS skillIdsJson,e.visibility,e.sort_order AS sortOrder,e.updated_at AS updatedAt,
            t.title AS taskTitle,t.lang AS language,g.judge_verdict AS judgeVerdict,
            g.tests_passed AS testsPassed,g.tests_total AS testsTotal,g.created_at AS submittedAt
     FROM portfolio_evidence e JOIN grades g ON g.id=e.source_grade_id AND g.user_id=e.owner_id
     JOIN tasks t ON t.id=g.task_id JOIN users u ON u.id=e.owner_id
     WHERE e.owner_id=? AND e.archived_at IS NULL AND ${eligibleEvidenceSourceSql}
     ORDER BY e.sort_order ASC,e.updated_at DESC,e.id ASC`, [ownerId, ownerId]
  ) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: row.id,
    sourceGradeId: Number(row.sourceGradeId),
    sourceType: "ONLINE_JUDGE",
    sourceKey: String(row.sourceGradeId),
    sourceTitle: row.taskTitle,
    sourceLabel: "StudyCod Online Judge · accepted solution",
    sourceDetail: `${Number(row.testsPassed ?? 0)}/${Number(row.testsTotal ?? 0)} tests passed`,
    description: row.description,
    skillIds: parseJsonArray(row.skillIdsJson),
    visibility: row.visibility,
    sortOrder: Number(row.sortOrder ?? 0),
    updatedAt: row.updatedAt,
    taskTitle: row.taskTitle,
    language: row.language,
    verificationMethod: "ONLINE_JUDGE",
    judgeVerdict: row.judgeVerdict,
    testsPassed: Number(row.testsPassed ?? 0),
    testsTotal: Number(row.testsTotal ?? 0),
    submittedAt: row.submittedAt,
  }));
}

async function listSourcedEvidence(ownerId: number, ids?: string[], visibility?: "PRIVATE" | "PUBLIC"): Promise<Array<Record<string, unknown>>> {
  if (ids && ids.length === 0) return [];
  const filters = ["owner_id=?", "archived_at IS NULL"];
  const args: unknown[] = [ownerId];
  if (visibility) { filters.push("visibility=?"); args.push(visibility); }
  if (ids) { filters.push(`id IN (${ids.map(() => "?").join(",")})`); args.push(...ids); }
  const rows = await AppDataSource.query(
    `SELECT id,source_type AS sourceType,source_key AS sourceKey,source_snapshot_json AS sourceSnapshotJson,
            description,skill_ids_json AS skillIdsJson,visibility,sort_order AS sortOrder,updated_at AS updatedAt
     FROM portfolio_sourced_evidence WHERE ${filters.join(" AND ")} ORDER BY sort_order ASC,updated_at DESC,id ASC`, args
  ) as Array<Record<string, unknown>>;
  if (!rows.length) return [];
  const eligible = await listPortfolioSourcedEvidenceSources(ownerId);
  const sourceMap = new Map(eligible.map(source => [`${source.sourceType}:${source.sourceKey}`, source]));
  return rows.flatMap(row => {
    const sourceType = String(row.sourceType) as PortfolioSourcedEvidenceType;
    const sourceKey = String(row.sourceKey);
    if (!PORTFOLIO_SOURCED_EVIDENCE_TYPES.includes(sourceType as typeof PORTFOLIO_SOURCED_EVIDENCE_TYPES[number])) return [];
    const currentSource = sourceMap.get(`${sourceType}:${sourceKey}`);
    if (!currentSource) return [];
    const snapshot = parseJsonObject<Record<string, unknown>>(row.sourceSnapshotJson, {});
    return [{
      id: row.id,
      sourceType,
      sourceKey,
      sourceTitle: typeof snapshot.title === "string" ? snapshot.title : currentSource.title,
      sourceLabel: typeof snapshot.sourceLabel === "string" ? snapshot.sourceLabel : currentSource.sourceLabel,
      sourceDetail: typeof snapshot.detail === "string" ? snapshot.detail : currentSource.detail,
      verifiedAt: snapshot.verifiedAt ?? currentSource.verifiedAt,
      description: row.description,
      skillIds: parseJsonArray(row.skillIdsJson, 8),
      visibility: row.visibility,
      sortOrder: Number(row.sortOrder ?? 0),
      updatedAt: row.updatedAt,
    }];
  });
}

async function listEvidencePacks(ownerId: number): Promise<Array<Record<string, unknown>>> {
  const rows = await AppDataSource.query(
    `SELECT id,title,specialization,include_profile AS includeProfile,work_ids_json AS workIdsJson,evidence_ids_json AS evidenceIdsJson,
            skill_ids_json AS skillIdsJson,
            expires_at AS expiresAt,revoked_at AS revokedAt,created_at AS createdAt
     FROM portfolio_evidence_packs WHERE owner_id=? ORDER BY created_at DESC LIMIT 100`, [ownerId]
  ) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    specialization: row.specialization,
    includeProfile: Boolean(row.includeProfile),
    workCount: parseJsonArray(row.workIdsJson, 50).length,
    evidenceCount: parseJsonArray(row.evidenceIdsJson, 50).length,
    skillIds: parseJsonArray(row.skillIdsJson, 12).filter(id => PORTFOLIO_SKILL_IDS.has(id)),
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }));
}

function publicPortfolioView(
  username: string,
  accountAvatarUrl: unknown,
  profile: ProfileRow,
  works: Array<Record<string, unknown>>,
  judgeEvidence: Array<Record<string, unknown>>,
  sourcedEvidence: Array<Record<string, unknown>>,
) {
  const evidence = ([
    ...judgeEvidence.filter(item => item.visibility === "PUBLIC").map(item => ({
      id: item.id,
      description: item.description,
      skillIds: Array.isArray(item.skillIds) ? item.skillIds : [],
      sourceType: "ONLINE_JUDGE",
      sourceTitle: item.taskTitle,
      sourceLabel: "StudyCod Online Judge · accepted solution",
      sourceDetail: `${Number(item.testsPassed ?? 0)}/${Number(item.testsTotal ?? 0)} tests passed`,
      taskTitle: item.taskTitle,
      language: item.language,
      verificationMethod: "ONLINE_JUDGE",
      judgeVerdict: item.judgeVerdict,
      testsPassed: Number(item.testsPassed ?? 0),
      testsTotal: Number(item.testsTotal ?? 0),
      submittedAt: item.submittedAt,
      sortOrder: Number(item.sortOrder ?? 0),
      updatedAt: item.updatedAt,
    })),
    ...sourcedEvidence.filter(item => item.visibility === "PUBLIC"),
  ] as Array<Record<string, unknown>>).sort(compareEvidenceOrder).map(({ sortOrder: _sortOrder, updatedAt: _updatedAt, visibility: _visibility, sourceKey: _sourceKey, sourceGradeId: _sourceGradeId, ...item }) => item);

  return {
    profile: {
      username,
      displayName: profile.displayName.trim() || username,
      headline: profile.headline,
      specialization: profile.specialization,
      technologies: profile.technologies ?? [],
      summary: profile.summary,
      githubUrl: profile.githubUrl,
      websiteUrl: profile.websiteUrl,
      avatarUrl: profile.shareAvatar ? shareableAvatarUrl(accountAvatarUrl) : null,
    },
    works: works.filter(work => work.visibility === "PUBLIC").map(work => ({
      id: work.id,
      title: work.title,
      problem: work.problem,
      solution: work.solution,
      role: work.role,
      technologies: Array.isArray(work.technologies) ? work.technologies : [],
      skillIds: Array.isArray(work.skillIds) ? work.skillIds : [],
      repositoryUrl: work.repositoryUrl,
      demoUrl: work.demoUrl,
      sourcePublicId: work.sourcePublicId,
    })),
    evidence,
    skills: PORTFOLIO_SKILLS,
  };
}

portfolioRouter.use(authRequired, createRouteLimiter({ windowMs: 60_000, limit: 90, namespace: "portfolio" }));
publicPortfolioRouter.use(createRouteLimiter({ windowMs: 60_000, limit: 90, namespace: "portfolio-public" }));

portfolioRouter.get("/me", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const [profile, works, userRows, publicationRows, gradeEvidence, evidenceSources, sourcedEvidenceSources, sourcedEvidence, evidencePacks] = await Promise.all([
    loadProfile(ownerId),
    listWorks(ownerId),
    AppDataSource.query("SELECT username,avatar_url AS avatarUrl,birth_day AS birthDay,birth_month AS birthMonth,birth_year AS birthYear FROM users WHERE id=? AND user_mode='PERSONAL' LIMIT 1", [ownerId]) as Promise<Array<{ username: string; avatarUrl: string | null; birthDay: number | null; birthMonth: number | null; birthYear: number | null }>>,
    AppDataSource.query(
      `SELECT p.id,p.public_id AS publicId,p.title,p.description,g.runtime,v.stage_key AS stage
       FROM growth_project_publications p
       JOIN growth_projects g ON g.id=p.project_id AND g.owner_id=p.owner_id
       JOIN growth_project_versions v ON v.id=p.version_id AND v.project_id=p.project_id
       WHERE p.owner_id=? AND p.revoked=0 ORDER BY p.updated_at DESC LIMIT 100`, [ownerId]
    ) as Promise<Array<Record<string, unknown>>>,
    listEvidence(ownerId),
    listEvidenceSources(ownerId),
    listPortfolioSourcedEvidenceSources(ownerId),
    listSourcedEvidence(ownerId),
    listEvidencePacks(ownerId),
  ]);
  const evidence = [...gradeEvidence, ...sourcedEvidence].sort(compareEvidenceOrder);
  const usedSourcedKeys = new Set(sourcedEvidence.map(item => `${item.sourceType}:${item.sourceKey}`));
  const availableSourcedEvidenceSources = sourcedEvidenceSources.filter(source => !usedSourcedKeys.has(`${source.sourceType}:${source.sourceKey}`));
  const user = userRows[0];
  return res.json({ username: user?.username ?? "", avatarUrl: user?.avatarUrl ?? null,
    birthDate: privatePortfolioBirthDate({ birthDay: user?.birthDay, birthMonth: user?.birthMonth, birthYear: user?.birthYear }),
    publicSharingAgeStatus: ageStatusFromRow(user), profile, works, availablePublications: publicationRows, evidence, evidenceSources, sourcedEvidenceSources: availableSourcedEvidenceSources, evidencePacks, skills: PORTFOLIO_SKILLS });
});

portfolioRouter.put("/me/birth-date", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = privateBirthDateSchema.safeParse(req.body?.birthDate);
  if (!parsed.success) return sendError(res, 400, "INVALID_PRIVATE_BIRTH_DATE");
  const birthDate = parsePortfolioBirthDate(parsed.data);
  if (!birthDate) return sendError(res, 400, "INVALID_PRIVATE_BIRTH_DATE");
  await AppDataSource.query(
    "UPDATE users SET birth_day=?,birth_month=?,birth_year=? WHERE id=? AND user_mode='PERSONAL'",
    [birthDate.birthDay, birthDate.birthMonth, birthDate.birthYear, ownerId]
  );
  return res.json({ birthDate: birthDate.isoDate, publicSharingAgeStatus: portfolioSharingAgeStatus(birthDate) });
});

portfolioRouter.delete("/me/birth-date", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  await AppDataSource.query(
    "UPDATE users SET birth_year=NULL WHERE id=? AND user_mode='PERSONAL'",
    [ownerId]
  );
  return res.json({ birthDate: null, publicSharingAgeStatus: "UNKNOWN" as const });
});

portfolioRouter.get("/preview", async (req: AuthRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const [userRows, profile, works, judgeEvidence, sourcedEvidence] = await Promise.all([
    AppDataSource.query("SELECT username,avatar_url AS avatarUrl FROM users WHERE id=? AND user_mode='PERSONAL' LIMIT 1", [ownerId]) as Promise<Array<{ username: string; avatarUrl: string | null }>>,
    loadProfile(ownerId),
    listWorks(ownerId),
    listEvidence(ownerId),
    listSourcedEvidence(ownerId),
  ]);
  const user = userRows[0];
  if (!user) return sendError(res, 404, "PORTFOLIO_NOT_FOUND");
  return res.json(publicPortfolioView(user.username, user.avatarUrl, profile, works, judgeEvidence, sourcedEvidence));
});

portfolioRouter.post("/evidence", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = evidenceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_SKILL_EVIDENCE");
  const evidence = parsed.data;
  if (evidence.visibility === "PUBLIC" && !await requireAdultPortfolioSharing(ownerId, res)) return;
  const sources = await AppDataSource.query(
    `SELECT g.id FROM grades g JOIN tasks t ON t.id=g.task_id JOIN users u ON u.id=g.user_id
     WHERE g.id=? AND ${eligibleEvidenceSourceSql} LIMIT 1`, [evidence.sourceGradeId, ownerId]
  ) as Array<{ id: number }>;
  if (!sources[0]) return sendError(res, 404, "ELIGIBLE_EVIDENCE_SOURCE_NOT_FOUND");

  const existing = await AppDataSource.query(
    "SELECT id,archived_at AS archivedAt FROM portfolio_evidence WHERE owner_id=? AND source_grade_id=? LIMIT 1",
    [ownerId, evidence.sourceGradeId]
  ) as Array<{ id: string; archivedAt: Date | string | null }>;
  if (existing[0] && existing[0].archivedAt == null) return sendError(res, 409, "SKILL_EVIDENCE_ALREADY_ADDED");
  if (existing[0]) {
    await AppDataSource.query(
      `UPDATE portfolio_evidence SET description=?,skill_ids_json=?,visibility=?,archived_at=NULL
       WHERE id=? AND owner_id=? AND source_grade_id=?`,
      [evidence.description, JSON.stringify([...new Set(evidence.skillIds)]), evidence.visibility, existing[0].id, ownerId, evidence.sourceGradeId]
    );
    return res.json({ id: existing[0].id, restored: true });
  }

  const id = randomUUID();
  const orderRows = await AppDataSource.query(
    "SELECT COALESCE(MAX(sort_order),-1)+1 AS nextOrder FROM portfolio_evidence WHERE owner_id=?",
    [ownerId]
  ) as Array<{ nextOrder: number | string }>;
  await AppDataSource.query(
    `INSERT INTO portfolio_evidence(id,owner_id,source_grade_id,description,skill_ids_json,visibility,sort_order)
     VALUES(?,?,?,?,?,?,?)`,
    [id, ownerId, evidence.sourceGradeId, evidence.description, JSON.stringify([...new Set(evidence.skillIds)]), evidence.visibility, Number(orderRows[0]?.nextOrder ?? 0)]
  );
  return res.status(201).json({ id });
});

portfolioRouter.post("/evidence/sourced", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = sourcedEvidenceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_SKILL_EVIDENCE");
  const evidence = parsed.data;
  if (evidence.visibility === "PUBLIC" && !await requireAdultPortfolioSharing(ownerId, res)) return;
  const source = await findPortfolioSourcedEvidenceSource(ownerId, evidence.sourceType, evidence.sourceKey);
  if (!source) return sendError(res, 404, "ELIGIBLE_EVIDENCE_SOURCE_NOT_FOUND");
  const existing = await AppDataSource.query(
    "SELECT id,archived_at AS archivedAt FROM portfolio_sourced_evidence WHERE owner_id=? AND source_type=? AND source_key=? LIMIT 1",
    [ownerId, evidence.sourceType, evidence.sourceKey]
  ) as Array<{ id: string; archivedAt: Date | string | null }>;
  const skillIdsJson = JSON.stringify(evidence.skillIds);
  const snapshotJson = JSON.stringify({ ...source, verifiedAt: new Date(source.verifiedAt).toISOString() });
  if (existing[0] && existing[0].archivedAt == null) return sendError(res, 409, "SKILL_EVIDENCE_ALREADY_ADDED");
  if (existing[0]) {
    await AppDataSource.query(
      `UPDATE portfolio_sourced_evidence
       SET source_snapshot_json=?,description=?,skill_ids_json=?,visibility=?,archived_at=NULL
       WHERE id=? AND owner_id=? AND source_type=? AND source_key=?`,
      [snapshotJson, evidence.description, skillIdsJson, evidence.visibility, existing[0].id, ownerId, evidence.sourceType, evidence.sourceKey]
    );
    return res.json({ id: existing[0].id, restored: true });
  }
  const id = randomUUID();
  const orderRows = await AppDataSource.query(
    "SELECT COALESCE(MAX(sort_order),-1)+1 AS nextOrder FROM portfolio_sourced_evidence WHERE owner_id=?",
    [ownerId]
  ) as Array<{ nextOrder: number | string }>;
  await AppDataSource.query(
    `INSERT INTO portfolio_sourced_evidence(id,owner_id,source_type,source_key,source_snapshot_json,description,skill_ids_json,visibility,sort_order)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [id, ownerId, evidence.sourceType, evidence.sourceKey, snapshotJson, evidence.description, skillIdsJson, evidence.visibility, Number(orderRows[0]?.nextOrder ?? 0)]
  );
  return res.status(201).json({ id });
});

portfolioRouter.patch("/evidence/:evidenceId", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  if (!UUID_RE.test(req.params.evidenceId)) return sendError(res, 404, "SKILL_EVIDENCE_NOT_FOUND");
  const parsed = evidenceUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_SKILL_EVIDENCE");
  if (parsed.data.visibility === "PUBLIC" && !await requireAdultPortfolioSharing(ownerId, res)) return;
  const result = await AppDataSource.query(
    `UPDATE portfolio_evidence SET description=?,skill_ids_json=?,visibility=?
     WHERE id=? AND owner_id=? AND archived_at IS NULL`,
    [parsed.data.description, JSON.stringify([...new Set(parsed.data.skillIds)]), parsed.data.visibility, req.params.evidenceId, ownerId]
  ) as { affectedRows?: number };
  if (!result.affectedRows) {
    const sources = await AppDataSource.query(
      "SELECT source_type AS sourceType,source_key AS sourceKey FROM portfolio_sourced_evidence WHERE id=? AND owner_id=? AND archived_at IS NULL LIMIT 1",
      [req.params.evidenceId, ownerId]
    ) as Array<{ sourceType: PortfolioSourcedEvidenceType; sourceKey: string }>;
    if (!sources[0] || !await findPortfolioSourcedEvidenceSource(ownerId, sources[0].sourceType, sources[0].sourceKey)) return sendError(res, 404, "SKILL_EVIDENCE_NOT_FOUND");
    const sourcedUpdate = await AppDataSource.query(
      `UPDATE portfolio_sourced_evidence SET description=?,skill_ids_json=?,visibility=?
       WHERE id=? AND owner_id=? AND archived_at IS NULL`,
      [parsed.data.description, JSON.stringify(parsed.data.skillIds), parsed.data.visibility, req.params.evidenceId, ownerId]
    ) as { affectedRows?: number };
    if (!sourcedUpdate.affectedRows) return sendError(res, 404, "SKILL_EVIDENCE_NOT_FOUND");
  }
  return res.json({ updated: true });
});

portfolioRouter.delete("/evidence/:evidenceId", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  if (!UUID_RE.test(req.params.evidenceId)) return sendError(res, 404, "SKILL_EVIDENCE_NOT_FOUND");
  const result = await AppDataSource.query(
    "UPDATE portfolio_evidence SET archived_at=UTC_TIMESTAMP(3),visibility='PRIVATE' WHERE id=? AND owner_id=? AND archived_at IS NULL",
    [req.params.evidenceId, ownerId]
  ) as { affectedRows?: number };
  if (!result.affectedRows) {
    const sourcedResult = await AppDataSource.query(
      "UPDATE portfolio_sourced_evidence SET archived_at=UTC_TIMESTAMP(3),visibility='PRIVATE' WHERE id=? AND owner_id=? AND archived_at IS NULL",
      [req.params.evidenceId, ownerId]
    ) as { affectedRows?: number };
    if (!sourcedResult.affectedRows) return sendError(res, 404, "SKILL_EVIDENCE_NOT_FOUND");
  }
  return res.json({ archived: true });
});

portfolioRouter.put("/evidence/order", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = evidenceOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success || new Set(parsed.data?.ids ?? []).size !== (parsed.data?.ids.length ?? 0)) return sendError(res, 400, "INVALID_PORTFOLIO_EVIDENCE_ORDER");
  const ids = parsed.data.ids;
  if (!ids.length) return res.json({ updated: true });

  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const gradeRows = await runner.query(
      "SELECT id FROM portfolio_evidence WHERE owner_id=? AND archived_at IS NULL FOR UPDATE", [ownerId]
    ) as Array<{ id: string }>;
    const sourcedRows = await runner.query(
      "SELECT id FROM portfolio_sourced_evidence WHERE owner_id=? AND archived_at IS NULL FOR UPDATE", [ownerId]
    ) as Array<{ id: string }>;
    const gradeIds = new Set(gradeRows.map(row => row.id));
    const sourcedIds = new Set(sourcedRows.map(row => row.id));
    const ownedIds = new Set([...gradeIds, ...sourcedIds]);
    if (gradeRows.length + sourcedRows.length !== ids.length || ids.some(id => !ownedIds.has(id))) {
      await runner.rollbackTransaction();
      return sendError(res, 409, "PORTFOLIO_EVIDENCE_ORDER_CONFLICT");
    }
    const orderedGradeIds = ids.map((id, position) => ({ id, position })).filter(item => gradeIds.has(item.id));
    const orderedSourcedIds = ids.map((id, position) => ({ id, position })).filter(item => sourcedIds.has(item.id));
    for (const [table, ordered] of [
      ["portfolio_evidence", orderedGradeIds],
      ["portfolio_sourced_evidence", orderedSourcedIds],
    ] as const) {
      if (!ordered.length) continue;
      const cases = ordered.map(() => "WHEN ? THEN ?").join(" ");
      const itemIds = ordered.map(item => item.id);
      await runner.query(
        `UPDATE ${table} SET sort_order=CASE id ${cases} ELSE sort_order END
         WHERE owner_id=? AND archived_at IS NULL AND id IN (${itemIds.map(() => "?").join(",")})`,
        [...ordered.flatMap(item => [item.id, item.position]), ownerId, ...itemIds]
      );
    }
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
  return res.json({ updated: true });
});

portfolioRouter.get("/evidence-packs", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const rows = await AppDataSource.query(
    `SELECT id,title,specialization,include_profile AS includeProfile,work_ids_json AS workIdsJson,evidence_ids_json AS evidenceIdsJson,
            skill_ids_json AS skillIdsJson,
            expires_at AS expiresAt,revoked_at AS revokedAt,created_at AS createdAt
     FROM portfolio_evidence_packs WHERE owner_id=? ORDER BY created_at DESC LIMIT 100`, [ownerId]
  ) as Array<Record<string, unknown>>;
  return res.json({ packs: rows.map(row => ({
    id: row.id,
    title: row.title,
    specialization: row.specialization,
    includeProfile: Boolean(row.includeProfile),
    workCount: parseJsonArray(row.workIdsJson).length,
    evidenceCount: parseJsonArray(row.evidenceIdsJson).length,
    skillIds: parseJsonArray(row.skillIdsJson, 12).filter(id => PORTFOLIO_SKILL_IDS.has(id)),
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  })) });
});

portfolioRouter.post("/evidence-packs", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = evidencePackSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_EVIDENCE_PACK");
  const pack = parsed.data;
  if (!await requireAdultPortfolioSharing(ownerId, res)) return;

  let ownedWorks: Array<{ id: string }> = [];
  if (pack.workIds.length) {
    ownedWorks = await AppDataSource.query(
      `SELECT id FROM portfolio_works WHERE owner_id=? AND archived_at IS NULL AND id IN (${pack.workIds.map(() => "?").join(",")})`,
      [ownerId, ...pack.workIds]
    ) as Array<{ id: string }>;
  }
  if (ownedWorks.length !== pack.workIds.length) return sendError(res, 404, "EVIDENCE_PACK_ITEM_NOT_FOUND");

  let ownedEvidence: Array<{ id: string }> = [];
  if (pack.evidenceIds.length) {
    ownedEvidence = await AppDataSource.query(
      `SELECT e.id FROM portfolio_evidence e JOIN grades g ON g.id=e.source_grade_id AND g.user_id=e.owner_id
       JOIN tasks t ON t.id=g.task_id JOIN users u ON u.id=e.owner_id
       WHERE e.owner_id=? AND e.archived_at IS NULL AND e.id IN (${pack.evidenceIds.map(() => "?").join(",")})
         AND ${eligibleEvidenceSourceSql}`,
      [ownerId, ...pack.evidenceIds, ownerId]
    ) as Array<{ id: string }>;
  }
  const sourcedEvidence = await listSourcedEvidence(ownerId, pack.evidenceIds);
  if (ownedEvidence.length + sourcedEvidence.length !== pack.evidenceIds.length) return sendError(res, 404, "EVIDENCE_PACK_ITEM_NOT_FOUND");

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + pack.expiresInDays * 24 * 60 * 60 * 1000);
  await AppDataSource.query(
    `INSERT INTO portfolio_evidence_packs(id,owner_id,token_hash,title,specialization,include_profile,work_ids_json,evidence_ids_json,expires_at,skill_ids_json)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [id, ownerId, tokenHash, pack.title, pack.specialization, pack.includeProfile ? 1 : 0, JSON.stringify(pack.workIds), JSON.stringify(pack.evidenceIds), expiresAt, JSON.stringify(pack.skillIds)]
  );
  return res.status(201).json({ id, token, expiresAt });
});

portfolioRouter.delete("/evidence-packs/:packId", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  if (!UUID_RE.test(req.params.packId)) return sendError(res, 404, "EVIDENCE_PACK_NOT_FOUND");
  const result = await AppDataSource.query(
    "UPDATE portfolio_evidence_packs SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND owner_id=? AND revoked_at IS NULL",
    [req.params.packId, ownerId]
  ) as { affectedRows?: number };
  if (!result.affectedRows) return sendError(res, 404, "EVIDENCE_PACK_NOT_FOUND");
  return res.json({ revoked: true });
});

portfolioRouter.put("/me", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = profileSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_PORTFOLIO_PROFILE");
  const profile = parsed.data;
  if (profile.visibility === "PUBLIC" && !await requireAdultPortfolioSharing(ownerId, res)) return;
  await AppDataSource.query(
    `INSERT INTO portfolio_profiles(owner_id,display_name,headline,specialization,summary,github_url,website_url,visibility,technologies_json,share_avatar)
     VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),headline=VALUES(headline),specialization=VALUES(specialization),
     summary=VALUES(summary),github_url=VALUES(github_url),website_url=VALUES(website_url),visibility=VALUES(visibility),technologies_json=VALUES(technologies_json),share_avatar=VALUES(share_avatar)`,
    [ownerId, profile.displayName, profile.headline, profile.specialization, profile.summary, profile.githubUrl, profile.websiteUrl, profile.visibility, JSON.stringify([...new Set(profile.technologies)]), profile.shareAvatar ? 1 : 0]
  );
  return res.json({ profile: await loadProfile(ownerId) });
});

portfolioRouter.post("/works", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = workSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_PORTFOLIO_WORK");
  const work: WorkInput = parsed.data;
  if (!validSkillSelection(work)) return sendError(res, 400, "INVALID_PORTFOLIO_WORK");
  if (work.visibility === "PUBLIC" && !await requireAdultPortfolioSharing(ownerId, res)) return;
  const sourcePublicationId = work.sourcePublicationId ?? null;
  if (sourcePublicationId) {
    const sources = await AppDataSource.query(
      "SELECT id FROM growth_project_publications WHERE id=? AND owner_id=? AND revoked=0 LIMIT 1",
      [sourcePublicationId, ownerId]
    ) as Array<{ id: string }>;
    if (!sources[0]) return sendError(res, 404, "PORTFOLIO_SOURCE_NOT_FOUND");
    const existing = await AppDataSource.query(
      "SELECT id,archived_at AS archivedAt FROM portfolio_works WHERE owner_id=? AND source_publication_id=? LIMIT 1",
      [ownerId, sourcePublicationId]
    ) as Array<{ id: string; archivedAt: Date | string | null }>;
    if (existing[0] && existing[0].archivedAt == null) return res.status(409).json({ code: "PORTFOLIO_SOURCE_ALREADY_ADDED", id: existing[0].id });
    if (existing[0]) {
      await AppDataSource.query(
        `UPDATE portfolio_works SET title=?,problem=?,solution=?,role=?,technologies_json=?,skill_ids_json=?,repository_url=?,demo_url=?,visibility=?,archived_at=NULL
         WHERE id=? AND owner_id=?`,
        [work.title, work.problem, work.solution, work.role, JSON.stringify([...new Set(work.technologies)]), JSON.stringify([...new Set(work.skillIds)]), work.repositoryUrl, work.demoUrl, work.visibility, existing[0].id, ownerId]
      );
      return res.json({ id: existing[0].id, restored: true });
    }
  }
  const id = randomUUID();
  await AppDataSource.query(
    `INSERT INTO portfolio_works(id,owner_id,title,problem,solution,role,technologies_json,skill_ids_json,repository_url,demo_url,source_publication_id,visibility)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, ownerId, work.title, work.problem, work.solution, work.role, JSON.stringify([...new Set(work.technologies)]), JSON.stringify([...new Set(work.skillIds)]), work.repositoryUrl, work.demoUrl, sourcePublicationId, work.visibility]
  );
  return res.status(201).json({ id });
});

portfolioRouter.patch("/works/:workId", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  if (!UUID_RE.test(req.params.workId)) return sendError(res, 404, "PORTFOLIO_WORK_NOT_FOUND");
  const parsed = workSchema.omit({ sourcePublicationId: true }).safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, "INVALID_PORTFOLIO_WORK");
  const work = parsed.data;
  if (!validSkillSelection(work)) return sendError(res, 400, "INVALID_PORTFOLIO_WORK");
  if (work.visibility === "PUBLIC" && !await requireAdultPortfolioSharing(ownerId, res)) return;
  const result = await AppDataSource.query(
    `UPDATE portfolio_works SET title=?,problem=?,solution=?,role=?,technologies_json=?,skill_ids_json=?,repository_url=?,demo_url=?,visibility=?
     WHERE id=? AND owner_id=? AND archived_at IS NULL`,
    [work.title, work.problem, work.solution, work.role, JSON.stringify([...new Set(work.technologies)]), JSON.stringify([...new Set(work.skillIds)]), work.repositoryUrl, work.demoUrl, work.visibility, req.params.workId, ownerId]
  ) as { affectedRows?: number };
  if (!result.affectedRows) return sendError(res, 404, "PORTFOLIO_WORK_NOT_FOUND");
  return res.json({ updated: true });
});

portfolioRouter.delete("/works/:workId", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  if (!UUID_RE.test(req.params.workId)) return sendError(res, 404, "PORTFOLIO_WORK_NOT_FOUND");
  const result = await AppDataSource.query(
    "UPDATE portfolio_works SET archived_at=UTC_TIMESTAMP(3),visibility='PRIVATE' WHERE id=? AND owner_id=? AND archived_at IS NULL",
    [req.params.workId, ownerId]
  ) as { affectedRows?: number };
  if (!result.affectedRows) return sendError(res, 404, "PORTFOLIO_WORK_NOT_FOUND");
  return res.json({ archived: true });
});

portfolioRouter.put("/works/order", async (req: AuthRequest, res: Response) => {
  const ownerId = await personalOwner(req, res); if (!ownerId) return;
  const parsed = workOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success || new Set(parsed.data?.ids ?? []).size !== (parsed.data?.ids.length ?? 0)) return sendError(res, 400, "INVALID_PORTFOLIO_ORDER");
  const ids = parsed.data.ids;
  if (!ids.length) return res.json({ updated: true });

  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const rows = await runner.query(
      `SELECT w.id FROM portfolio_works w
       LEFT JOIN growth_project_publications p
         ON p.id=w.source_publication_id AND p.owner_id=w.owner_id AND p.revoked=0
       WHERE w.owner_id=? AND w.archived_at IS NULL FOR UPDATE`, [ownerId]
    ) as Array<{ id: string }>;
    const owned = new Set(rows.map(row => row.id));
    if (rows.length !== ids.length || ids.some(id => !owned.has(id))) {
      await runner.rollbackTransaction();
      return sendError(res, 409, "PORTFOLIO_ORDER_CONFLICT");
    }
    for (const [position, id] of ids.entries()) {
      await runner.query("UPDATE portfolio_works SET sort_order=? WHERE id=? AND owner_id=? AND archived_at IS NULL", [position, id, ownerId]);
    }
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
  return res.json({ updated: true });
});

publicPortfolioRouter.get("/u/:username", async (req, res: Response) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  const username = String(req.params.username ?? "").trim();
  if (!username || username.length > 100) return sendError(res, 404, "PORTFOLIO_NOT_FOUND");
  const profiles = await AppDataSource.query(
    `SELECT u.id AS ownerId,u.username,u.birth_day AS birthDay,u.birth_month AS birthMonth,u.birth_year AS birthYear,p.display_name AS displayName,
            p.headline,p.specialization,p.technologies_json AS technologiesJson,p.summary,p.github_url AS githubUrl,p.website_url AS websiteUrl,
            p.share_avatar AS shareAvatar,CASE WHEN p.share_avatar=1 THEN u.avatar_url ELSE NULL END AS avatarUrl
     FROM portfolio_profiles p JOIN users u ON u.id=p.owner_id
     WHERE u.username=? AND u.user_mode='PERSONAL' AND p.visibility='PUBLIC' LIMIT 1`, [username]
  ) as Array<Record<string, unknown>>;
  const profile = profiles[0];
  if (!profile || ageStatusFromRow(profile) !== "ADULT") return sendError(res, 404, "PORTFOLIO_NOT_FOUND");
  const works = await AppDataSource.query(
    `SELECT w.id,w.title,w.problem,w.solution,w.role,w.technologies_json AS technologiesJson,w.skill_ids_json AS skillIdsJson,
            w.repository_url AS repositoryUrl,w.demo_url AS demoUrl,p.public_id AS sourcePublicId
     FROM portfolio_works w
     LEFT JOIN growth_project_publications p
       ON p.id=w.source_publication_id AND p.owner_id=w.owner_id AND p.revoked=0
     WHERE w.owner_id=? AND w.visibility='PUBLIC' AND w.archived_at IS NULL
     ORDER BY w.sort_order ASC,w.created_at DESC`, [profile.ownerId]
  ) as Array<Record<string, unknown>>;
  const evidenceRows = await AppDataSource.query(
    `SELECT e.id,e.description,e.skill_ids_json AS skillIdsJson,e.sort_order AS sortOrder,e.updated_at AS updatedAt,t.title AS taskTitle,t.lang AS language,
            g.judge_verdict AS judgeVerdict,g.tests_passed AS testsPassed,g.tests_total AS testsTotal,g.created_at AS submittedAt
     FROM portfolio_evidence e JOIN grades g ON g.id=e.source_grade_id AND g.user_id=e.owner_id
     JOIN tasks t ON t.id=g.task_id JOIN users u ON u.id=e.owner_id
     WHERE e.owner_id=? AND e.visibility='PUBLIC' AND e.archived_at IS NULL AND ${eligibleEvidenceSourceSql}
     ORDER BY e.sort_order ASC,e.updated_at DESC,e.id ASC LIMIT 100`, [profile.ownerId, profile.ownerId]
  ) as Array<Record<string, unknown>>;
  const sourcedEvidenceRows = await listSourcedEvidence(Number(profile.ownerId), undefined, "PUBLIC");
  const publicEvidence = ([
    ...evidenceRows.map(row => ({
      id: row.id,
      description: row.description,
      skillIds: parseJsonArray(row.skillIdsJson),
      sourceType: "ONLINE_JUDGE",
      sourceTitle: row.taskTitle,
      sourceLabel: "StudyCod Online Judge · accepted solution",
      sourceDetail: `${Number(row.testsPassed ?? 0)}/${Number(row.testsTotal ?? 0)} tests passed`,
      taskTitle: row.taskTitle,
      language: row.language,
      verificationMethod: "ONLINE_JUDGE",
      judgeVerdict: row.judgeVerdict,
      testsPassed: Number(row.testsPassed ?? 0),
      testsTotal: Number(row.testsTotal ?? 0),
      submittedAt: row.submittedAt,
      sortOrder: Number(row.sortOrder ?? 0),
      updatedAt: row.updatedAt,
    })),
    ...sourcedEvidenceRows.filter(row => row.visibility === "PUBLIC"),
  ] as Array<Record<string, unknown>>).sort(compareEvidenceOrder).map(({ sortOrder: _sortOrder, updatedAt: _updatedAt, visibility: _visibility, sourceKey: _sourceKey, ...row }) => row);
  return res.json({
    profile: {
      username: profile.username,
      displayName: typeof profile.displayName === "string" && profile.displayName.trim() ? profile.displayName.trim() : profile.username,
      headline: profile.headline,
      specialization: profile.specialization,
      technologies: parseJsonArray(profile.technologiesJson, 16),
      summary: profile.summary,
      githubUrl: profile.githubUrl,
      websiteUrl: profile.websiteUrl,
      avatarUrl: Boolean(profile.shareAvatar) ? shareableAvatarUrl(profile.avatarUrl) : null,
    },
    works: works.map(work => ({
      id: work.id, title: work.title, problem: work.problem, solution: work.solution, role: work.role,
      technologies: parseJsonArray(work.technologiesJson), skillIds: parseJsonArray(work.skillIdsJson, 12), repositoryUrl: work.repositoryUrl,
      demoUrl: work.demoUrl, sourcePublicId: work.sourcePublicId,
    })),
    evidence: publicEvidence,
    skills: PORTFOLIO_SKILLS,
  });
});

publicPortfolioRouter.get("/p/:token", async (req, res: Response) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  const token = String(req.params.token ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return sendError(res, 404, "EVIDENCE_PACK_NOT_FOUND");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const grants = await AppDataSource.query(
    `SELECT p.id,p.owner_id AS ownerId,p.title,p.specialization,p.include_profile AS includeProfile,p.work_ids_json AS workIdsJson,
            p.evidence_ids_json AS evidenceIdsJson,p.skill_ids_json AS skillIdsJson,p.expires_at AS expiresAt,u.username,
            u.birth_day AS birthDay,u.birth_month AS birthMonth,u.birth_year AS birthYear
     FROM portfolio_evidence_packs p JOIN users u ON u.id=p.owner_id AND u.user_mode='PERSONAL'
     WHERE p.token_hash=? AND p.revoked_at IS NULL AND p.expires_at>UTC_TIMESTAMP(3) LIMIT 1`, [tokenHash]
  ) as Array<Record<string, unknown>>;
  const grant = grants[0];
  if (!grant || ageStatusFromRow(grant) !== "ADULT") return sendError(res, 404, "EVIDENCE_PACK_NOT_FOUND");
  const workIds = parseJsonArray(grant.workIdsJson, 50);
  const evidenceIds = parseJsonArray(grant.evidenceIdsJson, 50);
  const skillIds = [...new Set(parseJsonArray(grant.skillIdsJson, 12))].filter(id => PORTFOLIO_SKILL_IDS.has(id));
  const [profileRows, workRows, evidenceRows, sourcedEvidenceRows] = await Promise.all([
    Boolean(grant.includeProfile) ? AppDataSource.query(
      `SELECT p.display_name AS displayName,p.headline,p.specialization,p.technologies_json AS technologiesJson,p.summary,
              p.github_url AS githubUrl,p.website_url AS websiteUrl,p.share_avatar AS shareAvatar,
              CASE WHEN p.share_avatar=1 THEN u.avatar_url ELSE NULL END AS avatarUrl
       FROM portfolio_profiles p JOIN users u ON u.id=p.owner_id WHERE p.owner_id=? LIMIT 1`, [grant.ownerId]
    ) as Promise<Array<Record<string, unknown>>> : Promise.resolve([]),
    workIds.length ? AppDataSource.query(
      `SELECT w.id,w.title,w.problem,w.solution,w.role,w.technologies_json AS technologiesJson,w.skill_ids_json AS skillIdsJson,w.sort_order AS sortOrder,
              w.repository_url AS repositoryUrl,w.demo_url AS demoUrl,p.public_id AS sourcePublicId
       FROM portfolio_works w LEFT JOIN growth_project_publications p
         ON p.id=w.source_publication_id AND p.owner_id=w.owner_id AND p.revoked=0
       WHERE w.owner_id=? AND w.archived_at IS NULL AND w.id IN (${workIds.map(() => "?").join(",")})
       ORDER BY w.sort_order ASC,w.created_at DESC`, [grant.ownerId, ...workIds]
    ) as Promise<Array<Record<string, unknown>>> : Promise.resolve([]),
    evidenceIds.length ? AppDataSource.query(
      `SELECT e.id,e.description,e.skill_ids_json AS skillIdsJson,e.sort_order AS sortOrder,e.updated_at AS updatedAt,t.title AS taskTitle,t.lang AS language,
              g.judge_verdict AS judgeVerdict,g.tests_passed AS testsPassed,g.tests_total AS testsTotal,g.created_at AS submittedAt
       FROM portfolio_evidence e JOIN grades g ON g.id=e.source_grade_id AND g.user_id=e.owner_id
       JOIN tasks t ON t.id=g.task_id JOIN users u ON u.id=e.owner_id
       WHERE e.owner_id=? AND e.archived_at IS NULL AND e.id IN (${evidenceIds.map(() => "?").join(",")})
         AND ${eligibleEvidenceSourceSql}
       ORDER BY e.sort_order ASC,e.updated_at DESC,e.id ASC`, [grant.ownerId, ...evidenceIds, grant.ownerId]
    ) as Promise<Array<Record<string, unknown>>> : Promise.resolve([]),
    listSourcedEvidence(Number(grant.ownerId), evidenceIds),
  ]);
  const savedProfile = profileRows[0];
  const profile = Boolean(grant.includeProfile) ? {
    username: grant.username,
    displayName: typeof savedProfile?.displayName === "string" && savedProfile.displayName.trim() ? savedProfile.displayName.trim() : grant.username,
    headline: savedProfile?.headline ?? "",
    specialization: savedProfile?.specialization ?? "",
    technologies: parseJsonArray(savedProfile?.technologiesJson, 16),
    summary: savedProfile?.summary ?? "",
    githubUrl: savedProfile?.githubUrl ?? null,
    websiteUrl: savedProfile?.websiteUrl ?? null,
    avatarUrl: Boolean(savedProfile?.shareAvatar) ? shareableAvatarUrl(savedProfile?.avatarUrl) : null,
  } : null;
  const sharedEvidence = ([
    ...evidenceRows.map(row => ({
      id: row.id,
      description: row.description,
      skillIds: parseJsonArray(row.skillIdsJson),
      sourceType: "ONLINE_JUDGE",
      sourceTitle: row.taskTitle,
      sourceLabel: "StudyCod Online Judge · accepted solution",
      sourceDetail: `${Number(row.testsPassed ?? 0)}/${Number(row.testsTotal ?? 0)} tests passed`,
      taskTitle: row.taskTitle,
      language: row.language,
      verificationMethod: "ONLINE_JUDGE",
      judgeVerdict: row.judgeVerdict,
      testsPassed: Number(row.testsPassed ?? 0),
      testsTotal: Number(row.testsTotal ?? 0),
      submittedAt: row.submittedAt,
      sortOrder: Number(row.sortOrder ?? 0),
      updatedAt: row.updatedAt,
    })),
    ...sourcedEvidenceRows,
  ] as Array<Record<string, unknown>>).sort(compareEvidenceOrder).map(({ sortOrder: _sortOrder, updatedAt: _updatedAt, visibility: _visibility, sourceKey: _sourceKey, ...row }) => row);
  return res.json({
    title: grant.title,
    specialization: grant.specialization,
    skillIds,
    competencies: PORTFOLIO_SKILLS.filter(skill => skillIds.includes(skill.id)),
    expiresAt: grant.expiresAt,
    profile,
    works: workRows.map(work => ({
      id: work.id, title: work.title, problem: work.problem, solution: work.solution, role: work.role,
      technologies: parseJsonArray(work.technologiesJson), skillIds: parseJsonArray(work.skillIdsJson, 12), repositoryUrl: work.repositoryUrl,
      demoUrl: work.demoUrl, sourcePublicId: work.sourcePublicId,
    })),
    evidence: sharedEvidence,
    skills: PORTFOLIO_SKILLS,
  });
});
