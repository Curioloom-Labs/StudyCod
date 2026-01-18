import AppDataSource from "../data-source";
import { MoreThan } from "typeorm";
import { Task } from "../entities/Task";
import { TopicTask } from "../entities/TopicTask";
import { EduTask } from "../entities/EduTask";
import { TestData } from "../entities/TestData";

type Assoc =
  | { kind: "personal"; taskId: number }
  | { kind: "topic"; topicTaskId: number }
  | { kind: "edu"; eduTaskId: number };

function parseArgs() {
  const argv: string[] = process.argv.slice(2);
  const apply = argv.includes("--apply") || process.env.APPLY === "1";
  const limitArg = argv.find((a: string) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : undefined;
  const batchArg = argv.find((a: string) => a.startsWith("--batch="));
  const batchSize = batchArg ? Number.parseInt(batchArg.split("=")[1] ?? "", 10) : 500;
  return {
    apply,
    limit: Number.isFinite(limit as any) ? limit : undefined,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 500
  };
}

function inferExpectedTypeToken(expectedOutput: string): string | null {
  // Expected formats we want to detect:
  // - "type: str"
  // - "type:str"
  // - "type: <something>" (we still return whatever after the colon, trimmed)
  const m = String(expectedOutput ?? "").trim().match(/^type\s*:\s*([^\s\n\r]+)\s*$/i);
  return m?.[1] ? m[1].trim() : null;
}

function descriptionMentionsOutputFormat(desc: string): boolean {
  const d = String(desc ?? "");
  return /\btype\s*:/i.test(d) || /Формат\s+виводу/i.test(d) || /Output\s+format/i.test(d);
}

function appendOutputFormatNote(desc: string, exampleType: string): string {
  const base = String(desc ?? "").trim();
  const note = `\n\n**Формат виводу:** виведіть **один рядок** у форматі \`type: <назва_типу>\`.\nНаприклад: \`type: ${exampleType}\`.\n\n> Важливо: не додавайте зайвого тексту (тільки цей рядок).`;
  return (base + note).trim();
}

function patchPythonStarterTemplate(template: string, exampleType: string): { patched: string; changed: boolean } {
  // If template already contains the required prefix, do nothing.
  const t = String(template ?? "");
  if (/\btype\s*:/i.test(t)) return { patched: t.trim(), changed: false };

  // Replace common naive output with a stable format.
  // print(type(x)) -> print(f"type: {type(x).__name__}")
  // or print("type:", type(x).__name__) (but that yields "type: str" with a space; we want EXACT.
  // Therefore use f-string.
  const patched = t.replace(/print\s*\(\s*type\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\)\s*/g, (_m, varName) => {
    return `print(f"type: {type(${varName}).__name__}")`;
  });

  // If nothing matched, keep original.
  return { patched: patched.trim(), changed: patched.trim() !== t.trim() };
}

function assocFromRow(row: any): Assoc | null {
  if (row?.personalTask?.id) return { kind: "personal", taskId: Number(row.personalTask.id) };
  if (row?.topicTask?.id) return { kind: "topic", topicTaskId: Number(row.topicTask.id) };
  if (row?.task?.id) return { kind: "edu", eduTaskId: Number(row.task.id) };
  return null;
}

async function main() {
  const args = parseArgs();
  console.log(`[fix-missing-output-format] Starting. apply=${args.apply} batchSize=${args.batchSize} limit=${args.limit ?? "(none)"}`);
  if (!args.apply) {
    console.log('[fix-missing-output-format] Dry-run mode. Re-run with --apply (or set APPLY=1) to persist changes.');
  }

  await AppDataSource.initialize();
  try {
    const testRepo = AppDataSource.getRepository(TestData);
    const taskRepo = AppDataSource.getRepository(Task);
    const topicTaskRepo = AppDataSource.getRepository(TopicTask);
    const eduTaskRepo = AppDataSource.getRepository(EduTask);

    let afterId = 0;
    let scanned = 0;
    let candidates = 0;
    let updatedDescriptions = 0;
    let updatedTemplates = 0;

    for (;;) {
      const batch = await testRepo.find({
        where: { id: MoreThan(afterId) } as any,
        relations: {
          personalTask: true,
          topicTask: true,
          task: true
        },
        select: {
          id: true,
          expectedOutput: true,
          personalTask: { id: true } as any,
          topicTask: { id: true } as any,
          task: { id: true } as any
        } as any,
        order: { id: "ASC" },
        take: args.batchSize
      });

      if (batch.length === 0) break;

      for (const td of batch) {
        scanned++;
        afterId = td.id;

        const expectedType = inferExpectedTypeToken(td.expectedOutput);
        if (!expectedType) continue;

        const assoc = assocFromRow(td as any);
        if (!assoc) continue;

        candidates++;

        if (assoc.kind === "personal") {
          const task = await taskRepo.findOne({ where: { id: assoc.taskId } as any });
          if (!task) continue;

          let descChanged = false;
          let tplChanged = false;

          if (!descriptionMentionsOutputFormat(task.description)) {
            const newDesc = appendOutputFormatNote(task.description, expectedType);
            descChanged = newDesc !== task.description;
            if (descChanged && args.apply) {
              await taskRepo.update({ id: task.id } as any, { description: newDesc } as any);
            }
          }

          if ((task.lang ?? "") === "PYTHON") {
            const { patched, changed } = patchPythonStarterTemplate(task.template, expectedType);
            tplChanged = changed;
            if (tplChanged && args.apply) {
              await taskRepo.update({ id: task.id } as any, { template: patched } as any);
            }
          }

          if (descChanged) updatedDescriptions++;
          if (tplChanged) updatedTemplates++;
        }

        if (assoc.kind === "topic") {
          const topicTask = await topicTaskRepo.findOne({ where: { id: assoc.topicTaskId } as any });
          if (!topicTask) continue;

          if (!descriptionMentionsOutputFormat(topicTask.description)) {
            const newDesc = appendOutputFormatNote(topicTask.description, expectedType);
            const changed = newDesc !== topicTask.description;
            if (changed) updatedDescriptions++;
            if (changed && args.apply) {
              await topicTaskRepo.update({ id: topicTask.id } as any, { description: newDesc } as any);
            }
          }

          // TopicTask has no lang column; we avoid patching templates automatically.
        }

        if (assoc.kind === "edu") {
          const eduTask = await eduTaskRepo.findOne({ where: { id: assoc.eduTaskId } as any });
          if (!eduTask) continue;

          if (!descriptionMentionsOutputFormat(eduTask.description)) {
            const newDesc = appendOutputFormatNote(eduTask.description, expectedType);
            const changed = newDesc !== eduTask.description;
            if (changed) updatedDescriptions++;
            if (changed && args.apply) {
              await eduTaskRepo.update({ id: eduTask.id } as any, { description: newDesc } as any);
            }
          }

          // EduTask has no lang column; avoid template patch.
        }

        if (args.limit != null && scanned >= args.limit) {
          console.log(`[fix-missing-output-format] Hit limit=${args.limit}, stopping early.`);
          break;
        }
      }

      console.log(`[fix-missing-output-format] progress: scannedTestData=${scanned}, candidates(type:*)=${candidates}, descWouldChange=${updatedDescriptions}, tplWouldChange=${updatedTemplates}, applied=${args.apply}`);

      if (args.limit != null && scanned >= args.limit) break;
    }

    console.log(`[fix-missing-output-format] Done. scannedTestData=${scanned}, candidates(type:*)=${candidates}, descWouldChange=${updatedDescriptions}, tplWouldChange=${updatedTemplates}, applied=${args.apply}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch(err => {
  console.error("[fix-missing-output-format] Failed:", err);
  process.exitCode = 1;
});
