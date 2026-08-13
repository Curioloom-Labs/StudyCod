import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { User, UserRole } from "../entities/User";
import type { CourseRuntime } from "../entities/CourseVariant";
import { Class } from "../entities/Class";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import adminMaintenanceRouter from "./adminMaintenance";
import adminLibraryRouter from "./adminLibrary";
import adminMaterialsRouter from "./adminMaterials";
import adminBroadcastRouter from "./adminBroadcast";
import adminMailRouter from "./adminMail";
import adminBlogRouter from "./adminBlog";
import { logger } from "../utils/logger";
import { getUserIadForLang } from "../utils/iad";
import { DEFAULT_GRADING_SYSTEM, GRADING_SYSTEMS } from "../types/GradingSystem";
import { getExecutionQueueMode } from "../services/execution/distributedJudgeQueueSingleton";
import { revokeUserTokensBeforeTime } from "../services/auth/jwtRevocation";
import {
  getJudgeDeadLetterQueue,
  getJudgeExecutionMetrics,
  replayJudgeDeadLetterQueue,
} from "../services/judgeWorker";
const adminRouter = Router();
adminRouter.use("/maintenance", adminMaintenanceRouter);
adminRouter.use("/library", adminLibraryRouter);
adminRouter.use("/materials", adminMaterialsRouter);
adminRouter.use("/emails", adminBroadcastRouter);
adminRouter.use("/mail", adminMailRouter);
adminRouter.use("/blog", adminBlogRouter);
const userRepo = () => AppDataSource.getRepository(User);
const classRepo = () => AppDataSource.getRepository(Class);
function normalizeLang(input?: string | null): CourseRuntime {
  const raw = (input || "").toUpperCase().replace(/\s+/g, "").trim();
  if (raw === "CPP" || raw === "C++" || raw.startsWith("C++")) return "CPP";
  if (raw.startsWith("PY")) return "PYTHON";
  return "JAVA";
}
function buildUserDto(user: User) {
  const iadValue = getUserIadForLang(user, "PYTHON");
  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    emailVerified: user.emailVerified,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    userMode: user.userMode,
    role: user.role || null,
    activeRuntime: "PYTHON" as CourseRuntime,
    iad: iadValue ?? 0,
    difus: iadValue ?? 0,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().optional(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  userMode: z.enum(["PERSONAL", "EDUCATIONAL", "CONTEST"]).optional(),
  role: z.enum(["USER", "TEACHER", "SUPPORT", "SYSTEM_ADMIN"]).optional(),
  emailVerified: z.boolean().optional()
});
const updateUserRoleSchema = z.object({
  role: z.enum(["USER", "TEACHER", "SUPPORT", "SYSTEM_ADMIN"])
});
const createClassSchema = z.object({
  name: z.string().min(1).max(255),
  language: z.enum(["JAVA", "PYTHON", "CPP"]).optional(),
  gradingSystem: z.enum(GRADING_SYSTEMS).optional(),
  teacherId: z.number().int().positive()
});
const updateClassSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  language: z.enum(["JAVA", "PYTHON", "CPP"]).optional(),
  gradingSystem: z.enum(GRADING_SYSTEMS).optional(),
  teacherId: z.number().int().positive().optional()
});
adminRouter.post("/users", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const validated = createUserSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const data = validated.data;
    const existingUser = await userRepo().findOne({
      where: {
        username: data.username
      }
    });
    if (existingUser) {
      return res.status(400).json({
        message: "USERNAME_ALREADY_EXISTS"
      });
    }
    if (data.email) {
      const existingEmail = await userRepo().findOne({
        where: {
          email: data.email
        }
      });
      if (existingEmail) {
        return res.status(400).json({
          message: "EMAIL_ALREADY_EXISTS"
        });
      }
    }
    const hashedPassword = await bcrypt.hash(data.password, 10);
    let role: UserRole | null = data.role || null;
    if (!role) {
      role = data.userMode === "EDUCATIONAL" ? "TEACHER" : "USER";
    }
    const user = userRepo().create({
      username: data.username,
      email: data.email || null,
      password: hashedPassword,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      userMode: data.userMode || "PERSONAL",
      role: role,
      emailVerified: data.emailVerified ?? false,
      iadJava: 0,
      iadPython: 0,
      iadCpp: 0
    });
    await userRepo().save(user);
    return res.status(201).json({
      message: "User created successfully",
      user: buildUserDto(user)
    });
  } catch (error: any) {
    logger.error("[admin] POST /users error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.get("/users", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const DEFAULT_PAGE = 1;
    const DEFAULT_PAGE_SIZE = 50;
    const page = parseInt(req.query.page as string, 10) || DEFAULT_PAGE;
    const limit = parseInt(req.query.limit as string, 10) || DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * limit;
    const roleFilter = req.query.role as UserRole | undefined;
    const userModeFilter = req.query.userMode as "PERSONAL" | "EDUCATIONAL" | "CONTEST" | undefined;
    const queryBuilder = userRepo().createQueryBuilder("user");
    if (roleFilter) {
      queryBuilder.where("user.role = :role", {
        role: roleFilter
      });
    }
    if (userModeFilter) {
      queryBuilder.andWhere("user.userMode = :userMode", {
        userMode: userModeFilter
      });
    } else {
      // By default keep generated contest-only accounts out of the main admin users list.
      queryBuilder.andWhere("user.userMode <> :contestMode", {
        contestMode: "CONTEST"
      });
    }
    const [users, total] = await queryBuilder.orderBy("user.createdAt", "DESC").skip(skip).take(limit).getManyAndCount();
    return res.json({
      users: users.map(buildUserDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    logger.error("[admin] GET /users error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.get("/users/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({
        message: "INVALID_USER_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: userId
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    return res.json({
      user: buildUserDto(user)
    });
  } catch (error: any) {
    logger.error("[admin] GET /users/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.patch("/users/:id/role", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({
        message: "INVALID_USER_ID"
      });
    }
    if (userId === req.userId) {
      return res.status(400).json({
        message: "CANNOT_CHANGE_OWN_ROLE"
      });
    }
    const validated = updateUserRoleSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: userId
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    user.role = validated.data.role;
    await userRepo().save(user);
    await revokeUserTokensBeforeTime(user.id, Date.now());
    return res.json({
      message: "User role updated successfully",
      user: buildUserDto(user)
    });
  } catch (error: any) {
    logger.error("[admin] PATCH /users/:id/role error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.patch("/users/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({
        message: "INVALID_USER_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: userId
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    if (req.body.username && req.body.username !== user.username) {
      const existing = await userRepo().findOne({
        where: {
          username: req.body.username
        }
      });
      if (existing) {
        return res.status(400).json({
          message: "USERNAME_ALREADY_EXISTS"
        });
      }
      user.username = req.body.username;
    }
    if (req.body.email !== undefined) {
      if (req.body.email && req.body.email !== user.email) {
        const existing = await userRepo().findOne({
          where: {
            email: req.body.email
          }
        });
        if (existing) {
          return res.status(400).json({
            message: "EMAIL_ALREADY_EXISTS"
          });
        }
      }
      user.email = req.body.email || null;
    }
    if (req.body.firstName !== undefined) user.firstName = req.body.firstName || null;
    if (req.body.lastName !== undefined) user.lastName = req.body.lastName || null;
    if (req.body.userMode) user.userMode = req.body.userMode;
    if (req.body.emailVerified !== undefined) user.emailVerified = req.body.emailVerified;
    const securityChanged = Boolean(req.body.password || req.body.userMode);
    if (req.body.password) {
      user.password = await bcrypt.hash(req.body.password, 10);
    }
    await userRepo().save(user);
    if (securityChanged) await revokeUserTokensBeforeTime(user.id, Date.now());
    return res.json({
      message: "User updated successfully",
      user: buildUserDto(user)
    });
  } catch (error: any) {
    logger.error("[admin] PATCH /users/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.delete("/users/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({
        message: "INVALID_USER_ID"
      });
    }
    if (userId === req.userId) {
      return res.status(400).json({
        message: "CANNOT_DELETE_OWN_ACCOUNT"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: userId
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    await userRepo().remove(user);
    return res.json({
      message: "User deleted successfully"
    });
  } catch (error: any) {
    logger.error("[admin] DELETE /users/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.post("/classes", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const validated = createClassSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const data = validated.data;
    const teacher = await userRepo().findOne({
      where: {
        id: data.teacherId
      }
    });
    if (!teacher) {
      return res.status(404).json({
        message: "TEACHER_NOT_FOUND"
      });
    }
    const cls = classRepo().create({
      teacher: teacher,
      name: data.name,
      language: normalizeLang(data.language || "PYTHON"),
      gradingSystem: data.gradingSystem || DEFAULT_GRADING_SYSTEM
    });
    await classRepo().save(cls);
    return res.status(201).json({
      message: "Class created successfully",
      class: {
        id: cls.id,
        name: cls.name,
        language: cls.language,
        gradingSystem: cls.gradingSystem || DEFAULT_GRADING_SYSTEM,
        teacherId: teacher.id,
        teacherName: teacher.username,
        createdAt: cls.createdAt
      }
    });
  } catch (error: any) {
    logger.error("[admin] POST /classes error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.get("/classes", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const classes = await classRepo().find({
      relations: ["teacher"],
      order: {
        createdAt: "DESC"
      }
    });
    return res.json({
      classes: classes.map(cls => ({
        id: cls.id,
        name: cls.name,
        language: cls.language,
        gradingSystem: cls.gradingSystem || DEFAULT_GRADING_SYSTEM,
        teacherId: cls.teacher.id,
        teacherName: cls.teacher.username,
        createdAt: cls.createdAt,
        updatedAt: cls.updatedAt
      }))
    });
  } catch (error: any) {
    logger.error("[admin] GET /classes error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.patch("/classes/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id);
    if (isNaN(classId)) {
      return res.status(400).json({
        message: "INVALID_CLASS_ID"
      });
    }
    const validated = updateClassSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const data = validated.data;
    const cls = await classRepo().findOne({
      where: {
        id: classId
      },
      relations: ["teacher"]
    });
    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }
    if (data.name) cls.name = data.name;
    if (data.language) cls.language = normalizeLang(data.language);
    if (data.gradingSystem) cls.gradingSystem = data.gradingSystem;
    if (data.teacherId && data.teacherId !== cls.teacher.id) {
      const teacher = await userRepo().findOne({
        where: {
          id: data.teacherId
        }
      });
      if (!teacher) {
        return res.status(404).json({
          message: "TEACHER_NOT_FOUND"
        });
      }
      cls.teacher = teacher;
    }
    await classRepo().save(cls);
    return res.json({
      message: "Class updated successfully",
      class: {
        id: cls.id,
        name: cls.name,
        language: cls.language,
        gradingSystem: cls.gradingSystem || DEFAULT_GRADING_SYSTEM,
        teacherId: cls.teacher.id,
        teacherName: cls.teacher.username,
        updatedAt: cls.updatedAt
      }
    });
  } catch (error: any) {
    logger.error("[admin] PATCH /classes/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.delete("/classes/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id);
    if (isNaN(classId)) {
      return res.status(400).json({
        message: "INVALID_CLASS_ID"
      });
    }
    const cls = await classRepo().findOne({
      where: {
        id: classId
      }
    });
    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }
    await classRepo().remove(cls);
    return res.json({
      message: "Class deleted successfully"
    });
  } catch (error: any) {
    logger.error("[admin] DELETE /classes/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
adminRouter.get("/stats", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const totalUsers = await userRepo().count();
    const totalTeachers = await userRepo().count({
      where: {
        role: "TEACHER"
      }
    });
    const totalAdmins = await userRepo().count({
      where: {
        role: "SYSTEM_ADMIN"
      }
    });
    const totalClasses = await classRepo().count();
    const usersByMode = (await userRepo().createQueryBuilder("user").select("user.userMode", "mode").addSelect("COUNT(*)", "count").groupBy("user.userMode").getRawMany()) as Array<{
      mode: string;
      count: string;
    }>;
    return res.json({
      users: {
        total: totalUsers,
        teachers: totalTeachers,
        admins: totalAdmins,
        byMode: usersByMode.reduce((acc: Record<string, number>, row) => {
          acc[row.mode] = parseInt(row.count, 10);
          return acc;
        }, {} as Record<string, number>)
      },
      classes: {
        total: totalClasses
      }
    });
  } catch (error: any) {
    logger.error("[admin] GET /stats error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

adminRouter.get("/judge/load", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const metrics = getJudgeExecutionMetrics();
    const mode = getExecutionQueueMode();

    return res.json({
      mode,
      active: metrics.active,
      queued: metrics.queued,
      peakActive: metrics.peakActive,
      peakQueueLength: metrics.peakQueueLength,
      maxConcurrent: metrics.maxConcurrent,
      maxQueueSize: metrics.maxQueueSize,
      maxRetries: metrics.maxRetries,
      avgExecutionTimeMs: Math.round(metrics.avgExecutionTimeMs),
      avgQueueWaitTimeMs: Math.round(metrics.averageQueueWaitTime),
      totalRejectedQueueFull: metrics.totalRejectedQueueFull,
      totalRequeuedExpired: metrics.totalRequeuedExpired,
      totalDeadLettered: metrics.totalDeadLettered,
      deadLetterQueueLength: metrics.deadLetterQueueLength,
      totalCompleted: metrics.totalCompleted,
      started: metrics.started,
      sampledAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("[admin] GET /judge/load error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

adminRouter.get("/judge/dead-letter", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const limitRaw = Number.parseInt(String(req.query.limit ?? ""), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, limitRaw))
      : 50;

    const result = await getJudgeDeadLetterQueue(limit);
    return res.json({
      ...result,
      limit,
      sampledAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("[admin] GET /judge/dead-letter error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

adminRouter.post("/judge/dead-letter/replay", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const bodyLimit = Number.parseInt(String((req.body as any)?.limit ?? ""), 10);
    const limit = Number.isFinite(bodyLimit)
      ? Math.max(1, Math.min(500, bodyLimit))
      : 20;

    const result = await replayJudgeDeadLetterQueue(limit);
    return res.json({
      ...result,
      replayedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("[admin] POST /judge/dead-letter/replay error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
export default adminRouter;
