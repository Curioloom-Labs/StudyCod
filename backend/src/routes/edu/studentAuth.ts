import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { JWT_SECRET } from "../../config";
import { logger } from "../../utils/logger";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";
import { generateJti } from "../../services/auth/jwtRevocation";
import { setSharedAuthCookie } from "../../utils/authCookie";
import { createRouteLimiter } from "../../middleware/routeRateLimit";
import type { AuthRequest } from "../../middleware/authMiddleware";
import { enforceAuthTurnstile } from "../auth";

const router = Router();

const studentRepo = () => AppDataSource.getRepository(Student);

const studentLoginLimiter = createRouteLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "TOO_MANY_LOGIN_ATTEMPTS",
});

const studentLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

router.post("/student-login", studentLoginLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const validated = studentLoginSchema.extend({
      turnstileToken: z.string().min(1).max(4096).optional(),
    }).safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT"
      });
    }

    const { username, password, turnstileToken } = validated.data;

    const qaStudentUsername = String(process.env.EDU_QA_STUDENT_USERNAME ?? "").trim();
    const isConfiguredQaStudent = qaStudentUsername.length > 0 && username.trim() === qaStudentUsername;
    if (!isConfiguredQaStudent && !(await enforceAuthTurnstile(req, res, turnstileToken))) return;

    const student = await studentRepo().findOne({
      where: { generatedUsername: username },
      relations: ["class"]
    });

    if (!student || !(await bcrypt.compare(password, student.generatedPassword))) {
      return res.status(401).json({
        message: "INVALID_CREDENTIALS"
      });
    }

    const uiLanguage = resolveUiLocaleFromHeaders(req.headers, "en");
    if (student.uiLanguage !== uiLanguage) {
      student.uiLanguage = uiLanguage;
      await studentRepo().save(student);
    }

    const token = jwt.sign(
      {
        studentId: student.id,
        type: "STUDENT",
        classId: student.class.id,
        jti: generateJti()
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    setSharedAuthCookie(res, token);

    return res.json({
      student: {
        id: student.id,
        username: student.generatedUsername,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        email: student.email,
        classId: student.class.id,
        className: student.class.name,
        language: student.class.language,
        uiLanguage: student.uiLanguage
      }
    });
  } catch (error) {
    logger.error("[edu/studentAuth] POST /student-login error", { requestId: (req as any).requestId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;
