/**
 * Localization helpers extracted from routes/tasks.ts and routes/topics.ts
 * (audit M1 starter — pure code-move, no behaviour change).
 *
 * Responsibilities:
 *  - A bounded LRU+TTL cache of topic-title uk -> en translations.
 *  - `buildLocalizedTopicTitleEnById` for batch-resolving titles for a list of
 *    Topic-like rows.
 *  - `translateTheoryUkToEn` for narrative theory text.
 *
 * Callers must NOT instantiate parallel caches — import `getCachedTopicTitleEn`
 * et al. from here so all routes share the same cache. The cache is also
 * used as a write-through layer when a persisted `title_en` column is present
 * (see audit M3).
 */
import { createHash } from "crypto";
import { BoundedCache } from "../../utils/boundedCache";
import { logger } from "../../utils/logger";
import { AppDataSource } from "../../data-source";
import {
  looksLikeTranslationProviderErrorText,
  translateMarkdownUkToEn,
  translateTextUkToEn,
} from "./translateUkToEn";

const TOPIC_TITLE_EN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TOPIC_TITLE_EN_CACHE_MAX = 1000;

const topicTitleEnCache = new BoundedCache<string, string>({
  maxEntries: TOPIC_TITLE_EN_CACHE_MAX,
  ttlMs: TOPIC_TITLE_EN_CACHE_TTL_MS,
});

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function topicTitleEnCacheKey(topicId: number, title: string): string {
  return `${topicId}:${sha256Hex(String(title ?? ""))}`;
}

export function looksLikeCyrillicText(text: string): boolean {
  return /[Ѐ-ӿ]/.test(String(text ?? ""));
}

export function getCachedTopicTitleEn(topicId: number, title: string): string | null {
  return topicTitleEnCache.get(topicTitleEnCacheKey(topicId, title)) ?? null;
}

export function setCachedTopicTitleEn(topicId: number, title: string, value: string): void {
  topicTitleEnCache.set(topicTitleEnCacheKey(topicId, title), value);
}

/**
 * Async write-through to topics_new.title_en. Fire-and-forget — failures are
 * logged but never block the caller. Skips the write if the topicId is not
 * positive or the value is empty. Uses raw SQL so the lookup column name
 * stays stable even if the entity field is renamed.
 */
function persistTopicTitleEnInBackground(topicId: number, valueEn: string): void {
  if (!Number.isFinite(topicId) || topicId <= 0) return;
  const trimmed = String(valueEn ?? "").trim();
  if (!trimmed) return;
  void AppDataSource.query(
    "UPDATE `topics_new` SET `title_en` = ? WHERE `id` = ? AND (`title_en` IS NULL OR `title_en` <> ?)",
    [trimmed, topicId, trimmed],
  ).catch(err => {
    logger.warn("[translation] write-through topics_new.title_en failed", {
      topicId,
      error: err?.message ?? String(err),
    });
  });
}

export type TopicLike = {
  id?: number | null;
  title?: string | null;
  titleEn?: string | null;
} | null | undefined;

export interface TranslationLogContext {
  requestId?: string;
  userId?: number;
}

/**
 * Returns a Map<topicId, displayTitle> where Ukrainian titles are translated
 * to English using the configured provider. Failures fall back to the
 * original title — never throws.
 */
export async function buildLocalizedTopicTitleEnById(params: {
  topics: TopicLike[];
  logContext?: TranslationLogContext;
}): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const unique = new Map<number, { title: string; titleEn: string | null }>();

  for (const topic of params.topics) {
    const topicId = Number((topic as any)?.id);
    if (!Number.isFinite(topicId) || topicId <= 0) continue;
    const title = String((topic as any)?.title ?? "").trim();
    if (!title) continue;
    if (unique.has(topicId)) continue;
    const titleEnRaw = (topic as any)?.titleEn;
    const titleEn = typeof titleEnRaw === "string" ? titleEnRaw.trim() : null;
    unique.set(topicId, { title, titleEn });
  }

  for (const [topicId, { title, titleEn }] of unique.entries()) {
    if (!looksLikeCyrillicText(title)) {
      out.set(topicId, title);
      continue;
    }

    // Persisted column wins — that's the whole point of write-through (M3).
    if (titleEn && !looksLikeTranslationProviderErrorText(titleEn)) {
      out.set(topicId, titleEn);
      setCachedTopicTitleEn(topicId, title, titleEn);
      continue;
    }

    const cached = getCachedTopicTitleEn(topicId, title);
    if (cached) {
      out.set(topicId, cached);
      continue;
    }

    try {
      const translated = await translateTextUkToEn(title);
      const normalized = String(translated ?? "").trim();
      if (normalized && !looksLikeTranslationProviderErrorText(normalized)) {
        out.set(topicId, normalized);
        setCachedTopicTitleEn(topicId, title, normalized);
        persistTopicTitleEnInBackground(topicId, normalized);
        continue;
      }
    } catch (error: any) {
      logger.warn("[translation] topic title uk->en failed", {
        requestId: params.logContext?.requestId,
        userId: params.logContext?.userId,
        topicId,
        error: error?.message ?? String(error),
      });
    }

    out.set(topicId, title);
  }

  return out;
}

/**
 * Async write-through to theory_blocks.{title_en,content_en,translation_version_en}.
 * Like the title_en write-through but version-aware: a stored translation is
 * only overwritten if the source version we just translated is newer than the
 * one already persisted. Fire-and-forget — never blocks the caller.
 */
export function persistTheoryBlockTranslationInBackground(params: {
  theoryBlockId: number;
  sourceVersion: number;
  titleEn?: string | null;
  contentEn?: string | null;
}): void {
  const id = Number(params.theoryBlockId);
  const version = Number(params.sourceVersion);
  if (!Number.isFinite(id) || id <= 0) return;
  if (!Number.isFinite(version) || version <= 0) return;

  const titleEn = typeof params.titleEn === "string" ? params.titleEn.trim() : null;
  const contentEn = typeof params.contentEn === "string" ? params.contentEn.trim() : null;
  if (!titleEn && !contentEn) return;

  // Only write if our translation reflects an equal-or-newer source version
  // than what is stored. NULL stored version means "never translated" — we
  // win unconditionally.
  void AppDataSource.query(
    `UPDATE \`theory_blocks\`
     SET ${titleEn ? "`title_en` = ?," : ""}
         ${contentEn ? "`content_en` = ?," : ""}
         \`translation_version_en\` = ?,
         \`translated_at_en\` = NOW()
     WHERE \`id\` = ?
       AND (\`translation_version_en\` IS NULL OR \`translation_version_en\` < ?)`,
    [
      ...(titleEn ? [titleEn] : []),
      ...(contentEn ? [contentEn] : []),
      version,
      id,
      version,
    ],
  ).catch(err => {
    logger.warn("[translation] write-through theory_blocks failed", {
      theoryBlockId: id,
      sourceVersion: version,
      error: err?.message ?? String(err),
    });
  });
}

/**
 * Translate a TheoryBlock end-to-end with persistence. Returns the English
 * content if available (column hit, otherwise live translate + write-through).
 * On any failure, returns the original uk text.
 */
export async function translateAndPersistTheoryBlock(params: {
  theoryBlockId: number;
  sourceVersion: number;
  contentUk: string;
  contentEn?: string | null;
  translationVersionEn?: number | null;
  logContext?: TranslationLogContext;
}): Promise<string> {
  const raw = String(params.contentUk ?? "");
  if (!raw.trim()) return raw;
  if (!looksLikeCyrillicText(raw)) return raw;

  // Persisted, up-to-date column wins.
  const persistedVersion = Number(params.translationVersionEn ?? 0);
  if (
    params.contentEn &&
    Number.isFinite(persistedVersion) &&
    persistedVersion >= Number(params.sourceVersion ?? 0) &&
    !looksLikeTranslationProviderErrorText(params.contentEn)
  ) {
    return params.contentEn;
  }

  try {
    const translated = await translateMarkdownUkToEn(raw);
    const normalized = String(translated ?? "").trim();
    if (normalized && !looksLikeTranslationProviderErrorText(normalized)) {
      persistTheoryBlockTranslationInBackground({
        theoryBlockId: params.theoryBlockId,
        sourceVersion: params.sourceVersion,
        contentEn: normalized,
      });
      return translated;
    }
  } catch (error: any) {
    logger.warn("[translation] theory uk->en failed", {
      requestId: params.logContext?.requestId,
      userId: params.logContext?.userId,
      theoryBlockId: params.theoryBlockId,
      error: error?.message ?? String(error),
    });
  }
  return raw;
}

/**
 * Translate markdown theory text uk -> en. Returns the original text if the
 * input is empty, non-Cyrillic, or the provider returned an error sentinel.
 * Never throws.
 */
export async function translateTopicTheoryUkToEn(params: {
  text: string;
  topicId?: number | null;
  logContext?: TranslationLogContext;
}): Promise<string> {
  const raw = String(params.text ?? "");
  if (!raw.trim()) return raw;
  if (!looksLikeCyrillicText(raw)) return raw;
  try {
    const translated = await translateMarkdownUkToEn(raw);
    const normalized = String(translated ?? "").trim();
    if (normalized && !looksLikeTranslationProviderErrorText(normalized)) {
      return translated;
    }
  } catch (error: any) {
    logger.warn("[translation] topic theory uk->en failed", {
      requestId: params.logContext?.requestId,
      userId: params.logContext?.userId,
      topicId: params.topicId ?? null,
      error: error?.message ?? String(error),
    });
  }
  return raw;
}

/**
 * Translate a single topic title uk -> en. Used by routes/topics.ts for the
 * single-item flow (where the cache lives only by id).
 */
export async function translateSingleTopicTitleUkToEn(params: {
  topicId: number;
  title: string;
  logContext?: TranslationLogContext;
}): Promise<string> {
  const raw = String(params.title ?? "").trim();
  if (!raw) return raw;
  if (!looksLikeCyrillicText(raw)) return raw;

  const cached = getCachedTopicTitleEn(params.topicId, raw);
  if (cached) return cached;

  try {
    const translated = await translateTextUkToEn(raw);
    const normalized = String(translated ?? "").trim();
    if (normalized && !looksLikeTranslationProviderErrorText(normalized)) {
      setCachedTopicTitleEn(params.topicId, raw, normalized);
      persistTopicTitleEnInBackground(params.topicId, normalized);
      return normalized;
    }
  } catch (error: any) {
    logger.warn("[translation] topic title uk->en failed", {
      requestId: params.logContext?.requestId,
      userId: params.logContext?.userId,
      topicId: params.topicId,
      error: error?.message ?? String(error),
    });
  }
  return raw;
}
