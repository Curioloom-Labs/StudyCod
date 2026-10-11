import { createHash } from "crypto";
import type { UiLocale } from "../../utils/uiLocale";
import {
  translateMarkdownBetweenLanguages,
  translateTextBetweenLanguages,
  looksLikeTranslationProviderErrorText,
} from "./translateUkToEn";
import { logger } from "../../utils/logger";

export type LocalizedTaskStatement = {
  title: string;
  description: string;
  language: UiLocale;
};
const cache = new Map<
  string,
  { expires: number; statement: LocalizedTaskStatement }
>();
const pending = new Map<string, Promise<LocalizedTaskStatement>>();

export function detectStatementLanguage(content: string): UiLocale {
  const prose = content.replace(
    /```[\s\S]*?```|~~~[\s\S]*?~~~|<pre\b[^>]*>[\s\S]*?<\/pre>|<code\b[^>]*>[\s\S]*?<\/code>|`[^`]*`|https?:\/\/[^\s]+/gi,
    "",
  );
  const ukrainian = prose.match(/[а-яіїєґ]/gi)?.length ?? 0;
  const latin = prose.match(/[a-z]/gi)?.length ?? 0;
  return ukrainian >= 4 && ukrainian > latin * 0.15 ? "uk" : "en";
}

/** Translate only the selected personal statement; never alter code or tests. */
export async function localizeTaskStatement(
  task: { id: number; title: string; description: string },
  target: UiLocale,
): Promise<LocalizedTaskStatement> {
  const source = detectStatementLanguage(task.description);
  const original = {
    title: task.title,
    description: task.description,
    language: source,
  };
  if (source === target || !task.description.trim()) return original;
  const hash = createHash("sha256")
    .update(`${task.title}\n${task.description}`)
    .digest("hex");
  const key = `${task.id}:${target}:${hash}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.statement;
  const existing = pending.get(key);
  if (existing) return existing;
  const work = (async () => {
    let statement = original;
    try {
      const [title, description] = await Promise.all([
        translateTextBetweenLanguages(task.title, source, target),
        translateMarkdownBetweenLanguages(task.description, source, target),
      ]);
      if (
        !looksLikeTranslationProviderErrorText(title) &&
        !looksLikeTranslationProviderErrorText(description) &&
        detectStatementLanguage(description) === target
      ) {
        statement = { title, description, language: target };
      }
    } catch (error) {
      logger.warn("[translation] personal task statement unavailable", {
        taskId: task.id,
        target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(key, {
      statement,
      expires:
        Date.now() + (statement.language === target ? 30 * 60_000 : 60_000),
    });
    return statement;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
