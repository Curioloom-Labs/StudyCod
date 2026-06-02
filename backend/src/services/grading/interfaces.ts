import type { CheckerSpec } from "../judgeWorker/types";

export interface CodeSubmission {
  code: string;
  language: "JAVA" | "PYTHON";
  taskId: number;
  userId: number;
  testData: TestDataItem[];
  /**
   * Optional output-comparison policy for this task. When omitted, grading
   * falls back to the historical lenient comparison (no behaviour change).
   * Populate it (e.g. from the task's persisted checkerSpec) to grade strictly.
   */
  checker?: CheckerSpec | null;
}
export interface TestDataItem {
  input: string;
  output: string;
  explanation?: string;
}
export interface TestRunnerResult {
  passed: boolean;
  passedCount: number;
  totalCount: number;
  testResults: Array<{
    testIndex: number;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    passed: boolean;
    error?: string;
  }>;
  correctnessScore: number;
}
export interface ASTAnalysisResult {
  complexityScore: number;
  metrics: {
    cyclomaticComplexity: number;
    maxNestingDepth: number;
    hasRecursion: boolean;
    hasLoops: boolean;
    functionCount: number;
    averageFunctionLength: number;
  };
  violations: Array<{
    type: "FORBIDDEN_CONSTRUCT" | "COMPLEXITY_THRESHOLD" | "CODE_SMELL";
    severity: "LOW" | "MEDIUM" | "HIGH";
    message: string;
    line?: number;
  }>;
  suggestions: Array<{
    type: "OPTIMIZATION" | "REFACTORING" | "BEST_PRACTICE";
    message: string;
    line?: number;
  }>;
}
export interface LLMCodeCritiqueResult {
  styleScore: number;
  feedback: {
    readability: string;
    style: string;
    logic: string;
    optimizations: string[];
    warnings: string[];
  };
  detailedAnalysis: {
    namingConventions: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
    codeOrganization: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
    errorHandling: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "NONE";
    documentation: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "NONE";
  };
}
export interface HybridGradingResult {
  correctnessScore: number;
  complexityScore: number;
  styleScore: number;
  finalScore: number;
  weights: {
    correctness: number;
    complexity: number;
    style: number;
  };
  feedback: {
    testResults: TestRunnerResult;
    astAnalysis: ASTAnalysisResult;
    llmCritique?: LLMCodeCritiqueResult;
  };
  overallFeedback: string;
  gradePoints: number;
  maxPoints: number;
}
export interface GradingConfig {
  weights: {
    correctness: number;
    complexity: number;
    style: number;
  };
  astAnalysis: {
    enabled: boolean;
    maxComplexity: number;
    forbiddenConstructs: string[];
  };
  llmCritique: {
    enabled: boolean;
    onlyIfTestsPass: boolean;
    provider: "cloudflare" | "openrouter";
    model?: string;
  };
  maxPoints: number;
}