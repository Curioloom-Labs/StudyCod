export type LanguageId = "java" | "python" | "cpp";
export interface CompilePlan {
  argv: string[];
  display: string;
}
export interface RunPlan {
  argv: string[];
  display: string;
}
export interface LanguageAdapter {
  id: LanguageId;
  writeSource(workDir: string, source: string): Promise<void>;
  getCompilePlan(): CompilePlan | null;
  getRunPlan(): RunPlan;
}