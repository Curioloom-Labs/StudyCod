import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { requireClassCapability, type ClassAccessRequest } from "../../middleware/orgContext";
import { authorizeStudentAction } from "../../services/edu/classAccess";
import type { Capability } from "../../services/edu/rbac";
import { Student } from "../../entities/Student";
import { provisionStudents, studentInputSchema } from "../../services/edu/studentProvision";
import { parseStudentRoster, csvCell } from "../../services/edu/studentRoster";
import { resetStudentPasswords } from "../../services/edu/studentPasswords";
import { getCredentialOperation, listCredentialOperations, closeCredentialOperation, type CredentialOperationOptions } from "../../services/edu/credentialOperations";
import { writeAudit, writeSensitiveStudentRead } from "../../services/audit/auditLog";
import { exportStudentData, eraseStudentData, restoreStudentData, setStudentConsent } from "../../services/edu/dataPrivacy";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";

const router = Router();
for (const param of ["classId", "studentId"]) router.param(param, (_req, res, next, value) => {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) { res.status(400).json({ message: "INVALID_ID" }); return; } next();
});
function rosterFailure(req: AuthRequest, res: Response, error: unknown) {
  const record = error as { statusCode?: number; message?: string; invalidLines?: number[]; code?: string };
  if (record.statusCode) return res.status(record.statusCode).json({ message: record.message, ...(record.invalidLines ? { invalidLines: record.invalidLines } : {}) });
  logger.error("[edu/classStudents] roster operation failed", { requestId: req.requestId, code: record.code });
  return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
}
const actor = (req: AuthRequest) => ({ userId: req.userId!, isSystemAdmin: req.userRole === "SYSTEM_ADMIN" });
const credentialRows = (results: Awaited<ReturnType<typeof provisionStudents>>) => results.map(({ student, username, password }) => ({ id: student.id, firstName: student.firstName, lastName: student.lastName, middleName: student.middleName || "", email: student.email, username, password }));

const studentRepo = () => AppDataSource.getRepository(Student);

const studentsImportSchema = z.object({
  csvData: z.string().min(1).max(2_000_000), operationKey: z.string().uuid().optional()
});
const operationKinds = z.enum(["CREATE", "IMPORT", "RESET", "RESET_BATCH"]);
const operation = (key: string | undefined, kind: CredentialOperationOptions["kind"]): CredentialOperationOptions | undefined => key ? { key, kind } : undefined;

router.get("/classes/:classId/credential-operations", authRequired, requireClassCapability("STUDENT_MANAGE"), async (req: ClassAccessRequest, res: Response) => {
  try { res.setHeader("Cache-Control", "no-store"); return res.json({ operations: await listCredentialOperations(actor(req), req.classAccess!.cls.id) }); }
  catch (error) { return rosterFailure(req, res, error); }
});
router.get("/classes/:classId/credential-operations/:operationKey", authRequired, requireClassCapability("STUDENT_MANAGE"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const result = await getCredentialOperation(actor(req), req.classAccess!.cls.id, String(req.params.operationKey));
    await writeAudit({ actorType: "USER", actorId: req.userId!, action: "student.credentials.recover", targetType: "class", targetId: req.classAccess!.cls.id, metadata: { operationKey: result.operationKey, state: result.state }, requestId: req.requestId, ip: req.ip });
    res.setHeader("Cache-Control", "no-store"); return res.json(result);
  } catch (error) { return rosterFailure(req, res, error); }
});
for (const action of ["ack", "cancel"] as const) router.post(`/classes/:classId/credential-operations/:operationKey/${action}`, authRequired, requireClassCapability("STUDENT_MANAGE"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const parsed = z.object({ kind: operationKinds }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const result = await closeCredentialOperation(actor(req), req.classAccess!.cls.id, String(req.params.operationKey), action === "ack" ? "ACK" : "CANCEL", parsed.data.kind);
    res.setHeader("Cache-Control", "no-store"); return res.json(result);
  } catch (error) { return rosterFailure(req, res, error); }
});

router.get("/classes/:classId/students", authRequired, requireClassCapability("STUDENT_DATA_VIEW"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const classId = req.classAccess!.cls.id;

    const students = await studentRepo().find({
      select: { id: true, firstName: true, lastName: true, middleName: true, email: true, generatedUsername: true, createdAt: true },
      where: {
        class: {
          id: classId
        }
      },
      order: {
        lastName: "ASC",
        firstName: "ASC"
      }
    });

    await writeSensitiveStudentRead({
      actorType: req.userType === "STUDENT" ? "STUDENT" : "USER",
      actorId: req.principalId ?? req.userId ?? req.studentId ?? null,
      action: "student-data.read.roster",
      classId,
      orgId: req.classAccess!.cls.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip,
      metadata: { studentCount: students.length }
    });

    res.json({
      students: students.map(student => ({ id: student.id, firstName: student.firstName, lastName: student.lastName, middleName: student.middleName, email: student.email, generatedUsername: student.generatedUsername, createdAt: student.createdAt })),
      // Org of the class — lets the client target the parent-invite endpoint.
      organizationId: req.classAccess!.cls.organizationId ?? null
    });
  } catch (error) {
    logger.error("[edu/classStudents] GET /classes/:classId/students error", { requestId: req.requestId, userId: req.userId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/classes/:classId/students", authRequired, requireClassCapability("STUDENT_MANAGE"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const parsed = z.object({ students: z.array(studentInputSchema).min(1).max(200), operationKey: z.string().uuid().optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", issues: parsed.error.issues.map(issue => ({ path: issue.path, code: issue.code })) });
    const results = await provisionStudents(req.classAccess!.cls, parsed.data.students, actor(req), operation(parsed.data.operationKey, "CREATE"));
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({ count: results.length, credentials: credentialRows(results) });
  } catch (error) { return rosterFailure(req, res, error); }
});

router.post("/classes/:classId/students/export", authRequired, requireClassCapability("STUDENT_MANAGE"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const parsed = z.object({ withPasswords: z.boolean().default(false), confirm: z.boolean().optional() }).strict().safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    if (parsed.data.withPasswords && parsed.data.confirm !== true) return res.status(400).json({ message: "PASSWORD_RESET_CONFIRMATION_REQUIRED" });
    const classId = req.classAccess!.cls.id;
    const students = await studentRepo().find({ where: { class: { id: classId } }, order: { lastName: "ASC", firstName: "ASC", id: "ASC" } });
    const resets = parsed.data.withPasswords ? await resetStudentPasswords(students.map(student => student.id), actor(req), classId) : [];
    const resetRows = new Map(resets.map(row => [row.id, row]));
    const exportRows = students.map(student => resetRows.get(student.id) || { ...student, username: student.generatedUsername, password: "" });
    const csv = "Ім'я,Прізвище,По-батькові,Email,Username,Password\n" + exportRows.map(student => [student.firstName, student.lastName, student.middleName || "", student.email, student.username, student.password].map(csvCell).join(",")).join("\n");
    if (parsed.data.withPasswords) await writeAudit({ actorType: "USER", actorId: req.userId!, action: "student.password.regenerate.batch", targetType: "class", targetId: classId, metadata: { studentCount: students.length }, requestId: req.requestId, ip: req.ip });
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=students_class_" + classId + ".csv");
    return res.send("\uFEFF" + csv);
  } catch (error) { return rosterFailure(req, res, error); }
});

router.post("/classes/:classId/students/import", authRequired, requireClassCapability("STUDENT_MANAGE"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const parsed = studentsImportSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "CSV_DATA_REQUIRED" });
    const results = await provisionStudents(req.classAccess!.cls, parseStudentRoster(parsed.data.csvData), actor(req), operation(parsed.data.operationKey, "IMPORT"));
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({ count: results.length, credentials: credentialRows(results) });
  } catch (error) { return rosterFailure(req, res, error); }
});

router.post("/students/:studentId/regenerate-password", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({ confirm: z.literal(true), operationKey: z.string().uuid().optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "PASSWORD_RESET_CONFIRMATION_REQUIRED" });
    const student = await requireStudent(req, res, "STUDENT_MANAGE"); if (!student) return;
    const options = operation(parsed.data.operationKey, "RESET");
    const [result] = await resetStudentPasswords([student.id], actor(req), student.class.id, options);
    await writeAudit({ actorType: "USER", actorId: req.userId ?? null, action: "student.password.regenerate", targetType: "student", targetId: student.id, metadata: { classId: student.class.id, replayed: options?.replayed || false }, requestId: req.requestId, ip: req.ip });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ username: result.username, password: result.password, credentials: [result], count: 1 });
  } catch (error) { return rosterFailure(req, res, error); }
});

router.post("/classes/:classId/students/reset-passwords", authRequired, requireClassCapability("STUDENT_MANAGE"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const parsed = z.object({ confirm: z.literal(true), studentIds: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(200), operationKey: z.string().uuid().optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "PASSWORD_RESET_CONFIRMATION_REQUIRED" });
    const options = operation(parsed.data.operationKey, "RESET_BATCH");
    const credentials = await resetStudentPasswords(parsed.data.studentIds, actor(req), req.classAccess!.cls.id, options);
    await writeAudit({ actorType: "USER", actorId: req.userId!, action: "student.password.regenerate.batch", targetType: "class", targetId: req.classAccess!.cls.id, metadata: { studentCount: credentials.length, replayed: options?.replayed || false }, requestId: req.requestId, ip: req.ip });
    res.setHeader("Cache-Control", "no-store"); return res.json({ count: credentials.length, credentials });
  } catch (error) { return rosterFailure(req, res, error); }
});

// Helper: load a student and authorize the caller against the student's class
// for `capability`. Writes the error response and returns null on 404/403, so
// callers can `const s = await requireStudent(...); if (!s) return;`.
async function requireStudent(
  req: AuthRequest,
  res: Response,
  capability: Capability
): Promise<Student | null> {
  if (!req.userId || req.studentId || req.userType === "STUDENT") { res.status(403).json({ message: "FORBIDDEN" }); return null; }
  const studentId = Number(req.params.studentId);
  if (!Number.isFinite(studentId)) {
    res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    return null;
  }
  const result = await authorizeStudentAction(req.userId!, studentId, capability, {
    isSystemAdmin: req.userRole === "SYSTEM_ADMIN"
  });
  if (!result) {
    res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    return null;
  }
  if (!result.access.allowed) {
    res.status(403).json({ message: "FORBIDDEN" });
    return null;
  }
  return result.student;
}

// Right-to-access: export everything held about a student (audited data access).
router.get("/students/:studentId/data-export", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const student = await requireStudent(req, res, "STUDENT_DATA_VIEW");
    if (!student) return;

    const data = await exportStudentData(student.id);
    await writeAudit({
      actorType: "USER",
      actorId: req.userId ?? null,
      action: "student.data.export",
      targetType: "student",
      targetId: student.id,
      orgId: student.class?.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({ export: data });
  } catch (error) {
    logger.error("[edu/classStudents] data-export error", { requestId: req.requestId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Right-to-erasure: soft-delete a student's record so academic records remain recoverable.
router.post("/students/:studentId/erase", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const confirmation = z.object({ confirm: z.literal(true) }).safeParse(req.body ?? {});
    if (!confirmation.success) {
      return res.status(400).json({ message: "ERASE_CONFIRMATION_REQUIRED" });
    }
    const student = await requireStudent(req, res, "STUDENT_MANAGE");
    if (!student) return;

    const orgId = student.class?.organizationId ?? null;
    const ok = await eraseStudentData(student.id, { userId: req.userId!, sessionVersion: req.eduSessionVersion });
    await writeAudit({
      actorType: "USER",
      actorId: req.userId ?? null,
      action: "student.data.erase",
      targetType: "student",
      targetId: student.id,
      orgId,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({ ok });
  } catch (error) {
    logger.error("[edu/classStudents] erase error", { requestId: req.requestId, error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Restore a soft-erased student. This is deliberately a separate, confirmed action.
router.post("/students/:studentId/restore", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const confirmation = z.object({ confirm: z.literal(true) }).safeParse(req.body ?? {});
    if (!confirmation.success) {
      return res.status(400).json({ message: "RESTORE_CONFIRMATION_REQUIRED" });
    }
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0 || !req.userId) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const result = await authorizeStudentAction(req.userId, studentId, "STUDENT_MANAGE", {
      isSystemAdmin: req.userRole === "SYSTEM_ADMIN",
      withDeleted: true
    });
    if (!result) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    if (!result.access.allowed) return res.status(403).json({ message: "FORBIDDEN" });

    const ok = await restoreStudentData(studentId, { userId: req.userId, sessionVersion: req.eduSessionVersion });
    if (!ok) return res.status(409).json({ message: "STUDENT_NOT_ERASED" });
    await writeAudit({
      actorType: "USER",
      actorId: req.userId,
      action: "student.data.restore",
      targetType: "student",
      targetId: studentId,
      orgId: result.student.class?.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({ ok: true });
  } catch (error) {
    logger.error("[edu/classStudents] restore error", { requestId: req.requestId, error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Record age / parental consent for a student.
router.put("/students/:studentId/consent", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const student = await requireStudent(req, res, "STUDENT_MANAGE");
    if (!student) return;

    const parsed = z
      .object({
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        consentGiven: z.boolean().optional()
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const updated = await setStudentConsent(student.id, parsed.data, { userId: req.userId!, sessionVersion: req.eduSessionVersion });
    await writeAudit({
      actorType: "USER",
      actorId: req.userId ?? null,
      action: "student.consent.update",
      targetType: "student",
      targetId: student.id,
      orgId: student.class?.organizationId ?? null,
      metadata: { consentGiven: parsed.data.consentGiven ?? null },
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({
      student: {
        id: updated!.id,
        birthDate: updated!.birthDate ?? null,
        parentalConsentAt: updated!.parentalConsentAt ?? null
      }
    });
  } catch (error) {
    logger.error("[edu/classStudents] consent error", { requestId: req.requestId, error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
