/**
 * Batch translation utilities to avoid N+1 translation API calls
 */

import { logger } from "./logger";
import { looksLikeTranslationProviderErrorText, translateMarkdownUkToEn } from "../services/translation/translateUkToEn";

/**
 * Translate multiple markdown texts in batch.
 * This reduces the number of API calls compared to individual translation calls.
 */
export async function batchTranslateMarkdownUkToEn(
  texts: Array<{ id: string | number; markdown: string }>,
  options?: {
    requestId?: string;
    userId?: number;
    context?: string;
    maxConcurrency?: number;
  }
): Promise<Map<string | number, string>> {
  const out = new Map<string | number, string>();
  const maxConcurrency = options?.maxConcurrency ?? 5;
  
  if (!texts.length) return out;

  // Process in batches to avoid overwhelming the translation service
  for (let i = 0; i < texts.length; i += maxConcurrency) {
    const batch = texts.slice(i, i + maxConcurrency);
    const promises = batch.map(async (item) => {
      try {
        const translated = await translateMarkdownUkToEn(item.markdown);
        if (translated.trim().length > 0 && !looksLikeTranslationProviderErrorText(translated)) {
          out.set(item.id, translated);
        }
      } catch (error: any) {
        logger.warn("[batch-translate] Translation failed", {
          requestId: options?.requestId,
          userId: options?.userId,
          context: options?.context,
          itemId: item.id,
          error: error?.message ?? String(error)
        });
      }
    });

    await Promise.all(promises);
  }

  return out;
}
