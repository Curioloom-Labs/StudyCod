import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { Class } from "../../entities/Class";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { createOrganization, listUserMemberships, listOrgMembers, getUserOrgRole } from "../../services/edu/membership";
import {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listPendingInvitations
} from "../../services/edu/invitations";
import { listChildren } from "../../services/edu/parentLinks";
import { roleCan } from "../../services/edu/rbac";
import { normalizeOrgRole } from "../../types/OrgRole";
import { writeAudit } from "../../services/audit/auditLog";
import { logger } from "../../utils/logger";

const router = Router();
const studentRepo = () => AppDataSource.getRepository(Student);
const classRepo = () => AppDataSource.getRepository(Class);

/** New endpoints → real authorization from day one (no legacy to shadow). */
function requireUser(req: AuthRequest, res: Response): boolean {
  if (!req.userId || req.userType === "STUDENT" || req.studentId) {
    res.status(403).json({ message: "ONLY_USERS" });
    return false;
  }
  return true;
}

async function requireOrgCapability(
  req: AuthRequest,
  res: Response,
  orgId: number,
  capability: Parameters<typeof roleCan>[1]
): Promise<boolean> {
  const role = await getUserOrgRole(req.userId!, orgId);
  if (!role || !roleCan(role, capability)) {
    res.status(403).json({ message: "FORBIDDEN" });
    return false;
  }
  return true;
}

// Self-signup: any authenticated user can create an org and becomes its ORG_ADMIN.
router.post("/orgs", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const parsed = z.object({ name: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const org = await createOrganization(parsed.data.name, req.userId!);
    await writeAudit({
      actorType: "USER",
      actorId: req.userId!,
      action: "org.create",
      targetType: "organization",
      targetId: org.id,
      orgId: org.id,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.status(201).json({ org: { id: org.id, name: org.name, slug: org.slug } });
  } catch (error: any) {
    logger.error("[edu/orgs] create org failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// List the orgs the caller belongs to, with their role.
router.get("/orgs", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const memberships = await listUserMemberships(req.userId!);
    return res.json({
      orgs: memberships.map((m) => ({
        orgId: m.organizationId,
        role: m.role,
        name: m.organization?.name ?? null,
        slug: m.organization?.slug ?? null
      }))
    });
  } catch (error: any) {
    logger.error("[edu/orgs] list orgs failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// List an org's members (MEMBER_MANAGE).
router.get("/orgs/:orgId/members", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) return res.status(400).json({ message: "INVALID_ID" });
    if (!(await requireOrgCapability(req, res, orgId, "MEMBER_MANAGE"))) return;

    const members = await listOrgMembers(orgId);
    return res.json({
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        username: m.user?.username ?? null,
        name: `${m.user?.firstName ?? ""} ${m.user?.lastName ?? ""}`.trim() || null,
        email: m.user?.email ?? null
      }))
    });
  } catch (error: any) {
    logger.error("[edu/orgs] list members failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Issue an invitation (ORG_ADMIN-level: MEMBER_MANAGE).
router.post("/orgs/:orgId/invites", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) return res.status(400).json({ message: "INVALID_ID" });
    if (!(await requireOrgCapability(req, res, orgId, "MEMBER_MANAGE"))) return;

    const parsed = z
      .object({ email: z.string().email(), role: z.string() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const role = normalizeOrgRole(parsed.data.role);
    if (!role) return res.status(400).json({ message: "INVALID_ROLE" });

    const invite = await createInvitation({
      orgId,
      email: parsed.data.email,
      role,
      invitedByUserId: req.userId!
    });
    await writeAudit({
      actorType: "USER",
      actorId: req.userId!,
      action: "org.invite.create",
      targetType: "organization",
      targetId: orgId,
      orgId,
      metadata: { email: invite.email, role: invite.role },
      requestId: req.requestId,
      ip: req.ip
    });
    return res.status(201).json({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token: invite.token,
        status: invite.status,
        expiresAt: invite.expiresAt
      }
    });
  } catch (error: any) {
    logger.error("[edu/orgs] create invite failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// List pending invitations for an org (MEMBER_MANAGE).
router.get("/orgs/:orgId/invites", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) return res.status(400).json({ message: "INVALID_ID" });
    if (!(await requireOrgCapability(req, res, orgId, "MEMBER_MANAGE"))) return;

    const invites = await listPendingInvitations(orgId);
    return res.json({
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt
      }))
    });
  } catch (error: any) {
    logger.error("[edu/orgs] list invites failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Revoke a pending invitation (MEMBER_MANAGE).
router.post("/orgs/:orgId/invites/:invitationId/revoke", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    const invitationId = parseInt(req.params.invitationId, 10);
    if (!Number.isFinite(orgId) || !Number.isFinite(invitationId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    if (!(await requireOrgCapability(req, res, orgId, "MEMBER_MANAGE"))) return;

    const ok = await revokeInvitation(invitationId, orgId);
    if (!ok) return res.status(404).json({ message: "INVITE_NOT_FOUND" });
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error("[edu/orgs] revoke invite failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Invite a parent and link them to a specific student (teacher-level: STUDENT_MANAGE).
router.post("/orgs/:orgId/parent-invites", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) return res.status(400).json({ message: "INVALID_ID" });
    if (!(await requireOrgCapability(req, res, orgId, "STUDENT_MANAGE"))) return;

    const parsed = z
      .object({ email: z.string().email(), studentId: z.number().int().positive() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    // The student must belong to this org (via their class).
    const student = await studentRepo().findOne({ where: { id: parsed.data.studentId }, relations: ["class"] });
    if (!student || student.class?.organizationId !== orgId) {
      return res.status(404).json({ message: "STUDENT_NOT_IN_ORG" });
    }

    const invite = await createInvitation({
      orgId,
      email: parsed.data.email,
      role: "PARENT",
      studentId: student.id,
      invitedByUserId: req.userId!
    });
    await writeAudit({
      actorType: "USER",
      actorId: req.userId!,
      action: "org.parent_invite.create",
      targetType: "student",
      targetId: student.id,
      orgId,
      metadata: { email: invite.email },
      requestId: req.requestId,
      ip: req.ip
    });
    return res.status(201).json({
      invite: { id: invite.id, email: invite.email, role: invite.role, token: invite.token, expiresAt: invite.expiresAt }
    });
  } catch (error: any) {
    logger.error("[edu/orgs] create parent invite failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// A parent lists their linked children.
router.get("/parent/children", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const children = await listChildren(req.userId!);
    return res.json({
      children: children.map((s) => ({
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        classId: s.class?.id ?? null
      }))
    });
  } catch (error: any) {
    logger.error("[edu/orgs] list children failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Accept an invitation as the authenticated user.
router.post("/invites/:token/accept", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const token = String(req.params.token ?? "").trim();
    if (!token) return res.status(400).json({ message: "INVALID_TOKEN" });

    const result = await acceptInvitation(token, req.userId!);
    await writeAudit({
      actorType: "USER",
      actorId: req.userId!,
      action: "org.invite.accept",
      targetType: "organization",
      targetId: result.orgId,
      orgId: result.orgId,
      metadata: { role: result.role },
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({ orgId: result.orgId, role: result.role });
  } catch (error: any) {
    if (error instanceof Error && error.message === "INVALID_INVITE") {
      return res.status(400).json({ message: "INVALID_INVITE" });
    }
    logger.error("[edu/orgs] accept invite failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Org-wide overview for admins (Tier 3): totals + per-class summary.
router.get("/orgs/:orgId/overview", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) return res.status(400).json({ message: "INVALID_ID" });
    if (!(await requireOrgCapability(req, res, orgId, "MEMBER_MANAGE"))) return;

    const classes = await classRepo().find({ where: { organizationId: orgId }, relations: ["teacher"] });
    const ids = classes.map((c) => c.id);

    const countRows = ids.length
      ? await studentRepo()
          .createQueryBuilder("s")
          .select("s.class_id", "classId")
          .addSelect("COUNT(*)", "cnt")
          .where("s.class_id IN (:...ids)", { ids })
          .groupBy("s.class_id")
          .getRawMany()
      : [];
    const countByClass = new Map<number, number>(countRows.map((r) => [Number(r.classId), Number(r.cnt)]));

    const classSummaries = classes.map((c) => ({
      id: c.id,
      name: c.name,
      language: c.language,
      studentsCount: countByClass.get(c.id) ?? 0,
      teacherName: c.teacher ? `${c.teacher.firstName ?? ""} ${c.teacher.lastName ?? ""}`.trim() || c.teacher.username : null
    }));

    const teacherIds = new Set<number>();
    for (const c of classes) if (c.teacher?.id) teacherIds.add(c.teacher.id);

    return res.json({
      totals: {
        classes: classes.length,
        students: classSummaries.reduce((s, c) => s + c.studentsCount, 0),
        teachers: teacherIds.size
      },
      classes: classSummaries
    });
  } catch (error: any) {
    logger.error("[edu/orgs] overview failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
