import { AppDataSource } from "../data-source";
import { Topic } from "../entities/Topic";
import { TheoryBlock } from "../entities/TheoryBlock";
import * as fs from "fs";
import * as path from "path";
async function readJsonFile(filePath: string): Promise<any> {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    const content = await fs.promises.readFile(fullPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err);
    return null;
  }
}
export async function seedTopicsIfNeeded(): Promise<void> {
  try {
    const topicRepo = AppDataSource.getRepository(Topic);
    const theoryRepo = AppDataSource.getRepository(TheoryBlock);
    const javaTopics = await readJsonFile("topics/java_topics.json");
    const pythonTopics = await readJsonFile("topics/python_topics.json");
    const javaTheory = await readJsonFile("theories/java_theory.json");
    const pythonTheory = await readJsonFile("theories/python_theory.json");
    if (!javaTopics || !pythonTopics) {
      console.warn("Topics files not found, skipping seed");
      return;
    }
    const items: Array<{
      title: string;
      lang: "JAVA" | "PYTHON";
      theory: string;
      index: number;
    }> = [];
    if (Array.isArray(javaTopics)) {
      javaTopics.forEach((title: string, i: number) => {
        items.push({
          title,
          lang: "JAVA",
          theory: javaTheory && typeof javaTheory === "object" && javaTheory[title] || "",
          index: i
        });
      });
    }
    if (Array.isArray(pythonTopics)) {
      pythonTopics.forEach((title: string, i: number) => {
        items.push({
          title,
          lang: "PYTHON",
          theory: pythonTheory && typeof pythonTheory === "object" && pythonTheory[title] || "",
          index: i
        });
      });
    }
    let added = 0;
    let updated = 0;
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
        } as any
      });
      if (existing) {
        const content = String(item.theory || "").trim();
        if (content) {
          const block = await getOrCreateBlock(item.title, content);
          (existing as any).theoryBlock = {
            id: block.id
          };
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
          ...(blockId ? {
            theoryBlock: {
              id: blockId
            }
          } : {}),
          isControl: false
        } as any);
        await topicRepo.save(newTopic);
        added++;
      }
    }
    if (added > 0 || updated > 0) {
      console.log(`Topics seeded: ${added} added, ${updated} updated`);
    }
  } catch (err) {
    console.error("Error seeding topics:", err);
  }
}