/**
 * Pure weighted-category gradebook calculator (P2.6). Generalizes grading beyond
 * the Ukrainian thematic/semester model: a class defines weighted categories
 * (e.g. Homework 20%, Exams 50%), each graded item belongs to a category, and
 * the final raw-100 grade is the weighted mean of category averages. The display
 * scale (12-point / letter / GPA / %) is applied separately by gradingScale.ts.
 *
 * No DB/IO — exhaustively unit-testable and identical on every replica.
 */
export interface GradebookCategory {
  id: string;
  name?: string;
  /** Relative weight; any positive scale works (normalized internally). */
  weight: number;
  /** Drop this many of the student's lowest scores in the category. */
  dropLowest?: number;
}

export interface GradebookConfig {
  categories: GradebookCategory[];
}

/** A single graded item for one student, already reduced to a 0..100 percent. */
export interface CategoryGrade {
  categoryId: string;
  percent: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  average: number | null; // null = no counting grades
  countedItems: number;
  normalizedWeight: number; // 0..1, among non-empty categories
}

export interface WeightedGradeResult {
  final: number | null; // raw-100, null when nothing counts
  categories: CategoryBreakdown[];
}

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/** Drop the N lowest values, then average the rest. null if nothing remains. */
function averageAfterDrop(values: number[], dropLowest: number): { average: number | null; counted: number } {
  if (values.length === 0) return { average: null, counted: 0 };
  const drop = Math.max(0, Math.min(Math.floor(dropLowest) || 0, values.length));
  const kept = [...values].sort((a, b) => a - b).slice(drop);
  if (kept.length === 0) return { average: null, counted: 0 };
  const sum = kept.reduce((s, v) => s + v, 0);
  return { average: sum / kept.length, counted: kept.length };
}

/**
 * Compute the weighted final grade. Categories with no counting grades are
 * excluded and the remaining weights are renormalized, so a student missing a
 * whole category is graded on what exists rather than dragged toward zero.
 */
export function computeWeightedGrade(config: GradebookConfig, grades: CategoryGrade[]): WeightedGradeResult {
  const categories = Array.isArray(config?.categories) ? config.categories : [];
  const byCategory = new Map<string, number[]>();
  for (const g of grades ?? []) {
    if (!byCategory.has(g.categoryId)) byCategory.set(g.categoryId, []);
    byCategory.get(g.categoryId)!.push(clampPercent(Number(g.percent)));
  }

  // First pass: per-category averages and raw weights of non-empty categories.
  const interim = categories.map((c) => {
    const values = byCategory.get(c.id) ?? [];
    const { average, counted } = averageAfterDrop(values, c.dropLowest ?? 0);
    const rawWeight = Number(c.weight);
    return {
      categoryId: c.id,
      average,
      counted,
      rawWeight: Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 0
    };
  });

  const totalActiveWeight = interim
    .filter((c) => c.average !== null && c.rawWeight > 0)
    .reduce((s, c) => s + c.rawWeight, 0);

  const breakdown: CategoryBreakdown[] = interim.map((c) => ({
    categoryId: c.categoryId,
    average: c.average,
    countedItems: c.counted,
    normalizedWeight:
      c.average !== null && c.rawWeight > 0 && totalActiveWeight > 0 ? c.rawWeight / totalActiveWeight : 0
  }));

  if (totalActiveWeight <= 0) {
    return { final: null, categories: breakdown };
  }

  const final = breakdown.reduce((sum, c) => {
    if (c.average === null) return sum;
    return sum + c.average * c.normalizedWeight;
  }, 0);

  return { final: Math.round(final), categories: breakdown };
}

/**
 * Map raw graded rows to category grades for the weighted calculator. Each row
 * is a graded task carrying its category tag and a raw-100 score. Rows without a
 * category or without a finite score are dropped (they don't count). Pure.
 */
export function mapGradesToCategoryGrades(
  rows: Array<{ categoryId?: string | null; total?: number | null }>
): CategoryGrade[] {
  const out: CategoryGrade[] = [];
  for (const r of rows ?? []) {
    const categoryId = (r.categoryId ?? "").trim();
    if (!categoryId || r.total == null) continue; // null/undefined score doesn't count
    const total = Number(r.total);
    if (!Number.isFinite(total)) continue;
    out.push({ categoryId, percent: total });
  }
  return out;
}

/** Validate/normalize a class gradebook config: unique non-empty ids, positive weights. */
export function normalizeGradebookConfig(input: unknown): GradebookConfig | null {
  if (!input || typeof input !== "object") return null;
  const cats = (input as any).categories;
  if (!Array.isArray(cats)) return null;
  const seen = new Set<string>();
  const categories: GradebookCategory[] = [];
  for (const c of cats) {
    const id = String(c?.id ?? "").trim();
    if (!id || seen.has(id)) return null;
    const weight = Number(c?.weight);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    seen.add(id);
    categories.push({
      id,
      name: typeof c?.name === "string" ? c.name : undefined,
      weight,
      dropLowest: Number.isFinite(Number(c?.dropLowest)) ? Math.max(0, Math.floor(Number(c.dropLowest))) : 0
    });
  }
  if (categories.length === 0) return null;
  return { categories };
}
