import { Router, Response } from "express";
import { z } from "zod";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { getUserOrgRole } from "../../services/edu/membership";
import { roleCan, type Capability } from "../../services/edu/rbac";
import {
  createCourse,
  listCourses,
  getCourseTree,
  addModule,
  addItem,
  setCourseStatus
} from "../../services/edu/courses";
import { assignCourseToClass, hashEduTask } from "../../services/edu/courseFork";
import { computePullDiff, summarizePullDiff, applyPullUpdates, type LocalItemState } from "../../services/edu/coursePull";
import { Course } from "../../entities/Course";
import { CourseModule } from "../../entities/CourseModule";
import { CourseItem } from "../../entities/CourseItem";
import { Class } from "../../entities/Class";
import { CourseAssignment } from "../../entities/CourseAssignment";
import { EduTask } from "../../entities/EduTask";
import { AppDataSource } from "../../data-source";
import { writeAudit } from "../../services/audit/auditLog";
import { logger } from "../../utils/logger";

const router = Router();

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
  capability: Capability
): Promise<boolean> {
  const role = await getUserOrgRole(req.userId!, orgId);
  if (!role || !roleCan(role, capability)) {
    res.status(403).json({ message: "FORBIDDEN" });
    return false;
  }
  return true;
}

/** Resolve the org that owns a course (for nested module/item routes). */
async function courseOrgId(courseId: number): Promise<number | null> {
  const course = await AppDataSource.getRepository(Course).findOne({ where: { id: courseId } });
  return course?.organizationId ?? null;
}

async function moduleOrgId(moduleId: number): Promise<number | null> {
  const mod = await AppDataSource.getRepository(CourseModule).findOne({
    where: { id: moduleId },
    relations: ["course"]
  });
  return mod?.course?.organizationId ?? null;
}

// Create a course template within an org.
router.post("/orgs/:orgId/courses", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) return res.status(400).json({ message: "INVALID_ID" });
    if (!(await requireOrgCapability(req, res, orgId, "CONTENT_AUTHOR"))) return;

    const parsed = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(50_000).optional(),
        runtime: z.string().optional()
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const course = await createCourse({
      orgId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      runtime: parsed.data.runtime,
      createdByUserId: req.userId!
    });
    await writeAudit({
      actorType: "USER",
      actorId: req.userId!,
      action: "course.create",
      targetType: "course",
      targetId: course.id,
      orgId,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.status(201).json({ course: { id: course.id, title: course.title, status: course.status, variants: (course.variants || []).map((v) => ({ id: v.id, runtime: v.runtime, status: v.status })) } });
  } catch (error: any) {
    logger.error("[edu/courses] create failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// List an org's course templates.
router.get("/orgs/:orgId/courses", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) return res.status(400).json({ message: "INVALID_ID" });
    if (!(await requireOrgCapability(req, res, orgId, "CONTENT_AUTHOR"))) return;

    const courses = await listCourses(orgId);
    return res.json({
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        variants: (c.variants || []).map((v) => ({ id: v.id, runtime: v.runtime, status: v.status })),
        updatedAt: c.updatedAt
      }))
    });
  } catch (error: any) {
    logger.error("[edu/courses] list failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Full course tree (modules + items).
router.get("/courses/:courseId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const courseId = parseInt(req.params.courseId, 10);
    if (!Number.isFinite(courseId)) return res.status(400).json({ message: "INVALID_ID" });
    const orgId = await courseOrgId(courseId);
    if (orgId == null) return res.status(404).json({ message: "COURSE_NOT_FOUND" });
    if (!(await requireOrgCapability(req, res, orgId, "CONTENT_AUTHOR"))) return;

    const course = await getCourseTree(courseId, orgId);
    if (!course) return res.status(404).json({ message: "COURSE_NOT_FOUND" });
    return res.json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description ?? null,
        status: course.status,
        variants: (course.variants || []).map((v) => ({ id: v.id, runtime: v.runtime, title: v.title, status: v.status })),
        modules: course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          order: m.order,
          items: m.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, order: i.order, content: i.content ?? null }))
        }))
      }
    });
  } catch (error: any) {
    logger.error("[edu/courses] get tree failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Add a module to a course.
router.post("/courses/:courseId/modules", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const courseId = parseInt(req.params.courseId, 10);
    if (!Number.isFinite(courseId)) return res.status(400).json({ message: "INVALID_ID" });
    const orgId = await courseOrgId(courseId);
    if (orgId == null) return res.status(404).json({ message: "COURSE_NOT_FOUND" });
    if (!(await requireOrgCapability(req, res, orgId, "CONTENT_AUTHOR"))) return;

    const parsed = z.object({ title: z.string().min(1).max(200), order: z.number().int().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const mod = await addModule(courseId, parsed.data.title, parsed.data.order ?? 0);
    return res.status(201).json({ module: { id: mod.id, title: mod.title, order: mod.order } });
  } catch (error: any) {
    logger.error("[edu/courses] add module failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Add an item to a module.
router.post("/modules/:moduleId/items", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const moduleId = parseInt(req.params.moduleId, 10);
    if (!Number.isFinite(moduleId)) return res.status(400).json({ message: "INVALID_ID" });
    const orgId = await moduleOrgId(moduleId);
    if (orgId == null) return res.status(404).json({ message: "MODULE_NOT_FOUND" });
    if (!(await requireOrgCapability(req, res, orgId, "CONTENT_AUTHOR"))) return;

    const parsed = z
      .object({
        kind: z.string(),
        title: z.string().min(1).max(255),
        order: z.number().int().optional(),
        content: z.record(z.string(), z.unknown()).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    try {
      const item = await addItem({
        moduleId,
        kind: parsed.data.kind,
        title: parsed.data.title,
        order: parsed.data.order ?? 0,
        content: parsed.data.content ?? null
      });
      return res.status(201).json({ item: { id: item.id, kind: item.kind, title: item.title, order: item.order } });
    } catch (e: any) {
      if (e?.message === "INVALID_ITEM_KIND") return res.status(400).json({ message: "INVALID_ITEM_KIND" });
      throw e;
    }
  } catch (error: any) {
    logger.error("[edu/courses] add item failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Assign (fork) a published course onto a class.
router.post("/classes/:classId/assign-course", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const classId = parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await AppDataSource.getRepository(Class).findOne({ where: { id: classId } });
    const orgId = cls?.organizationId ?? null;
    if (orgId == null) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    if (!(await requireOrgCapability(req, res, orgId, "CLASS_EDIT"))) return;

    const parsed = z.object({ courseId: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    try {
      const result = await assignCourseToClass({ classId, courseId: parsed.data.courseId, orgId });
      await writeAudit({
        actorType: "USER",
        actorId: req.userId!,
        action: "course.assign",
        targetType: "class",
        targetId: classId,
        orgId,
        metadata: { courseId: parsed.data.courseId, ...result },
        requestId: req.requestId,
        ip: req.ip
      });
      return res.status(201).json({ assignment: result });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg === "COURSE_NOT_FOUND") return res.status(404).json({ message: "COURSE_NOT_FOUND" });
      if (msg === "COURSE_NOT_PUBLISHED") return res.status(409).json({ message: "COURSE_NOT_PUBLISHED" });
      if (msg === "CLASS_NOT_IN_ORG") return res.status(403).json({ message: "CLASS_NOT_IN_ORG" });
      throw e;
    }
  } catch (error: any) {
    logger.error("[edu/courses] assign failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Pull-diff: what changed between the class's forked copy and the course now.
router.get("/classes/:classId/course-updates", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const classId = parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await AppDataSource.getRepository(Class).findOne({ where: { id: classId } });
    const orgId = cls?.organizationId ?? null;
    if (orgId == null) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    if (!(await requireOrgCapability(req, res, orgId, "CLASS_EDIT"))) return;

    // Latest assignment for this class.
    const assignment = await AppDataSource.getRepository(CourseAssignment).findOne({
      where: { class: { id: classId } },
      relations: ["course"],
      order: { forkedAt: "DESC" }
    });
    if (!assignment) return res.json({ assigned: false, summary: null, entries: [] });

    const originMap = assignment.originMap ?? {};

    // Upstream: current course items.
    const modules = await AppDataSource.getRepository(CourseModule).find({
      where: { course: { id: assignment.courseId } }
    });
    const upstream: CourseItem[] = [];
    for (const m of modules) {
      const items = await AppDataSource.getRepository(CourseItem).find({ where: { module: { id: m.id } } });
      upstream.push(...items);
    }

    // Local: current EduTask hashes keyed by source item id.
    const localStates: LocalItemState[] = [];
    for (const [key, origin] of Object.entries(originMap)) {
      const taskId = origin.eduTaskId ?? null;
      let localHash: string | null = null;
      let title: string | null = null;
      if (taskId != null) {
        const task = await AppDataSource.getRepository(EduTask).findOne({ where: { id: taskId } });
        if (task) {
          localHash = hashEduTask(task);
          title = task.title;
        }
      }
      localStates.push({ sourceItemId: Number(key), localHash, title });
    }

    const entries = computePullDiff(originMap, upstream, localStates);
    return res.json({
      assigned: true,
      courseId: assignment.courseId,
      summary: summarizePullDiff(entries),
      entries
    });
  } catch (error: any) {
    logger.error("[edu/courses] course-updates failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Apply selected upstream updates to the class's forked tasks.
router.post("/classes/:classId/course-updates/apply", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const classId = parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await AppDataSource.getRepository(Class).findOne({ where: { id: classId } });
    const orgId = cls?.organizationId ?? null;
    if (orgId == null) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    if (!(await requireOrgCapability(req, res, orgId, "CLASS_EDIT"))) return;

    const parsed = z
      .object({ sourceItemIds: z.array(z.number().int()).min(1).max(500), removeDeleted: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    try {
      const result = await applyPullUpdates(classId, orgId, parsed.data.sourceItemIds, {
        removeDeleted: parsed.data.removeDeleted
      });
      await writeAudit({
        actorType: "USER",
        actorId: req.userId!,
        action: "course.pull.apply",
        targetType: "class",
        targetId: classId,
        orgId,
        metadata: { ...result, requested: parsed.data.sourceItemIds.length },
        requestId: req.requestId,
        ip: req.ip
      });
      return res.json({ result });
    } catch (e: any) {
      if (String(e?.message) === "ASSIGNMENT_NOT_FOUND") return res.status(404).json({ message: "ASSIGNMENT_NOT_FOUND" });
      throw e;
    }
  } catch (error: any) {
    logger.error("[edu/courses] pull apply failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Publish / unpublish a course.
router.put("/courses/:courseId/status", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const courseId = parseInt(req.params.courseId, 10);
    if (!Number.isFinite(courseId)) return res.status(400).json({ message: "INVALID_ID" });
    const orgId = await courseOrgId(courseId);
    if (orgId == null) return res.status(404).json({ message: "COURSE_NOT_FOUND" });
    if (!(await requireOrgCapability(req, res, orgId, "CONTENT_AUTHOR"))) return;

    const parsed = z.object({ status: z.enum(["DRAFT", "PUBLISHED"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const course = await setCourseStatus(courseId, orgId, parsed.data.status);
    if (!course) return res.status(404).json({ message: "COURSE_NOT_FOUND" });
    return res.json({ course: { id: course.id, status: course.status } });
  } catch (error: any) {
    logger.error("[edu/courses] set status failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
