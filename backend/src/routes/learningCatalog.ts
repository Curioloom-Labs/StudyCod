import { Router, Response } from "express";
import { z } from "zod";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { checkCourseProject, completeCourseItem, enrollInCourseVariant, getCourseForUser, getCourseProject, getEnrollmentIad, getLearningCatalog, getLearningMe, passFinalAssessment, runCourseProject, saveCourseProject, setCurrentCourseEnrollment, submitCourseProject } from "../services/learningCatalogService";
import { normalizeUiLocale, resolveUiLocaleFromHeaders, type UiLocale } from "../utils/uiLocale";

export const learningCatalogRouter = Router();

function requestLocale(req: AuthRequest): UiLocale {
  return normalizeUiLocale((req.query as any)?.uiLang, resolveUiLocaleFromHeaders(req.headers, "uk"));
}

learningCatalogRouter.get("/me", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  return res.json(await getLearningMe(req.userId, requestLocale(req)));
});

learningCatalogRouter.put("/me/current-course", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  const enrollmentId = Number((req.body as any)?.enrollmentId);
  if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    const enrollment = await setCurrentCourseEnrollment(req.userId, enrollmentId);
    return res.json({ enrollment: {
      id: enrollment.id,
      courseId: enrollment.courseId,
      variantId: enrollment.variantId,
      status: enrollment.status,
    } });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR") });
  }
});

learningCatalogRouter.get("/catalog", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  return res.json({ courses: await getLearningCatalog(req.userId, requestLocale(req)) });
});

learningCatalogRouter.get("/courses/:courseId", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  const courseId = Number(req.params.courseId);
  if (!Number.isFinite(courseId)) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    return res.json({ course: await getCourseForUser(req.userId, courseId, requestLocale(req)) });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR"), prerequisites: error?.prerequisites });
  }
});

learningCatalogRouter.post("/courses/:courseId/enroll", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  const courseId = Number(req.params.courseId);
  const parsed = z.object({ variantId: z.number().int().positive() }).safeParse(req.body);
  if (!Number.isFinite(courseId) || !parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    const enrollment = await enrollInCourseVariant(req.userId, parsed.data.variantId, courseId);
    return res.status(201).json({ enrollment: {
      id: enrollment.id,
      courseId: enrollment.courseId,
      variantId: enrollment.variantId,
      status: enrollment.status,
      completionPercent: enrollment.completionPercent,
      masteryScore: enrollment.masteryScore,
    } });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR"), prerequisites: error?.prerequisites, theoryItemId: error?.theoryItemId });
  }
});

learningCatalogRouter.post("/items/:itemId/complete", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  const itemId = Number(req.params.itemId);
  const parsed = z.object({ score: z.number().min(0).max(100).optional() }).safeParse(req.body ?? {});
  if (!Number.isFinite(itemId) || !parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    const enrollment = await completeCourseItem(req.userId, itemId, parsed.data.score);
    return res.json({ enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      completionPercent: enrollment.completionPercent,
      masteryScore: enrollment.masteryScore,
      finalAssessmentPassed: enrollment.finalAssessmentPassed,
    } });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR"), prerequisites: error?.prerequisites, theoryItemId: error?.theoryItemId });
  }
});

const projectProgressSchema = z.object({
  milestoneIds: z.array(z.string().trim().min(1)).max(100),
  draft: z.string().max(100_000),
  files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) })).max(64).optional(),
  // Kept optional for old clients; README is no longer part of the project contract.
  readme: z.string().max(30_000).optional(),
});

const projectCheckSchema = z.object({
  files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) })).min(1).max(64),
});

const projectRunSchema = z.object({
  files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) })).min(1).max(64),
  stdin: z.string().max(100_000).default(""),
});

learningCatalogRouter.get("/items/:itemId/project", authRequired, async (req: AuthRequest, res: Response) => {
  // A mini-project is a learner-facing course item. The previous guard
  // accidentally rejected the normal STUDENT role, so the roadmap could
  // render the card but never load its specification.
  if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(itemId)) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    return res.json({ project: await getCourseProject(req.userId, itemId, requestLocale(req)) });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR"), prerequisites: error?.prerequisites });
  }
});

learningCatalogRouter.put("/items/:itemId/project", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
  const itemId = Number(req.params.itemId);
  const parsed = projectProgressSchema.safeParse(req.body ?? {});
  if (!Number.isFinite(itemId) || !parsed.success) return res.status(400).json({ message: "INVALID_INPUT", issues: parsed.success ? undefined : parsed.error.issues });
  try {
    const result = await saveCourseProject(req.userId, itemId, parsed.data);
    return res.json({ project: result.project, enrollment: { id: result.enrollment.id, status: result.enrollment.status, completionPercent: result.enrollment.completionPercent } });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR"), prerequisites: error?.prerequisites });
  }
});

learningCatalogRouter.post("/items/:itemId/project/check", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
  const itemId = Number(req.params.itemId);
  const parsed = projectCheckSchema.safeParse(req.body ?? {});
  if (!Number.isFinite(itemId) || !parsed.success) return res.status(400).json({ message: "INVALID_INPUT", issues: parsed.success ? undefined : parsed.error.issues });
  try {
    return res.json({ check: await checkCourseProject(req.userId, itemId, parsed.data.files) });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR") });
  }
});

learningCatalogRouter.post("/items/:itemId/project/run", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
  const itemId = Number(req.params.itemId);
  const parsed = projectRunSchema.safeParse(req.body ?? {});
  if (!Number.isFinite(itemId) || !parsed.success) return res.status(400).json({ message: "INVALID_INPUT", issues: parsed.success ? undefined : parsed.error.issues });
  try {
    return res.json({ result: await runCourseProject(req.userId, itemId, parsed.data.files, parsed.data.stdin) });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR") });
  }
});

learningCatalogRouter.post("/items/:itemId/project/submit", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
  const itemId = Number(req.params.itemId);
  const parsed = projectProgressSchema.safeParse(req.body ?? {});
  if (!Number.isFinite(itemId) || !parsed.success) return res.status(400).json({ message: "INVALID_INPUT", issues: parsed.success ? undefined : parsed.error.issues });
  try {
    const result = await submitCourseProject(req.userId, itemId, parsed.data);
    return res.json({ project: result.project, enrollment: { id: result.enrollment.id, status: result.enrollment.status, completionPercent: result.enrollment.completionPercent } });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR"), prerequisites: error?.prerequisites });
  }
});

learningCatalogRouter.get("/enrollments/:enrollmentId/iad", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  const enrollmentId = Number(req.params.enrollmentId);
  if (!Number.isFinite(enrollmentId)) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    return res.json({ iad: await getEnrollmentIad(req.userId, enrollmentId) });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR") });
  }
});

learningCatalogRouter.post("/enrollments/:enrollmentId/final-assessment", authRequired, async (req: AuthRequest, res: Response) => {
  if (!req.userId || req.userType === "STUDENT") return res.status(403).json({ message: "ONLY_USERS" });
  const enrollmentId = Number(req.params.enrollmentId);
  const parsed = z.object({}).safeParse(req.body ?? {});
  if (!Number.isFinite(enrollmentId) || !parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
  try {
    const enrollment = await passFinalAssessment(req.userId, enrollmentId);
    return res.json({ enrollment: { id: enrollment.id, status: enrollment.status, completionPercent: enrollment.completionPercent, finalAssessmentPassed: enrollment.finalAssessmentPassed } });
  } catch (error: any) {
    return res.status(Number(error?.statusCode) || 500).json({ message: String(error?.message || "INTERNAL_SERVER_ERROR") });
  }
});
