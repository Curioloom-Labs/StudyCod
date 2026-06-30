import { Router, Response } from "express";
import { z } from "zod";

import { AppDataSource } from "../../data-source";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { ClassAnnouncement } from "../../entities/ClassAnnouncement";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { emailService } from "../../services/emailService";
import { logger } from "../../utils/logger";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const announcementRepo = () => AppDataSource.getRepository(ClassAnnouncement);

const announcementCreateSchema = z.object({
  title: z.string().max(255).optional().nullable(),
  content: z.string().min(1),
  pinned: z.boolean().optional()
});

const announcementUpdateSchema = z.object({
  title: z.string().max(255).optional().nullable(),
  content: z.string().min(1).optional(),
  pinned: z.boolean().optional()
});

router.get("/classes/:classId/announcements", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    if (req.studentId) {
      const student = await studentRepo().findOne({
        where: { id: req.studentId },
        relations: ["class"]
      });

      if (!student || !student.class || student.class.id !== classId) {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
    } else {
      const access = await authorizeClassForReq(req, classId, "CLASS_VIEW");
      if (!access) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
      if (!access.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const items = await announcementRepo().find({
      where: { class: { id: classId } as any },
      relations: ["author"],
      order: { pinned: "DESC", createdAt: "DESC" }
    });

    return res.json({
      announcements: items.map(a => ({
        id: a.id,
        title: a.title,
        content: a.content,
        pinned: a.pinned,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        author: {
          id: a.author.id,
          name: `${a.author.firstName || ""} ${a.author.lastName || ""}`.trim() || a.author.username
        }
      }))
    });
  } catch (error) {
    logger.error("[edu/announcements] Error listing announcements", { requestId: req.requestId, principalId: req.principalId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/students/me/announcements", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const student = await studentRepo().findOne({
      where: { id: req.studentId },
      relations: ["class"]
    });

    if (!student || !student.class) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    const items = await announcementRepo().find({
      where: { class: { id: student.class.id } as any },
      relations: ["author"],
      order: { pinned: "DESC", createdAt: "DESC" },
      take: 50
    });

    return res.json({
      class: { id: student.class.id, name: student.class.name },
      announcements: items.map(a => ({
        id: a.id,
        title: a.title,
        content: a.content,
        pinned: a.pinned,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        author: {
          id: a.author.id,
          name: `${a.author.firstName || ""} ${a.author.lastName || ""}`.trim() || a.author.username
        }
      }))
    });
  } catch (error) {
    logger.error("[edu/announcements] Error listing student announcements", { requestId: req.requestId, studentId: req.studentId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/classes/:classId/announcements", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.studentId || req.userType === "STUDENT") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_CREATE_ANNOUNCEMENTS" });
    }

    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_CLASS_ID" });

    const parsed = announcementCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const access = await authorizeClassForReq(req, classId, "CONTENT_AUTHOR");
    if (!access) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    if (!access.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    const cls = access.cls;

    const author = await userRepo().findOne({ where: { id: req.userId } });
    if (!author) return res.status(404).json({ message: "USER_NOT_FOUND" });

    const ann = announcementRepo().create({
      class: cls,
      author,
      title: parsed.data.title ?? null,
      content: parsed.data.content,
      pinned: parsed.data.pinned ?? false
    });

    await announcementRepo().save(ann);

    res.status(201).json({ message: "ANNOUNCEMENT_CREATED", id: ann.id });

    // Fire-and-forget notifications.
    try {
      const students = await studentRepo().find({
        where: { class: { id: classId } as any },
        relations: ["class"]
      });

      const preview = (parsed.data.content || "").slice(0, 240);

      await Promise.allSettled(
        students
          .filter(s => !!s.email)
          .map(s =>
            emailService.sendAnnouncementEmail(
              s.email!,
              `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.generatedUsername,
              cls.name,
              parsed.data.title ?? null,
              preview
            )
          )
      );
    } catch (err) {
      logger.error("[edu/announcements] Failed to send announcement emails", { requestId: req.requestId, userId: req.userId, classId, err });
    }
  } catch (error) {
    logger.error("[edu/announcements] Error creating announcement", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/classes/:classId/announcements/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.studentId || req.userType === "STUDENT") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UPDATE_ANNOUNCEMENTS" });
    }

    const classId = parseInt(req.params.classId, 10);
    const id = parseInt(req.params.id, 10);
    if (isNaN(classId) || isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const parsed = announcementUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const ann = await announcementRepo().findOne({
      where: { id, class: { id: classId } as any },
      relations: ["class", "class.teacher"]
    });

    if (!ann) return res.status(404).json({ message: "ANNOUNCEMENT_NOT_FOUND" });

    const annAccess = ann.class?.id ? await authorizeClassForReq(req, ann.class.id, "CONTENT_AUTHOR") : null;
    if (!annAccess || !annAccess.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    if ("title" in parsed.data) ann.title = parsed.data.title ?? null;
    if (parsed.data.content !== undefined) ann.content = parsed.data.content;
    if (parsed.data.pinned !== undefined) ann.pinned = parsed.data.pinned;

    await announcementRepo().save(ann);

    return res.json({ message: "ANNOUNCEMENT_UPDATED" });
  } catch (error) {
    logger.error("[edu/announcements] Error updating announcement", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.delete("/classes/:classId/announcements/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.studentId || req.userType === "STUDENT") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_DELETE_ANNOUNCEMENTS" });
    }

    const classId = parseInt(req.params.classId, 10);
    const id = parseInt(req.params.id, 10);
    if (isNaN(classId) || isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const ann = await announcementRepo().findOne({
      where: { id, class: { id: classId } as any },
      relations: ["class", "class.teacher"]
    });

    if (!ann) return res.status(404).json({ message: "ANNOUNCEMENT_NOT_FOUND" });

    const annAccess = ann.class?.id ? await authorizeClassForReq(req, ann.class.id, "CONTENT_AUTHOR") : null;
    if (!annAccess || !annAccess.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    await announcementRepo().remove(ann);

    return res.json({ message: "ANNOUNCEMENT_DELETED" });
  } catch (error) {
    logger.error("[edu/announcements] Error deleting announcement", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
