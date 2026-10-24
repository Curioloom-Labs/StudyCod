type CoursePracticeExercise = {
  prompt?: unknown;
  learningContract?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Assemble the learner's authored theory and hidden generation contract. */
export function buildCoursePracticeTheoryForAi(input: {
  theoryMarkdown?: string | null;
  exercise?: CoursePracticeExercise | null;
}): string {
  const exercise = input.exercise ?? {};
  return [
    String(input.theoryMarkdown ?? "").trim(),
    typeof exercise.prompt === "string" ? `Practice brief:\n${exercise.prompt}` : "",
    isRecord(exercise.learningContract)
      ? `<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(exercise.learningContract)}\nSTUDYCOD_LEARNING_META_END -->`
      : "",
  ].filter(Boolean).join("\n\n").trim();
}
