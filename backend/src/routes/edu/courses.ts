import { Router, Response } from "express";
import { z } from "zod";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeOrgAction } from "../../services/edu/classAccess";
import type { Capability } from "../../services/edu/rbac";
import {
  createCourse,
  listCourses,
  getCourseTree,
  addModule,
  addItem,
  setCourseStatus,
  createGlobalCourse,
  listGlobalCourses,
  attachPrecedingTheoryReference,
  authoredCoursePublishIssues,
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
import { markCurriculumAuthoringOverrides } from "../../services/curriculumAuthoringOverrides";

const router = Router();

function errorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "";
}

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
  const access = await authorizeOrgAction(req.userId!, orgId, capability, {
    isSystemAdmin: req.userRole === "SYSTEM_ADMIN"
  });
  if (!access || !access.allowed) {
    res.status(403).json({ message: "FORBIDDEN" });
    return false;
  }
  return true;
}

async function getAuthorableCourse(req: AuthRequest, res: Response, courseId: number): Promise<Course | null> {
  const course = await AppDataSource.getRepository(Course).findOne({ where: { id: courseId }, relations: ["organization"] });
  if (!course) {
    res.status(404).json({ message: "COURSE_NOT_FOUND" });
    return null;
  }
  if (course.organizationId != null) {
    if (!(await requireOrgCapability(req, res, course.organizationId, "CONTENT_AUTHOR"))) return null;
    return course;
  }
  // YAML remains the baseline for catalog courses, while system-admin edits are
  // recorded as per-field overrides so later syncs can update untouched fields.
  if (req.userRole === "SYSTEM_ADMIN") return course;
  res.status(404).json({ message: "COURSE_NOT_FOUND" });
  return null;
}

async function getAuthorableModule(req: AuthRequest, res: Response, moduleId: number): Promise<CourseModule | null> {
  const module = await AppDataSource.getRepository(CourseModule).findOne({ where: { id: moduleId }, relations: ["course"] });
  if (!module) {
    res.status(404).json({ message: "MODULE_NOT_FOUND" });
    return null;
  }
  if (!(await getAuthorableCourse(req, res, module.courseId))) return null;
  return module;
}

router.get("/global/courses", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    if (req.userRole !== "SYSTEM_ADMIN") return res.status(403).json({ message: "FORBIDDEN" });
    const courses = await listGlobalCourses();
    return res.json({ courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description ?? null,
      catalogKey: course.catalogKey ?? null,
      isSourceManagedCourse: Boolean(course.catalogKey),
      hasAuthoringOverrides: Object.keys(course.authoringOverrides ?? {}).length > 0,
      status: course.status,
      variants: (course.variants ?? []).map((variant) => ({ id: variant.id, runtime: variant.runtime, status: variant.status })),
      updatedAt: course.updatedAt,
    })) });
  } catch (error: unknown) {
    logger.error("[edu/courses] global list failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/global/courses", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    if (req.userRole !== "SYSTEM_ADMIN") return res.status(403).json({ message: "FORBIDDEN" });
    const parsed = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().max(50_000).optional(),
      runtime: z.enum(["JAVA", "PYTHON", "CPP"]).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    const course = await createGlobalCourse({ ...parsed.data, createdByUserId: req.userId! });
    await writeAudit({
      actorType: "USER", actorId: req.userId!, action: "global_course.create", targetType: "course", targetId: course.id,
      requestId: req.requestId, ip: req.ip,
    });
    return res.status(201).json({ course: {
      id: course.id, title: course.title, description: course.description ?? null, status: course.status,
      variants: (course.variants ?? []).map((variant) => ({ id: variant.id, runtime: variant.runtime, status: variant.status })),
    } });
  } catch (error: unknown) {
    logger.error("[edu/courses] global create failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
    const authorable = await getAuthorableCourse(req, res, courseId);
    if (!authorable) return;

    const course = await getCourseTree(courseId, authorable.organizationId ?? null);
    if (!course) return res.status(404).json({ message: "COURSE_NOT_FOUND" });
    return res.json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description ?? null,
        status: course.status,
        isGlobalCatalogCourse: course.organizationId == null && !course.catalogKey,
        isSourceManagedCourse: Boolean(course.catalogKey),
        hasAuthoringOverrides: Object.keys(course.authoringOverrides ?? {}).length > 0,
        variants: (course.variants || []).map((v) => ({ id: v.id, runtime: v.runtime, title: v.title, status: v.status })),
        modules: course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          order: m.order,
          items: m.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, order: i.order, content: i.content ?? null }))
        }))
      }
    });
  } catch (error: unknown) {
    logger.error("[edu/courses] get tree failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/courses/:courseId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const courseId = parseInt(req.params.courseId, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const authorable = await getAuthorableCourse(req, res, courseId);
    if (!authorable) return;
    const parsed = z.object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(50_000).nullable().optional(),
    }).refine((value) => value.title !== undefined || value.description !== undefined).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    if (parsed.data.title !== undefined) authorable.title = parsed.data.title;
    if (parsed.data.description !== undefined) authorable.description = parsed.data.description;
    if (authorable.catalogKey) {
      authorable.authoringOverrides = markCurriculumAuthoringOverrides(
        authorable.authoringOverrides,
        [
          ...(parsed.data.title !== undefined ? ["title"] : []),
          ...(parsed.data.description !== undefined ? ["description"] : []),
        ],
      );
    }
    const saved = await AppDataSource.getRepository(Course).save(authorable);
    await writeAudit({
      actorType: "USER", actorId: req.userId!, action: "course.update", targetType: "course", targetId: saved.id,
      orgId: saved.organizationId ?? null, requestId: req.requestId, ip: req.ip,
    });
    return res.json({ course: { id: saved.id, title: saved.title, description: saved.description ?? null, status: saved.status } });
  } catch (error: unknown) {
    logger.error("[edu/courses] update course failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.delete("/courses/:courseId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isSafeInteger(courseId) || courseId <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const course = await getAuthorableCourse(req, res, courseId);
    if (!course) return;
    if (course.catalogKey) return res.status(409).json({ message: "SOURCE_MANAGED_COURSE_DELETE_UNSUPPORTED" });

    await AppDataSource.getRepository(Course).delete({ id: courseId });
    await writeAudit({
      actorType: "USER", actorId: req.userId!, action: "course.delete", targetType: "course", targetId: courseId,
      orgId: course.organizationId ?? null, requestId: req.requestId, ip: req.ip,
    });
    return res.json({ deleted: true, courseId });
  } catch (error: unknown) {
    logger.error("[edu/courses] delete course failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Add a module to a course.
router.post("/courses/:courseId/modules", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const courseId = parseInt(req.params.courseId, 10);
    if (!Number.isFinite(courseId)) return res.status(400).json({ message: "INVALID_ID" });
    const authorableCourse = await getAuthorableCourse(req, res, courseId);
    if (!authorableCourse) return;
    if (authorableCourse.catalogKey && authorableCourse.status === "PUBLISHED") {
      return res.status(409).json({ message: "COURSE_MUST_BE_DRAFT_TO_EDIT_STRUCTURE" });
    }

    const parsed = z.object({ title: z.string().min(1).max(200), order: z.number().int().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const mod = await addModule(courseId, parsed.data.title, parsed.data.order ?? 0);
    return res.status(201).json({ module: { id: mod.id, title: mod.title, order: mod.order } });
  } catch (error: unknown) {
    logger.error("[edu/courses] add module failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/modules/:moduleId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const moduleId = parseInt(req.params.moduleId, 10);
    if (!Number.isInteger(moduleId) || moduleId <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const module = await getAuthorableModule(req, res, moduleId);
    if (!module) return;
    const parsed = z.object({
      title: z.string().trim().min(1).max(200).optional(),
      order: z.number().int().min(0).max(100_000).optional(),
    }).refine((value) => value.title !== undefined || value.order !== undefined).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    if (parsed.data.title !== undefined) module.title = parsed.data.title;
    if (parsed.data.order !== undefined) module.order = parsed.data.order;
    if (module.course.catalogKey) {
      module.authoringOverrides = markCurriculumAuthoringOverrides(
        module.authoringOverrides,
        [
          ...(parsed.data.title !== undefined ? ["title"] : []),
          ...(parsed.data.order !== undefined ? ["order"] : []),
        ],
      );
    }
    const saved = await AppDataSource.getRepository(CourseModule).save(module);
    return res.json({ module: { id: saved.id, title: saved.title, order: saved.order } });
  } catch (error: unknown) {
    logger.error("[edu/courses] update module failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.delete("/modules/:moduleId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const moduleId = Number(req.params.moduleId);
    if (!Number.isSafeInteger(moduleId) || moduleId <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const module = await getAuthorableModule(req, res, moduleId);
    if (!module) return;
    if (module.course.catalogKey) return res.status(409).json({ message: "SOURCE_MANAGED_COURSE_DELETE_UNSUPPORTED" });

    await AppDataSource.getRepository(CourseModule).delete({ id: moduleId });
    await writeAudit({
      actorType: "USER", actorId: req.userId!, action: "course.module.delete", targetType: "course_module", targetId: moduleId,
      orgId: module.course.organizationId ?? null, requestId: req.requestId, ip: req.ip,
    });
    return res.json({ deleted: true, moduleId });
  } catch (error: unknown) {
    logger.error("[edu/courses] delete module failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Add an item to a module.
router.post("/modules/:moduleId/items", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const moduleId = parseInt(req.params.moduleId, 10);
    if (!Number.isFinite(moduleId)) return res.status(400).json({ message: "INVALID_ID" });
    const authorableModule = await getAuthorableModule(req, res, moduleId);
    if (!authorableModule) return;
    if (authorableModule.course.catalogKey && authorableModule.course.status === "PUBLISHED") {
      return res.status(409).json({ message: "COURSE_MUST_BE_DRAFT_TO_EDIT_STRUCTURE" });
    }

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
    } catch (e: unknown) {
      if (errorMessage(e) === "INVALID_ITEM_KIND") return res.status(400).json({ message: "INVALID_ITEM_KIND" });
      throw e;
    }
  } catch (error: unknown) {
    logger.error("[edu/courses] add item failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/items/:itemId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const itemId = parseInt(req.params.itemId, 10);
    if (!Number.isInteger(itemId) || itemId <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const item = await AppDataSource.getRepository(CourseItem).findOne({ where: { id: itemId }, relations: ["module", "module.course"] });
    if (!item) return res.status(404).json({ message: "ITEM_NOT_FOUND" });
    const authorableCourse = await getAuthorableCourse(req, res, item.module.courseId);
    if (!authorableCourse) return;
    const parsed = z.object({
      kind: z.string().optional(),
      title: z.string().trim().min(1).max(255).optional(),
      order: z.number().int().min(0).max(100_000).optional(),
      content: z.record(z.string(), z.unknown()).nullable().optional(),
    }).refine((value) => value.kind !== undefined || value.title !== undefined || value.order !== undefined || value.content !== undefined).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    if (parsed.data.kind !== undefined) {
      if (!(["THEORY", "PAGE", "CODE_TASK", "WEB_TASK", "QUIZ", "MANUAL"] as string[]).includes(parsed.data.kind)) return res.status(400).json({ message: "INVALID_ITEM_KIND" });
      item.kind = parsed.data.kind as CourseItem["kind"];
    }
    if (parsed.data.title !== undefined) item.title = parsed.data.title;
    if (parsed.data.order !== undefined) item.order = parsed.data.order;
    if (parsed.data.content !== undefined) item.content = parsed.data.content;
    if (item.module.course.catalogKey) {
      item.authoringOverrides = markCurriculumAuthoringOverrides(
        item.authoringOverrides,
        [
          ...(parsed.data.kind !== undefined ? ["kind"] : []),
          ...(parsed.data.title !== undefined ? ["title"] : []),
          ...(parsed.data.order !== undefined ? ["order"] : []),
          ...(parsed.data.content !== undefined ? ["content"] : []),
        ],
      );
    }
    if (authorableCourse.catalogKey && authorableCourse.status === "PUBLISHED") {
      const modules = await AppDataSource.getRepository(CourseModule).find({
        where: { course: { id: authorableCourse.id } },
        relations: ["items"],
        order: { order: "ASC" },
      });
      const issues = authoredCoursePublishIssues(modules.map((module) => ({
        id: module.id,
        items: module.items.map((entry) => entry.id === item.id ? item : entry),
      })));
      if (issues.length) return res.status(409).json({ message: "COURSE_CONTENT_INCOMPLETE", issues });
    }
    const saved = await AppDataSource.getRepository(CourseItem).save(item);
    if (authorableCourse.organizationId == null && !authorableCourse.catalogKey) {
      const moduleItems = await AppDataSource.getRepository(CourseItem).find({ where: { module: { id: item.moduleId } }, order: { order: "ASC" } });
      const theoryItems = moduleItems.filter((entry) => entry.kind === "THEORY" || entry.kind === "PAGE");
      const generatedPractice = moduleItems.filter((entry) => entry.kind === "CODE_TASK" && entry.content?.generatedAfterTheory === true);
      for (const practice of generatedPractice) {
        practice.content = attachPrecedingTheoryReference(practice.content ?? {}, practice.order, theoryItems, true);
      }
      if (generatedPractice.length) await AppDataSource.getRepository(CourseItem).save(generatedPractice);
    }
    await writeAudit({
      actorType: "USER", actorId: req.userId!, action: "course_item.update", targetType: "course_item", targetId: saved.id,
      orgId: item.module.course.organizationId ?? null, requestId: req.requestId, ip: req.ip,
    });
    return res.json({ item: { id: saved.id, kind: saved.kind, title: saved.title, order: saved.order, content: saved.content ?? null } });
  } catch (error: unknown) {
    logger.error("[edu/courses] update item failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.delete("/items/:itemId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireUser(req, res)) return;
    const itemId = Number(req.params.itemId);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const item = await AppDataSource.getRepository(CourseItem).findOne({ where: { id: itemId }, relations: ["module", "module.course"] });
    if (!item) return res.status(404).json({ message: "ITEM_NOT_FOUND" });
    const course = await getAuthorableCourse(req, res, item.module.courseId);
    if (!course) return;
    if (course.catalogKey) return res.status(409).json({ message: "SOURCE_MANAGED_COURSE_DELETE_UNSUPPORTED" });

    await AppDataSource.getRepository(CourseItem).delete({ id: itemId });
    await writeAudit({
      actorType: "USER", actorId: req.userId!, action: "course.item.delete", targetType: "course_item", targetId: itemId,
      orgId: course.organizationId ?? null, requestId: req.requestId, ip: req.ip,
    });
    return res.json({ deleted: true, itemId });
  } catch (error: unknown) {
    logger.error("[edu/courses] delete item failed", { requestId: req.requestId, err: error });
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
    } catch (e: unknown) {
      const msg = errorMessage(e);
      if (msg === "COURSE_NOT_FOUND") return res.status(404).json({ message: "COURSE_NOT_FOUND" });
      if (msg === "COURSE_NOT_PUBLISHED") return res.status(409).json({ message: "COURSE_NOT_PUBLISHED" });
      if (msg === "CLASS_NOT_IN_ORG") return res.status(403).json({ message: "CLASS_NOT_IN_ORG" });
      throw e;
    }
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
    } catch (e: unknown) {
      if (errorMessage(e) === "ASSIGNMENT_NOT_FOUND") return res.status(404).json({ message: "ASSIGNMENT_NOT_FOUND" });
      throw e;
    }
  } catch (error: unknown) {
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
    const authorable = await getAuthorableCourse(req, res, courseId);
    if (!authorable) return;

    const parsed = z.object({ status: z.enum(["DRAFT", "PUBLISHED"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const course = await setCourseStatus(courseId, authorable.organizationId ?? null, parsed.data.status);
    if (!course) return res.status(404).json({ message: "COURSE_NOT_FOUND" });
    return res.json({ course: { id: course.id, status: course.status } });
  } catch (error: unknown) {
    if (errorMessage(error) === "COURSE_CONTENT_INCOMPLETE") {
      const issues = typeof error === "object" && error !== null && "issues" in error && Array.isArray(error.issues) ? error.issues : [];
      return res.status(409).json({ message: "COURSE_CONTENT_INCOMPLETE", issues });
    }
    logger.error("[edu/courses] set status failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
