/**
 * Rubric grading (Tier 1) — pure logic. A rubric is a list of weighted criteria;
 * grading assigns points per criterion and the total is the percent of the max.
 */

export interface RubricCriterion {
  id: string;
  label: string;
  maxPoints: number;
}

export interface RubricResult {
  raw: number;
  max: number;
  percent: number;
}

const MAX_CRITERIA = 30;

/**
 * Validate/clean a rubric definition: non-empty unique ids, trimmed labels,
 * positive integer maxPoints. Invalid criteria are dropped; empty → [].
 */
export function normalizeRubric(raw: unknown): RubricCriterion[] {
  if (!Array.isArray(raw)) return [];
  const out: RubricCriterion[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const id = String((c as any).id ?? "").trim();
    const label = String((c as any).label ?? "").trim();
    const maxPoints = Math.floor(Number((c as any).maxPoints));
    if (!id || seen.has(id) || !label || !Number.isFinite(maxPoints) || maxPoints <= 0) continue;
    seen.add(id);
    out.push({ id, label, maxPoints });
    if (out.length >= MAX_CRITERIA) break;
  }
  return out;
}

/**
 * Compute the grade from per-criterion scores. Each score is clamped to
 * [0, maxPoints]; total is the percent of the achievable max (raw-100 core).
 */
export function computeRubricTotal(rubric: RubricCriterion[], scores: Record<string, unknown>): RubricResult {
  let raw = 0;
  let max = 0;
  for (const c of rubric) {
    const mp = Math.max(0, Number(c.maxPoints) || 0);
    max += mp;
    const s = Number((scores ?? {})[c.id]);
    const clamped = Number.isFinite(s) ? Math.max(0, Math.min(mp, s)) : 0;
    raw += clamped;
  }
  const percent = max > 0 ? Math.round((raw / max) * 100) : 0;
  return { raw, max, percent };
}
