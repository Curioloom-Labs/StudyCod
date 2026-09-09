import { parser as javaParser } from "@lezer/java";
import { parser as pythonParser } from "@lezer/python";
import type { Tree } from "@lezer/common";
import type { ASTAnalysisResult, CodeSubmission } from "./interfaces";

export interface IASTAnalyzer {
  analyze(submission: CodeSubmission): Promise<ASTAnalysisResult>;
}

interface FunctionRange {
  name: string;
  startLine: number;
  endLine: number;
  from: number;
  to: number;
}

interface SourceNode {
  name: string;
  from: number;
  to: number;
  line: number;
  text: string;
  controlDepth: number;
}

interface ParsedSource {
  source: string;
  lines: string[];
  nodes: SourceNode[];
  functions: FunctionRange[];
  syntaxErrorCount: number;
}

type Language = CodeSubmission["language"];

const JAVA_CONTROL_NODES = new Set([
  "IfStatement",
  "ForStatement",
  "EnhancedForStatement",
  "WhileStatement",
  "DoStatement",
  "SwitchStatement",
  "TryStatement",
  "SynchronizedStatement",
  "TernaryExpression",
]);

const PYTHON_CONTROL_NODES = new Set([
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "WithStatement",
  "TryStatement",
  "MatchStatement",
  "ConditionalExpression",
]);

const JAVA_FUNCTION_NODES = new Set(["MethodDeclaration", "ConstructorDeclaration"]);
const PYTHON_FUNCTION_NODES = new Set(["FunctionDefinition"]);

/**
 * Syntax-tree-backed code analysis for the grading pipeline.
 *
 * Lezer gives us a tolerant in-process parser for both supported
 * languages. The analyzer deliberately consumes only tree metadata and source
 * spans; it never executes or compiles student code. This keeps the analysis
 * useful for incomplete submissions while avoiding the false positives caused
 * by counting keywords inside comments and strings.
 */
export class ASTAnalyzer implements IASTAnalyzer {
  async analyze(submission: CodeSubmission): Promise<ASTAnalysisResult> {
    const ast = this.parseCode(submission.code, submission.language);
    const metrics = this.calculateMetrics(ast, submission.language);
    const violations = this.detectViolations(ast, metrics, submission.language);
    const suggestions = this.generateSuggestions(ast, metrics);

    return {
      complexityScore: this.calculateComplexityScore(metrics, violations),
      metrics,
      violations,
      suggestions,
    };
  }

  private parseCode(source: string, language: Language): ParsedSource {
    const tree: Tree = language === "PYTHON"
      ? pythonParser.parse(source)
      : javaParser.parse(source);
    const lineStarts = this.lineStarts(source);
    const lines = source.split(/\r?\n/);
    const nodes: SourceNode[] = [];
    const functions: FunctionRange[] = [];
    const functionNodes = language === "PYTHON" ? PYTHON_FUNCTION_NODES : JAVA_FUNCTION_NODES;
    const controlNodes = language === "PYTHON" ? PYTHON_CONTROL_NODES : JAVA_CONTROL_NODES;
    let syntaxErrorCount = 0;
    const cursor = tree.cursor();

    const visit = (controlDepth: number): void => {
      const name = cursor.name;
      const nextControlDepth = controlNodes.has(name) ? controlDepth + 1 : controlDepth;
      const node: SourceNode = {
        name,
        from: cursor.from,
        to: cursor.to,
        line: this.lineAt(lineStarts, cursor.from),
        text: source.slice(cursor.from, cursor.to),
        controlDepth: nextControlDepth,
      };
      nodes.push(node);
      if (name === "⚠") syntaxErrorCount += 1;
      if (functionNodes.has(name)) {
        const functionName = this.extractFunctionName(node.text, language);
        if (functionName) {
          const startLine = node.line;
          const endLine = this.lineAt(lineStarts, Math.max(node.from, node.to - 1));
          functions.push({ name: functionName, startLine, endLine, from: node.from, to: node.to });
        }
      }

      if (cursor.firstChild()) {
        do {
          visit(nextControlDepth);
        } while (cursor.nextSibling());
        cursor.parent();
      }
    };

    // The root cursor is always a valid node, including for parser-recovered
    // incomplete submissions.
    visit(0);
    return { source, lines, nodes, functions, syntaxErrorCount };
  }

  private extractFunctionName(source: string, language: Language): string | null {
    if (language === "PYTHON") {
      return source.match(/\bdef\s+([A-Za-z_]\w*)\s*\(/)?.[1] ?? null;
    }
    // Java MethodDeclaration and ConstructorDeclaration nodes start at their
    // declaration header. The first identifier before the parameter list is
    // therefore the method/constructor name, even when the body is multiline.
    return source.match(/\b([A-Za-z_$][\w$]*)\s*\(/)?.[1] ?? null;
  }

  private calculateMetrics(ast: ParsedSource, language: Language): ASTAnalysisResult["metrics"] {
    const branchingNodes = language === "JAVA"
      ? new Set(["IfStatement", "ForStatement", "EnhancedForStatement", "WhileStatement", "DoStatement", "CatchClause", "SwitchLabel", "TernaryExpression"])
      : new Set(["IfStatement", "ForStatement", "WhileStatement", "ExceptClause", "MatchClause", "ConditionalExpression"]);
    const logicalOperators = new Set(["&&", "||", "and", "or", "LogicOp"]);
    const cyclomaticComplexity = 1 + ast.nodes.filter((node) => branchingNodes.has(node.name) || logicalOperators.has(node.name) || logicalOperators.has(node.text.trim())).length;
    const loopNodes = language === "JAVA"
      ? new Set(["ForStatement", "EnhancedForStatement", "WhileStatement", "DoStatement"])
      : new Set(["ForStatement", "WhileStatement"]);
    const hasLoops = ast.nodes.some((node) => loopNodes.has(node.name));
    const hasRecursion = ast.functions.some((functionRange) => {
      const escapedName = functionRange.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const callNodes = ast.nodes.filter((node) => {
        if (node.from < functionRange.from || node.to > functionRange.to) return false;
        if (language === "PYTHON" && node.name !== "CallExpression") return false;
        if (language === "JAVA" && node.name !== "MethodInvocation") return false;
        return new RegExp(`(?:^|[.\\s])${escapedName}\\s*\\(`).test(node.text.trim());
      });
      return callNodes.length > 0;
    });
    const averageFunctionLength = ast.functions.length === 0
      ? 0
      : ast.functions.reduce((total, item) => total + item.endLine - item.startLine + 1, 0) / ast.functions.length;

    return {
      cyclomaticComplexity,
      maxNestingDepth: Math.max(0, ...ast.nodes.map((node) => node.controlDepth)),
      hasRecursion,
      hasLoops,
      functionCount: ast.functions.length,
      averageFunctionLength: Math.round(averageFunctionLength * 10) / 10,
    };
  }

  private detectViolations(
    ast: ParsedSource,
    metrics: ASTAnalysisResult["metrics"],
    language: Language,
  ): ASTAnalysisResult["violations"] {
    const violations: ASTAnalysisResult["violations"] = [];
    const complexityLine = this.findNodeLine(ast, (node) =>
      ["IfStatement", "ForStatement", "EnhancedForStatement", "WhileStatement", "SwitchStatement", "TryStatement"].includes(node.name));
    if (metrics.cyclomaticComplexity > 10) {
      violations.push({ type: "COMPLEXITY_THRESHOLD", severity: "HIGH", message: "Cyclomatic complexity exceeds 10.", line: complexityLine });
    } else if (metrics.cyclomaticComplexity > 5) {
      violations.push({ type: "COMPLEXITY_THRESHOLD", severity: "MEDIUM", message: "Cyclomatic complexity exceeds 5.", line: complexityLine });
    }
    if (metrics.maxNestingDepth > 4) {
      violations.push({
        type: "COMPLEXITY_THRESHOLD",
        severity: "MEDIUM",
        message: "Nesting depth exceeds 4.",
        line: complexityLine,
      });
    }
    if (metrics.averageFunctionLength > 60) {
      violations.push({ type: "CODE_SMELL", severity: "MEDIUM", message: "Average function length exceeds 60 lines.", line: ast.functions[0]?.startLine });
    }

    const forbiddenNode = ast.nodes.find((node) => {
      if (language === "PYTHON") return node.name === "CallExpression" && /^(?:eval|exec)\s*\(/.test(node.text.trim());
      return node.name === "Identifier" && node.text.trim() === "goto";
    });
    if (forbiddenNode) {
      violations.push({
        type: "FORBIDDEN_CONSTRUCT",
        severity: "HIGH",
        message: language === "PYTHON" ? "Dynamic eval/exec is not allowed in submissions." : "The goto construct is not allowed in submissions.",
        line: forbiddenNode.line,
      });
    }
    if (ast.syntaxErrorCount > 0) {
      violations.push({
        type: "CODE_SMELL",
        severity: "LOW",
        message: "The syntax tree contains recoverable errors; run the language compiler for exact diagnostics.",
        line: this.findNodeLine(ast, (node) => node.name === "⚠"),
      });
    }
    return violations;
  }

  private generateSuggestions(ast: ParsedSource, metrics: ASTAnalysisResult["metrics"]): ASTAnalysisResult["suggestions"] {
    const suggestions: ASTAnalysisResult["suggestions"] = [];
    if (metrics.hasRecursion) {
      suggestions.push({
        type: "BEST_PRACTICE",
        message: "Перевірте наявність базового випадку та глибину рекурсії.",
        line: ast.functions[0]?.startLine,
      });
    }
    if (metrics.maxNestingDepth > 4 || metrics.cyclomaticComplexity > 5) {
      suggestions.push({ type: "REFACTORING", message: "Спробуйте розділити складну логіку на менші функції та зменшити вкладеність." });
    }
    if (metrics.averageFunctionLength > 60) {
      suggestions.push({ type: "REFACTORING", message: "Розбийте довгі функції на менші, із чіткою відповідальністю." });
    }
    if (suggestions.length === 0) {
      suggestions.push({ type: "BEST_PRACTICE", message: "Підтримуйте короткі функції та перевіряйте граничні випадки." });
    }
    return suggestions;
  }

  private calculateComplexityScore(metrics: ASTAnalysisResult["metrics"], violations: ASTAnalysisResult["violations"]): number {
    let score = 1.0;
    if (metrics.cyclomaticComplexity > 10) score -= 0.2;
    else if (metrics.cyclomaticComplexity > 5) score -= 0.1;
    if (metrics.maxNestingDepth > 4) score -= 0.2;
    else if (metrics.maxNestingDepth > 3) score -= 0.1;
    violations.forEach((violation) => {
      if (violation.severity === "HIGH") score -= 0.15;
      else if (violation.severity === "MEDIUM") score -= 0.1;
      else score -= 0.05;
    });
    return Math.max(0.0, Math.min(1.0, score));
  }

  private lineStarts(source: string): number[] {
    const starts = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") starts.push(index + 1);
    }
    return starts;
  }

  private lineAt(starts: number[], offset: number): number {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.max(1, low);
  }

  private findNodeLine(ast: ParsedSource, predicate: (node: SourceNode) => boolean): number | undefined {
    return ast.nodes.find(predicate)?.line;
  }
}
