import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { TopicNew, TopicLanguage } from "../entities/TopicNew";
import { Topic } from "../entities/Topic";
import { TheoryBlock } from "../entities/TheoryBlock";
import { TheoryBlockRevision, TheoryBlockRevisionAction } from "../entities/TheoryBlockRevision";
import { IsNull, Not } from "typeorm";
import { logger } from "../utils/logger";
import { parse as parseYaml } from "yaml";

const adminMaterialsRouter = Router();

const topicRepo = () => AppDataSource.getRepository(TopicNew);
const theoryBlockRepo = () => AppDataSource.getRepository(TheoryBlock);
const theoryBlockRevisionRepo = () => AppDataSource.getRepository(TheoryBlockRevision);

function parseMaybeJsonTags(tags: string | null | undefined): any {
  if (tags === null || tags === undefined) return null;
  const s = String(tags);
  if (!s.trim()) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function buildTheorySnapshot(block: TheoryBlock): { title: string; content: string; level: number | null; tags: any } {
  return {
    title: String(block.title ?? "").trim(),
    content: String(block.content ?? ""),
    level: block.level === undefined ? null : (block.level ?? null),
    tags: parseMaybeJsonTags(block.tags)
  };
}

async function tryStoreTheoryRevision(params: {
  theoryBlock: TheoryBlock;
  version: number;
  action: TheoryBlockRevisionAction;
  comment?: string | null;
  createdByUserId?: number;
}): Promise<void> {
  try {
    const snapshot = buildTheorySnapshot(params.theoryBlock);
    await theoryBlockRevisionRepo().save(
      theoryBlockRevisionRepo().create({
        theoryBlockId: params.theoryBlock.id,
        theoryBlock: { id: params.theoryBlock.id } as any,
        version: params.version,
        action: params.action,
        comment: params.comment ?? null,
        snapshot: JSON.stringify(snapshot),
        createdByUserId: params.createdByUserId ?? null,
        createdBy: params.createdByUserId ? ({ id: params.createdByUserId } as any) : null
      })
    );
  } catch (error: any) {
    logger.warn("[admin/materials] Failed to store theory revision", {
      theoryBlockId: params.theoryBlock.id,
      version: params.version,
      action: params.action,
      error: error?.message || error
    });
  }
}

function assertTheoryContentIsPure(content: string): void {
  const t = String(content ?? "").trim();
  if (!t) throw new Error("THEORY_EMPTY");

  // Prevent mixing practice/task statements into theory.
  const forbiddenHeaders =
    /(###\s*(Практика|Practice)\b)|(###\s*(Завдання|Вправа|Task|Exercise)\b)|(Умова\s+задачі)|(Формат\s+вхідних\s+даних)|(Формат\s+вихідних\s+даних)/i;
  if (forbiddenHeaders.test(t)) {
    throw new Error("THEORY_CONTAINS_PRACTICE");
  }

  const forbiddenImperatives =
    /\b(виконайте|обчисліть|знайдіть|розв\s*яжіть|напис(ати|іть)\s+програм(у|у)|зчитайте|прочитайте|введіть|input\s*\(|read\s+from\s+stdin)\b/i;
  if (forbiddenImperatives.test(t)) {
    throw new Error("THEORY_CONTAINS_TASK_INSTRUCTIONS");
  }
}

const languageSchema = z.enum(["JAVA", "PYTHON"]);

const createTopicSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  language: languageSchema,
  // For now we only manage global topics (class=null). classId can be added later if needed.
  theory: z
    .object({
      title: z.string().min(1).max(255).optional(),
      content: z.string().min(1),
      level: z.number().int().nullable().optional(),
      tags: z.any().optional()
    })
    .nullable()
    .optional()
});

const updateTopicSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  language: languageSchema.optional(),
  theory: z
    .object({
      title: z.string().min(1).max(255).optional(),
      content: z.string().min(1),
      level: z.number().int().nullable().optional(),
      tags: z.any().optional()
    })
    .nullable()
    .optional(),
  clearTheory: z.boolean().optional(),
  theoryRevisionAction: z.enum(["UPDATE", "AUTO"]).optional(),
  theoryRevisionComment: z.string().max(255).optional()
});

const reorderSchema = z.object({
  language: languageSchema,
  orderedIds: z.array(z.number().int().positive()).min(1)
});

const importYamlSchema = z.object({
  // If omitted, we try to read it from YAML root.
  language: languageSchema.optional(),
  yaml: z.string().min(1),
  mode: z.enum(["merge", "replace"]).optional()
});

const importLegacySchema = z.object({
  language: languageSchema,
  mode: z.enum(["merge", "replace"]).optional()
});

type ImportYamlTopic = {
  title: string;
  description?: string | null;
  order?: number;
  theory?:
    | {
        title?: string;
        content: string;
        level?: number | null;
        tags?: any;
      }
    | string
    | null;
};

function normalizeImportTopic(raw: any, index: number): ImportYamlTopic {
  if (!raw || typeof raw !== "object") {
    throw new Error(`INVALID_TOPIC_AT_${index}`);
  }

  const title = String((raw as any).title ?? "").trim();
  if (!title) throw new Error(`TOPIC_TITLE_REQUIRED_AT_${index}`);

  const descriptionRaw = (raw as any).description;
  const description = descriptionRaw === undefined ? undefined : descriptionRaw === null ? null : String(descriptionRaw);

  const orderRaw = (raw as any).order;
  const order = orderRaw === undefined || orderRaw === null || orderRaw === "" ? undefined : Number(orderRaw);
  if (order !== undefined && (!Number.isFinite(order) || order < 0 || !Number.isInteger(order))) {
    throw new Error(`TOPIC_ORDER_INVALID_AT_${index}`);
  }

  const theoryRaw = (raw as any).theory;
  let theory: ImportYamlTopic["theory"] = undefined;
  if (theoryRaw === undefined) {
    theory = undefined;
  } else if (theoryRaw === null) {
    theory = null;
  } else if (typeof theoryRaw === "string") {
    theory = theoryRaw;
  } else if (typeof theoryRaw === "object") {
    const content = String((theoryRaw as any).content ?? "");
    const ttitle = (theoryRaw as any).title === undefined ? undefined : String((theoryRaw as any).title ?? "");
    const levelRaw = (theoryRaw as any).level;
    const level = levelRaw === undefined ? undefined : levelRaw === null ? null : Number(levelRaw);
    if (level !== undefined && level !== null && (!Number.isFinite(level) || !Number.isInteger(level))) {
      throw new Error(`THEORY_LEVEL_INVALID_AT_${index}`);
    }
    theory = {
      title: ttitle,
      content,
      level: level as any,
      tags: (theoryRaw as any).tags
    };
  } else {
    throw new Error(`THEORY_INVALID_AT_${index}`);
  }

  return {
    title,
    description,
    order,
    theory
  };
}

function parseImportYamlPayload(yamlText: string): { language?: TopicLanguage; topics: ImportYamlTopic[] } {
  let doc: any;
  try {
    doc = parseYaml(String(yamlText ?? ""));
  } catch {
    throw new Error("INVALID_YAML");
  }

  if (!doc) {
    throw new Error("INVALID_YAML");
  }

  // Allow either:
  // - { language: JAVA, topics: [...] }
  // - [...] (topics array) with language taken from request
  const langRaw = typeof doc === "object" && !Array.isArray(doc) ? (doc as any).language : undefined;
  const language = langRaw ? String(langRaw).toUpperCase().trim() : undefined;
  const parsedLanguage = language === "JAVA" || language === "PYTHON" ? (language as TopicLanguage) : undefined;

  const topicsRaw = Array.isArray(doc) ? doc : (doc as any).topics;
  if (!Array.isArray(topicsRaw)) {
    throw new Error("INVALID_YAML_STRUCTURE");
  }

  const topics: ImportYamlTopic[] = topicsRaw.map((t: any, idx: number) => normalizeImportTopic(t, idx));
  return { language: parsedLanguage, topics };
}

adminMaterialsRouter.get("/topics", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const language = req.query.language as string | undefined;
    if (language && language !== "JAVA" && language !== "PYTHON") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topics = await topicRepo().find({
      where: {
        ...(language ? { language: language as TopicLanguage } : {}),
        class: IsNull() as any
      } as any,
      order: { order: "ASC" },
      relations: ["theoryBlock"]
    });

    return res.json({ topics });
  } catch (error: any) {
    logger.error("[admin/materials] GET /topics error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Bulk reorder global topics for drag&drop UI.
adminMaterialsRouter.patch("/topics/reorder", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const validated = reorderSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const { language, orderedIds } = validated.data;

    // Ensure all IDs exist and belong to global topics with the same language.
    const topics = await topicRepo().find({
      where: {
        language,
        class: IsNull() as any
      } as any,
      order: { order: "ASC" }
    });

    const existingIds = new Set(topics.map(t => t.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        return res.status(400).json({ message: "TOPIC_NOT_FOUND_OR_NOT_GLOBAL" });
      }
    }

    // Keep any topics not present in orderedIds at the end (stable).
    const seen = new Set<number>();
    const normalized = orderedIds.filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const tail = topics.map(t => t.id).filter(id => !seen.has(id));
    const finalOrder = [...normalized, ...tail];

    await AppDataSource.transaction(async manager => {
      // Use 1-based ordering to keep UI intuitive.
      for (let i = 0; i < finalOrder.length; i++) {
        const id = finalOrder[i];
        await manager.update(TopicNew, { id }, { order: i + 1 } as any);
      }
    });

    const updated = await topicRepo().find({
      where: {
        language,
        class: IsNull() as any
      } as any,
      order: { order: "ASC" },
      relations: ["theoryBlock"]
    });

    return res.json({ topics: updated });
  } catch (error: any) {
    logger.error("[admin/materials] PATCH /topics/reorder error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

adminMaterialsRouter.post("/topics", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const validated = createTopicSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const data = validated.data;

    let topicOrder = data.order;
    if (topicOrder === undefined || topicOrder === null) {
      const maxOrderTopic = await topicRepo().findOne({
        where: {
          language: data.language,
          class: IsNull() as any
        } as any,
        order: { order: "DESC" }
      });
      topicOrder = (maxOrderTopic?.order ?? 0) + 1;
    }

    let theoryBlock: TheoryBlock | null = null;
    if (data.theory && data.theory.content) {
      const normalizedContent = String(data.theory.content).trim();
      assertTheoryContentIsPure(normalizedContent);
      const created = theoryBlockRepo().create({
        title: String(data.theory.title || data.title).trim(),
        content: normalizedContent,
        version: 1,
        level: data.theory.level === undefined ? null : data.theory.level,
        tags: data.theory.tags === undefined ? null : JSON.stringify(data.theory.tags)
      });
      const savedBlock = await theoryBlockRepo().save(created);
      theoryBlock = savedBlock;
      await tryStoreTheoryRevision({
        theoryBlock: savedBlock,
        version: savedBlock.version,
        action: "CREATE",
        comment: null,
        createdByUserId: req.userId
      });
    }

    const topic = topicRepo().create({
      title: data.title.trim(),
      description: data.description ?? null,
      order: topicOrder,
      language: data.language,
      class: null,
      theoryBlock: theoryBlock ? ({ id: theoryBlock.id } as any) : null
    });

    const saved = await topicRepo().save(topic);
    const full = await topicRepo().findOne({ where: { id: saved.id }, relations: ["theoryBlock"] });

    return res.status(201).json({ topic: full ?? saved });
  } catch (error: any) {
    const msg = error?.message || "INTERNAL_SERVER_ERROR";
    if (msg === "THEORY_EMPTY") return res.status(400).json({ message: "THEORY_EMPTY" });
    if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({ message: "THEORY_CONTAINS_PRACTICE" });
    if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({ message: "THEORY_CONTAINS_TASK_INSTRUCTIONS" });

    logger.error("[admin/materials] POST /topics error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Import global topics + theory from YAML (paste or upload in UI and send as text).
// This is designed to seed an empty DB quickly.
adminMaterialsRouter.post("/import/yaml", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const validated = importYamlSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const { yaml, mode } = validated.data;
    const parsed = parseImportYamlPayload(yaml);
    const language = (validated.data.language ?? parsed.language) as TopicLanguage | undefined;
    if (language !== "JAVA" && language !== "PYTHON") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topicsToImport = parsed.topics;
    if (!topicsToImport.length) {
      return res.status(400).json({ message: "NO_TOPICS" });
    }

    const importMode = mode ?? "merge";

    const result = await AppDataSource.transaction(async manager => {
      const tRepo = manager.getRepository(TopicNew);
      const bRepo = manager.getRepository(TheoryBlock);
      const rRepo = manager.getRepository(TheoryBlockRevision);

      const existingTopics = await tRepo.find({
        where: { language, class: IsNull() as any } as any,
        relations: ["theoryBlock", "tasks", "controlWorks", "class"] as any,
        order: { order: "ASC" } as any
      });

      if (importMode === "replace") {
        // Safety: block deletion if global topic already has tasks/control works.
        for (const t of existingTopics) {
          if ((t as any).class) continue;
          if ((t as any).tasks?.length || (t as any).controlWorks?.length) {
            throw new Error("TOPIC_NOT_EMPTY");
          }
        }
        if (existingTopics.length) {
          await tRepo.remove(existingTopics);
        }
      }

      const afterDeleteExisting = importMode === "replace" ? [] : existingTopics;
      const existingByTitle = new Map<string, TopicNew>();
      for (const t of afterDeleteExisting) {
        const key = String(t.title ?? "").trim().toLowerCase();
        if (key && !existingByTitle.has(key)) existingByTitle.set(key, t);
      }

      // Determine next order when not provided.
      const maxOrder = afterDeleteExisting.reduce((acc, t) => Math.max(acc, Number(t.order ?? 0)), 0);
      let nextOrder = maxOrder + 1;

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (let i = 0; i < topicsToImport.length; i++) {
        const it = topicsToImport[i];
        const key = String(it.title ?? "").trim().toLowerCase();
        if (!key) {
          skipped++;
          continue;
        }

        const targetOrder = it.order ?? nextOrder++;
        const nextDescription = it.description === undefined ? undefined : it.description;

        const theoryObj = (() => {
          if (it.theory === undefined) return undefined;
          if (it.theory === null) return null;
          if (typeof it.theory === "string") {
            return { title: it.title, content: it.theory };
          }
          return it.theory;
        })();

        const existing = existingByTitle.get(key);
        if (existing) {
          let changed = false;

          if (existing.title !== it.title) {
            existing.title = it.title;
            changed = true;
          }
          if (nextDescription !== undefined && (existing.description ?? null) !== (nextDescription ?? null)) {
            existing.description = nextDescription as any;
            changed = true;
          }
          if (Number(existing.order ?? 0) !== Number(targetOrder)) {
            existing.order = targetOrder as any;
            changed = true;
          }

          // Merge theory if provided.
          if (theoryObj && typeof theoryObj.content === "string" && theoryObj.content.trim()) {
            const normalizedContent = String(theoryObj.content).trim();
            assertTheoryContentIsPure(normalizedContent);

            const block = (existing as any).theoryBlock as TheoryBlock | null;
            const nextTitle = String(theoryObj.title || existing.title).trim();
            const nextLevel = (theoryObj as any).level === undefined ? (block?.level ?? null) : ((theoryObj as any).level ?? null);
            const nextTags = (theoryObj as any).tags === undefined ? (block?.tags ?? null) : JSON.stringify((theoryObj as any).tags);

            if (block) {
              const needsUpdate =
                String(block.title ?? "") !== nextTitle ||
                String(block.content ?? "") !== normalizedContent ||
                (block.level ?? null) !== (nextLevel ?? null) ||
                (block.tags ?? null) !== (nextTags ?? null);
              if (needsUpdate) {
                block.title = nextTitle;
                block.content = normalizedContent;
                block.level = nextLevel;
                block.tags = nextTags;
                block.version = Number(block.version ?? 1) + 1;
                const savedBlock = await bRepo.save(block);
                await rRepo.save(
                  rRepo.create({
                    theoryBlockId: savedBlock.id,
                    theoryBlock: { id: savedBlock.id } as any,
                    version: savedBlock.version,
                    action: "UPDATE" as any,
                    comment: "import:yaml",
                    snapshot: JSON.stringify(buildTheorySnapshot(savedBlock)),
                    createdByUserId: req.userId ?? null,
                    createdBy: req.userId ? ({ id: req.userId } as any) : null
                  })
                );
              }
            } else {
              const createdBlock = await bRepo.save(
                bRepo.create({
                  title: nextTitle,
                  content: normalizedContent,
                  version: 1,
                  level: (theoryObj as any).level === undefined ? null : ((theoryObj as any).level ?? null),
                  tags: (theoryObj as any).tags === undefined ? null : JSON.stringify((theoryObj as any).tags)
                })
              );
              (existing as any).theoryBlock = { id: createdBlock.id } as any;
              await rRepo.save(
                rRepo.create({
                  theoryBlockId: createdBlock.id,
                  theoryBlock: { id: createdBlock.id } as any,
                  version: createdBlock.version,
                  action: "CREATE" as any,
                  comment: "import:yaml",
                  snapshot: JSON.stringify(buildTheorySnapshot(createdBlock)),
                  createdByUserId: req.userId ?? null,
                  createdBy: req.userId ? ({ id: req.userId } as any) : null
                })
              );
            }
          }

          if (changed) {
            await tRepo.save(existing);
          }

          updated++;
        } else {
          let theoryBlock: TheoryBlock | null = null;
          if (theoryObj && typeof theoryObj.content === "string" && theoryObj.content.trim()) {
            const normalizedContent = String(theoryObj.content).trim();
            assertTheoryContentIsPure(normalizedContent);
            const createdBlock = await bRepo.save(
              bRepo.create({
                title: String(theoryObj.title || it.title).trim(),
                content: normalizedContent,
                version: 1,
                level: (theoryObj as any).level === undefined ? null : ((theoryObj as any).level ?? null),
                tags: (theoryObj as any).tags === undefined ? null : JSON.stringify((theoryObj as any).tags)
              })
            );
            theoryBlock = createdBlock;
            await rRepo.save(
              rRepo.create({
                theoryBlockId: createdBlock.id,
                theoryBlock: { id: createdBlock.id } as any,
                version: createdBlock.version,
                action: "CREATE" as any,
                comment: "import:yaml",
                snapshot: JSON.stringify(buildTheorySnapshot(createdBlock)),
                createdByUserId: req.userId ?? null,
                createdBy: req.userId ? ({ id: req.userId } as any) : null
              })
            );
          }

          const createdTopic = await tRepo.save(
            tRepo.create({
              title: it.title,
              description: nextDescription === undefined ? null : (nextDescription ?? null),
              order: targetOrder,
              language,
              class: null,
              theoryBlock: theoryBlock ? ({ id: theoryBlock.id } as any) : null
            })
          );

          existingByTitle.set(key, createdTopic);
          created++;
        }
      }

      // Normalize ordering (1..N) to avoid duplicates/gaps after import.
      const finalList = await tRepo.find({
        where: { language, class: IsNull() as any } as any,
        order: { order: "ASC" } as any,
        relations: ["theoryBlock"] as any
      });
      for (let i = 0; i < finalList.length; i++) {
        const t = finalList[i];
        const desired = i + 1;
        if (Number(t.order ?? 0) !== desired) {
          await tRepo.update({ id: t.id } as any, { order: desired } as any);
          (t as any).order = desired;
        }
      }

      const refreshed = await tRepo.find({
        where: { language, class: IsNull() as any } as any,
        order: { order: "ASC" } as any,
        relations: ["theoryBlock"] as any
      });

      return { created, updated, skipped, topics: refreshed };
    });

    return res.json(result);
  } catch (error: any) {
    const msg = error?.message || "INTERNAL_SERVER_ERROR";
    if (msg === "INVALID_YAML" || msg === "INVALID_YAML_STRUCTURE") {
      return res.status(400).json({ message: msg });
    }
    if (msg === "TOPIC_NOT_EMPTY") {
      return res.status(400).json({ message: "TOPIC_NOT_EMPTY" });
    }
    if (msg === "THEORY_EMPTY") return res.status(400).json({ message: "THEORY_EMPTY" });
    if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({ message: "THEORY_CONTAINS_PRACTICE" });
    if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({ message: "THEORY_CONTAINS_TASK_INSTRUCTIONS" });

    logger.error("[admin/materials] POST /import/yaml error", { requestId: (req as any).requestId, userId: (req as any).userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Diagnostics helper: tells how many topics exist in different storages.
// Useful when UI shows "No topics" but DB has legacy topics or class-specific topics.
adminMaterialsRouter.get("/diagnostics", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const language = String(req.query.language || "").toUpperCase().trim();
    if (language !== "JAVA" && language !== "PYTHON") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topicsNewGlobal = await topicRepo().count({
      where: {
        language: language as TopicLanguage,
        class: IsNull() as any
      } as any
    });

    const topicsNewClass = await topicRepo().count({
      where: {
        language: language as TopicLanguage,
        class: Not(IsNull()) as any
      } as any
    });

    const legacyTopics = await AppDataSource.getRepository(Topic).count({
      where: {
        lang: language as any
      } as any
    });

    return res.json({
      language,
      topicsNewGlobal,
      topicsNewClass,
      legacyTopics
    });
  } catch (error: any) {
    logger.error("[admin/materials] GET /diagnostics error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Import from legacy `topics` table (old system) into `topics_new` as global topics.
// This solves the common scenario when DB already has records in `topics` but admin materials UI works with `topics_new`.
adminMaterialsRouter.post("/import/legacy-topics", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const validated = importLegacySchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const { language, mode } = validated.data;
    const importMode = mode ?? "merge";

    const legacy = await AppDataSource.getRepository(Topic).find({
      where: { lang: language } as any,
      order: { topicIndex: "ASC" } as any,
      relations: ["theoryBlock"] as any
    });

    if (!legacy.length) {
      return res.status(400).json({ message: "NO_LEGACY_TOPICS" });
    }

    const result = await AppDataSource.transaction(async manager => {
      const tRepo = manager.getRepository(TopicNew);
      const legacyRepo = manager.getRepository(Topic);
      const bRepo = manager.getRepository(TheoryBlock);
      const rRepo = manager.getRepository(TheoryBlockRevision);

      // Load existing global topics for the language.
      const existingTopics = await tRepo.find({
        where: { language, class: IsNull() as any } as any,
        relations: ["theoryBlock", "tasks", "controlWorks", "class"] as any,
        order: { order: "ASC" } as any
      });

      if (importMode === "replace") {
        // Safety: block deletion if global topic already has tasks/control works.
        for (const t of existingTopics) {
          if ((t as any).class) continue;
          if ((t as any).tasks?.length || (t as any).controlWorks?.length) {
            throw new Error("TOPIC_NOT_EMPTY");
          }
        }
        if (existingTopics.length) {
          await tRepo.remove(existingTopics);
        }
      }

      const afterDeleteExisting = importMode === "replace" ? [] : existingTopics;
      const existingByTitle = new Map<string, TopicNew>();
      for (const t of afterDeleteExisting) {
        const key = String(t.title ?? "").trim().toLowerCase();
        if (key && !existingByTitle.has(key)) existingByTitle.set(key, t);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      const ensureRevisionExists = async (block: TheoryBlock, comment: string) => {
        // Revisions are unique by (theoryBlockId, version). During legacy import we may attach an existing
        // theory block that already has revisions; avoid throwing on duplicates.
        const exists = await rRepo.findOne({ where: { theoryBlockId: block.id, version: block.version } as any });
        if (exists) return;
        await rRepo.save(
          rRepo.create({
            theoryBlockId: block.id,
            theoryBlock: { id: block.id } as any,
            version: block.version,
            action: "CREATE" as any,
            comment,
            snapshot: JSON.stringify(buildTheorySnapshot(block)),
            createdByUserId: req.userId ?? null,
            createdBy: req.userId ? ({ id: req.userId } as any) : null
          })
        );
      };

      for (let i = 0; i < legacy.length; i++) {
        const src = legacy[i];
        const title = String((src as any).title ?? "").trim();
        if (!title) {
          skipped++;
          continue;
        }

        const orderRaw = (src as any).topicIndex;
        const targetOrder = Number.isFinite(Number(orderRaw)) ? Math.max(0, Math.floor(Number(orderRaw))) : i + 1;

        const legacyBlock = ((src as any).theoryBlock as TheoryBlock | null) ?? null;
        const legacyBlockId = Number((src as any).theoryBlockId ?? legacyBlock?.id ?? 0) || null;

        const contentCandidate = String((src as any).theoryMarkdown ?? "").trim();
        const content = contentCandidate ? contentCandidate : "";

        const key = title.toLowerCase();
        const existing = existingByTitle.get(key);

        const upsertTheory = async (topic: TopicNew) => {
          // Prefer attaching an already-migrated legacy theory block (topics.theory_block_id).
          if (legacyBlockId) {
            const existingBlock = (topic as any).theoryBlock as TheoryBlock | null;

            // In merge mode, only attach legacy block if the topic has no theory yet.
            // In replace mode, prefer legacy block as the source of truth.
            const shouldAttach = importMode === "replace" ? true : !existingBlock;
            if (shouldAttach) {
              (topic as any).theoryBlock = { id: legacyBlockId } as any;
              (topic as any).theoryBlockId = legacyBlockId;

              // Ensure at least one revision exists so History UI is not empty.
              const blockEntity = legacyBlock ?? (await bRepo.findOne({ where: { id: legacyBlockId } as any }));
              if (blockEntity) {
                await ensureRevisionExists(blockEntity, "import:legacy-link");
              }
            }
            return;
          }

          // Fallback: legacy topic may still contain theory_markdown.
          if (!content) return;

          // NOTE: We intentionally do NOT validate legacy theory with assertTheoryContentIsPure().
          // Old data may include practice/tasks sections; importing should still work so admins can clean it up.

          const block = (topic as any).theoryBlock as TheoryBlock | null;
          const nextTitle = title;

          if (block) {
            const needsUpdate = String(block.title ?? "") !== nextTitle || String(block.content ?? "") !== content;
            if (needsUpdate) {
              block.title = nextTitle;
              block.content = content;
              block.version = Number(block.version ?? 1) + 1;
              const savedBlock = await bRepo.save(block);
              try {
                await ensureRevisionExists(savedBlock, "import:legacy");
              } catch {
                // ignore revision conflicts
              }
            }
          } else {
            const createdBlock = await bRepo.save(
              bRepo.create({
                title: nextTitle,
                content: content,
                version: 1,
                level: null,
                tags: null
              })
            );
            (topic as any).theoryBlock = createdBlock;
            (topic as any).theoryBlockId = createdBlock.id;
            try {
              await ensureRevisionExists(createdBlock, "import:legacy");
            } catch {
              // ignore revision conflicts
            }
          }
        };

        if (existing) {
          let changed = false;
          if (existing.title !== title) {
            existing.title = title;
            changed = true;
          }
          if (Number(existing.order ?? 0) !== Number(targetOrder)) {
            existing.order = targetOrder as any;
            changed = true;
          }

          await upsertTheory(existing);
          if (changed) {
            await tRepo.save(existing);
          }
          updated++;
        } else {
          const nextTopic = tRepo.create({
            title,
            description: null,
            order: targetOrder,
            language,
            class: null,
            theoryBlock: null
          });

          await upsertTheory(nextTopic);
          const saved = await tRepo.save(nextTopic);
          existingByTitle.set(key, saved);
          created++;
        }
      }

      // Normalize order to 1..N
      const all = await tRepo.find({
        where: { language, class: IsNull() as any } as any,
        order: { order: "ASC" } as any
      });
      for (let i = 0; i < all.length; i++) {
        const id = all[i].id;
        const desired = i + 1;
        if (Number(all[i].order ?? 0) !== desired) {
          await manager.update(TopicNew, { id }, { order: desired } as any);
        }
      }

      const topics = await tRepo.find({
        where: { language, class: IsNull() as any } as any,
        order: { order: "ASC" } as any,
        relations: ["theoryBlock"] as any
      });

      // Touch legacy repo to avoid unused warning in some TS configurations.
      void legacyRepo;

      return { created, updated, skipped, topics };
    });

    return res.json(result);
  } catch (error: any) {
    const msg = error?.message || "INTERNAL_SERVER_ERROR";
    if (msg === "TOPIC_NOT_EMPTY") return res.status(409).json({ message: "TOPIC_NOT_EMPTY" });
    if (msg === "THEORY_EMPTY") return res.status(400).json({ message: "THEORY_EMPTY" });
    if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({ message: "THEORY_CONTAINS_PRACTICE" });
    if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({ message: "THEORY_CONTAINS_TASK_INSTRUCTIONS" });

    logger.error("[admin/materials] POST /import/legacy-topics error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

adminMaterialsRouter.patch("/topics/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.id, 10);
    if (isNaN(topicId)) return res.status(400).json({ message: "INVALID_TOPIC_ID" });

    const validated = updateTopicSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const data = validated.data;

    const topic = await topicRepo().findOne({ where: { id: topicId }, relations: ["theoryBlock", "class"] });
    if (!topic) return res.status(404).json({ message: "TOPIC_NOT_FOUND" });

    // We only allow editing global materials here.
    if ((topic as any).class) {
      return res.status(400).json({ message: "ONLY_GLOBAL_TOPICS_SUPPORTED" });
    }

    if (data.title !== undefined) topic.title = data.title.trim();
    if (data.description !== undefined) topic.description = data.description;
    if (data.order !== undefined) topic.order = data.order;
    if (data.language !== undefined) topic.language = data.language;

    if (data.clearTheory) {
      (topic as any).theoryBlock = null;
    }

    if (data.theory && data.theory.content) {
      const normalizedContent = String(data.theory.content).trim();
      assertTheoryContentIsPure(normalizedContent);

      const revisionAction: TheoryBlockRevisionAction = data.theoryRevisionAction === "AUTO" ? "AUTO" : "UPDATE";
      const revisionComment = data.theoryRevisionComment?.trim() || null;

      const existing = topic.theoryBlock;
      if (existing) {
        const nextTitle = String(data.theory.title || existing.title || topic.title).trim();
        const nextLevel = data.theory.level === undefined ? (existing.level ?? null) : data.theory.level;
        const nextTags = data.theory.tags === undefined ? (existing.tags ?? null) : JSON.stringify(data.theory.tags);
        const changed =
          String(existing.title ?? "") !== nextTitle ||
          String(existing.content ?? "") !== normalizedContent ||
          (existing.level ?? null) !== (nextLevel ?? null) ||
          (existing.tags ?? null) !== (nextTags ?? null);

        if (changed) {
          existing.title = nextTitle;
          existing.content = normalizedContent;
          existing.level = nextLevel;
          existing.tags = nextTags;
          existing.version = Number(existing.version ?? 1) + 1;
          const saved = await theoryBlockRepo().save(existing);
          await tryStoreTheoryRevision({
            theoryBlock: saved,
            version: saved.version,
            action: revisionAction,
            comment: revisionComment,
            createdByUserId: req.userId
          });
        }
      } else {
        const created = theoryBlockRepo().create({
          title: String(data.theory.title || topic.title).trim(),
          content: normalizedContent,
          version: 1,
          level: data.theory.level === undefined ? null : data.theory.level,
          tags: data.theory.tags === undefined ? null : JSON.stringify(data.theory.tags)
        });
        const savedBlock = await theoryBlockRepo().save(created);
        (topic as any).theoryBlock = { id: savedBlock.id };

        await tryStoreTheoryRevision({
          theoryBlock: savedBlock,
          version: savedBlock.version,
          action: "CREATE",
          comment: revisionComment,
          createdByUserId: req.userId
        });
      }
    }

    await topicRepo().save(topic);

    const full = await topicRepo().findOne({ where: { id: topicId }, relations: ["theoryBlock"] });
    return res.json({ topic: full ?? topic });
  } catch (error: any) {
    const msg = error?.message || "INTERNAL_SERVER_ERROR";
    if (msg === "THEORY_EMPTY") return res.status(400).json({ message: "THEORY_EMPTY" });
    if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({ message: "THEORY_CONTAINS_PRACTICE" });
    if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({ message: "THEORY_CONTAINS_TASK_INSTRUCTIONS" });

    logger.error("[admin/materials] PATCH /topics/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

adminMaterialsRouter.get(
  "/theory-blocks/:id/revisions",
  authRequired,
  systemAdminGuard,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

      const rows = await theoryBlockRevisionRepo().find({
        where: { theoryBlockId: id } as any,
        order: { version: "DESC" } as any,
        take: 200
      });

      return res.json({
        revisions: rows.map(r => ({
          id: r.id,
          version: r.version,
          action: r.action,
          comment: r.comment ?? null,
          createdAt: r.createdAt,
          createdByUserId: r.createdByUserId ?? null
        }))
      });
    } catch (error: any) {
      logger.error("[admin/materials] GET /theory-blocks/:id/revisions error", {
        requestId: req.requestId,
        userId: req.userId,
        error
      });
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  }
);

adminMaterialsRouter.get(
  "/theory-blocks/:id/revisions/:version",
  authRequired,
  systemAdminGuard,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const version = parseInt(req.params.version, 10);
      if (isNaN(id) || isNaN(version)) return res.status(400).json({ message: "INVALID_ID" });

      const r = await theoryBlockRevisionRepo().findOne({ where: { theoryBlockId: id, version } as any });
      if (!r) return res.status(404).json({ message: "NOT_FOUND" });

      let snapshot: any = null;
      try {
        snapshot = JSON.parse(String(r.snapshot ?? "null"));
      } catch {
        snapshot = null;
      }

      return res.json({
        revision: {
          id: r.id,
          version: r.version,
          action: r.action,
          comment: r.comment ?? null,
          createdAt: r.createdAt,
          createdByUserId: r.createdByUserId ?? null
        },
        snapshot
      });
    } catch (error: any) {
      logger.error("[admin/materials] GET /theory-blocks/:id/revisions/:version error", {
        requestId: req.requestId,
        userId: req.userId,
        error
      });
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  }
);

const rollbackTheorySchema = z.object({
  comment: z.string().max(255).optional()
});

adminMaterialsRouter.post(
  "/theory-blocks/:id/revisions/:version/rollback",
  authRequired,
  systemAdminGuard,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const version = parseInt(req.params.version, 10);
      if (isNaN(id) || isNaN(version)) return res.status(400).json({ message: "INVALID_ID" });

      const validated = rollbackTheorySchema.safeParse(req.body ?? {});
      if (!validated.success) {
        return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
      }

      const r = await theoryBlockRevisionRepo().findOne({ where: { theoryBlockId: id, version } as any });
      if (!r) return res.status(404).json({ message: "NOT_FOUND" });

      let snapshot: any;
      try {
        snapshot = JSON.parse(String(r.snapshot ?? "null"));
      } catch {
        return res.status(500).json({ message: "CORRUPT_REVISION_SNAPSHOT" });
      }

      const nextContent = String(snapshot?.content ?? "").trim();
      const nextTitle = String(snapshot?.title ?? "").trim();
      if (!nextTitle || !nextContent) {
        return res.status(500).json({ message: "CORRUPT_REVISION_SNAPSHOT" });
      }

      assertTheoryContentIsPure(nextContent);

      const block = await theoryBlockRepo().findOne({ where: { id } as any });
      if (!block) return res.status(404).json({ message: "NOT_FOUND" });

      // Choose a new monotonically increasing version.
      const maxRow = (await AppDataSource.query(
        "SELECT MAX(version) as v FROM theory_block_revisions WHERE theory_block_id = ?",
        [id]
      )) as Array<{ v: number | null }>;
      const maxV = Number(maxRow?.[0]?.v ?? null);
      const base = Math.max(Number(block.version ?? 1), Number.isFinite(maxV) ? maxV : 0);
      const nextVersion = base + 1;

      block.title = nextTitle;
      block.content = nextContent;
      block.level = snapshot?.level === undefined ? null : (snapshot.level ?? null);
      if (snapshot?.tags === undefined || snapshot?.tags === null) {
        block.tags = null;
      } else if (typeof snapshot.tags === "string") {
        block.tags = snapshot.tags;
      } else {
        try {
          block.tags = JSON.stringify(snapshot.tags);
        } catch {
          block.tags = null;
        }
      }
      block.version = nextVersion;

      const saved = await theoryBlockRepo().save(block);
      await tryStoreTheoryRevision({
        theoryBlock: saved,
        version: saved.version,
        action: "ROLLBACK",
        comment: validated.data.comment?.trim() || `rollback-to:${version}`,
        createdByUserId: req.userId
      });

      return res.json({ ok: true, theoryBlock: saved });
    } catch (error: any) {
      const msg = error?.message || "INTERNAL_SERVER_ERROR";
      if (msg === "THEORY_EMPTY") return res.status(400).json({ message: "THEORY_EMPTY" });
      if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({ message: "THEORY_CONTAINS_PRACTICE" });
      if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({ message: "THEORY_CONTAINS_TASK_INSTRUCTIONS" });

      logger.error("[admin/materials] POST /theory-blocks/:id/revisions/:version/rollback error", {
        requestId: req.requestId,
        userId: req.userId,
        error
      });
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  }
);

adminMaterialsRouter.delete("/topics/:id", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.id, 10);
    if (isNaN(topicId)) return res.status(400).json({ message: "INVALID_TOPIC_ID" });

    const topic = await topicRepo().findOne({
      where: { id: topicId },
      relations: ["tasks", "controlWorks", "class"]
    });

    if (!topic) return res.status(404).json({ message: "TOPIC_NOT_FOUND" });
    if ((topic as any).class) return res.status(400).json({ message: "ONLY_GLOBAL_TOPICS_SUPPORTED" });

    if ((topic.tasks?.length ?? 0) > 0 || (topic.controlWorks?.length ?? 0) > 0) {
      return res.status(400).json({ message: "TOPIC_NOT_EMPTY" });
    }

    await topicRepo().remove(topic);
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error("[admin/materials] DELETE /topics/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default adminMaterialsRouter;
