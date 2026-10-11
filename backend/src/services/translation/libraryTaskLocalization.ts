import { createHash } from "crypto";
import { AppDataSource } from "../../data-source";
import { LibraryTask } from "../../entities/LibraryTask";
import type { AuthRequest } from "../../middleware/authMiddleware";
import { logger } from "../../utils/logger";
import {
  looksLikeTranslationProviderErrorText,
  translateMarkdownUkToEn,
  translateTextUkToEn,
} from "./translateUkToEn";
import { detectStatementLanguage } from "./taskStatementLocalization";
import { hasLibraryTaskEnTranslationColumns } from "./translationSchema";
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const LIBRARY_TASK_EN_TRANSLATION_VERSION = 2;
const pending = new Map<
  string,
  Promise<{ title: string; description: string } | null>
>();
const retryAfter = new Map<string, number>();

function computeLibraryTaskEnSourceHash(
  task: Pick<LibraryTask, "title" | "description">,
): string {
  // Include the translation version in the hash so we can invalidate cached translations
  // after changing our Markdown-masking/translation behavior.
  const src = `v${LIBRARY_TASK_EN_TRANSLATION_VERSION}\nTITLE\n${task.title}\nDESC\n${task.description}`;
  return createHash("sha256").update(src, "utf8").digest("hex");
}

function isLibraryTaskEnFresh(
  taskWithEn: LibraryTask,
  expectedSourceHash: string,
): boolean {
  const titleEn = String(taskWithEn.titleEn ?? "");
  const descEn = String(taskWithEn.descriptionEn ?? "");
  const okTitle =
    titleEn.trim().length > 0 &&
    !looksLikeTranslationProviderErrorText(titleEn);
  const okDesc =
    descEn.trim().length > 0 && !looksLikeTranslationProviderErrorText(descEn);
  const okHash =
    String(taskWithEn.translationSourceHashEn ?? "").trim() ===
    expectedSourceHash;
  const okVer =
    Number(taskWithEn.translationVersionEn ?? 0) ===
    LIBRARY_TASK_EN_TRANSLATION_VERSION;
  const unchangedUkrainian =
    titleEn === taskWithEn.title &&
    descEn === taskWithEn.description &&
    /[а-яіїєґ]/i.test(taskWithEn.description);
  return (
    okTitle &&
    okDesc &&
    okHash &&
    okVer &&
    !unchangedUkrainian &&
    detectStatementLanguage(descEn) === "en"
  );
}

export async function localizeLibraryTasksToEn(
  tasks: LibraryTask[],
  req: AuthRequest,
): Promise<Map<number, { title: string; description: string }>> {
  const out = new Map<number, { title: string; description: string }>();
  const ids = Array.from(
    new Set(
      tasks.map((t) => t.id).filter((x): x is number => typeof x === "number"),
    ),
  );
  if (ids.length === 0) return out;

  const hasCols = await hasLibraryTaskEnTranslationColumns();
  if (!hasCols) {
    logger.warn(
      "[library] EN translation requested but DB columns are missing; serving uk content",
      {
        requestId: req.requestId,
        userId: req.userId ?? null,
      },
    );
    return out;
  }

  // Translation columns are marked select:false, so we explicitly select them.
  const rows = await AppDataSource.getRepository(LibraryTask)
    .createQueryBuilder("t")
    .where("t.id IN (:...ids)", { ids })
    .addSelect([
      "t.titleEn",
      "t.descriptionEn",
      "t.translationSourceHashEn",
      "t.translationVersionEn",
      "t.translatedAtEn",
    ])
    .getMany();

  const byId = new Map<number, LibraryTask>();
  for (const r of rows) byId.set(r.id, r);

  // Translate missing/stale ones sequentially to be gentle to free API.
  for (const id of ids) {
    const t = byId.get(id);
    if (!t) continue;

    const sourceHash = computeLibraryTaskEnSourceHash(t);
    if (isLibraryTaskEnFresh(t, sourceHash)) {
      out.set(id, {
        title: t.titleEn as string,
        description: t.descriptionEn as string,
      });
      continue;
    }

    const key = `${id}:${sourceHash}`;
    if ((retryAfter.get(key) ?? 0) > Date.now()) continue;
    let work = pending.get(key);
    if (!work) {
      work = (async () => {
        try {
          const [titleEn, descriptionEn] = await Promise.all([
            translateTextUkToEn(t.title),
            translateMarkdownUkToEn(t.description),
          ]);
          if (
            looksLikeTranslationProviderErrorText(titleEn) ||
            looksLikeTranslationProviderErrorText(descriptionEn) ||
            detectStatementLanguage(descriptionEn) !== "en" ||
            (descriptionEn === t.description &&
              /[а-яіїєґ]/i.test(t.description))
          ) {
            if (retryAfter.size >= 256)
              retryAfter.delete(retryAfter.keys().next().value!);
            retryAfter.set(key, Date.now() + 60_000);
            return null;
          }
          await AppDataSource.query(
            `UPDATE \`library_tasks\` SET \`title_en\` = ?, \`description_en\` = ?,
              \`translation_source_hash_en\` = ?, \`translation_version_en\` = ?,
              \`translated_at_en\` = ?, \`updated_at\` = \`updated_at\` WHERE \`id\` = ?`,
            [
              titleEn,
              descriptionEn,
              sourceHash,
              LIBRARY_TASK_EN_TRANSLATION_VERSION,
              new Date(),
              id,
            ],
          );
          return { title: titleEn, description: descriptionEn };
        } catch (error) {
          if (retryAfter.size >= 256)
            retryAfter.delete(retryAfter.keys().next().value!);
          retryAfter.set(key, Date.now() + 60_000);
          logger.warn("[library] translate uk->en failed", {
            requestId: req.requestId,
            libraryTaskId: id,
            error: errorMessage(error),
          });
          return null;
        }
      })();
      pending.set(key, work);
    }
    try {
      const translated = await work;
      if (translated) out.set(id, translated);
    } finally {
      if (pending.get(key) === work) pending.delete(key);
    }
  }

  return out;
}
