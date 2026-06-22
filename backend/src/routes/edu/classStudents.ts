import { Router, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { requireCapability, orgIdFromClassParam, orgIdFromStudentParam } from "../../middleware/orgContext";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { generatePassword, generateUsername, hashPassword } from "../../services/studentCredentialsService";
import { provisionStudent } from "../../services/edu/studentProvision";
import { writeAudit } from "../../services/audit/auditLog";
import { exportStudentData, eraseStudentData, setStudentConsent } from "../../services/edu/dataPrivacy";
import { logger } from "../../utils/logger";

const router = Router();

const classRepo = () => AppDataSource.getRepository(Class);
const studentRepo = () => AppDataSource.getRepository(Student);

const studentsImportSchema = z.object({
  csvData: z.string().min(1).max(2_000_000)
});

router.get("/classes/:classId/students", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });

    const students = await studentRepo().find({
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

    res.json({
      students
    });
  } catch (error) {
    logger.error("[edu/classStudents] GET /classes/:classId/students error", { requestId: req.requestId, userId: req.userId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/classes/:classId/students", authRequired, requireCapability("STUDENT_MANAGE", { resolveOrgId: orgIdFromClassParam() }), async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });

    const schema = z.object({
      students: z.array(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        middleName: z.string().optional(),
        email: z.string().email()
      }))
    });
    const validated = schema.safeParse(req.body);
    if (!validated.success) return res.status(400).json({
      message: "INVALID_INPUT"
    });

    const results = [];
    const credentials = [];

    for (const s of validated.data.students) {
      let student;
      let username: string;
      let plainPassword: string;
      try {
        // Preferred: a real User-backed account (boots into the student view,
        // can use the full platform; same creds also work on /student-login).
        const prov = await provisionStudent(cls, s);
        student = prov.student;
        username = prov.username;
        plainPassword = prov.password;
      } catch (provErr) {
        // Graceful fallback so teacher-add never regresses: legacy shell student
        // (no User), claimable later via POST /edu/students/claim.
        logger.warn("[edu/classStudents] User provisioning fell back to shell student", { requestId: req.requestId, err: (provErr as any)?.message });
        plainPassword = generatePassword();
        const hashedPassword = await hashPassword(plainPassword);
        username = generateUsername(s.firstName, s.lastName, s.middleName);
        student = studentRepo().create({
          firstName: s.firstName,
          lastName: s.lastName,
          middleName: s.middleName,
          email: s.email,
          class: cls,
          generatedUsername: username,
          generatedPassword: hashedPassword
        });
        await studentRepo().save(student);
      }

      results.push(student);
      credentials.push({
        id: student.id,
        firstName: s.firstName,
        lastName: s.lastName,
        middleName: s.middleName || "",
        email: s.email,
        username,
        password: plainPassword
      });
    }

    res.status(201).json({
      count: results.length,
      credentials
    });
  } catch (error) {
    logger.error("[edu/classStudents] POST /classes/:classId/students error", { requestId: req.requestId, userId: req.userId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.get("/classes/:classId/students/export", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });

    const students = await studentRepo().find({
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

    const withPasswordsRaw = Array.isArray((req.query as any)?.withPasswords) ? String((req.query as any).withPasswords[0] || "") : String((req.query as any)?.withPasswords || "");
    const withPasswords = ["1", "true", "yes"].includes(withPasswordsRaw.toLowerCase().trim());

    const csvEscape = (value: unknown) => {
      const s = String(value ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };

    let csv = `Ім'я,Прізвище,По-батькові,Email,Username,Password\n`;
    if (withPasswords) {
      // Regenerate + persist all passwords atomically so the exported CSV always
      // matches what is stored (no partial reset on a mid-loop failure).
      const rows = await AppDataSource.transaction(async (manager) => {
        const studentRepoTx = manager.getRepository(Student);
        const out: string[] = [];
        for (const s of students) {
          const plainPassword = generatePassword();
          s.generatedPassword = await hashPassword(plainPassword);
          await studentRepoTx.save(s);
          out.push([
            csvEscape(s.firstName),
            csvEscape(s.lastName),
            csvEscape(s.middleName || ""),
            csvEscape(s.email),
            csvEscape(s.generatedUsername),
            csvEscape(plainPassword)
          ].join(",") + "\n");
        }
        return out;
      });
      csv += rows.join("");
    } else {
      for (const s of students) {
        csv += [
          csvEscape(s.firstName),
          csvEscape(s.lastName),
          csvEscape(s.middleName || ""),
          csvEscape(s.email),
          csvEscape(s.generatedUsername),
          csvEscape("")
        ].join(",") + "\n";
      }
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=students_class_${classId}.csv`);
    res.send("\uFEFF" + csv);
  } catch (error) {
    logger.error("[edu/classStudents] GET /classes/:classId/students/export error", { requestId: req.requestId, userId: req.userId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/classes/:classId/students/import", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });

    const parsed = studentsImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "CSV_DATA_REQUIRED"
      });
    }

    const { csvData } = parsed.data;

    const lines = csvData
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const credentials: Array<{
      id: number;
      firstName: string;
      lastName: string;
      middleName: string;
      email: string;
      username: string;
      password: string;
    }> = [];

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === "," && !inQuotes) {
          result.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result.map(v => v.replace(/^\uFEFF/, "").trim());
    };

    const normalizeHeaderKey = (raw: string) => raw
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/["']/g, "")
      .replace(/-/g, "");

    const headerCells = parseCsvLine(lines[0]);
    const headerKeys = headerCells.map(normalizeHeaderKey);

    const hasHeader = headerKeys.some(k => k.includes("email") || k.includes("e-mail"))
      || headerKeys.some(k => k.includes("прізвище") || k.includes("призвище"))
      || headerKeys.some(k => k.includes("імя") || k.includes("імя") || k.includes("имя"))
      || headerKeys.some(k => k.includes("firstname") || k.includes("lastname"));

    const colIndex = (variants: string[]) => {
      for (let i = 0; i < headerKeys.length; i++) {
        if (variants.includes(headerKeys[i])) return i;
      }
      return -1;
    };

    const firstNameIdx = colIndex(["імя", "имя", "firstname", "first", "first_name", "firstname"]);
    const lastNameIdx = colIndex(["прізвище", "призвище", "lastname", "last", "last_name", "lastname"]);
    const middleNameIdx = colIndex(["побатькові", "по-батькові", "middlename", "middle", "middle_name", "middlename"]);
    const emailIdx = colIndex(["email", "e-mail"]);
    const usernameIdx = colIndex(["username", "login", "логін", "логин"]);
    const passwordIdx = colIndex(["password", "пароль"]);

    const startIndex = hasHeader ? 1 : 0;

    const ensureUniqueUsername = async (desired: string) => {
      let candidate = desired;
      if (!candidate.trim()) {
        candidate = desired;
      }
      for (let attempt = 0; attempt < 10; attempt++) {
        const exists = await studentRepo().count({
          where: {
            generatedUsername: candidate
          } as any
        });
        if (!exists) return candidate;
        const suffix = crypto.randomBytes(2).toString("hex");
        candidate = `${candidate}_${suffix}`;
      }
      return `${candidate}_${crypto.randomBytes(2).toString("hex")}`;
    };

    // Persist the whole batch atomically: a failure partway through must not
    // leave some students created and others not.
    await AppDataSource.transaction(async (manager) => {
    const studentRepoTx = manager.getRepository(Student);
    for (let i = startIndex; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      if (parts.length < 3) continue;

      let firstName = "";
      let lastName = "";
      let middleName = "";
      let email = "";
      let username = "";
      let password = "";

      if (hasHeader) {
        firstName = firstNameIdx >= 0 ? parts[firstNameIdx] || "" : "";
        lastName = lastNameIdx >= 0 ? parts[lastNameIdx] || "" : "";
        middleName = middleNameIdx >= 0 ? parts[middleNameIdx] || "" : "";
        email = emailIdx >= 0 ? parts[emailIdx] || "" : "";
        username = usernameIdx >= 0 ? parts[usernameIdx] || "" : "";
        password = passwordIdx >= 0 ? parts[passwordIdx] || "" : "";
      } else {
        firstName = parts[0] || "";
        lastName = parts[1] || "";
        if (parts.length === 3) {
          email = parts[2] || "";
        } else {
          middleName = parts[2] || "";
          email = parts[3] || "";
          username = parts[4] || "";
          password = parts[5] || "";
        }
      }

      if (!email) {
        const emailCandidate = parts.find(p => p.includes("@"));
        if (emailCandidate) email = emailCandidate;
      }

      if (!firstName || !lastName || !email) continue;

      const plainPassword = password?.trim() ? password.trim() : generatePassword();
      const hashedPassword = await hashPassword(plainPassword);
      const generatedBase = generateUsername(firstName, lastName, middleName);
      const finalUsername = await ensureUniqueUsername(username?.trim() ? username.trim() : generatedBase);

      const student = studentRepoTx.create({
        firstName,
        lastName,
        middleName,
        email,
        class: cls,
        generatedUsername: finalUsername,
        generatedPassword: hashedPassword
      });
      await studentRepoTx.save(student);

      credentials.push({
        id: student.id,
        firstName,
        lastName,
        middleName: middleName || "",
        email,
        username: finalUsername,
        password: plainPassword
      });
    }
    });

    res.status(201).json({
      count: credentials.length,
      credentials
    });
  } catch (error) {
    logger.error("[edu/classStudents] POST /classes/:classId/students/import error", { requestId: req.requestId, userId: req.userId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/students/:studentId/regenerate-password", authRequired, requireCapability("STUDENT_MANAGE", { resolveOrgId: orgIdFromStudentParam() }), async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class", "class.teacher"]
    });

    if (!student || !student.class || !student.class.teacher || student.class.teacher.id !== req.userId) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }

    const plainPassword = generatePassword();
    student.generatedPassword = await hashPassword(plainPassword);
    await studentRepo().save(student);

    // Sensitive action on a (likely minor) student's credentials → audit trail.
    await writeAudit({
      actorType: "USER",
      actorId: req.userId ?? null,
      action: "student.password.regenerate",
      targetType: "student",
      targetId: student.id,
      metadata: { classId: student.class.id },
      requestId: req.requestId,
      ip: req.ip
    });

    res.json({
      username: student.generatedUsername,
      password: plainPassword
    });
  } catch (error) {
    logger.error("[edu/classStudents] POST /students/:studentId/regenerate-password error", { requestId: req.requestId, userId: req.userId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

// Helper: load a student and assert the caller is the owning teacher.
async function loadOwnedStudent(req: AuthRequest): Promise<Student | null> {
  const studentId = parseInt(req.params.studentId, 10);
  if (!Number.isFinite(studentId)) return null;
  const student = await studentRepo().findOne({
    where: { id: studentId },
    relations: ["class", "class.teacher"]
  });
  if (!student || student.class?.teacher?.id !== req.userId) return null;
  return student;
}

// Right-to-access: export everything held about a student (audited data access).
router.get("/students/:studentId/data-export", authRequired, requireCapability("STUDENT_DATA_VIEW", { resolveOrgId: orgIdFromStudentParam() }), async (req: AuthRequest, res: Response) => {
  try {
    const student = await loadOwnedStudent(req);
    if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });

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

// Right-to-erasure: delete a student's record (cascade removes grades/links).
router.post("/students/:studentId/erase", authRequired, requireCapability("STUDENT_MANAGE", { resolveOrgId: orgIdFromStudentParam() }), async (req: AuthRequest, res: Response) => {
  try {
    const student = await loadOwnedStudent(req);
    if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });

    const orgId = student.class?.organizationId ?? null;
    const ok = await eraseStudentData(student.id);
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
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Record age / parental consent for a student.
router.put("/students/:studentId/consent", authRequired, requireCapability("STUDENT_MANAGE", { resolveOrgId: orgIdFromStudentParam() }), async (req: AuthRequest, res: Response) => {
  try {
    const student = await loadOwnedStudent(req);
    if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });

    const parsed = z
      .object({
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        consentGiven: z.boolean().optional()
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const updated = await setStudentConsent(student.id, parsed.data);
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
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
