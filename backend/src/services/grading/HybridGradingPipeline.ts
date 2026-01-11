import { CodeSubmission, HybridGradingResult, GradingConfig, TestRunnerResult, ASTAnalysisResult, LLMCodeCritiqueResult } from './interfaces';
import { TestRunner, ITestRunner } from './TestRunner';
import { ASTAnalyzer, IASTAnalyzer } from './ASTAnalyzer';
import { LLMCodeCritic, ILLMCodeCritic } from './LLMCodeCritic';
export interface IHybridGradingPipeline {
  grade(submission: CodeSubmission, config: GradingConfig, taskDescription?: string): Promise<HybridGradingResult>;
}
export class HybridGradingPipeline implements IHybridGradingPipeline {
  constructor(private testRunner: ITestRunner = new TestRunner(), private astAnalyzer: IASTAnalyzer = new ASTAnalyzer(), private llmCritic: ILLMCodeCritic = new LLMCodeCritic()) {}
  async grade(submission: CodeSubmission, config: GradingConfig, taskDescription?: string): Promise<HybridGradingResult> {
    const testResults = await this.testRunner.runTests(submission);
    if (!testResults.passed) {
      return this.createMinimalScoreResult(testResults, config, "Код не проходить тести. Виправте помилки перед подальшою оцінкою.");
    }
    let astAnalysis: ASTAnalysisResult | undefined;
    let llmCritique: LLMCodeCritiqueResult | undefined;
    if (config.astAnalysis.enabled) {
      try {
        astAnalysis = await this.astAnalyzer.analyze(submission);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not yet implemented")) {
          astAnalysis = this.createNeutralASTResult();
        } else {
          console.error("AST Analysis failed:", error);
          astAnalysis = this.createNeutralASTResult();
        }
      }
    } else {
      astAnalysis = this.createNeutralASTResult();
    }
    if (config.llmCritique.enabled) {
      if (!config.llmCritique.onlyIfTestsPass || testResults.passed) {
        try {
          llmCritique = await this.llmCritic.critique(submission, taskDescription);
        } catch (error: any) {
          console.error("LLM Critique failed:", error);
          llmCritique = this.createNeutralLLMResult();
        }
      }
    } else {
      llmCritique = this.createNeutralLLMResult();
    }
    const finalScore = this.calculateFinalScore(testResults.correctnessScore, astAnalysis.complexityScore, llmCritique?.styleScore ?? 0.5, config.weights);
    const overallFeedback = this.generateOverallFeedback(testResults, astAnalysis, llmCritique);
    const gradePoints = Math.round(finalScore * config.maxPoints);
    return {
      correctnessScore: testResults.correctnessScore,
      complexityScore: astAnalysis.complexityScore,
      styleScore: llmCritique?.styleScore ?? 0.5,
      finalScore,
      weights: config.weights,
      feedback: {
        testResults,
        astAnalysis,
        llmCritique
      },
      overallFeedback,
      gradePoints,
      maxPoints: config.maxPoints
    };
  }
  private createMinimalScoreResult(testResults: TestRunnerResult, config: GradingConfig, message: string): HybridGradingResult {
    const finalScore = testResults.correctnessScore * config.weights.correctness;
    const gradePoints = Math.round(finalScore * config.maxPoints);
    return {
      correctnessScore: testResults.correctnessScore,
      complexityScore: 0.0,
      styleScore: 0.0,
      finalScore,
      weights: config.weights,
      feedback: {
        testResults,
        astAnalysis: this.createNeutralASTResult(),
        llmCritique: undefined
      },
      overallFeedback: message,
      gradePoints,
      maxPoints: config.maxPoints
    };
  }
  private createNeutralASTResult(): ASTAnalysisResult {
    return {
      complexityScore: 0.5,
      metrics: {
        cyclomaticComplexity: 0,
        maxNestingDepth: 0,
        hasRecursion: false,
        hasLoops: false,
        functionCount: 0,
        averageFunctionLength: 0
      },
      violations: [],
      suggestions: []
    };
  }
  private createNeutralLLMResult(): LLMCodeCritiqueResult {
    return {
      styleScore: 0.5,
      feedback: {
        readability: "Стиль коду не було проаналізовано.",
        style: "Стиль коду не було проаналізовано.",
        logic: "Логіка коду не була проаналізована.",
        optimizations: [],
        warnings: []
      },
      detailedAnalysis: {
        namingConventions: "FAIR",
        codeOrganization: "FAIR",
        errorHandling: "NONE",
        documentation: "NONE"
      }
    };
  }
  private calculateFinalScore(correctness: number, complexity: number, style: number, weights: GradingConfig['weights']): number {
    return correctness * weights.correctness + complexity * weights.complexity + style * weights.style;
  }
  private generateOverallFeedback(testResults: TestRunnerResult, astAnalysis: ASTAnalysisResult, llmCritique?: LLMCodeCritiqueResult): string {
    const parts: string[] = [];
    if (testResults.passed) {
      parts.push(`✅ Всі тести пройдені (${testResults.passedCount}/${testResults.totalCount}).`);
    } else {
      parts.push(`❌ Тести не пройдені (${testResults.passedCount}/${testResults.totalCount}).`);
    }
    if (astAnalysis.complexityScore >= 0.8) {
      parts.push("✅ Код має хорошу структуру та управління складністю.");
    } else if (astAnalysis.complexityScore >= 0.6) {
      parts.push("⚠️ Складність коду в межах норми, але є простір для покращення.");
    } else {
      parts.push("⚠️ Код має високу складність. Рекомендується спрощення.");
    }
    if (astAnalysis.violations.length > 0) {
      parts.push(`⚠️ Виявлено ${astAnalysis.violations.length} порушень best practices.`);
    }
    if (llmCritique) {
      if (llmCritique.styleScore >= 0.8) {
        parts.push("✅ Відмінний стиль коду та читабельність.");
      } else if (llmCritique.styleScore >= 0.6) {
        parts.push("⚠️ Стиль коду хороший, але є рекомендації для покращення.");
      } else {
        parts.push("⚠️ Стиль коду потребує покращення.");
      }
    }
    return parts.join(" ");
  }
}
export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  weights: {
    correctness: 0.6,
    complexity: 0.25,
    style: 0.15
  },
  astAnalysis: {
    enabled: true,
    maxComplexity: 10,
    forbiddenConstructs: ["System.exit", "Runtime.exec", "eval", "exec", "__import__"]
  },
  llmCritique: {
    enabled: true,
    onlyIfTestsPass: true,
    provider: "cloudflare"
  },
  maxPoints: 12
};