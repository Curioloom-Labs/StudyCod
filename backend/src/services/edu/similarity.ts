import { buildFingerprint, jaccardSimilarity } from "../plagiarism/lightPlagiarism";

/**
 * Code-similarity (antiplagiat) for EDU classes (Tier 2). Reuses the existing
 * contest plagiarism fingerprinting; surfaces suspicious pairs to teachers. No
 * schema — reads existing EduGrade.submittedCode.
 */

export interface SimilaritySubmission {
  studentId: number;
  code: string;
}

export interface SimilarityPair {
  aStudentId: number;
  bStudentId: number;
  similarity: number; // 0..1, rounded to 2dp
}

/**
 * Pure: all student pairs whose code similarity meets the threshold, sorted
 * desc. Blank code is ignored; pairs are unordered (aStudentId < bStudentId) so
 * each pair appears once.
 */
export function buildSimilarityPairs(subs: SimilaritySubmission[], opts?: { minSimilarity?: number; lang?: string }): SimilarityPair[] {
  const minSim = Math.max(0, Math.min(1, opts?.minSimilarity ?? 0.7));
  const fps = subs
    .filter(s => typeof s.code === "string" && s.code.trim().length > 0)
    .map(s => ({ studentId: s.studentId, fp: buildFingerprint(s.code, { lang: opts?.lang }) }));

  const pairs: SimilarityPair[] = [];
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      if (fps[i].studentId === fps[j].studentId) continue;
      const sim = jaccardSimilarity(fps[i].fp, fps[j].fp);
      if (sim >= minSim) {
        pairs.push({
          aStudentId: Math.min(fps[i].studentId, fps[j].studentId),
          bStudentId: Math.max(fps[i].studentId, fps[j].studentId),
          similarity: Math.round(sim * 100) / 100
        });
      }
    }
  }
  pairs.sort((x, y) => y.similarity - x.similarity);
  return pairs;
}

/**
 * Pure: per-line "shared" flags for a side-by-side view. A line is shared when
 * its whitespace-normalized content (non-blank) also appears in the other file.
 */
export function markSharedLines(aCode: string, bCode: string): { aShared: boolean[]; bShared: boolean[] } {
  const norm = (l: string) => l.replace(/\s+/g, " ").trim();
  const aLines = (aCode ?? "").split("\n");
  const bLines = (bCode ?? "").split("\n");
  const aNorm = aLines.map(norm);
  const bNorm = bLines.map(norm);
  const aSet = new Set(aNorm.filter(x => x.length > 0));
  const bSet = new Set(bNorm.filter(x => x.length > 0));
  return {
    aShared: aNorm.map(x => x.length > 0 && bSet.has(x)),
    bShared: bNorm.map(x => x.length > 0 && aSet.has(x))
  };
}
