/**
 * Generic deterministic tasks are safe only for personal practice.
 * A catalog task must keep its exact course-item contract when AI is down;
 * silently substituting another exercise could complete the wrong item.
 */
export function shouldUseGenericPersonalFallback(subtitle: unknown): boolean {
  return !String(subtitle ?? "").startsWith("CATALOG_ITEM:");
}

/** A semantic rejection is evidence against the examples, not an outage. */
export function canUseTaskExamplesAfterTestFailure(error: { statusCode?: unknown; details?: { validationError?: unknown } } | undefined): boolean {
  if (error?.details?.validationError) return false;
  return [429, 503, 504].includes(Number(error?.statusCode));
}

/** A Judge oracle can prove that the generated statement or its public examples need a fresh task variant. */
export function shouldRegenerateOlympiadTask(error: { details?: { validationError?: unknown } } | undefined): boolean {
  const validationError = String(error?.details?.validationError ?? "");
  return /TASK_CONTRACT_REVIEW_FAILED\[(?:statement|publicExamples)\]/.test(validationError);
}
