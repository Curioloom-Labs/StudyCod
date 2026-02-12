import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, UserLang } from "../entities/User";
import { Student } from "../entities/Student";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { executeCodeWithInput } from "../services/codeExecutionService";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
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
    placementMasteredUntilTopicIndexPython: (user as any).placementMasteredUntilTopicIndexPython ?? null,
    placementCodingPassed: Boolean((user as any).placementCodingPassed),
    placementCodingLevel: (user as any).placementCodingLevel ?? null,
    placementCodingTaskId: (user as any).placementCodingTaskId ?? null,
    placementCodingScore: (user as any).placementCodingScore ?? null,
    placementCodingDoneAt: (user as any).placementCodingDoneAt ?? null
  };
}

type PlacementCodingChallenge = {
  id: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  taskId: string;
  titleUk: string;
  titleEn: string;
  promptUk: string;
  promptEn: string;
  starterCodeJava: string;
  starterCodePython: string;
  sampleInput: string;
  sampleOutput: string;
};

function normalizeTokens(out: string): string[] {
  return String(out ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInt(rng: () => number, min: number, max: number): number {
  const v = rng();
  return Math.floor(min + v * (max - min + 1));
}

function seedFor(userId: number, level: string): number {
  const s = `${userId}:${level}:placement`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildFizzBuzzChallenge(level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED", seed: number): { challenge: PlacementCodingChallenge; tests: Array<{ input: string; expectedTokens: string[] }> } {
  const starterJava = "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    int n = sc.nextInt();\n\n    // TODO: implement\n  }\n}\n";
  const starterPy = "n = int(input().strip())\n\n# TODO: implement\n";
  const sampleInput = "15\n";
  const sampleOutput = "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n";
  const tests = [
    { input: "1\n", out: "1\n" },
    { input: "3\n", out: "1\n2\nFizz\n" },
    { input: "5\n", out: "1\n2\nFizz\n4\nBuzz\n" },
    { input: sampleInput, out: sampleOutput },
    { input: "16\n", out: sampleOutput + "16\n" }
  ];
  return {
    challenge: {
      id: `placement:${level}:fizzbuzz:${seed}`,
      level,
      taskId: "fizzbuzz",
      titleUk: "Міні-задача: FizzBuzz",
      titleEn: "Mini task: FizzBuzz",
      promptUk: "Зчитай ціле число N (1..100). Виведи числа від 1 до N (кожне з нового рядка), але:\n- якщо число ділиться на 3 — виведи Fizz\n- якщо число ділиться на 5 — виведи Buzz\n- якщо число ділиться і на 3, і на 5 — виведи FizzBuzz\n\nВажливо: формат має збігатися з прикладом (рядки).",
      promptEn: "Read integer N (1..100). Print numbers from 1 to N (each on a new line), but:\n- if divisible by 3 — print Fizz\n- if divisible by 5 — print Buzz\n- if divisible by both 3 and 5 — print FizzBuzz\n\nImportant: output formatting must match the example (line-based).",
      starterCodeJava: starterJava,
      starterCodePython: starterPy,
      sampleInput,
      sampleOutput
    },
    tests: tests.map(t => ({ input: t.input, expectedTokens: normalizeTokens(t.out) }))
  };
}

function buildIntermediateChallenge(seed: number): { challenge: PlacementCodingChallenge; tests: Array<{ input: string; expectedTokens: string[] }> } {
  const rng = mulberry32(seed);

  const starterJava = "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    int n = sc.nextInt();\n    long sum = 0;\n    int count = 0;\n    for (int i = 0; i < n; i++) {\n      int x = sc.nextInt();\n      // TODO: update count and sum for even numbers\n    }\n    // TODO: print count and sum\n  }\n}\n";
  const starterPy = "n = int(input().strip())\nnums = list(map(int, input().split()))\n# TODO: count even numbers and compute their sum\n";

  const solve = (arr: number[]) => {
    let c = 0;
    let s = 0;
    for (const x of arr) {
      if (x % 2 === 0) {
        c++;
        s += x;
      }
    }
    return `${c}\n${s}\n`;
  };

  const makeCase = () => {
    const n = pickInt(rng, 6, 12);
    const arr = Array.from({ length: n }, () => pickInt(rng, -20, 20));
    const input = `${n}\n${arr.join(" ")}\n`;
    const out = solve(arr);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const hidden1 = makeCase();
  const hidden2 = makeCase();
  const hidden3 = makeCase();
  const hidden4 = makeCase();

  return {
    challenge: {
      id: `placement:INTERMEDIATE:even-stats:${seed}`,
      level: "INTERMEDIATE",
      taskId: "even-stats",
      titleUk: "Масив: парні числа",
      titleEn: "Array: even numbers",
      promptUk: "Зчитай N, потім N цілих чисел.\nВиведи:\n1) кількість парних чисел\n2) суму парних чисел\n\nКожне значення — з нового рядка.",
      promptEn: "Read N, then N integers.\nPrint:\n1) count of even numbers\n2) sum of even numbers\n\nEach value on a new line.",
      starterCodeJava: starterJava,
      starterCodePython: starterPy,
      sampleInput: sample.input,
      sampleOutput: sample.out
    },
    tests: [sample, hidden1, hidden2, hidden3, hidden4].map(t => ({ input: t.input, expectedTokens: t.expectedTokens }))
  };
}

function buildAdvancedChallenge(seed: number): { challenge: PlacementCodingChallenge; tests: Array<{ input: string; expectedTokens: string[] }> } {
  const rng = mulberry32(seed);

  const starterJava = "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    int n = sc.nextInt();\n    int[] a = new int[n];\n    for (int i = 0; i < n; i++) a[i] = sc.nextInt();\n\n    // TODO: print distinct numbers in ascending order\n  }\n}\n";
  const starterPy = "n = int(input().strip())\na = list(map(int, input().split()))\n# TODO: print distinct numbers in ascending order\n";

  const solve = (arr: number[]) => {
    const uniq = Array.from(new Set(arr));
    uniq.sort((x, y) => x - y);
    return uniq.join(" ") + "\n";
  };

  const makeCase = () => {
    const n = pickInt(rng, 8, 16);
    const arr = Array.from({ length: n }, () => pickInt(rng, -10, 10));
    const input = `${n}\n${arr.join(" ")}\n`;
    const out = solve(arr);
    return { input, expectedTokens: normalizeTokens(out), out };
  };

  const sample = makeCase();
  const hidden1 = makeCase();
  const hidden2 = makeCase();
  const hidden3 = makeCase();
  const hidden4 = makeCase();

  return {
    challenge: {
      id: `placement:ADVANCED:distinct-sort:${seed}`,
      level: "ADVANCED",
      taskId: "distinct-sort",
      titleUk: "Масив: унікальні та сортування",
      titleEn: "Array: unique and sorting",
      promptUk: "Зчитай N, потім N цілих чисел.\nВиведи всі різні числа у зростаючому порядку в один рядок через пробіл.",
      promptEn: "Read N, then N integers.\nPrint all distinct numbers in ascending order on one line separated by spaces.",
      starterCodeJava: starterJava,
      starterCodePython: starterPy,
      sampleInput: sample.input,
      sampleOutput: sample.out
    },
    tests: [sample, hidden1, hidden2, hidden3, hidden4].map(t => ({ input: t.input, expectedTokens: t.expectedTokens }))
  };
}

function buildChallengeFor(level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED", userId: number) {
  const seed = seedFor(userId, level);
  if (level === "INTERMEDIATE") return buildIntermediateChallenge(seed);
  if (level === "ADVANCED") return buildAdvancedChallenge(seed);
  return buildFizzBuzzChallenge(level, seed);
}

router.get("/placement/coding-challenge", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_PERSONAL_USERS" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ message: "USER_NOT_FOUND" });
    }
    if (user.userMode === "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_PERSONAL_USERS" });
    }

    const qLevelRaw = String((req.query as any)?.level ?? "INTERMEDIATE").toUpperCase().trim();
    const level = (qLevelRaw === "ADVANCED" ? "ADVANCED" : qLevelRaw === "BEGINNER" ? "BEGINNER" : "INTERMEDIATE") as "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

    const qCourse = (req.query as any)?.course;
    const qLang = (req.query as any)?.lang;
    const normalizedLang = normalizeLang(qCourse || qLang || user.lang);
    const { challenge } = buildChallengeFor(level, user.id);

    return res.json({
      id: challenge.id,
      level: challenge.level,
      taskId: challenge.taskId,
      titleUk: challenge.titleUk,
      titleEn: challenge.titleEn,
      promptUk: challenge.promptUk,
      promptEn: challenge.promptEn,
      starterCode: normalizedLang === "JAVA" ? challenge.starterCodeJava : challenge.starterCodePython,
      language: normalizedLang,
      sampleInput: challenge.sampleInput,
      sampleOutput: challenge.sampleOutput
    });
  } catch (err) {
    logger.error("[profile] GET /profile/placement/coding-challenge error", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/placement/coding-submit", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_PERSONAL_USERS" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ message: "USER_NOT_FOUND" });
    }
    if (user.userMode === "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_PERSONAL_USERS" });
    }

    const { code, course, lang, level, challengeId } = req.body as {
      code?: string;
      course?: string | null;
      lang?: string | null;
      level?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
      challengeId?: string | null;
    };

    const normalizedLevel = (String(level ?? "").toUpperCase().trim() === "ADVANCED"
      ? "ADVANCED"
      : String(level ?? "").toUpperCase().trim() === "BEGINNER"
        ? "BEGINNER"
        : String(level ?? "").toUpperCase().trim() === "INTERMEDIATE"
          ? "INTERMEDIATE"
          : null) as ("BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null);
    if (!normalizedLevel) {
      return res.status(400).json({ message: "LEVEL_REQUIRED" });
    }
    const normalizedLang = normalizeLang(course || lang || user.lang);
    if (normalizedLang !== "JAVA" && normalizedLang !== "PYTHON") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }
    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "CODE_REQUIRED" });
    }
    if (code.length > 50_000) {
      return res.status(400).json({ message: "CODE_TOO_LARGE" });
    }

    const built = buildChallengeFor(normalizedLevel, user.id);
    if (challengeId && challengeId !== built.challenge.id) {
      return res.status(400).json({ message: "CHALLENGE_MISMATCH" });
    }
    const tests = built.tests;

    let passedCount = 0;
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const execRes = await executeCodeWithInput(code, normalizedLang, t.input, 8000);
      if (!execRes.success) {
        return res.status(200).json({
          passed: false,
          passedCount,
          total: tests.length,
          caseIndex: i,
          stderr: execRes.stderr || null,
          stdout: execRes.stdout || null
        });
      }
      const actualTokens = normalizeTokens(execRes.stdout);
      const expectedTokens = t.expectedTokens;
      if (actualTokens.join(" ") !== expectedTokens.join(" ")) {
        return res.status(200).json({
          passed: false,
          passedCount,
          total: tests.length,
          caseIndex: i,
          expected: expectedTokens.join(" "),
          actual: actualTokens.join(" ")
        });
      }
      passedCount++;
    }

    user.placementCodingPassed = true;
    user.placementCodingLevel = normalizedLevel;
    user.placementCodingTaskId = built.challenge.taskId;
    user.placementCodingScore = passedCount;
    user.placementCodingDoneAt = new Date();
    await userRepo().save(user);

    return res.json({
      passed: true,
      passedCount,
      total: tests.length
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.statusCode).json({ error: err.message, status: err.statusCode });
    }
    logger.error("[profile] POST /profile/placement/coding-submit error", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", status: 500 });
  }
});
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
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

      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }

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
    return res.json(buildUserDto(user));
  } catch (err) {
    logger.error("[profile] GET /profile/me error", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
router.put("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
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
    logger.error("[profile] PUT /profile/me error", { requestId: req.requestId, principalId: req.principalId, err });
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
    logger.error("[profile] POST /profile/milestone-shown error", { requestId: req.requestId, userId: req.userId, err });
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

    if (level === undefined || level === null) {
      return res.status(400).json({
        message: "LEVEL_REQUIRED"
      });
    }

    const prevLang = user.lang;
    const normalizedLang = normalizeLang(course || lang || user.lang);
    if (course !== undefined || lang !== undefined) {
      user.lang = normalizedLang;
      if (prevLang !== normalizedLang) {
        // language switch invalidates coding challenge result
        user.placementCodingPassed = false;
        user.placementCodingLevel = null;
        user.placementCodingTaskId = null;
        user.placementCodingScore = null;
        user.placementCodingDoneAt = null;
      }
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

    const isBeginnerBypass = level === "BEGINNER" && score == null && masteredUntilTopicIndex == null;
    if (!isBeginnerBypass) {
      if (typeof score !== "number" || !Number.isFinite(Number(score)) || Number(score) < 0) {
        return res.status(400).json({
          message: "PLACEMENT_SCORE_REQUIRED"
        });
      }
      if (!user.placementCodingPassed) {
        return res.status(403).json({
          message: "PLACEMENT_CODING_REQUIRED"
        });
      }
      if (user.placementCodingLevel !== level) {
        return res.status(403).json({
          message: "PLACEMENT_CODING_LEVEL_MISMATCH"
        });
      }
    } else {
      (user as any).placementScore = null;
      if (normalizedLang === "JAVA") {
        (user as any).placementMasteredUntilTopicIndexJava = null;
      } else {
        (user as any).placementMasteredUntilTopicIndexPython = null;
      }
    }

    (user as any).placementDone = true;
    (user as any).placementDoneAt = new Date();

    await userRepo().save(user);
    return res.json(buildUserDto(user));
  } catch (err) {
    logger.error("[profile] PUT /profile/placement error", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

export const profileRouter = router;
export default router;