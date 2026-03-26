import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, UserLang } from "../entities/User";
import { Student } from "../entities/Student";
import { LibraryTaskAttempt } from "../entities/LibraryTaskAttempt";
import { ContestParticipant } from "../entities/ContestParticipant";
import { ContestSubmission } from "../entities/ContestSubmission";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { executeCodeWithInput } from "../services/codeExecutionService";
import {
  buildPlacementAssessmentPack,
  computePlacementLevelFromAssessment,
  toPublicPlacementAssessmentPack,
  type PlacementAssessmentLevel,
  type PlacementAssessmentTrack,
} from "../services/placementAssessmentService";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import {
  getIadDeltaByGrade,
  getIadReasonKeyByGrade,
  getLastProcessedGradeIdForLang,
  getUserIadForLang,
} from "../utils/iad";
const router = Router();
const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const libraryAttemptRepo = () => AppDataSource.getRepository(LibraryTaskAttempt);
const contestParticipantRepo = () => AppDataSource.getRepository(ContestParticipant);
const contestSubmissionRepo = () => AppDataSource.getRepository(ContestSubmission);
function normalizeLang(input?: string | null): UserLang {
  const raw = (input || "").toUpperCase().replace(/\s+/g, "").trim();
  if (raw === "CPP" || raw === "C++" || raw.startsWith("C++")) return "CPP";
  if (raw.startsWith("PY")) return "PYTHON";
  return "JAVA";
}

type CourseHandleMap = Record<UserLang, string | null>;
type ContestHandlesByCourse = {
  codeforces: CourseHandleMap;
  atcoder: CourseHandleMap;
  leetcode: CourseHandleMap;
  codechef: CourseHandleMap;
};

type ContestPlatform = "codeforces" | "atcoder" | "leetcode" | "codechef";

type PublicProfilePrivacy = {
  showContestStats: boolean;
  showSolvedHistory: boolean;
  showLanguageBreakdown: boolean;
};

const DEFAULT_PUBLIC_PROFILE_PRIVACY: PublicProfilePrivacy = {
  showContestStats: true,
  showSolvedHistory: true,
  showLanguageBreakdown: true,
};

const EMPTY_COURSE_HANDLES = (): CourseHandleMap => ({ JAVA: null, PYTHON: null, CPP: null });

function safeDecodeComponent(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseCourseHandleMap(rawValue: string | null | undefined): CourseHandleMap {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return EMPTY_COURSE_HANDLES();

  if (!raw.startsWith("ctx:")) {
    // Legacy format: one global handle. Keep backward compatibility by mirroring it to all courses.
    const legacy = raw.slice(0, 100) || null;
    return { JAVA: legacy, PYTHON: legacy, CPP: legacy };
  }

  const map = EMPTY_COURSE_HANDLES();
  const payload = raw.slice(4);
  for (const part of payload.split(";")) {
    const [kRaw, vRaw] = part.split("=", 2);
    const k = String(kRaw ?? "").trim().toUpperCase();
    const v = String(vRaw ?? "").trim();
    const decoded = safeDecodeComponent(v).trim();
    const normalized = decoded ? decoded.slice(0, 32) : null;
    if (k === "J") map.JAVA = normalized;
    else if (k === "P") map.PYTHON = normalized;
    else if (k === "C") map.CPP = normalized;
  }
  return map;
}

function serializeCourseHandleMap(map: CourseHandleMap): string | null {
  const j = (map.JAVA ?? "").trim() || null;
  const p = (map.PYTHON ?? "").trim() || null;
  const c = (map.CPP ?? "").trim() || null;

  if (!j && !p && !c) return null;
  if (j && p && c && j === p && p === c) return j.slice(0, 100);

  const enc = (v: string | null) => encodeURIComponent((v ?? "").slice(0, 32));
  const serialized = `ctx:J=${enc(j)};P=${enc(p)};C=${enc(c)}`;
  return serialized.slice(0, 100);
}

function getContestHandlesByCourse(user: User): ContestHandlesByCourse {
  return {
    codeforces: parseCourseHandleMap(user.cfHandle ?? null),
    atcoder: parseCourseHandleMap(user.atcoderHandle ?? null),
    leetcode: parseCourseHandleMap(user.leetcodeHandle ?? null),
    codechef: parseCourseHandleMap(user.codechefHandle ?? null),
  };
}

function pickContestHandlesForCourse(all: ContestHandlesByCourse, course: UserLang) {
  return {
    codeforces: all.codeforces[course] ?? null,
    atcoder: all.atcoder[course] ?? null,
    leetcode: all.leetcode[course] ?? null,
    codechef: all.codechef[course] ?? null,
  };
}

function setCourseContestHandle(
  map: CourseHandleMap,
  course: UserLang,
  nextRaw: unknown,
  platform: ContestPlatform
): CourseHandleMap {
  const next = { ...map };
  const normalized = String(nextRaw ?? "").trim();
  if (!normalized) {
    next[course] = null;
    return next;
  }

  const safe = normalized.slice(0, 32);
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(safe)) {
    throw new HttpError(400, `${platform.toUpperCase()}_HANDLE_INVALID`);
  }

  next[course] = safe;
  return next;
}

function parseUserProfileMeta(rawValue: string | null | undefined): {
  timezone: string | null;
  privacy: PublicProfilePrivacy;
} {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    return {
      timezone: null,
      privacy: { ...DEFAULT_PUBLIC_PROFILE_PRIVACY },
    };
  }

  let timezone: string | null = null;
  let privacyPart: string | null = null;

  if (raw.startsWith("tz:")) {
    const payload = raw.slice(3);
    const [tzRaw, ppRaw] = payload.split("|pp:", 2);
    timezone = String(tzRaw ?? "").trim() || null;
    if (ppRaw != null) privacyPart = `pp:${ppRaw}`;
  } else if (raw.startsWith("pp:")) {
    privacyPart = raw;
  } else if (raw.includes("|pp:")) {
    const [tzRaw, ppRaw] = raw.split("|pp:", 2);
    timezone = String(tzRaw ?? "").trim() || null;
    if (ppRaw != null) privacyPart = `pp:${ppRaw}`;
  } else {
    timezone = raw.slice(0, 100) || null;
  }

  const privacy: PublicProfilePrivacy = { ...DEFAULT_PUBLIC_PROFILE_PRIVACY };
  if (privacyPart && privacyPart.startsWith("pp:")) {
    const payload = privacyPart.slice(3);
    for (const part of payload.split(";")) {
      const [kRaw, vRaw] = part.split("=", 2);
      const k = String(kRaw ?? "").trim().toLowerCase();
      const v = String(vRaw ?? "").trim().toLowerCase();
      const bool = v === "1" || v === "true" || v === "yes";
      if (k === "c") privacy.showContestStats = bool;
      else if (k === "h") privacy.showSolvedHistory = bool;
      else if (k === "l") privacy.showLanguageBreakdown = bool;
    }
  }

  return { timezone, privacy };
}

function serializeUserProfileMeta(meta: {
  timezone?: string | null;
  privacy: PublicProfilePrivacy;
}): string | null {
  const timezone = String(meta.timezone ?? "").trim() || null;
  const privacy = meta.privacy;
  const pp = `pp:c=${privacy.showContestStats ? 1 : 0};h=${privacy.showSolvedHistory ? 1 : 0};l=${privacy.showLanguageBreakdown ? 1 : 0}`;
  const isDefault =
    privacy.showContestStats === DEFAULT_PUBLIC_PROFILE_PRIVACY.showContestStats &&
    privacy.showSolvedHistory === DEFAULT_PUBLIC_PROFILE_PRIVACY.showSolvedHistory &&
    privacy.showLanguageBreakdown === DEFAULT_PUBLIC_PROFILE_PRIVACY.showLanguageBreakdown;

  if (!timezone && isDefault) return null;
  if (timezone) return `tz:${timezone}|${pp}`.slice(0, 100);
  return pp.slice(0, 100);
}

function buildUserDto(user: User) {
  const iadValue = getUserIadForLang(user, user.lang);
  const handlesByCourse = getContestHandlesByCourse(user);
  const profileMeta = parseUserProfileMeta(user.timezone ?? null);
  return {
    id: user.id,
    username: user.username,
    course: user.lang,
    lang: user.lang,
    iad: iadValue ?? 0,
    difus: iadValue ?? 0,
    iadByLang: {
      JAVA: getUserIadForLang(user, "JAVA"),
      PYTHON: getUserIadForLang(user, "PYTHON"),
      CPP: getUserIadForLang(user, "CPP"),
    },
    difusByLang: {
      JAVA: getUserIadForLang(user, "JAVA"),
      PYTHON: getUserIadForLang(user, "PYTHON"),
      CPP: getUserIadForLang(user, "CPP"),
    },
    avatarUrl: user.avatarUrl ?? null,
    contestHandles: pickContestHandlesForCourse(handlesByCourse, user.lang),
    contestHandlesByCourse: handlesByCourse,
    publicProfilePrivacy: profileMeta.privacy,
    email: user.email ?? null,
    marketingEmailsEnabled: Boolean(user.marketingEmailsEnabled),
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

const PROFILE_BADGES: ReadonlyArray<number> = [25, 50, 100, 250, 500, 1000];

function denyContestProfileAccess(req: AuthRequest, res: Response): boolean {
  if (req.userType === "USER" && req.userMode === "CONTEST") {
    res.status(403).json({ message: "CONTEST_MODE_RESTRICTED" });
    return true;
  }
  return false;
}

router.get("/public/:username", async (req: AuthRequest, res: Response) => {
  try {
    const username = String((req.params as any)?.username ?? "").trim();
    if (!username) {
      return res.status(400).json({ message: "USERNAME_REQUIRED" });
    }

    const user = await userRepo()
      .createQueryBuilder("u")
      .where("LOWER(u.username) = LOWER(:username)", { username })
      .andWhere("u.userMode = :mode", { mode: "PERSONAL" })
      .getOne();

    if (!user) {
      return res.status(404).json({ message: "PUBLIC_PROFILE_NOT_FOUND" });
    }

    const solvedByLangRows = await libraryAttemptRepo()
      .createQueryBuilder("a")
      .innerJoin("a.libraryTask", "t")
      .select("t.lang", "lang")
      .addSelect("COUNT(a.id)", "solved")
      .where("a.user_id = :userId", { userId: user.id })
      .andWhere("a.last_tests_total IS NOT NULL")
      .andWhere("a.last_tests_total > 0")
      .andWhere("a.last_tests_passed IS NOT NULL")
      .andWhere("a.last_tests_passed >= a.last_tests_total")
      .andWhere("t.status = :status", { status: "APPROVED" })
      .groupBy("t.lang")
      .getRawMany<{ lang: "JAVA" | "PYTHON" | "CPP"; solved: string | number }>();

    const solvedByLang: Record<"JAVA" | "PYTHON" | "CPP", number> = {
      JAVA: 0,
      PYTHON: 0,
      CPP: 0,
    };
    for (const row of solvedByLangRows) {
      const key = String(row.lang || "").toUpperCase() as "JAVA" | "PYTHON" | "CPP";
      if (key === "JAVA" || key === "PYTHON" || key === "CPP") {
        solvedByLang[key] = Number(row.solved ?? 0) || 0;
      }
    }
    const solvedTotal = solvedByLang.JAVA + solvedByLang.PYTHON + solvedByLang.CPP;
    const profileMeta = parseUserProfileMeta(user.timezone ?? null);
    const privacy = profileMeta.privacy;

    const recentSolved = await libraryAttemptRepo()
      .createQueryBuilder("a")
      .innerJoin("a.libraryTask", "t")
      .select("t.id", "id")
      .addSelect("t.title", "title")
      .addSelect("t.problem_code", "problemCode")
      .addSelect("t.slug", "slug")
      .addSelect("t.lang", "lang")
      .addSelect("a.last_score", "lastScore")
      .addSelect("a.last_tests_passed", "lastTestsPassed")
      .addSelect("a.last_tests_total", "lastTestsTotal")
      .addSelect("a.last_checked_at", "lastCheckedAt")
      .where("a.user_id = :userId", { userId: user.id })
      .andWhere("a.last_tests_total IS NOT NULL")
      .andWhere("a.last_tests_total > 0")
      .andWhere("a.last_tests_passed IS NOT NULL")
      .andWhere("a.last_tests_passed >= a.last_tests_total")
      .andWhere("t.status = :status", { status: "APPROVED" })
      .orderBy("a.last_checked_at", "DESC")
      .limit(10)
      .getRawMany<{
        id: string | number;
        title: string;
        problemCode: string | null;
        slug: string | null;
        lang: "JAVA" | "PYTHON" | "CPP";
        lastScore: string | number | null;
        lastTestsPassed: string | number | null;
        lastTestsTotal: string | number | null;
        lastCheckedAt: string | null;
      }>();

    const [contestsJoined, contestSubmissionsAgg] = await Promise.all([
      contestParticipantRepo()
        .createQueryBuilder("p")
        .where("p.user_id = :userId", { userId: user.id })
        .getCount(),
      contestSubmissionRepo()
        .createQueryBuilder("s")
        .innerJoin("s.participant", "p")
        .select("COUNT(s.id)", "total")
        .addSelect(
          "SUM(CASE WHEN s.tests_total IS NOT NULL AND s.tests_total > 0 AND s.tests_passed IS NOT NULL AND s.tests_passed >= s.tests_total THEN 1 ELSE 0 END)",
          "accepted"
        )
        .where("p.user_id = :userId", { userId: user.id })
        .getRawOne<{ total: string | number | null; accepted: string | number | null }>(),
    ]);

    return res.json({
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl ?? null,
      lang: user.lang,
      iad: getUserIadForLang(user, user.lang),
      difus: getUserIadForLang(user, user.lang),
      joinedAt: user.createdAt,
      contestHandles: pickContestHandlesForCourse(getContestHandlesByCourse(user), user.lang),
      privacy,
      stats: {
        solvedTotal,
        solvedByLang: privacy.showLanguageBreakdown ? solvedByLang : { JAVA: 0, PYTHON: 0, CPP: 0 },
        badgesUnlocked: PROFILE_BADGES.filter((m) => solvedTotal >= m),
        contestsJoined: privacy.showContestStats ? contestsJoined : null,
        contestSubmissionsTotal: privacy.showContestStats ? (Number(contestSubmissionsAgg?.total ?? 0) || 0) : null,
        contestAcceptedLike: privacy.showContestStats ? (Number(contestSubmissionsAgg?.accepted ?? 0) || 0) : null,
      },
      recentSolved: (privacy.showSolvedHistory ? recentSolved : []).map((row) => ({
        id: Number(row.id),
        title: row.title,
        problemCode: row.problemCode,
        slug: row.slug,
        lang: row.lang,
        lastScore: row.lastScore == null ? null : Number(row.lastScore),
        lastTestsPassed: row.lastTestsPassed == null ? null : Number(row.lastTestsPassed),
        lastTestsTotal: row.lastTestsTotal == null ? null : Number(row.lastTestsTotal),
        lastCheckedAt: row.lastCheckedAt,
      })),
    });
  } catch (err) {
    logger.error("[profile] GET /profile/public/:username error", {
      requestId: req.requestId,
      username: (req.params as any)?.username,
      err,
    });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get(["/iad", "/difus"], authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
    if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_PERSONAL_USERS" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: "USER_NOT_FOUND" });
    if (user.userMode !== "PERSONAL") {
      return res.status(403).json({ message: "ONLY_PERSONAL_USERS" });
    }

    const lang = user.lang;
    const currentIad = getUserIadForLang(user, lang);
    const lastAppliedGradeId = getLastProcessedGradeIdForLang(user, lang);

    const recentGrades = await AppDataSource
      .createQueryBuilder()
      .select("g.id", "gradeId")
      .addSelect("g.total", "grade")
      .addSelect("g.created_at", "createdAt")
      .addSelect("t.id", "taskId")
      .addSelect("t.title", "taskTitle")
      .addSelect("t.topic_index", "topicIndex")
      .from("grades", "g")
      .innerJoin("tasks", "t", "t.id = g.task_id")
      .where("g.user_id = :userId", { userId: req.userId })
      .andWhere("t.lang = :lang", { lang })
      .andWhere("g.total IS NOT NULL")
      .orderBy("g.created_at", "DESC")
      .addOrderBy("g.id", "DESC")
      .limit(25)
      .getRawMany<{
        gradeId: string | number;
        grade: string | number;
        createdAt: string;
        taskId: string | number;
        taskTitle: string;
        topicIndex: string | number;
      }>();

    const events = recentGrades.map((row) => {
      const gradeValue = Number(row.grade ?? 0);
      const delta = getIadDeltaByGrade(gradeValue);
      const gradeId = Number(row.gradeId ?? 0);
      return {
        gradeId,
        taskId: Number(row.taskId ?? 0),
        taskTitle: String(row.taskTitle ?? ""),
        topicIndex: Number(row.topicIndex ?? 0),
        grade: gradeValue,
        delta,
        reasonKey: getIadReasonKeyByGrade(gradeValue),
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        applied: lastAppliedGradeId != null ? gradeId <= lastAppliedGradeId : false,
        createdAt: row.createdAt,
      };
    });

    const positiveEvents = events.filter((e) => e.delta > 0).length;
    const negativeEvents = events.filter((e) => e.delta < 0).length;

    return res.json({
      lang,
      currentIad,
      currentDifus: currentIad,
      iadByLang: {
        JAVA: getUserIadForLang(user, "JAVA"),
        PYTHON: getUserIadForLang(user, "PYTHON"),
        CPP: getUserIadForLang(user, "CPP"),
      },
      difusByLang: {
        JAVA: getUserIadForLang(user, "JAVA"),
        PYTHON: getUserIadForLang(user, "PYTHON"),
        CPP: getUserIadForLang(user, "CPP"),
      },
      limits: { min: 0, max: 1 },
      lastAppliedGradeId,
      updatedAt: user.lastIadChange ?? user.lastDifusChange ?? null,
      rules: [
        { minGrade: 0, maxGrade: 30, delta: -0.045, reasonKey: "very_low_score" },
        { minGrade: 31, maxGrade: 55, delta: -0.02, reasonKey: "low_score" },
        { minGrade: 56, maxGrade: 79, delta: 0.012, reasonKey: "good_score" },
        { minGrade: 80, maxGrade: 100, delta: 0.028, reasonKey: "excellent_score" },
      ],
      recentEvents: events,
      summary: {
        totalEvents: events.length,
        positiveEvents,
        negativeEvents,
      },
    });
  } catch (err) {
    logger.error("[profile] GET /profile/iad error", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

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

function normalizePlacementTrack(input: unknown): PlacementAssessmentTrack {
  const raw = String(input ?? "").toUpperCase().trim();
  if (raw === "INTERMEDIATE") return "INTERMEDIATE";
  if (raw === "ADVANCED") return "ADVANCED";
  return "UNDECIDED";
}

function fallbackMasteredByLevel(level: PlacementAssessmentLevel): number | null {
  if (level === "BEGINNER") return null;
  if (level === "INTERMEDIATE") return 2;
  return 5;
}

router.get("/placement/coding-challenge", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
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
    if (denyContestProfileAccess(req, res)) return;
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
    user.placementCodingScore = Math.max(0, Math.min(100, Math.round((passedCount / Math.max(1, tests.length)) * 100)));
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

router.get("/placement/assessment-pack", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
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

    const track = normalizePlacementTrack((req.query as any)?.track);
    const normalizedLang = normalizeLang((req.query as any)?.course || (req.query as any)?.lang || user.lang);
    const pack = buildPlacementAssessmentPack(track, normalizedLang, user.id);
    return res.json(toPublicPlacementAssessmentPack(pack));
  } catch (err) {
    logger.error("[profile] GET /profile/placement/assessment-pack error", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/placement/assessment-submit", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
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

    const {
      track,
      course,
      lang,
      quizAnswers,
      taskSolutions,
    } = req.body as {
      track?: PlacementAssessmentTrack;
      course?: string | null;
      lang?: string | null;
      quizAnswers?: Array<{ questionId: string; selectedIndex: number }>;
      taskSolutions?: Array<{ taskId: string; code: string }>;
    };

    const normalizedTrack = normalizePlacementTrack(track);
    const normalizedLang = normalizeLang(course || lang || user.lang);
    const pack = buildPlacementAssessmentPack(normalizedTrack, normalizedLang, user.id);

    const quizById = new Map(pack.quizQuestions.map((q) => [q.id, q]));
    const answerById = new Map<string, number>();
    for (const item of Array.isArray(quizAnswers) ? quizAnswers : []) {
      if (!item || typeof item.questionId !== "string") continue;
      const v = Number(item.selectedIndex);
      if (!Number.isFinite(v)) continue;
      answerById.set(item.questionId, Math.floor(v));
    }

    const quizTotal = pack.quizQuestions.length;
    let quizCorrect = 0;
    const quizReports = pack.quizQuestions.map((q) => {
      const selectedIndexRaw = answerById.get(q.id);
      const selectedIndex = Number.isFinite(Number(selectedIndexRaw)) ? Number(selectedIndexRaw) : -1;
      const isCorrect = selectedIndex === q.correctIndex;
      if (isCorrect) quizCorrect++;
      return {
        questionId: q.id,
        selectedIndex,
        correctIndex: q.correctIndex,
        isCorrect,
      };
    });
    const quizPct = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;

    const solutionByTaskId = new Map<string, string>();
    for (const item of Array.isArray(taskSolutions) ? taskSolutions : []) {
      if (!item || typeof item.taskId !== "string") continue;
      solutionByTaskId.set(item.taskId, String(item.code ?? ""));
    }

    const taskReports: Array<{
      taskId: string;
      passed: boolean;
      passedTests: number;
      totalTests: number;
      caseIndex?: number;
      stderr?: string | null;
      expected?: string;
      actual?: string;
    }> = [];

    let practicalPassed = 0;
    for (const task of pack.tasks) {
      const code = String(solutionByTaskId.get(task.id) ?? "").trim();
      if (!code) {
        taskReports.push({
          taskId: task.id,
          passed: false,
          passedTests: 0,
          totalTests: task.tests.length,
          stderr: "CODE_REQUIRED",
        });
        continue;
      }

      let passedCount = 0;
      let failedReport: {
        caseIndex?: number;
        stderr?: string | null;
        expected?: string;
        actual?: string;
      } | null = null;

      for (let i = 0; i < task.tests.length; i++) {
        const test = task.tests[i];
        const execRes = await executeCodeWithInput(code, normalizedLang, test.input, 8000);
        if (!execRes.success) {
          failedReport = {
            caseIndex: i,
            stderr: execRes.stderr || null,
          };
          break;
        }
        const actualTokens = normalizeTokens(execRes.stdout);
        const expectedTokens = test.expectedTokens;
        if (actualTokens.join(" ") !== expectedTokens.join(" ")) {
          failedReport = {
            caseIndex: i,
            expected: expectedTokens.join(" "),
            actual: actualTokens.join(" "),
          };
          break;
        }
        passedCount++;
      }

      const passed = failedReport == null;
      if (passed) practicalPassed++;
      taskReports.push({
        taskId: task.id,
        passed,
        passedTests: passedCount,
        totalTests: task.tests.length,
        ...(failedReport || {}),
      });
    }

    const practicalTotal = pack.tasks.length;
    const practicalPct = practicalTotal > 0 ? Math.round((practicalPassed / practicalTotal) * 100) : 0;
    const overallPct = Math.round(quizPct * 0.4 + practicalPct * 0.6);
    const finalLevel = computePlacementLevelFromAssessment(normalizedTrack, quizPct, practicalPassed, practicalTotal);

    user.lang = normalizedLang;
    user.placementDone = true;
    user.placementDoneAt = new Date();
    user.placementLevel = finalLevel;
    user.placementScore = Math.max(0, Math.min(100, overallPct));
    if (normalizedLang === "JAVA") {
      user.placementMasteredUntilTopicIndexJava = fallbackMasteredByLevel(finalLevel);
    } else {
      user.placementMasteredUntilTopicIndexPython = fallbackMasteredByLevel(finalLevel);
    }
    user.placementCodingPassed = practicalPassed >= 2;
    user.placementCodingLevel = finalLevel;
    user.placementCodingTaskId = `assessment:${normalizedTrack}`;
    user.placementCodingScore = practicalPct;
    user.placementCodingDoneAt = new Date();

    await userRepo().save(user);

    return res.json({
      user: buildUserDto(user),
      summary: {
        track: normalizedTrack,
        finalLevel,
        quizCorrect,
        quizTotal,
        quizPct,
        practicalPassed,
        practicalTotal,
        practicalPct,
        overallPct,
      },
      quizReports,
      taskReports,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.statusCode).json({ error: err.message, status: err.statusCode });
    }
    logger.error("[profile] POST /profile/placement/assessment-submit error", { requestId: req.requestId, userId: req.userId, err });
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", status: 500 });
  }
});

router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
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
          iad: 0,
          difus: 0,
          avatarUrl: student.avatarUrl ?? null,
          userMode: "EDUCATIONAL",
          studentId: student.id,
          classId: student.class.id,
          className: student.class.name,
          firstName: student.firstName,
          lastName: student.lastName,
          middleName: student.middleName,
          email: student.email,
          marketingEmailsEnabled: Boolean(student.marketingEmailsEnabled)
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
    if (denyContestProfileAccess(req, res)) return;
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
        iad: 0,
        difus: 0,
        avatarUrl: student.avatarUrl ?? null,
        userMode: "EDUCATIONAL",
        studentId: student.id,
        classId: student.class.id,
        className: student.class.name,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        email: student.email,
        marketingEmailsEnabled: Boolean(student.marketingEmailsEnabled)
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
      avatarData,
      contestHandles,
      publicProfilePrivacy
    } = req.body as {
      course?: string;
      lang?: string;
      avatarUrl?: string | null;
      avatarData?: string | null;
      contestHandles?: {
        codeforces?: string | null;
        atcoder?: string | null;
        leetcode?: string | null;
        codechef?: string | null;
      };
      publicProfilePrivacy?: {
        showContestStats?: boolean;
        showSolvedHistory?: boolean;
        showLanguageBreakdown?: boolean;
      };
    };
    if (course || lang) {
      user.lang = normalizeLang(course || lang);
    }
    if (avatarData?.startsWith("data:image/")) {
      user.avatarUrl = avatarData;
    } else if (avatarUrl !== undefined) {
      user.avatarUrl = avatarUrl;
    }

    if (contestHandles && typeof contestHandles === "object") {
      const activeCourse = user.lang;
      const byCourse = getContestHandlesByCourse(user);

      if (Object.prototype.hasOwnProperty.call(contestHandles, "codeforces")) {
        byCourse.codeforces = setCourseContestHandle(byCourse.codeforces, activeCourse, (contestHandles as any).codeforces, "codeforces");
      }
      if (Object.prototype.hasOwnProperty.call(contestHandles, "atcoder")) {
        byCourse.atcoder = setCourseContestHandle(byCourse.atcoder, activeCourse, (contestHandles as any).atcoder, "atcoder");
      }
      if (Object.prototype.hasOwnProperty.call(contestHandles, "leetcode")) {
        byCourse.leetcode = setCourseContestHandle(byCourse.leetcode, activeCourse, (contestHandles as any).leetcode, "leetcode");
      }
      if (Object.prototype.hasOwnProperty.call(contestHandles, "codechef")) {
        byCourse.codechef = setCourseContestHandle(byCourse.codechef, activeCourse, (contestHandles as any).codechef, "codechef");
      }

      user.cfHandle = serializeCourseHandleMap(byCourse.codeforces);
      user.atcoderHandle = serializeCourseHandleMap(byCourse.atcoder);
      user.leetcodeHandle = serializeCourseHandleMap(byCourse.leetcode);
      user.codechefHandle = serializeCourseHandleMap(byCourse.codechef);
    }

    if (publicProfilePrivacy && typeof publicProfilePrivacy === "object") {
      const currentMeta = parseUserProfileMeta(user.timezone ?? null);
      const nextPrivacy: PublicProfilePrivacy = {
        showContestStats:
          typeof publicProfilePrivacy.showContestStats === "boolean"
            ? publicProfilePrivacy.showContestStats
            : currentMeta.privacy.showContestStats,
        showSolvedHistory:
          typeof publicProfilePrivacy.showSolvedHistory === "boolean"
            ? publicProfilePrivacy.showSolvedHistory
            : currentMeta.privacy.showSolvedHistory,
        showLanguageBreakdown:
          typeof publicProfilePrivacy.showLanguageBreakdown === "boolean"
            ? publicProfilePrivacy.showLanguageBreakdown
            : currentMeta.privacy.showLanguageBreakdown,
      };
      user.timezone = serializeUserProfileMeta({
        timezone: currentMeta.timezone,
        privacy: nextPrivacy,
      });
    }
    await userRepo().save(user);
    return res.json(buildUserDto(user));
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    logger.error("[profile] PUT /profile/me error", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

router.get("/email-subscription", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
    if (req.userType === "STUDENT" && req.studentId) {
      const student = await studentRepo().findOne({ where: { id: req.studentId } });
      if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
      return res.json({ enabled: Boolean(student.marketingEmailsEnabled), email: student.email });
    }
    if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: "USER_NOT_FOUND" });
    return res.json({ enabled: Boolean(user.marketingEmailsEnabled), email: user.email ?? null });
  } catch (err) {
    logger.error("[profile] GET /profile/email-subscription error", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/email-subscription", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
    const enabled = Boolean((req.body as any)?.enabled);

    if (req.userType === "STUDENT" && req.studentId) {
      const student = await studentRepo().findOne({ where: { id: req.studentId } });
      if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
      student.marketingEmailsEnabled = enabled;
      await studentRepo().save(student);
      return res.json({ enabled: Boolean(student.marketingEmailsEnabled) });
    }

    if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: "USER_NOT_FOUND" });
    user.marketingEmailsEnabled = enabled;
    await userRepo().save(user);
    return res.json({ enabled: Boolean(user.marketingEmailsEnabled) });
  } catch (err) {
    logger.error("[profile] PUT /profile/email-subscription error", { requestId: req.requestId, principalId: req.principalId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/certificates", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;

    if (!req.userId && !req.studentId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const rows = (await AppDataSource.query(
      `
      SELECT c.certificate_id as certificateId,
             c.contest_id as contestId,
             c.participant_name as participantName,
             c.score as score,
             c.max_score as maxScore,
             c.place_text as placeText,
             c.organizer_name as organizerName,
             c.issued_at as issuedAt,
             c.status as status,
             c.pdf_storage_key as pdfStorageKey,
             c.created_at as createdAt,
             ct.title as contestTitle
      FROM certificates c
      JOIN contests ct ON ct.id = c.contest_id
      WHERE (${req.userId ? "c.user_id = ?" : "1 = 0"})
         OR (${req.studentId ? "c.student_id = ?" : "1 = 0"})
      ORDER BY COALESCE(c.issued_at, c.created_at) DESC, c.id DESC
      `,
      [
        ...(req.userId ? [req.userId] : []),
        ...(req.studentId ? [req.studentId] : []),
      ]
    )) as Array<any>;

    return res.json({
      certificates: rows.map((r) => ({
        certificateId: String(r.certificateId ?? ""),
        contestId: Number(r.contestId),
        contestTitle: String(r.contestTitle ?? ""),
        participantName: String(r.participantName ?? ""),
        score: Number(r.score ?? 0) || 0,
        maxScore: Number(r.maxScore ?? 0) || 0,
        place: r.placeText == null ? null : String(r.placeText),
        organizer: String(r.organizerName ?? ""),
        status: String(r.status ?? "queued"),
        issuedAt: r.issuedAt ? new Date(r.issuedAt).toISOString() : null,
        pdfStorageKey: r.pdfStorageKey == null ? null : String(r.pdfStorageKey),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      })),
    });
  } catch (err) {
    logger.error("[profile] GET /profile/certificates error", {
      requestId: req.requestId,
      principalId: req.principalId,
      err,
    });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/milestone-shown", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (denyContestProfileAccess(req, res)) return;
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
    if (denyContestProfileAccess(req, res)) return;
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

      const hasValidIncomingScore = typeof score === "number" && Number.isFinite(Number(score)) && Number(score) >= 0;
      if (hasValidIncomingScore) {
        (user as any).placementScore = Math.max(0, Math.min(100, Math.round(Number(score))));
      } else {
        const codingScore = Number((user as any).placementCodingScore ?? NaN);
        if (!Number.isFinite(codingScore)) {
          return res.status(400).json({
            message: "PLACEMENT_SCORE_REQUIRED"
          });
        }
        (user as any).placementScore = Math.max(0, Math.min(100, Math.round(codingScore)));
      }

      if (masteredUntilTopicIndex === undefined) {
        const byLevel: Record<"BEGINNER" | "INTERMEDIATE" | "ADVANCED", number | null> = {
          BEGINNER: null,
          INTERMEDIATE: 2,
          ADVANCED: 5,
        };
        const fallbackMastered = byLevel[level as "BEGINNER" | "INTERMEDIATE" | "ADVANCED"];
        if (normalizedLang === "JAVA") {
          (user as any).placementMasteredUntilTopicIndexJava = fallbackMastered;
        } else {
          (user as any).placementMasteredUntilTopicIndexPython = fallbackMastered;
        }
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