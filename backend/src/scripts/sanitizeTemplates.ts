import AppDataSource from "../data-source";
import { MoreThan } from "typeorm";
import { Task } from "../entities/Task";
import { TopicTask } from "../entities/TopicTask";
import { EduTask } from "../entities/EduTask";

type SupportedLang = "JAVA" | "PYTHON";

function detectLanguageFromTemplate(template: string): SupportedLang {
  const t = template.toLowerCase();
  if (t.includes("def main") || t.includes("__name__") || t.includes("#")) return "PYTHON";
  if (t.includes("public class") || t.includes("system.out") || t.includes("scanner") || t.includes("//")) return "JAVA";
  // Fallback: pick python if it looks like indentation+pass, otherwise Java.
  if (/^\s*pass\s*$/m.test(template)) return "PYTHON";
  return "JAVA";
}

function looksLikeRussianInstruction(text: string): boolean {
  // Heuristic: cyrillic + common RU instruction verbs.
  const hasCyrillic = /[\u0400-\u04FF]/.test(text);
  if (!hasCyrillic) return false;
  return /\b(присвойте|переменн|переменных|выведите|введите|считайте|найдите|отсортируйте|добавьте|удалите|верните|прочитайте)\b/i.test(text);
}

function normalizeTemplateTodoComments(params: {
  template: string;
  language: SupportedLang;
  todoText: string;
}): string {
  const original = params.template ?? "";
  const template = String(original).replace(/\r\n/g, "\n");
  const lines = template.split("\n");

  const shouldAggressivelyNormalizeComments = looksLikeRussianInstruction(template);

  const normalizePython = (line: string): string => {
    const todoMatch = line.match(/^(\s*)#\s*todo\b.*$/i);
    if (todoMatch) return `${todoMatch[1]}# TODO: ${params.todoText}`;

    if (shouldAggressivelyNormalizeComments) {
      const m = line.match(/^(\s*)#\s*.+$/);
      if (m) return `${m[1]}# TODO: ${params.todoText}`;
    }
    return line;
  };

  const normalizeJava = (line: string): string => {
    const todoMatch = line.match(/^(\s*)\/\/\s*todo\b.*$/i);
    if (todoMatch) return `${todoMatch[1]}// TODO: ${params.todoText}`;

    if (shouldAggressivelyNormalizeComments) {
      const m = line.match(/^(\s*)\/\/\s*.+$/);
      if (m) return `${m[1]}// TODO: ${params.todoText}`;
    }
    return line;
  };

  const normalizedLines = lines.map(line => {
    if (params.language === "PYTHON") return normalizePython(line);
    return normalizeJava(line);
  });

  return normalizedLines.join("\n").trim();
}

function sanitizeTemplate(params: {
  template: string;
  languageHint?: SupportedLang;
}): { sanitized: string; changed: boolean; language: SupportedLang } {
  const template = String(params.template ?? "");
  const language = params.languageHint ?? detectLanguageFromTemplate(template);

  // Default to UA, but keep EN-only templates as-is unless we detect RU instructions.
  const hasCyrillic = /[\u0400-\u04FF]/.test(template);
  const isRu = looksLikeRussianInstruction(template);

  const uaTodo = "реалізуйте рішення задачі згідно з умовою";
  const enTodo = "implement the solution according to the statement";

  // If it already looks English (ASCII-ish) and there's no RU, keep it.
  const hasAnyLetters = /[A-Za-z\u0400-\u04FF]/.test(template);
  const looksEnglishOnly = hasAnyLetters && !hasCyrillic;

  const todoText = (isRu || hasCyrillic) ? uaTodo : (looksEnglishOnly ? enTodo : uaTodo);

  const sanitized = normalizeTemplateTodoComments({
    template,
    language,
    todoText
  });

  return {
    sanitized,
    changed: sanitized !== template.trim(),
    language
  };
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply") || process.env.APPLY === "1";
  const limitArg = argv.find(a => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : undefined;
  const batchArg = argv.find(a => a.startsWith("--batch="));
  const batchSize = batchArg ? Number.parseInt(batchArg.split("=")[1] ?? "", 10) : 500;
  return {
    apply,
    limit: Number.isFinite(limit as any) ? limit : undefined,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 500
  };
}

async function sanitizeRepo<T extends { id: number; template: string }>(params: {
  name: string;
  getBatch: (afterId: number, take: number) => Promise<T[]>;
  updateTemplate: (id: number, template: string) => Promise<void>;
  getLanguageHint?: (row: T) => SupportedLang | undefined;
  apply: boolean;
  batchSize: number;
  limit?: number;
}) {
  let afterId = 0;
  let scanned = 0;
  let changed = 0;

  for (;;) {
    const batch = await params.getBatch(afterId, params.batchSize);
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned++;
      afterId = row.id;

      const { sanitized, changed: isChanged } = sanitizeTemplate({
        template: row.template,
        languageHint: params.getLanguageHint?.(row)
      });

      if (isChanged) {
        changed++;
        if (params.apply) {
          await params.updateTemplate(row.id, sanitized);
        }
      }

      if (params.limit != null && scanned >= params.limit) {
        console.log(`[sanitize-templates] Hit limit=${params.limit}, stopping early.`);
        console.log(`[sanitize-templates] ${params.name}: scanned=${scanned}, wouldChange=${changed}, applied=${params.apply}`);
        return;
      }
    }

    if (scanned % (params.batchSize * 2) === 0) {
      console.log(`[sanitize-templates] ${params.name}: scanned=${scanned}, wouldChange=${changed}, applied=${params.apply}`);
    }
  }

  console.log(`[sanitize-templates] ${params.name}: scanned=${scanned}, wouldChange=${changed}, applied=${params.apply}`);
}

async function main() {
  const args = parseArgs();
  console.log(`[sanitize-templates] Starting. apply=${args.apply} batchSize=${args.batchSize} limit=${args.limit ?? "(none)"}`);
  if (!args.apply) {
    console.log('[sanitize-templates] Dry-run mode. Re-run with --apply (or set APPLY=1) to persist changes.');
  }

  await AppDataSource.initialize();
  try {
    const taskRepo = AppDataSource.getRepository(Task);
    const topicTaskRepo = AppDataSource.getRepository(TopicTask);
    const eduTaskRepo = AppDataSource.getRepository(EduTask);

    await sanitizeRepo({
      name: "tasks",
      apply: args.apply,
      batchSize: args.batchSize,
      limit: args.limit,
      getBatch: async (afterId, take) => taskRepo.find({
        select: {
          id: true,
          template: true,
          lang: true
        },
        where: {
          id: MoreThan(afterId)
        },
        order: {
          id: "ASC"
        },
        take
      }) as any,
      getLanguageHint: (row: any) => (row.lang === "PYTHON" ? "PYTHON" : row.lang === "JAVA" ? "JAVA" : undefined),
      updateTemplate: async (id, template) => {
        await taskRepo.update({ id } as any, { template } as any);
      }
    });

    await sanitizeRepo({
      name: "topic_tasks",
      apply: args.apply,
      batchSize: args.batchSize,
      limit: args.limit,
      getBatch: async (afterId, take) => topicTaskRepo.find({
        select: {
          id: true,
          template: true
        },
        where: {
          id: MoreThan(afterId)
        },
        order: {
          id: "ASC"
        },
        take
      }) as any,
      updateTemplate: async (id, template) => {
        await topicTaskRepo.update({ id } as any, { template } as any);
      }
    });

    await sanitizeRepo({
      name: "edu_tasks",
      apply: args.apply,
      batchSize: args.batchSize,
      limit: args.limit,
      getBatch: async (afterId, take) => eduTaskRepo.find({
        select: {
          id: true,
          template: true
        },
        where: {
          id: MoreThan(afterId)
        },
        order: {
          id: "ASC"
        },
        take
      }) as any,
      updateTemplate: async (id, template) => {
        await eduTaskRepo.update({ id } as any, { template } as any);
      }
    });

    console.log("[sanitize-templates] Done.");
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch(err => {
  console.error("[sanitize-templates] Failed:", err);
  process.exitCode = 1;
});
