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
    googleId: user.googleId ?? null,
    placementDone: Boolean((user as any).placementDone),
    placementLevel: (user as any).placementLevel ?? null,
    placementScore: (user as any).placementScore ?? null,
    placementMasteredUntilTopicIndexJava: (user as any).placementMasteredUntilTopicIndexJava ?? null,
    placementMasteredUntilTopicIndexPython: (user as any).placementMasteredUntilTopicIndexPython ?? null
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

router.put("/placement", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_PERSONAL_USERS"
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
        message: "ONLY_PERSONAL_USERS"
      });
    }

    const {
      level,
      score,
      course,
      lang,
      masteredUntilTopicIndex
    } = req.body as {
      level?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
      score?: number | null;
      course?: string | null;
      lang?: string | null;
      masteredUntilTopicIndex?: number | null;
    };

    const normalizedLang = normalizeLang(course || lang || user.lang);
    if (course !== undefined || lang !== undefined) {
      user.lang = normalizedLang;
    }

    if (level !== undefined && level !== null) {
      const allowed = new Set(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
      if (!allowed.has(level)) {
        return res.status(400).json({
          message: "INVALID_LEVEL"
        });
      }
      (user as any).placementLevel = level;
    }
    if (score !== undefined) {
      if (score !== null && (!Number.isFinite(Number(score)) || Number(score) < 0)) {
        return res.status(400).json({
          message: "INVALID_SCORE"
        });
      }
      (user as any).placementScore = score === null ? null : Math.round(Number(score));
    }

    if (masteredUntilTopicIndex !== undefined) {
      if (masteredUntilTopicIndex !== null) {
        const v = Number(masteredUntilTopicIndex);
        if (!Number.isFinite(v)) {
          return res.status(400).json({
            message: "INVALID_MASTERED_UNTIL"
          });
        }
        const rounded = Math.floor(v);
        if (rounded < -1 || rounded > 10000) {
          return res.status(400).json({
            message: "INVALID_MASTERED_UNTIL"
          });
        }
        const normalizedValue = rounded < 0 ? null : rounded;
        if (normalizedLang === "JAVA") {
          (user as any).placementMasteredUntilTopicIndexJava = normalizedValue;
        } else {
          (user as any).placementMasteredUntilTopicIndexPython = normalizedValue;
        }
      } else {
        if (normalizedLang === "JAVA") {
          (user as any).placementMasteredUntilTopicIndexJava = null;
        } else {
          (user as any).placementMasteredUntilTopicIndexPython = null;
        }
      }
    }
    (user as any).placementDone = true;
    (user as any).placementDoneAt = new Date();

    await userRepo().save(user);
    return res.json(buildUserDto(user));
  } catch (err) {
    console.error("PUT /profile/placement error", err);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

export const profileRouter = router;
export default router;