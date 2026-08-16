/**
 * Generic deterministic tasks are safe only for personal practice.
 * A catalog task must keep its exact course-item contract when AI is down;
 * silently substituting another exercise could complete the wrong item.
 */
export function shouldUseGenericPersonalFallback(subtitle: unknown): boolean {
  return !String(subtitle ?? "").startsWith("CATALOG_ITEM:");
}
