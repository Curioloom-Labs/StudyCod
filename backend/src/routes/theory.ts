import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { TopicNew, TopicLanguage } from "../entities/TopicNew";
import { IsNull } from "typeorm";
import { logger } from "../utils/logger";

export const theoryRouter = Router();

const topicRepo = () => AppDataSource.getRepository(TopicNew);

theoryRouter.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const language = String(req.query.language || "").toUpperCase().trim();
    if (language !== "JAVA" && language !== "PYTHON") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topics = await topicRepo().find({
      where: {
        language: language as TopicLanguage,
        class: IsNull() as any
      } as any,
      order: { order: "ASC" },
      relations: ["theoryBlock"]
    });

    // DTO optimized for theory reading.
    return res.json({
      topics: topics.map(t => ({
        id: t.id,
        title: t.title,
        order: t.order,
        description: t.description ?? null,
        language: t.language,
        theory: t.theoryBlock
          ? {
              id: t.theoryBlock.id,
              title: t.theoryBlock.title,
              content: t.theoryBlock.content,
              version: t.theoryBlock.version,
              updatedAt: t.theoryBlock.updatedAt
            }
          : null
      }))
    });
  } catch (error: any) {
    logger.error("[theory] GET / error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});
