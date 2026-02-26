import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { TopicNew, TopicLanguage } from "../entities/TopicNew";
import { IsNull } from "typeorm";
import { logger } from "../utils/logger";
import { looksLikeTranslationProviderErrorText, translateMarkdownUkToEn, translateTextUkToEn } from "../services/translation/translateUkToEn";
import { TheoryBlock } from "../entities/TheoryBlock";
import { hasTheoryBlockEnTranslationColumns } from "../services/translation/translationSchema";

export const theoryRouter = Router();

const topicRepo = () => AppDataSource.getRepository(TopicNew);
const theoryBlockRepo = () => AppDataSource.getRepository(TheoryBlock);

theoryRouter.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const language = String(req.query.language || "").toUpperCase().trim();
    const uiLang = String((req.query as any)?.uiLang ?? "").toLowerCase().trim();
    const wantsEn = uiLang.startsWith("en");
    if (language !== "JAVA" && language !== "PYTHON" && language !== "CPP") {
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

    // Lazily translate theory blocks for English UI and store once in DB.
    // Translation columns are marked select:false, so we explicitly select them.
    const localizedEnById = new Map<number, TheoryBlock>();
    if (wantsEn) {
      const hasCols = await hasTheoryBlockEnTranslationColumns();
      if (hasCols) {
        const ids = Array.from(
          new Set(
            topics
              .map(t => (t.theoryBlock ? t.theoryBlock.id : null))
              .filter((x): x is number => typeof x === "number")
          )
        );

        if (ids.length > 0) {
          const blocks = await theoryBlockRepo()
            .createQueryBuilder("b")
            .where("b.id IN (:...ids)", { ids })
            .addSelect(["b.titleEn", "b.contentEn", "b.translationVersionEn", "b.translatedAtEn"])
            .getMany();

          for (const b of blocks) localizedEnById.set(b.id, b);

          // Translate missing/stale ones (sequential to be gentle to free API)
          for (const id of ids) {
            const b = localizedEnById.get(id);
            if (!b) continue;
            const titleEn = String(b.titleEn ?? "");
            const contentEn = String(b.contentEn ?? "");
            const isFresh =
              titleEn.trim().length > 0 &&
              contentEn.trim().length > 0 &&
              !looksLikeTranslationProviderErrorText(titleEn) &&
              !looksLikeTranslationProviderErrorText(contentEn) &&
              Number(b.translationVersionEn ?? 0) === Number(b.version ?? 0);
            if (isFresh) continue;

            try {
              const [titleEn, contentEn] = await Promise.all([
                translateTextUkToEn(b.title),
                translateMarkdownUkToEn(b.content)
              ]);

              b.titleEn = titleEn;
              b.contentEn = contentEn;
              b.translationVersionEn = Number(b.version ?? 1);
              b.translatedAtEn = new Date();
              await theoryBlockRepo().save(b);
              localizedEnById.set(b.id, b);
            } catch (error: any) {
              logger.warn("[theory] translate uk->en failed", {
                requestId: req.requestId,
                userId: req.userId,
                theoryBlockId: b.id,
                error: error?.message ?? String(error)
              });
              // Best-effort: fall back to Ukrainian content.
            }
          }
        }
      } else {
        logger.warn("[theory] EN translation requested but DB columns are missing; serving uk content", {
          requestId: req.requestId,
          userId: req.userId
        });
      }
    }

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
              title: (() => {
                if (!wantsEn) return t.theoryBlock!.title;
                const b = localizedEnById.get(t.theoryBlock!.id);
                const ok =
                  b &&
                  Number(b.translationVersionEn ?? 0) === Number(b.version ?? 0) &&
                  String(b.titleEn ?? "").trim() &&
                  !looksLikeTranslationProviderErrorText(String(b.titleEn ?? ""));
                return ok ? (b!.titleEn as string) : t.theoryBlock!.title;
              })(),
              content: (() => {
                if (!wantsEn) return t.theoryBlock!.content;
                const b = localizedEnById.get(t.theoryBlock!.id);
                const ok =
                  b &&
                  Number(b.translationVersionEn ?? 0) === Number(b.version ?? 0) &&
                  String(b.contentEn ?? "").trim() &&
                  !looksLikeTranslationProviderErrorText(String(b.contentEn ?? ""));
                return ok ? (b!.contentEn as string) : t.theoryBlock!.content;
              })(),
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
