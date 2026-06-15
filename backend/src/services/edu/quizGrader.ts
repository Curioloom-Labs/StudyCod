/**
 * Pure quiz auto-grader (P2.5). Grades a quiz payload against a student's answers
 * with zero DB/IO so it is exhaustively unit-testable and identical on every
 * replica. Auto-gradable types plus one OPEN_TEXT type that defers to manual
 * grading. Defensive throughout: malformed questions/answers score 0, never throw.
 *
 * Quiz JSON shape:
 *   { questions: [ { id, type, prompt, points?, ...typeFields } ] }
 */
export type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "FILL_BLANK"
  | "MATCHING"
  | "OPEN_TEXT";

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  prompt?: string;
  points?: number;
  // SINGLE/MULTIPLE_CHOICE
  options?: string[];
  correctIndex?: number;
  correctIndexes?: number[];
  // TRUE_FALSE
  correct?: boolean;
  // SHORT_ANSWER
  accept?: string[];
  pattern?: string;
  caseSensitive?: boolean;
  // FILL_BLANK
  blanks?: Array<{ accept: string[]; caseSensitive?: boolean }>;
  // MATCHING: correct[i] = index of the right-side item matching left item i
  correctMatches?: number[];
}

export interface Quiz {
  questions: QuizQuestion[];
}

export type AnswerMap = Record<string, unknown>;

export interface QuestionResult {
  id: string;
  type: QuestionType;
  points: number;
  earned: number;
  needsManual: boolean;
  correct: boolean | null; // null when manual
}

export interface QuizGradeResult {
  maxScore: number;
  autoScore: number;
  /** 0..100 of the auto-gradable portion (excludes pending manual questions). */
  autoPercent: number;
  needsManual: boolean;
  results: QuestionResult[];
}

function questionPoints(q: QuizQuestion): number {
  const p = Number(q.points);
  return Number.isFinite(p) && p > 0 ? p : 1;
}

function normStr(s: unknown, caseSensitive: boolean): string {
  const v = typeof s === "string" ? s : String(s ?? "");
  const trimmed = v.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function setsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

function gradeShortAnswer(q: QuizQuestion, answer: unknown): boolean {
  const cs = Boolean(q.caseSensitive);
  if (typeof q.pattern === "string" && q.pattern) {
    try {
      const re = new RegExp(q.pattern, cs ? "" : "i");
      return re.test(typeof answer === "string" ? answer.trim() : String(answer ?? ""));
    } catch {
      return false; // bad regex never throws
    }
  }
  const accept = Array.isArray(q.accept) ? q.accept : [];
  const a = normStr(answer, cs);
  return accept.some((acc) => normStr(acc, cs) === a);
}

function gradeFillBlank(q: QuizQuestion, answer: unknown): number {
  const blanks = Array.isArray(q.blanks) ? q.blanks : [];
  if (blanks.length === 0) return 0;
  const provided = Array.isArray(answer) ? answer : [];
  let correctCount = 0;
  for (let i = 0; i < blanks.length; i++) {
    const cs = Boolean(blanks[i]?.caseSensitive);
    const accept = Array.isArray(blanks[i]?.accept) ? blanks[i].accept : [];
    const a = normStr(provided[i], cs);
    if (a && accept.some((acc) => normStr(acc, cs) === a)) correctCount++;
  }
  return correctCount / blanks.length; // fraction 0..1
}

function gradeMatching(q: QuizQuestion, answer: unknown): number {
  const correct = Array.isArray(q.correctMatches) ? q.correctMatches : [];
  if (correct.length === 0) return 0;
  const provided = Array.isArray(answer) ? answer : [];
  let correctCount = 0;
  for (let i = 0; i < correct.length; i++) {
    if (Number(provided[i]) === Number(correct[i])) correctCount++;
  }
  return correctCount / correct.length;
}

/** Grade one question → fraction earned (0..1), or null if it needs manual grading. */
function gradeQuestionFraction(q: QuizQuestion, answer: unknown): number | null {
  switch (q.type) {
    case "SINGLE_CHOICE":
      return Number(answer) === Number(q.correctIndex) ? 1 : 0;
    case "MULTIPLE_CHOICE": {
      const sel = Array.isArray(answer) ? answer.map(Number) : [];
      const correct = Array.isArray(q.correctIndexes) ? q.correctIndexes.map(Number) : [];
      return setsEqual(sel, correct) ? 1 : 0; // all-or-nothing
    }
    case "TRUE_FALSE":
      return Boolean(answer) === Boolean(q.correct) ? 1 : 0;
    case "SHORT_ANSWER":
      return gradeShortAnswer(q, answer) ? 1 : 0;
    case "FILL_BLANK":
      return gradeFillBlank(q, answer);
    case "MATCHING":
      return gradeMatching(q, answer);
    case "OPEN_TEXT":
      return null; // manual
    default:
      return 0; // unknown type
  }
}

export function gradeQuiz(quiz: Quiz | null | undefined, answers: AnswerMap | null | undefined): QuizGradeResult {
  const questions = Array.isArray(quiz?.questions) ? quiz!.questions : [];
  const ans = answers ?? {};
  const results: QuestionResult[] = [];
  let maxScore = 0;
  let autoScore = 0;
  let autoMax = 0;
  let needsManual = false;

  for (const q of questions) {
    const points = questionPoints(q);
    maxScore += points;
    const fraction = gradeQuestionFraction(q, ans[q.id]);
    if (fraction === null) {
      needsManual = true;
      results.push({ id: q.id, type: q.type, points, earned: 0, needsManual: true, correct: null });
      continue;
    }
    const earned = Math.round(points * fraction * 100) / 100;
    autoScore += earned;
    autoMax += points;
    results.push({
      id: q.id,
      type: q.type,
      points,
      earned,
      needsManual: false,
      correct: fraction >= 1
    });
  }

  const autoPercent = autoMax > 0 ? Math.round((autoScore / autoMax) * 100) : 0;
  return {
    maxScore,
    autoScore: Math.round(autoScore * 100) / 100,
    autoPercent,
    needsManual,
    results
  };
}

export interface ManualGradeResult {
  manualAwarded: number;
  openQuestionIds: string[];
  /** Manual question ids the caller supplied that aren't OPEN_TEXT (ignored). */
  invalidIds: string[];
}

/**
 * Resolve teacher-awarded points for a quiz's OPEN_TEXT questions. Each award is
 * clamped to [0, question.points]; ids that aren't OPEN_TEXT are reported and
 * ignored. Pure — the route adds this to the stored auto score for the final.
 */
export function manualPointsAwarded(
  quiz: Quiz | null | undefined,
  manualScores: Record<string, unknown> | null | undefined
): ManualGradeResult {
  const questions = Array.isArray(quiz?.questions) ? quiz!.questions : [];
  const scores = manualScores ?? {};
  const openIds = new Set(questions.filter((q) => q.type === "OPEN_TEXT").map((q) => q.id));
  const pointsById = new Map(questions.map((q) => [q.id, questionPoints(q)]));

  let manualAwarded = 0;
  const invalidIds: string[] = [];
  for (const [qid, raw] of Object.entries(scores)) {
    if (!openIds.has(qid)) {
      invalidIds.push(qid);
      continue;
    }
    const max = pointsById.get(qid) ?? 1;
    const v = Number(raw);
    const awarded = Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
    manualAwarded += awarded;
  }
  return {
    manualAwarded: Math.round(manualAwarded * 100) / 100,
    openQuestionIds: [...openIds],
    invalidIds
  };
}

/**
 * Strip answer keys from a quiz before sending it to a student — removes
 * correctIndex/correctIndexes/correct/accept/pattern/correctMatches and per-blank
 * accept lists, keeping only what's needed to render and answer. Pure.
 */
export function stripQuizForStudent(quiz: Quiz | null | undefined): Quiz {
  const questions = Array.isArray(quiz?.questions) ? quiz!.questions : [];
  return {
    questions: questions.map((q) => {
      const safe: QuizQuestion = { id: q.id, type: q.type, prompt: q.prompt, points: q.points };
      if (Array.isArray(q.options)) safe.options = q.options;
      if (q.type === "FILL_BLANK" && Array.isArray(q.blanks)) {
        // Keep the blank count (for rendering N inputs), drop the accepted answers.
        safe.blanks = q.blanks.map(() => ({ accept: [] }));
      }
      if (q.type === "MATCHING" && Array.isArray(q.correctMatches)) {
        // Expose the number of pairs only.
        (safe as any).pairCount = q.correctMatches.length;
      }
      return safe;
    })
  };
}
