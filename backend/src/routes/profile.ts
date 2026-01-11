import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, UserLang } from "../entities/User";
import { Student } from "../entities/Student";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
const router = Router();
const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
function normalizeLang(input?: string | null): UserLang {
  const raw = (input || "").toUpperCase().trim();
  if (raw.startsWith("PY")) return "PYTHON";
  return "JAVA";
}
function buildUserDto(user: User) {
  const difusValue = user.lang === "JAVA" ? user.difusJava : user.difusPython;
  return {
    id: user.id,
    username: user.username,
    course: user.lang,
    lang: user.lang,
    difus: difusValue ?? 0,
    avatarUrl: user.avatarUrl ?? null,
    userMode: user.userMode,
    role: user.role || null,
    googleId: user.googleId ?? null
  };
}
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    if (req.userType === "STUDENT" && req.studentId) {
      const student = await studentRepo().findOne({
        where: {
          id: req.studentId
        },
        relations: ["class"]
      });
      if (student) {
        return res.json({
          id: student.id,
          username: student.generatedUsername,
          course: student.class.language,
          lang: student.class.language,
          difus: 0,
          avatarUrl: student.avatarUrl ?? null,
          userMode: "EDUCATIONAL",
          studentId: student.id,
          classId: student.class.id,
          className: student.class.name,
          firstName: student.firstName,
          lastName: student.lastName,
          middleName: student.middleName,
          email: student.email
        });
      }
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    return res.json(buildUserDto(user));
  } catch (err) {
    console.error("GET /profile/me error", err);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
router.put("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    if (req.userType === "STUDENT" && req.studentId) {
      const student = await studentRepo().findOne({
        where: {
          id: req.studentId
        },
        relations: ["class"]
      });
      if (!student) {
        return res.status(404).json({
          message: "STUDENT_NOT_FOUND"
        });
      }
      const {
        avatarUrl,
        avatarData
      } = req.body as {
        avatarUrl?: string | null;
        avatarData?: string | null;
      };
      if (avatarData?.startsWith("data:image/")) {
        student.avatarUrl = avatarData;
      } else if (avatarUrl !== undefined) {
        student.avatarUrl = avatarUrl;
      }
      await studentRepo().save(student);
      return res.json({
        id: student.id,
        username: student.generatedUsername,
        course: student.class.language,
        lang: student.class.language,
        difus: 0,
        avatarUrl: student.avatarUrl ?? null,
        userMode: "EDUCATIONAL",
        studentId: student.id,
        classId: student.class.id,
        className: student.class.name,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        email: student.email
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    if (user.userMode === "EDUCATIONAL") {
      return res.status(403).json({
        message: "TEACHERS_CANNOT_UPDATE_PROFILE"
      });
    }
    const {
      course,
      lang,
      avatarUrl,
      avatarData
    } = req.body as {
      course?: string;
      lang?: string;
      avatarUrl?: string | null;
      avatarData?: string | null;
    };
    if (course || lang) {
      user.lang = normalizeLang(course || lang);
    }
    if (avatarData?.startsWith("data:image/")) {
      user.avatarUrl = avatarData;
    } else if (avatarUrl !== undefined) {
      user.avatarUrl = avatarUrl;
    }
    await userRepo().save(user);
    return res.json(buildUserDto(user));
  } catch (err) {
    console.error("PUT /profile/me error", err);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
router.post("/milestone-shown", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    user.lastMilestoneShown = new Date();
    await userRepo().save(user);
    return res.json({
      success: true
    });
  } catch (err) {
    console.error("POST /profile/milestone-shown error", err);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
export const profileRouter = router;
export default router;