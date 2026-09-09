import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { TopicNew, TopicLanguage } from "../entities/TopicNew";
import { Topic } from "../entities/Topic";
import { Task } from "../entities/Task";
import { TheoryBlock } from "../entities/TheoryBlock";
import { EntityManager, IsNull, Not } from "typeorm";
import { logger } from "../utils/logger";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import * as fs from "fs";
import * as path from "path";
import { looksLikeTranslationProviderErrorText, translateMarkdownUkToEn, translateTextUkToEn } from "../services/translation/translateUkToEn";
import { hasTheoryBlockEnTranslationColumns } from "../services/translation/translationSchema";
import { env } from "../env";

const adminMaterialsRouter = Router();

// Source of truth for personal tasks curriculum.
const legacyTopicRepo = () => AppDataSource.getRepository(Topic);
// EDU system tables (kept for compatibility; may be synced from legacy topics).
const topicNewRepo = () => AppDataSource.getRepository(TopicNew);
const theoryBlockRepo = () => AppDataSource.getRepository(TheoryBlock);
const taskRepo = () => AppDataSource.getRepository(Task);

type MaterialsLanguage = "JAVA" | "PYTHON" | "CPP";
type TheoryBlockRevisionAction = "CREATE" | "UPDATE" | "ROLLBACK" | "AUTO";
type UnknownRecord = Record<string, unknown>;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type AdminTopicDto = {
  id: number;
  title: string;
  description: null;
  order: number;
  language: TopicLanguage;
  theoryBlock: {
    id: number;
    title: string;
    content: string;
    version: number;
    level: number | null;
    tags: JsonValue | string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function errorMessage(error: unknown): string {
  const message = readProperty(error, "message");
  return message instanceof Error ? message.message : String(message ?? "");
}

function isEduLanguage(lang: string): lang is TopicLanguage {
  return lang === "JAVA" || lang === "PYTHON" || lang === "CPP";
}

function buildAdminTopicDtoFromLegacy(t: Topic): AdminTopicDto {
  const block = t.theoryBlock;
  return {
    id: t.id,
    title: t.title,
    description: null,
    order: Number(t.topicIndex ?? 0) + 1,
    language: t.lang,
    theoryBlock: block
      ? {
          id: block.id,
          title: block.title,
          content: block.content,
          version: block.version,
          level: block.level === undefined ? null : (block.level ?? null),
          tags: block.tags ?? null,
          createdAt: block.createdAt,
          updatedAt: block.updatedAt
        }
      : null
  };
}

async function syncGlobalTopicNewFromLegacy(params: { legacy: Topic }): Promise<void> {
  try {
    const legacy = params.legacy;
    const languageRaw = String(legacy.lang ?? "").toUpperCase().trim();
    if (!isEduLanguage(languageRaw)) return;
    const language = languageRaw as TopicLanguage;

    const order = Number(legacy.topicIndex ?? NaN);
    const order1 = Number.isFinite(order) ? Math.max(1, Math.floor(order) + 1) : null;
    const titleNorm = String(legacy.title ?? "").trim().toLowerCase();

    const repo = topicNewRepo();
    let global: TopicNew | null = null;
    if (order1 !== null) {
      global = await repo.findOne({
        where: { language, order: order1, class: IsNull() },
        relations: { theoryBlock: true }
      });
    }
    if (!global && titleNorm) {
      const globals = await repo.find({ where: { language, class: IsNull() }, relations: { theoryBlock: true } });
      global = globals.find(t => String(t.title ?? "").trim().toLowerCase() === titleNorm) ?? null;
    }

    const blockId = Number(legacy.theoryBlock?.id ?? legacy.theoryBlockId ?? 0) || null;
    const nextTitle = String(legacy.title ?? "").trim();

    if (!global) {
      if (order1 === null) return;
      const created = repo.create({
        title: nextTitle,
        description: null,
        order: order1,
        language,
        class: null,
        theoryBlock: blockId ? { id: blockId } : null
      });
      await repo.save(created);
      return;
    }

    let changed = false;
    if (nextTitle && String(global.title ?? "").trim() !== nextTitle) {
      global.title = nextTitle;
      changed = true;
    }
    if (order1 !== null && Number(global.order ?? 0) !== order1) {
      global.order = order1;
      changed = true;
    }
    if (global.language !== language) {
      global.language = language;
      changed = true;
    }
    const currentBlockId = Number(global.theoryBlock?.id ?? global.theoryBlockId ?? 0) || null;
    if (currentBlockId !== blockId) {
      global.theoryBlock = blockId ? ({ id: blockId } as unknown as TheoryBlock) : null;
      changed = true;
    }

    if (changed) {
      await repo.save(global);
    }
  } catch (error: unknown) {
    logger.warn("[admin/materials] Failed to sync topics_new from legacy", {
      legacyTopicId: params.legacy.id,
      error: errorMessage(error) || error
    });
  }
}

function parseMaybeJsonTags(tags: string | null | undefined): JsonValue | string | null {
  if (tags === null || tags === undefined) return null;
  const s = String(tags);
  if (!s.trim()) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

async function writeTheoryRevisionTx(params: {
  manager: EntityManager;
  theoryBlock: TheoryBlock;
  action: TheoryBlockRevisionAction;
  comment: string;
  createdByUserId: number | null;
}): Promise<TheoryBlock> {
  const { manager, theoryBlock, action, comment, createdByUserId } = params;

  // Revisions table was removed; we keep only a monotonically increasing version on theory_blocks.
  // CREATE should usually stay at version=1; UPDATE/AUTO/ROLLBACK always bumps.
  void comment;
  void createdByUserId;
  const cur = Number(theoryBlock.version ?? 0);
  const nextVersion = action === "CREATE"
    ? Math.max(1, cur || 1)
    : Math.max(1, cur || 1) + 1;

  theoryBlock.version = nextVersion;
  return manager.getRepository(TheoryBlock).save(theoryBlock);
}

async function tryStoreTheoryRevision(params: {
  theoryBlock: TheoryBlock;
  version: number;
  action: TheoryBlockRevisionAction;
  comment?: string | null;
  createdByUserId?: number;
}): Promise<void> {
  // History is disabled (theory_block_revisions table was dropped).
  void params;
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

  // Imperative wording is valid inside an explanation or a code walkthrough.
  // A global word regex rejected legitimate theory such as input() lessons;
  // structural practice headings and explicit I/O sections remain the boundary.
}

const eduLanguageSchema = z.enum(["JAVA", "PYTHON", "CPP"]);
const materialsLanguageSchema = z.enum(["JAVA", "PYTHON", "CPP"]);

const createTopicSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  language: materialsLanguageSchema,
  // For now we only manage global topics (class=null). classId can be added later if needed.
  theory: z
    .object({
      title: z.string().min(1).max(255).optional(),
      content: z.string().min(1),
      level: z.number().int().nullable().optional(),
      tags: z.unknown().optional()
    })
    .nullable()
    .optional()
});

const updateTopicSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  language: materialsLanguageSchema.optional(),
  theory: z
    .object({
      title: z.string().min(1).max(255).optional(),
      content: z.string().min(1),
      level: z.number().int().nullable().optional(),
      tags: z.unknown().optional()
    })
    .nullable()
    .optional(),
  clearTheory: z.boolean().optional(),
  theoryRevisionAction: z.enum(["UPDATE", "AUTO"]).optional(),
  theoryRevisionComment: z.string().max(255).optional()
});

const reorderSchema = z.object({
  language: materialsLanguageSchema,
  orderedIds: z.array(z.number().int().positive()).min(1)
});

const importYamlSchema = z.object({
  // If omitted, we try to read it from YAML root.
  language: materialsLanguageSchema.optional(),
  yaml: z.string().min(1),
  mode: z.enum(["merge", "replace"]).optional()
});

const syncRepoSchema = z.object({
  language: materialsLanguageSchema,
  mode: z.enum(["merge", "replace"]).optional()
});

const importLegacySchema = z.object({
  language: eduLanguageSchema,
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
        tags?: unknown;
      }
    | string
    | null;
};

function normalizeImportTopic(raw: unknown, index: number): ImportYamlTopic {
  if (!isRecord(raw)) {
    throw new Error(`INVALID_TOPIC_AT_${index}`);
  }

  const title = String(raw.title ?? "").trim();
  if (!title) throw new Error(`TOPIC_TITLE_REQUIRED_AT_${index}`);

  const descriptionRaw = raw.description;
  const description = descriptionRaw === undefined ? undefined : descriptionRaw === null ? null : String(descriptionRaw);

  const orderRaw = raw.order;
  const order = orderRaw === undefined || orderRaw === null || orderRaw === "" ? undefined : Number(orderRaw);
  if (order !== undefined && (!Number.isFinite(order) || order < 0 || !Number.isInteger(order))) {
    throw new Error(`TOPIC_ORDER_INVALID_AT_${index}`);
  }

  const theoryRaw = raw.theory;
  let theory: ImportYamlTopic["theory"] = undefined;
  if (theoryRaw === undefined) {
    theory = undefined;
  } else if (theoryRaw === null) {
    theory = null;
  } else if (typeof theoryRaw === "string") {
    theory = theoryRaw;
  } else if (typeof theoryRaw === "object") {
    if (!isRecord(theoryRaw)) throw new Error(`THEORY_INVALID_AT_${index}`);
    const content = String(theoryRaw.content ?? "");
    const ttitle = theoryRaw.title === undefined ? undefined : String(theoryRaw.title ?? "");
    const levelRaw = theoryRaw.level;
    const level = levelRaw === undefined ? undefined : levelRaw === null ? null : Number(levelRaw);
    if (level !== undefined && level !== null && (!Number.isFinite(level) || !Number.isInteger(level))) {
      throw new Error(`THEORY_LEVEL_INVALID_AT_${index}`);
    }
    theory = {
      title: ttitle,
      content,
      level,
      tags: theoryRaw.tags
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

function parseImportYamlPayload(yamlText: string): { language?: MaterialsLanguage; topics: ImportYamlTopic[] } {
  class YamlParseError extends Error {
    details?: UnknownRecord;
    constructor(message: string, details?: UnknownRecord) {
      super(message);
      this.name = "YamlParseError";
      this.details = details;
    }
  }

  let doc: unknown;
  try {
    doc = parseYaml(String(yamlText ?? ""));
  } catch (err: unknown) {
    // The `yaml` library usually provides useful location info; bubble it up.
    const details: UnknownRecord = {};
    try {
      const message = readProperty(err, "message");
      const linePos = readProperty(err, "linePos");
      const source = readProperty(err, "source");
      const name = readProperty(err, "name");
      if (message) details.parseMessage = String(message);
      if (linePos) details.linePos = linePos;
      if (source) details.source = source;
      if (name) details.name = String(name);
    } catch {
      // ignore
    }
    throw new YamlParseError("INVALID_YAML", Object.keys(details).length ? details : undefined);
  }

  if (!doc) {
    throw new Error("INVALID_YAML");
  }

  // Allow either:
  // - { language: JAVA, topics: [...] }
  // - [...] (topics array) with language taken from request
  const langRaw = isRecord(doc) ? doc.language : undefined;
  const language = langRaw ? String(langRaw).toUpperCase().trim() : undefined;
  const parsedLanguage = (language === "JAVA" || language === "PYTHON" || language === "CPP")
    ? (language as MaterialsLanguage)
    : undefined;

  const topicsRaw = Array.isArray(doc) ? doc : isRecord(doc) ? doc.topics : undefined;
  if (!Array.isArray(topicsRaw)) {
    const details: UnknownRecord = {};
    try {
      details.rootType = Array.isArray(doc) ? "array" : typeof doc;
      if (isRecord(doc)) {
        details.rootKeys = Object.keys(doc).slice(0, 50);
        details.hasTopicsKey = Object.prototype.hasOwnProperty.call(doc, "topics");
        details.topicsType = doc.topics === null ? "null" : typeof doc.topics;
      }
    } catch {
      // ignore
    }
    throw new YamlParseError("INVALID_YAML_STRUCTURE", Object.keys(details).length ? details : undefined);
  }

  const topics: ImportYamlTopic[] = topicsRaw.map((t: unknown, idx: number) => normalizeImportTopic(t, idx));
  return { language: parsedLanguage, topics };
}

function findRepoTheoryFile(language: MaterialsLanguage): string | null {
  const fileBase = `${language === "JAVA" ? "java_core" : language === "PYTHON" ? "python_core" : "cpp_core"}_theory`;
  const exts = [".yml", ".yaml", ".json"];

  // backend/ and theories/ are siblings in this repo.
  // In production, the process working directory isn't guaranteed (systemd/docker/etc),
  // so we search both from cwd and from this file's location.
  const backendRootFromThisFile = path.resolve(__dirname, "..", "..", "..");
  const repoRootFromThisFile = path.resolve(__dirname, "..", "..", "..", "..");
  const envRepoRoots = [
    env.REPO_ROOT,
    env.STUDYCOD_REPO_ROOT,
    env.APP_ROOT
  ].filter(Boolean) as string[];

  // Prefer explicit repo root + inferred repo root from this file.
  // This avoids accidentally picking a stray backend/theories folder if it exists.
  const bases = [
    ...envRepoRoots.map(r => path.resolve(r, "theories")),
    path.resolve(repoRootFromThisFile, "theories"),
    // Fallback: if theories are deployed under backend/
    path.resolve(backendRootFromThisFile, "theories"),
    // When cwd is repo root
    path.resolve(process.cwd(), "theories"),
    // When cwd is backend/
    path.resolve(process.cwd(), "..", "theories"),
    // When cwd is backend/dist or backend/src
    path.resolve(process.cwd(), "..", "..", "theories")
  ];

  const candidates: string[] = [];
  for (const base of bases) {
    for (const ext of exts) {
      candidates.push(path.resolve(base, `${fileBase}${ext}`));
    }
  }

  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter(p => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const p of uniqueCandidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function findRepoTheoryYamlFile(language: MaterialsLanguage): string | null {
  const fileBase = `${language === "JAVA" ? "java_core" : language === "PYTHON" ? "python_core" : "cpp_core"}_theory`;
  const exts = [".yml", ".yaml"];

  const backendRootFromThisFile = path.resolve(__dirname, "..", "..", "..");
  const repoRootFromThisFile = path.resolve(__dirname, "..", "..", "..", "..");
  const envRepoRoots = [
    env.REPO_ROOT,
    env.STUDYCOD_REPO_ROOT,
    env.APP_ROOT
  ].filter(Boolean) as string[];

  const bases = [
    ...envRepoRoots.map(r => path.resolve(r, "theories")),
    path.resolve(repoRootFromThisFile, "theories"),
    // fallback if deployed under backend/
    path.resolve(backendRootFromThisFile, "theories"),
    path.resolve(process.cwd(), "theories"),
    path.resolve(process.cwd(), "..", "theories"),
    path.resolve(process.cwd(), "..", "..", "theories")
  ];

  const candidates: string[] = [];
  for (const base of bases) {
    for (const ext of exts) {
      candidates.push(path.resolve(base, `${fileBase}${ext}`));
    }
  }

  const seen = new Set<string>();
  for (const p of candidates) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function findRepoTopicsListFile(language: MaterialsLanguage): string | null {
  const fileName = `${String(language).toLowerCase()}_topics.json`;

  const backendRootFromThisFile = path.resolve(__dirname, "..", "..", "..");
  const repoRootFromThisFile = path.resolve(__dirname, "..", "..", "..", "..");
  const envRepoRoots = [
    env.REPO_ROOT,
    env.STUDYCOD_REPO_ROOT,
    env.APP_ROOT
  ].filter(Boolean) as string[];

  const bases = [
    ...envRepoRoots.map(r => path.resolve(r, "topics")),
    path.resolve(repoRootFromThisFile, "topics"),
    path.resolve(backendRootFromThisFile, "topics"),
    path.resolve(process.cwd(), "topics"),
    path.resolve(process.cwd(), "..", "topics"),
    path.resolve(process.cwd(), "..", "..", "topics")
  ];

  const candidates = bases.map(b => path.resolve(b, fileName));
  const seen = new Set<string>();
  for (const p of candidates) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function parseLegacyTheoryMap(text: string): Record<string, string> | null {
  // Legacy shape: { "Topic title": "markdown", ... }
  // (stored historically as JSON, but YAML parser also accepts JSON syntax)
  let doc: unknown;
  try {
    doc = parseYaml(String(text ?? ""));
  } catch {
    try {
      doc = JSON.parse(String(text ?? ""));
    } catch {
      return null;
    }
  }

  if (!isRecord(doc)) return null;
  if (Object.prototype.hasOwnProperty.call(doc, "topics")) return null;
  if (Object.prototype.hasOwnProperty.call(doc, "language")) return null;

  const out: Record<string, string> = {};
  const keys = Object.keys(doc);
  if (!keys.length) return null;

  for (const k of keys) {
    const v = doc[k];
    if (typeof v === "string") {
      out[String(k)] = v;
    } else if (isRecord(v) && typeof v.content === "string") {
      // tolerate { content: "..." }
      out[String(k)] = v.content;
    } else {
      out[String(k)] = "";
    }
  }

  return out;
}

adminMaterialsRouter.get("/topics", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const language = String(req.query.language ?? "").toUpperCase().trim();
    if (language && language !== "JAVA" && language !== "PYTHON" && language !== "CPP") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topics = await legacyTopicRepo().find({
      where: {
        ...(language ? { lang: language as MaterialsLanguage } : {})
      },
      order: { topicIndex: "ASC" },
      relations: { theoryBlock: true }
    });

    return res.json({ topics: topics.map(buildAdminTopicDtoFromLegacy) });
  } catch (error: unknown) {
    logger.error("[admin/materials] GET /topics error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Export global topics + theory to YAML (for backups / editing in repo).
adminMaterialsRouter.get("/export/yaml", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const language = String(req.query.language || "").toUpperCase().trim();
    if (language !== "JAVA" && language !== "PYTHON" && language !== "CPP") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topics = await legacyTopicRepo().find({
      where: {
        lang: language as MaterialsLanguage
      },
      order: { topicIndex: "ASC" },
      relations: { theoryBlock: true }
    });

    const payload: UnknownRecord = {
      language,
      topics: topics.map(t => {
        const base: UnknownRecord = {
          title: t.title,
          description: null,
          order: Number(t.topicIndex ?? 0) + 1
        };

        const block = t.theoryBlock;
        if (block) {
          const theory: UnknownRecord = {
            title: String(block.title ?? "").trim() || undefined,
            content: String(block.content ?? ""),
            level: block.level === undefined ? null : (block.level ?? null),
            tags: parseMaybeJsonTags(block.tags)
          };
          base.theory = theory;

          // Remove undefined title to keep YAML clean.
          if (theory.title === undefined) delete theory.title;
          if (theory.tags === null) delete theory.tags;
        }

        return base;
      })
    };

    const yaml = stringifyYaml(payload);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const filename = `materials_${language}_${yyyy}-${mm}-${dd}.yaml`;

    res.setHeader("Content-Type", "text/yaml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    return res.send(yaml);
  } catch (error: unknown) {
    logger.error("[admin/materials] GET /export/yaml error", { requestId: req.requestId, userId: req.userId, error });
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

    const topics = await legacyTopicRepo().find({
      where: { lang: language },
      order: { topicIndex: "ASC" }
    });

    const existingIds = new Set(topics.map(t => t.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        return res.status(400).json({ message: "TOPIC_NOT_FOUND" });
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
      for (let i = 0; i < finalOrder.length; i++) {
        const id = finalOrder[i];
        await manager.update(Topic, { id }, { topicIndex: i });
      }
    });

    const updated = await legacyTopicRepo().find({
      where: { lang: language },
      order: { topicIndex: "ASC" },
      relations: { theoryBlock: true }
    });

    // Keep global topics_new aligned for EDU (best-effort).
    for (const t of updated) {
      await syncGlobalTopicNewFromLegacy({ legacy: t });
    }

    return res.json({ topics: updated.map(buildAdminTopicDtoFromLegacy) });
  } catch (error: unknown) {
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

    const maxIdx = await legacyTopicRepo().findOne({
      where: { lang: data.language },
      order: { topicIndex: "DESC" }
    });
    const nextDefaultIndex = Number(maxIdx?.topicIndex ?? -1) + 1;
    const desiredIndex = data.order === undefined || data.order === null ? nextDefaultIndex : Math.max(0, Math.floor(Number(data.order) - 1));

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

    const saved = await AppDataSource.transaction(async manager => {
      // Make room in ordering.
      await manager
        .createQueryBuilder()
        .update(Topic)
        .set({ topicIndex: () => "topic_index + 1" })
        .where("lang = :lang", { lang: data.language })
        .andWhere("topic_index >= :idx", { idx: desiredIndex })
        .execute();

      const legacy = manager.getRepository(Topic).create({
        title: data.title.trim(),
        lang: data.language,
        topicIndex: desiredIndex,
        theoryBlock: theoryBlock ? ({ id: theoryBlock.id } as unknown as TheoryBlock) : null,
        theoryMarkdown: theoryBlock ? String(theoryBlock.content ?? "").trim() : null,
        isControl: false
      });
      return manager.getRepository(Topic).save(legacy);
    });

    const savedId = saved.id;

    const full = savedId
      ? await legacyTopicRepo().findOne({ where: { id: savedId }, relations: { theoryBlock: true } })
      : null;
    if (full) {
      await syncGlobalTopicNewFromLegacy({ legacy: full });
    }

    return res.status(201).json({ topic: buildAdminTopicDtoFromLegacy(full ?? saved) });
  } catch (error: unknown) {
    const msg = errorMessage(error) || "INTERNAL_SERVER_ERROR";
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
    const language = (validated.data.language ?? parsed.language) as MaterialsLanguage | undefined;
    if (language !== "JAVA" && language !== "PYTHON" && language !== "CPP") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topicsToImport = parsed.topics;
    if (!topicsToImport.length) {
      return res.status(400).json({ message: "NO_TOPICS" });
    }

    const importMode = mode ?? "merge";

    const result = await AppDataSource.transaction(async manager => {
      const tRepo = manager.getRepository(Topic);
      const bRepo = manager.getRepository(TheoryBlock);

      const existingTasks = await manager.getRepository(Task).count({ where: { lang: language } });

      const existingTopics = await tRepo.find({
        where: { lang: language },
        relations: { theoryBlock: true },
        order: { topicIndex: "ASC" }
      });

      if (importMode === "replace") {
        // Safety: block deletion if there are any personal tasks for this language.
        if (existingTasks > 0) throw new Error("TOPIC_NOT_EMPTY");
        if (existingTopics.length) await tRepo.remove(existingTopics);
      }

      const afterDeleteExisting = importMode === "replace" ? [] : existingTopics;
      const existingByTitle = new Map<string, Topic>();
      const existingByIndex = new Map<number, Topic>();
      // NOTE: keep the variable name for minimal diff; it now stores legacy Topic objects.
      for (const t of afterDeleteExisting) {
        const key = String(t.title ?? "").trim().toLowerCase();
        if (key && !existingByTitle.has(key)) existingByTitle.set(key, t);

        const idx = Number(t.topicIndex ?? NaN);
        if (Number.isFinite(idx) && !existingByIndex.has(idx)) existingByIndex.set(idx, t);
      }

      // Determine next topicIndex when not provided.
      const maxIndex = afterDeleteExisting.reduce((acc, t) => Math.max(acc, Number(t.topicIndex ?? -1)), -1);
      let nextIndex = maxIndex + 1;

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

        const targetIndex = Math.max(0, Math.floor(Number(it.order ?? (nextIndex + 1)) - 1));
        if (it.order === undefined || it.order === null) nextIndex++;
        const nextDescription = it.description === undefined ? undefined : it.description;

        const theoryObj = (() => {
          if (it.theory === undefined) return undefined;
          if (it.theory === null) return null;
          if (typeof it.theory === "string") {
            return { title: it.title, content: it.theory };
          }
          return it.theory;
        })();

        let existing = existingByTitle.get(key);
        if (!existing) {
          existing = existingByIndex.get(targetIndex);
          if (existing) {
            // Allow future lookups by title from YAML.
            existingByTitle.set(key, existing);
          }
        }
        if (existing) {
          let changed = false;

          if (existing.title !== it.title) {
            existing.title = it.title;
            changed = true;
          }
          // legacy topics do not have description.
          void nextDescription;

          if (Number(existing.topicIndex ?? 0) !== Number(targetIndex)) {
            existing.topicIndex = targetIndex;
            changed = true;
          }

          // Merge theory if provided.
          if (theoryObj && typeof theoryObj.content === "string" && theoryObj.content.trim()) {
            const normalizedContent = String(theoryObj.content).trim();
            assertTheoryContentIsPure(normalizedContent);

            const block = existing.theoryBlock;
            const nextTitle = String(theoryObj.title || existing.title).trim();
            const nextLevel = theoryObj.level === undefined ? (block?.level ?? null) : (theoryObj.level ?? null);
            const nextTags = theoryObj.tags === undefined ? (block?.tags ?? null) : JSON.stringify(theoryObj.tags);

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
                await writeTheoryRevisionTx({
                  manager,
                  theoryBlock: block,
                  action: "UPDATE",
                  comment: "import:yaml",
                  createdByUserId: req.userId ?? null
                });
              }
            } else {
              const createdBlock = await bRepo.save(
                bRepo.create({
                  title: nextTitle,
                  content: normalizedContent,
                  version: 1,
                  level: theoryObj.level === undefined ? null : (theoryObj.level ?? null),
                  tags: theoryObj.tags === undefined ? null : JSON.stringify(theoryObj.tags)
                })
              );
              existing.theoryBlock = { id: createdBlock.id } as unknown as TheoryBlock;
              await writeTheoryRevisionTx({
                manager,
                theoryBlock: createdBlock,
                action: "CREATE",
                comment: "import:yaml",
                createdByUserId: req.userId ?? null
              });
            }

            // Mirror for compatibility.
            existing.theoryMarkdown = normalizedContent;
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
                level: theoryObj.level === undefined ? null : (theoryObj.level ?? null),
                tags: theoryObj.tags === undefined ? null : JSON.stringify(theoryObj.tags)
              })
            );
            theoryBlock = createdBlock;
            await writeTheoryRevisionTx({
              manager,
              theoryBlock: createdBlock,
              action: "CREATE",
              comment: "import:yaml",
              createdByUserId: req.userId ?? null
            });
          }

          const createdTopic = await tRepo.save(
            tRepo.create({
              title: it.title,
              lang: language,
              topicIndex: targetIndex,
              isControl: false,
              theoryBlock: theoryBlock ? ({ id: theoryBlock.id } as unknown as TheoryBlock) : null,
              theoryMarkdown: theoryBlock ? String(theoryBlock.content ?? "").trim() : null
            })
          );

          existingByTitle.set(key, createdTopic);
          created++;
        }
      }

      // Normalize ordering (0..N-1) to avoid duplicates/gaps after import.
      const finalList = await tRepo.find({ where: { lang: language }, order: { topicIndex: "ASC" } });
      for (let i = 0; i < finalList.length; i++) {
        const t = finalList[i];
        if (Number(t.topicIndex ?? 0) !== i) {
          await tRepo.update({ id: t.id }, { topicIndex: i });
          t.topicIndex = i;
        }
      }

      const refreshed = await tRepo.find({ where: { lang: language }, order: { topicIndex: "ASC" }, relations: { theoryBlock: true } });

      return { created, updated, skipped, topics: refreshed };
    });

    if (Array.isArray(result?.topics)) {
      for (const t of result.topics) {
        await syncGlobalTopicNewFromLegacy({ legacy: t });
      }
    }

    return res.json({ ...result, topics: result.topics.map(buildAdminTopicDtoFromLegacy) });
  } catch (error: unknown) {
    // Common infra/DB issue: TEXT column overflow when importing big theory markdown.
    // Return a helpful client error instead of generic 500.
    const rawMsg = errorMessage(error);
    const rawCode = String(readProperty(error, "code") ?? "");
    if (/data too long/i.test(rawMsg) || /ER_DATA_TOO_LONG/i.test(rawCode)) {
      return res.status(400).json({
        message: "THEORY_TOO_LARGE",
        hint: "Theory content is too large for current DB column type. Ensure theory_blocks.content and topics.theory_markdown are MEDIUMTEXT/LONGTEXT, then retry the import."
      });
    }

    const msg = rawMsg || "INTERNAL_SERVER_ERROR";
    if (msg === "INVALID_YAML" || msg === "INVALID_YAML_STRUCTURE") {
      return res.status(400).json({ message: msg, details: readProperty(error, "details") });
    }
    if (msg === "TOPIC_NOT_EMPTY") {
      return res.status(400).json({
        message: "TOPIC_NOT_EMPTY",
        hint: "Replace mode is blocked because some existing global topics already have tasks/control works. Use merge mode to update theory without deleting topics."
      });
    }
    if (msg === "THEORY_EMPTY") return res.status(400).json({ message: "THEORY_EMPTY" });
    if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({ message: "THEORY_CONTAINS_PRACTICE" });
    if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({ message: "THEORY_CONTAINS_TASK_INSTRUCTIONS" });

    // Treat per-topic validation errors as client errors (bad YAML content/shape).
    if (typeof msg === "string" && /_AT_\d+$/.test(msg)) {
      return res.status(400).json({ message: "INVALID_YAML_TOPIC", detail: msg });
    }

    logger.error("[admin/materials] POST /import/yaml error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Sync from repo curriculum files (theories/*_theory.yml).
// This provides a one-click way to make the repo "menu" the priority source.
adminMaterialsRouter.post("/sync/repo", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  let sourceFilePath: string | null = null;
  let preferredYamlPath: string | null = null;
  let selectedWasLegacyJson = false;
  try {
    const validated = syncRepoSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const { language, mode } = validated.data;
    const found = findRepoTheoryFile(language);
    preferredYamlPath = findRepoTheoryYamlFile(language);

    // If we found a legacy *_theory.json but a YAML exists, always use YAML.
    // This ensures the repo menu (YAML) is the source of truth.
    const filePath = (() => {
      if (!found) return null;
      const lower = String(found).toLowerCase();
      if (lower.endsWith("_theory.json") && preferredYamlPath) {
        selectedWasLegacyJson = true;
        return preferredYamlPath;
      }
      return found;
    })();

    sourceFilePath = filePath;
    if (!filePath) {
      return res.status(404).json({ message: "REPO_THEORY_FILE_NOT_FOUND" });
    }

    let yamlText = "";
    try {
      yamlText = fs.readFileSync(filePath, "utf8");
    } catch (e: unknown) {
      return res.status(500).json({
        message: "REPO_THEORY_FILE_READ_ERROR",
        filePath,
        code: readProperty(e, "code") ?? null
      });
    }

    // Reuse the same import pipeline.
    // Additionally, tolerate legacy *_theory.json (object map title->markdown)
    // by combining it with topics/*_topics.json ordering when possible.
    let parsed: { language?: MaterialsLanguage; topics: ImportYamlTopic[] } | null = null;
    try {
      parsed = parseImportYamlPayload(yamlText);
    } catch (e: unknown) {
      if (errorMessage(e) === "INVALID_YAML_STRUCTURE" && String(filePath).toLowerCase().endsWith("_theory.json")) {
        const legacyMap = parseLegacyTheoryMap(yamlText);
        if (legacyMap) {
          const effectiveLanguage = language as MaterialsLanguage;
          const topicsListPath = findRepoTopicsListFile(effectiveLanguage);
          let orderedTitles: string[] = [];
          if (topicsListPath) {
            try {
              const raw = fs.readFileSync(topicsListPath, "utf8");
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) orderedTitles = arr.map((x: unknown) => String(x));
            } catch {
              // ignore
            }
          }
          const titles = orderedTitles.length ? orderedTitles : Object.keys(legacyMap);
          parsed = {
            language: effectiveLanguage,
            topics: titles.map((title, idx) => ({
              title,
              description: "",
              order: idx + 1,
              theory: {
                title,
                content: String(legacyMap[title] ?? "")
              }
            }))
          };
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    const langFromYaml = parsed?.language;
    const effectiveLanguage = (language ?? langFromYaml) as MaterialsLanguage | undefined;
    if (effectiveLanguage !== "JAVA" && effectiveLanguage !== "PYTHON" && effectiveLanguage !== "CPP") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topicsToImport = parsed?.topics ?? [];
    if (!topicsToImport.length) {
      return res.status(400).json({ message: "NO_TOPICS" });
    }

    const importMode = mode ?? "merge";

    const result = await AppDataSource.transaction(async manager => {
      const tRepo = manager.getRepository(Topic);
      const bRepo = manager.getRepository(TheoryBlock);

      const existingTasks = await manager.getRepository(Task).count({ where: { lang: effectiveLanguage } });

      const existingTopics = await tRepo.find({
        where: { lang: effectiveLanguage },
        relations: { theoryBlock: true },
        order: { topicIndex: "ASC" }
      });

      if (importMode === "replace") {
        if (existingTasks > 0) throw new Error("TOPIC_NOT_EMPTY");
        if (existingTopics.length) await tRepo.remove(existingTopics);
      }

      const afterDeleteExisting = importMode === "replace" ? [] : existingTopics;
      const existingByTitle = new Map<string, Topic>();
      const existingByIndex = new Map<number, Topic>();
      for (const t of afterDeleteExisting) {
        const key = String(t.title ?? "").trim().toLowerCase();
        if (key && !existingByTitle.has(key)) existingByTitle.set(key, t);

        const idx = Number(t.topicIndex ?? NaN);
        if (Number.isFinite(idx) && !existingByIndex.has(idx)) existingByIndex.set(idx, t);
      }

      const maxIndex = afterDeleteExisting.reduce((acc, t) => Math.max(acc, Number(t.topicIndex ?? -1)), -1);
      let nextIndex = maxIndex + 1;

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

        const targetIndex = Math.max(0, Math.floor(Number(it.order ?? (nextIndex + 1)) - 1));
        if (it.order === undefined || it.order === null) nextIndex++;
        const nextDescription = it.description === undefined ? undefined : it.description;

        const theoryObj = (() => {
          if (it.theory === undefined) return undefined;
          if (it.theory === null) return null;
          if (typeof it.theory === "string") {
            return { title: it.title, content: it.theory };
          }
          return it.theory;
        })();

        let existing = existingByTitle.get(key);
        if (!existing) {
          existing = existingByIndex.get(targetIndex);
          if (existing) existingByTitle.set(key, existing);
        }

        if (existing) {
          let changed = false;

          if (existing.title !== it.title) {
            existing.title = it.title;
            changed = true;
          }
          void nextDescription;

          if (Number(existing.topicIndex ?? 0) !== Number(targetIndex)) {
            existing.topicIndex = targetIndex;
            changed = true;
          }

          if (theoryObj && typeof theoryObj.content === "string" && theoryObj.content.trim()) {
            const normalizedContent = theoryObj.content.trim();
            assertTheoryContentIsPure(normalizedContent);

            const block = existing.theoryBlock;
            const nextTitle = String(theoryObj.title || existing.title).trim();
            const nextLevel = theoryObj.level === undefined ? (block?.level ?? null) : (theoryObj.level ?? null);
            const nextTags = theoryObj.tags === undefined ? (block?.tags ?? null) : JSON.stringify(theoryObj.tags);

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
                await writeTheoryRevisionTx({
                  manager,
                  theoryBlock: block,
                  action: "UPDATE",
                  comment: "sync:repo",
                  createdByUserId: req.userId ?? null
                });
              }
            } else {
              const createdBlock = await bRepo.save(
                bRepo.create({
                  title: nextTitle,
                  content: normalizedContent,
                  version: 1,
                  level: nextLevel,
                  tags: nextTags
                })
              );
              existing.theoryBlock = { id: createdBlock.id } as unknown as TheoryBlock;
              await writeTheoryRevisionTx({
                manager,
                theoryBlock: createdBlock,
                action: "CREATE",
                comment: "sync:repo",
                createdByUserId: req.userId ?? null
              });
            }

            existing.theoryMarkdown = normalizedContent;
            changed = true;
          }

          if (changed) {
            await tRepo.save(existing);
          }
          updated++;
        } else {
          let theoryBlock: TheoryBlock | null = null;
          if (theoryObj && typeof theoryObj.content === "string" && theoryObj.content.trim()) {
            const normalizedContent = theoryObj.content.trim();
            assertTheoryContentIsPure(normalizedContent);
            const createdBlock = await bRepo.save(
              bRepo.create({
                title: String(theoryObj.title || it.title).trim(),
                content: normalizedContent,
                version: 1,
                level: theoryObj.level === undefined ? null : (theoryObj.level ?? null),
                tags: theoryObj.tags === undefined ? null : JSON.stringify(theoryObj.tags)
              })
            );
            theoryBlock = createdBlock;
            await writeTheoryRevisionTx({
              manager,
              theoryBlock: createdBlock,
              action: "CREATE",
              comment: "sync:repo",
              createdByUserId: req.userId ?? null
            });
          }

          const createdTopic = await tRepo.save(
            tRepo.create({
              title: it.title,
              lang: effectiveLanguage,
              topicIndex: targetIndex,
              isControl: false,
              theoryBlock: theoryBlock ? ({ id: theoryBlock.id } as unknown as TheoryBlock) : null,
              theoryMarkdown: theoryBlock ? String(theoryBlock.content ?? "").trim() : null
            })
          );

          existingByTitle.set(key, createdTopic);
          existingByIndex.set(targetIndex, createdTopic);
          created++;
        }
      }

      const finalList = await tRepo.find({ where: { lang: effectiveLanguage }, order: { topicIndex: "ASC" } });
      for (let i = 0; i < finalList.length; i++) {
        const t = finalList[i];
        if (Number(t.topicIndex ?? 0) !== i) {
          await tRepo.update({ id: t.id }, { topicIndex: i });
          t.topicIndex = i;
        }
      }

      const refreshed = await tRepo.find({ where: { lang: effectiveLanguage }, order: { topicIndex: "ASC" }, relations: { theoryBlock: true } });
      return { created, updated, skipped, topics: refreshed };
    });

    if (Array.isArray(result?.topics)) {
      for (const t of result.topics) {
        await syncGlobalTopicNewFromLegacy({ legacy: t });
      }
    }

    return res.json({
      ...result,
      source: {
        type: "repo",
        filePath,
        preferredYamlPath,
        selectedWasLegacyJson
      },
      topics: result.topics.map(buildAdminTopicDtoFromLegacy)
    });
  } catch (error: unknown) {
    const rawMsg = errorMessage(error);
    const rawCode = String(readProperty(error, "code") ?? "");
    if (/data too long/i.test(rawMsg) || /ER_DATA_TOO_LONG/i.test(rawCode)) {
      return res.status(400).json({
        message: "THEORY_TOO_LARGE",
        hint: "Theory content is too large for current DB column type. Ensure theory_blocks.content and topics.theory_markdown are MEDIUMTEXT/LONGTEXT, then retry the sync."
      });
    }

    // YAML parse / structure issues should be treated as client errors.
    if (rawMsg === "INVALID_YAML" || rawMsg === "INVALID_YAML_STRUCTURE") {
      return res.status(400).json({
        message: rawMsg,
        filePath: sourceFilePath,
        preferredYamlPath,
        selectedWasLegacyJson,
        details: readProperty(error, "details")
      });
    }

    // DB unique constraints, etc.
    const driverError = readProperty(error, "driverError");
    const driverCode = String(readProperty(driverError, "code") ?? "");
    const driverMsg = String(readProperty(driverError, "sqlMessage") ?? "");
    if (rawCode === "ER_DUP_ENTRY" || driverCode === "ER_DUP_ENTRY" || /duplicate entry/i.test(rawMsg) || /duplicate entry/i.test(driverMsg)) {
      return res.status(409).json({
        message: "DUPLICATE_ENTRY",
        hint: "A unique constraint failed during sync. This usually indicates out-of-sync theory revision versions. After deploying the latest backend (which auto-fixes revision versions), retry sync." 
      });
    }

    const msg = rawMsg || "INTERNAL_SERVER_ERROR";
    if (msg === "TOPIC_NOT_EMPTY") {
      return res.status(400).json({
        message: "TOPIC_NOT_EMPTY",
        hint: "Replace mode is blocked because some existing topics already have tasks. Use merge mode to update theory without deleting topics."
      });
    }
    if (msg === "THEORY_EMPTY") return res.status(400).json({ message: "THEORY_EMPTY" });
    if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({ message: "THEORY_CONTAINS_PRACTICE" });
    if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({ message: "THEORY_CONTAINS_TASK_INSTRUCTIONS" });
    if (typeof msg === "string" && /_AT_\d+$/.test(msg)) {
      return res.status(400).json({ message: "INVALID_YAML_TOPIC", detail: msg });
    }

    logger.error("[admin/materials] POST /sync/repo error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Diagnostics helper: tells how many topics exist in different storages.
// Useful when UI shows "No topics" but DB has legacy topics or class-specific topics.
adminMaterialsRouter.get("/diagnostics", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const language = String(req.query.language || "").toUpperCase().trim();
    if (language !== "JAVA" && language !== "PYTHON" && language !== "CPP") {
      return res.status(400).json({ message: "INVALID_LANGUAGE" });
    }

    const topicsNewGlobal = isEduLanguage(language)
      ? await topicNewRepo().count({
          where: {
            language: language as TopicLanguage,
            class: IsNull()
          }
        })
      : 0;

    const topicsNewClass = isEduLanguage(language)
      ? await topicNewRepo().count({
          where: {
            language: language as TopicLanguage,
            class: Not(IsNull())
          }
        })
      : 0;

    const legacyTopics = await legacyTopicRepo().count({
      where: {
        lang: language as MaterialsLanguage
      }
    });

    return res.json({
      language,
      topicsNewGlobal,
      topicsNewClass,
      legacyTopics
    });
  } catch (error: unknown) {
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
      where: { lang: language },
      order: { topicIndex: "ASC" },
      relations: { theoryBlock: true }
    });

    if (!legacy.length) {
      return res.status(400).json({ message: "NO_LEGACY_TOPICS" });
    }

    const result = await AppDataSource.transaction(async manager => {
      const tRepo = manager.getRepository(TopicNew);
      const legacyRepo = manager.getRepository(Topic);
      const bRepo = manager.getRepository(TheoryBlock);

      // Load existing global topics for the language.
      const existingTopics = await tRepo.find({
        where: { language, class: IsNull() },
        relations: { theoryBlock: true, tasks: true, controlWorks: true, class: true },
        order: { order: "ASC" }
      });

      if (importMode === "replace") {
        // Safety: block deletion if global topic already has tasks/control works.
        for (const t of existingTopics) {
          if (t.class) continue;
          if (t.tasks?.length || t.controlWorks?.length) {
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
        // History is disabled (theory_block_revisions table was dropped).
        void block;
        void comment;
      };

      for (let i = 0; i < legacy.length; i++) {
        const src = legacy[i];
        const title = String(src.title ?? "").trim();
        if (!title) {
          skipped++;
          continue;
        }

        const orderRaw = src.topicIndex;
        const targetOrder = Number.isFinite(Number(orderRaw)) ? Math.max(0, Math.floor(Number(orderRaw))) : i + 1;

        const legacyBlock = src.theoryBlock ?? null;
        const legacyBlockId = Number(src.theoryBlockId ?? legacyBlock?.id ?? 0) || null;

        const contentCandidate = String(src.theoryMarkdown ?? "").trim();
        const content = contentCandidate ? contentCandidate : "";

        const key = title.toLowerCase();
        const existing = existingByTitle.get(key);

        const upsertTheory = async (topic: TopicNew) => {
          // Prefer attaching an already-migrated legacy theory block (topics.theory_block_id).
          if (legacyBlockId) {
            const existingBlock = topic.theoryBlock;

            // In merge mode, only attach legacy block if the topic has no theory yet.
            // In replace mode, prefer legacy block as the source of truth.
            const shouldAttach = importMode === "replace" ? true : !existingBlock;
            if (shouldAttach) {
              topic.theoryBlock = { id: legacyBlockId } as unknown as TheoryBlock;
              topic.theoryBlockId = legacyBlockId;

              // Ensure at least one revision exists so History UI is not empty.
              const blockEntity = legacyBlock ?? (await bRepo.findOne({ where: { id: legacyBlockId } }));
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

          const block = topic.theoryBlock;
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
            topic.theoryBlock = createdBlock;
            topic.theoryBlockId = createdBlock.id;
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
            existing.order = targetOrder;
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
        where: { language, class: IsNull() },
        order: { order: "ASC" }
      });
      for (let i = 0; i < all.length; i++) {
        const id = all[i].id;
        const desired = i + 1;
        if (Number(all[i].order ?? 0) !== desired) {
          await manager.update(TopicNew, { id }, { order: desired });
        }
      }

      const topics = await tRepo.find({
        where: { language, class: IsNull() },
        order: { order: "ASC" },
        relations: { theoryBlock: true }
      });

      // Touch legacy repo to avoid unused warning in some TS configurations.
      void legacyRepo;

      return { created, updated, skipped, topics };
    });

    return res.json(result);
  } catch (error: unknown) {
    const msg = errorMessage(error) || "INTERNAL_SERVER_ERROR";
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

    const topic = await legacyTopicRepo().findOne({ where: { id: topicId }, relations: { theoryBlock: true } });
    if (!topic) return res.status(404).json({ message: "TOPIC_NOT_FOUND" });

    const prevLang = topic.lang;
    const prevIndex = Number(topic.topicIndex ?? 0);

    const nextLang = data.language ?? topic.lang;
    const nextIndex = data.order !== undefined ? Math.max(0, Math.floor(Number(data.order) - 1)) : prevIndex;

    await AppDataSource.transaction(async manager => {
      // Handle moving across languages / indexes.
      if (nextLang !== prevLang) {
        // Close the gap in prev language.
        await manager
          .createQueryBuilder()
          .update(Topic)
          .set({ topicIndex: () => "topic_index - 1" })
          .where("lang = :lang", { lang: prevLang })
          .andWhere("topic_index > :idx", { idx: prevIndex })
          .execute();

        // Make room in new language.
        await manager
          .createQueryBuilder()
          .update(Topic)
          .set({ topicIndex: () => "topic_index + 1" })
          .where("lang = :lang", { lang: nextLang })
          .andWhere("topic_index >= :idx", { idx: nextIndex })
          .execute();

        await manager.update(Topic, { id: topicId }, { lang: nextLang, topicIndex: nextIndex });
      } else if (nextIndex !== prevIndex) {
        // Move within same language.
        if (nextIndex > prevIndex) {
          await manager
            .createQueryBuilder()
            .update(Topic)
            .set({ topicIndex: () => "topic_index - 1" })
            .where("lang = :lang", { lang: nextLang })
            .andWhere("topic_index > :from", { from: prevIndex })
            .andWhere("topic_index <= :to", { to: nextIndex })
            .execute();
        } else {
          await manager
            .createQueryBuilder()
            .update(Topic)
            .set({ topicIndex: () => "topic_index + 1" })
            .where("lang = :lang", { lang: nextLang })
            .andWhere("topic_index >= :to", { to: nextIndex })
            .andWhere("topic_index < :from", { from: prevIndex })
            .execute();
        }
        await manager.update(Topic, { id: topicId }, { topicIndex: nextIndex });
      }

      if (data.title !== undefined) {
        await manager.update(Topic, { id: topicId }, { title: data.title.trim() });
      }
      if (data.language !== undefined) {
        await manager.update(Topic, { id: topicId }, { lang: data.language });
      }

      // Theory changes (block + mirror).
      if (data.clearTheory) {
        await manager.update(Topic, { id: topicId }, { theoryBlock: null, theoryMarkdown: null });
      }

      if (data.theory && data.theory.content) {
        const normalizedContent = String(data.theory.content).trim();
        assertTheoryContentIsPure(normalizedContent);

        const revisionAction: TheoryBlockRevisionAction = data.theoryRevisionAction === "AUTO" ? "AUTO" : "UPDATE";
        const revisionComment = data.theoryRevisionComment?.trim() || null;

        const current = await manager.getRepository(Topic).findOne({ where: { id: topicId }, relations: { theoryBlock: true } });
        const existing = current?.theoryBlock;
        if (existing) {
          const nextTitle = String(data.theory.title || existing.title || current?.title).trim();
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
            await writeTheoryRevisionTx({
              manager,
              theoryBlock: existing,
              action: revisionAction,
              comment: revisionComment || "update",
              createdByUserId: req.userId ?? null
            });
          }
          await manager.update(Topic, { id: topicId }, { theoryMarkdown: normalizedContent });
        } else {
          const created = manager.getRepository(TheoryBlock).create({
            title: String(data.theory.title || current?.title).trim(),
            content: normalizedContent,
            version: 1,
            level: data.theory.level === undefined ? null : data.theory.level,
            tags: data.theory.tags === undefined ? null : JSON.stringify(data.theory.tags)
          });
          const savedBlock = await manager.getRepository(TheoryBlock).save(created);
          await manager.update(Topic, { id: topicId }, { theoryBlock: { id: savedBlock.id } as unknown as TheoryBlock, theoryMarkdown: normalizedContent });
          await writeTheoryRevisionTx({
            manager,
            theoryBlock: savedBlock,
            action: "CREATE",
            comment: revisionComment || "create",
            createdByUserId: req.userId ?? null
          });
        }
      }

      // Normalize ordering for the affected language(s) (best-effort).
      const langs = new Set<MaterialsLanguage>([prevLang, nextLang]);
      for (const l of langs) {
        const rows = await manager.getRepository(Topic).find({ where: { lang: l }, order: { topicIndex: "ASC" } });
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (Number(r.topicIndex ?? 0) !== i) {
            await manager.update(Topic, { id: r.id }, { topicIndex: i });
          }
        }
      }
    });

    const full = await legacyTopicRepo().findOne({ where: { id: topicId }, relations: { theoryBlock: true } });
    if (full) {
      await syncGlobalTopicNewFromLegacy({ legacy: full });
    }
    return res.json({ topic: full ? buildAdminTopicDtoFromLegacy(full) : null });
  } catch (error: unknown) {
    const msg = errorMessage(error) || "INTERNAL_SERVER_ERROR";
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

      // History is disabled (theory_block_revisions table was dropped).
      return res.json({ revisions: [] });
    } catch (error: unknown) {
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

      // History is disabled (theory_block_revisions table was dropped).
      return res.status(410).json({ message: "THEORY_REVISIONS_DISABLED" });
    } catch (error: unknown) {
      logger.error("[admin/materials] GET /theory-blocks/:id/revisions/:version error", {
        requestId: req.requestId,
        userId: req.userId,
        error
      });
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  }
);

const translateTheoryEnSchema = z.object({
  force: z.boolean().optional()
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

      // History is disabled (theory_block_revisions table was dropped).
      void id;
      void version;
      return res.status(410).json({ message: "THEORY_REVISIONS_DISABLED" });
    } catch (error: unknown) {
      const msg = errorMessage(error) || "INTERNAL_SERVER_ERROR";
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

adminMaterialsRouter.post(
  "/theory-blocks/:id/translate/en",
  authRequired,
  systemAdminGuard,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

      const parsed = translateTheoryEnSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
      }
      const force = Boolean(parsed.data.force);

      const hasCols = await hasTheoryBlockEnTranslationColumns();
      if (!hasCols) {
        return res.status(409).json({ message: "TRANSLATION_COLUMNS_MISSING" });
      }

      const block = await theoryBlockRepo()
        .createQueryBuilder("b")
        .where("b.id = :id", { id })
        .addSelect(["b.titleEn", "b.contentEn", "b.translationVersionEn", "b.translatedAtEn"])
        .getOne();
      if (!block) return res.status(404).json({ message: "THEORY_BLOCK_NOT_FOUND" });

      const isFresh =
        String(block.titleEn ?? "").trim().length > 0 &&
        String(block.contentEn ?? "").trim().length > 0 &&
        !looksLikeTranslationProviderErrorText(String(block.titleEn ?? "")) &&
        !looksLikeTranslationProviderErrorText(String(block.contentEn ?? "")) &&
        Number(block.translationVersionEn ?? 0) === Number(block.version ?? 0);
      if (isFresh && !force) {
        return res.json({
          theoryBlock: {
            id: block.id,
            titleEn: block.titleEn,
            contentEn: block.contentEn,
            translationVersionEn: block.translationVersionEn,
            translatedAtEn: block.translatedAtEn
          }
        });
      }

      const [titleEn, contentEn] = await Promise.all([
        translateTextUkToEn(block.title),
        translateMarkdownUkToEn(block.content)
      ]);

      const translatedAt = new Date();
      await theoryBlockRepo().update(
        { id: block.id },
        {
          titleEn,
          contentEn,
          translationVersionEn: Number(block.version ?? 1),
          translatedAtEn: translatedAt
        }
      );

      return res.json({
        theoryBlock: {
          id: block.id,
          titleEn,
          contentEn,
          translationVersionEn: Number(block.version ?? 1),
          translatedAtEn: translatedAt
        }
      });
    } catch (error: unknown) {
      const msg = errorMessage(error);
      if (msg.includes("MyMemory HTTP 429") || msg.includes("YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY")) {
        return res.status(429).json({ message: "TRANSLATION_QUOTA_EXCEEDED" });
      }

      logger.error("[admin/materials] POST /theory-blocks/:id/translate/en error", {
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

    const topic = await legacyTopicRepo().findOne({ where: { id: topicId } });
    if (!topic) return res.status(404).json({ message: "TOPIC_NOT_FOUND" });

    const countTasks = await taskRepo().count({ where: { topic: { id: topicId } } });
    if (countTasks > 0) {
      return res.status(400).json({ message: "TOPIC_NOT_EMPTY" });
    }

    const lang = topic.lang;
    await legacyTopicRepo().remove(topic);

    // Normalize ordering after delete.
    const rows = await legacyTopicRepo().find({ where: { lang }, order: { topicIndex: "ASC" } });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (Number(r.topicIndex ?? 0) !== i) {
        await legacyTopicRepo().update({ id: r.id }, { topicIndex: i });
      }
    }

    return res.json({ ok: true });
    } catch (error: unknown) {
    logger.error("[admin/materials] DELETE /topics/:id error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default adminMaterialsRouter;
