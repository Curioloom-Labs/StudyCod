import { AppDataSource } from "../data-source";
import { Topic } from "../entities/Topic";
import { TopicNew, TopicLanguage } from "../entities/TopicNew";
import { TheoryBlock } from "../entities/TheoryBlock";
import { logger } from "./logger";
import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import { IsNull } from "typeorm";
import { env } from "../env";

let cachedRepoRoot: string | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function walkUpDirs(startDir: string, maxDepth: number): string[] {
  const out: string[] = [];
  let cur = path.resolve(startDir);
  for (let i = 0; i <= maxDepth; i++) {
    out.push(cur);
    const parent = path.dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return out;
}

function findRepoRoot(): string | null {
  if (cachedRepoRoot !== undefined) return cachedRepoRoot;

  const envRoots = [
    env.REPO_ROOT,
    env.STUDYCOD_REPO_ROOT,
    env.APP_ROOT
  ].filter((root): root is string => typeof root === "string" && root.length > 0);

  const candidates = [
    ...envRoots.map(r => path.resolve(r)),
    ...walkUpDirs(process.cwd(), 6),
    ...walkUpDirs(__dirname, 8)
  ];

  const seen = new Set<string>();
  for (const dir of candidates) {
    const key = dir.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const theoriesDir = path.join(dir, "theories");
      if (fs.existsSync(theoriesDir) && fs.statSync(theoriesDir).isDirectory()) {
        cachedRepoRoot = dir;
        return cachedRepoRoot;
      }
    } catch {
      // ignore
    }
  }

  cachedRepoRoot = null;
  return null;
}

function resolveRepoFile(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const repoRoot = findRepoRoot();
  if (repoRoot) return path.resolve(repoRoot, filePath);
  return path.resolve(process.cwd(), filePath);
}
async function readYamlFile(filePath: string): Promise<unknown> {
  try {
    const fullPath = resolveRepoFile(filePath);
    const content = await fs.promises.readFile(fullPath, "utf-8");
    return YAML.parse(content);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug('[seed-topics] read yaml failed', { filePath, resolved: resolveRepoFile(filePath), message });
    return null;
  }
}

async function loadTopicsFromYaml(lang: "JAVA" | "PYTHON" | "CPP"): Promise<Array<{ title: string; theory: string; index: number }> | null> {
  const name = lang === "JAVA" ? "java_core" : lang === "PYTHON" ? "python_core" : "cpp_core";
  const parsed = await readYamlFile(`theories/${name}_theory.yml`);
  const topics = isRecord(parsed) && Array.isArray(parsed.topics) ? parsed.topics : null;
  if (!Array.isArray(topics)) return null;

  const result: Array<{ title: string; theory: string; index: number }> = [];
  topics.forEach((rawTopic, i) => {
    const topic = isRecord(rawTopic) ? rawTopic : {};
    const title = String(topic.title || "").trim();
    if (!title) return;
    const content = typeof topic.theory === "string"
      ? topic.theory
      : isRecord(topic.theory) ? String(topic.theory.content || "") : "";
    const order = Number(topic.order);
    const index = Number.isFinite(order) && order > 0 ? (order - 1) : i;
    result.push({
      title,
      theory: content || "",
      index
    });
  });
  return result.length > 0 ? result : null;
}
export async function seedTopicsIfNeeded(): Promise<void> {
  try {
    const topicRepo = AppDataSource.getRepository(Topic);
    const topicNewRepo = AppDataSource.getRepository(TopicNew);
    const theoryRepo = AppDataSource.getRepository(TheoryBlock);

    // Safety guard: startup seeding should initialize empty databases,
    // not overwrite already customized curriculum on every restart.
    // Use SEED_TOPICS_FORCE_SYNC=true only when you intentionally want
    // to re-sync DB from repo files.
    const forceSync = String(env.SEED_TOPICS_FORCE_SYNC ?? "false").toLowerCase() === "true";
    if (!forceSync) {
      const [legacyCount, globalCount] = await Promise.all([
        topicRepo.count(),
        topicNewRepo.count({
          where: {
            class: IsNull()
          }
        })
      ]);

      if (legacyCount > 0 || globalCount > 0) {
        logger.info('[seed-topics] skipped (existing curriculum detected)', {
          legacyCount,
          globalCount,
          hint: 'Set SEED_TOPICS_FORCE_SYNC=true to force sync from repo files.'
        });
        return;
      }
    }

    const items: Array<{
      title: string;
      lang: "JAVA" | "PYTHON" | "CPP";
      theory: string;
      index: number;
    }> = [];

    const langs: Array<"JAVA" | "PYTHON" | "CPP"> = ["JAVA", "PYTHON", "CPP"];
    for (const lang of langs) {
      const yamlTopics = await loadTopicsFromYaml(lang);
      if (yamlTopics) {
        yamlTopics.forEach(t => items.push({ ...t, lang }));
      }
    }

    if (items.length === 0) {
      logger.debug('[seed-topics] no topic sources found, skip');
      return;
    }
    let added = 0;
    let updated = 0;
    let addedNew = 0;
    let updatedNew = 0;
    const crypto = await import("crypto");
    const hash = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
    const existingBlocks = await theoryRepo.find();
    const blockByHash = new Map<string, TheoryBlock>();
    for (const b of existingBlocks) {
      blockByHash.set(hash(String(b.content ?? "")), b);
    }
    const getOrCreateBlock = async (title: string, content: string): Promise<TheoryBlock> => {
      const c = String(content ?? "").trim();
      const h = hash(c);
      const cached = blockByHash.get(h);
      if (cached) return cached;
      const created = theoryRepo.create({
        title: String(title || "Theory").trim(),
        content: c,
        version: 1
      });
      const saved = await theoryRepo.save(created);
      blockByHash.set(h, saved);
      return saved;
    };
    for (const item of items) {
      const existing = await topicRepo.findOne({
        where: {
          title: item.title,
          lang: item.lang
        }
      });
      if (existing) {
        const content = String(item.theory || "").trim();
        if (content) {
          const block = await getOrCreateBlock(item.title, content);
          existing.theoryBlock = block;
        }
        if (existing.topicIndex !== item.index) {
          existing.topicIndex = item.index;
        }
        await topicRepo.save(existing);
        updated++;
      } else {
        const content = String(item.theory || "").trim();
        let blockId: number | null = null;
        if (content) {
          const block = await getOrCreateBlock(item.title, content);
          blockId = block.id;
        }
        const newTopic = topicRepo.create({
          title: item.title,
          lang: item.lang,
          topicIndex: item.index,
          theoryMarkdown: null,
          theoryBlock: blockId ? { id: blockId } : null,
          isControl: false
        });
        await topicRepo.save(newTopic);
        added++;
      }

      // Keep topics_new (global curriculum) in sync as well.
      // Many UI pages (admin materials, theory reading) rely on topics_new.
      // We only touch GLOBAL topics here (class_id IS NULL) to avoid interfering with EDU class-specific content.
      const desiredOrder = Number.isFinite(item.index) ? (Math.floor(item.index) + 1) : 0;
      const desiredTheoryContent = String(item.theory || "").trim();
      const desiredBlock = desiredTheoryContent ? await getOrCreateBlock(item.title, desiredTheoryContent) : null;
      const existingNew = await topicNewRepo.findOne({
        where: {
          title: item.title,
          language: item.lang as TopicLanguage,
          class: IsNull()
        },
        relations: ["theoryBlock"]
      });
      if (existingNew) {
        let changed = false;
        if (existingNew.order !== desiredOrder) {
          existingNew.order = desiredOrder;
          changed = true;
        }
        if (desiredBlock && (existingNew.theoryBlockId ?? null) !== desiredBlock.id) {
          existingNew.theoryBlock = desiredBlock;
          changed = true;
        }
        if (changed) {
          await topicNewRepo.save(existingNew);
          updatedNew++;
        }
      } else {
        const created = topicNewRepo.create({
          title: item.title,
          description: null,
          order: desiredOrder,
          language: item.lang as TopicLanguage,
          class: null,
          theoryBlock: desiredBlock
        });
        await topicNewRepo.save(created);
        addedNew++;
      }
    }
    if (added > 0 || updated > 0 || addedNew > 0 || updatedNew > 0) {
      logger.info('[seed-topics] updated', { added, updated, addedNew, updatedNew });
    }
  } catch (err: unknown) {
    logger.error('[seed-topics] failed', { message: err instanceof Error ? err.message : String(err) });
  }
}
