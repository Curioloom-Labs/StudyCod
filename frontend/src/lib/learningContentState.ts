export type LearningContentState = "loading" | "error" | "empty" | "refreshing" | "stale" | "ready";

export function getLearningContentState(input: {
  loading: boolean;
  hasError: boolean;
  hasData: boolean;
}): LearningContentState {
  if (input.loading && !input.hasData) return "loading";
  if (input.hasError) return input.hasData ? "stale" : "error";
  if (input.loading) return "refreshing";
  if (!input.hasData) return "empty";
  return "ready";
}
