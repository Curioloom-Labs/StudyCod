import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { JWT_SECRET } from "../../config";
import { logger } from "../../utils/logger";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";
import { generateJti } from "../../services/auth/jwtRevocation";

const router = Router();

const studentRepo = () => AppDataSource.getRepository(Student);

const studentLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

router.post("/student-login", async (req: Request, res: Response) => {
  try {
    const validated = studentLoginSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT"
      });
    }

    const { username, password } = validated.data;

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

    return res.json({
      token,
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
