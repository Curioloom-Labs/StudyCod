import { CodeExecutor } from "./executor";
import { ExecutionResult, ExecutionStatus, ResourceLimits, LANGUAGE_LIMITS } from "./limits";
export type Language = "python" | "cpp" | "java";
export interface RunCodeParams {
  language: Language;
  code: string;
  input?: string;
  limits?: ResourceLimits;
}
export class CodeRunner {
  private executor: CodeExecutor;
  constructor(executor?: CodeExecutor) {
    this.executor = executor || new CodeExecutor();
  }
  async run(params: RunCodeParams): Promise<ExecutionResult> {
    const {
      language,
      code,
      input = "",
      limits
    } = params;
    const resourceLimits = limits || LANGUAGE_LIMITS[language] || LANGUAGE_LIMITS.python;
    this.validateCode(code, language);
    switch (language) {
      case "python":
        return await this.executor.executePython(code, input, resourceLimits);
      case "cpp":
        return await this.executor.executeCpp(code, input, resourceLimits);
      case "java":
        return await this.executor.executeJava(code, input, resourceLimits);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }
  private validateCode(code: string, language: Language): void {
    if (!code || code.trim().length === 0) {
      throw new Error("Code cannot be empty");
    }
    if (code.length > 1024 * 1024) {
      throw new Error("Code size exceeds maximum limit (1 MB)");
    }
    const dangerousPatterns: Record<Language, RegExp[]> = {
      python: [/__import__\s*\(/, /eval\s*\(/, /exec\s*\(/, /compile\s*\(/, /open\s*\([^)]*['"]\/etc/, /open\s*\([^)]*['"]\/proc/, /open\s*\([^)]*['"]\/sys/, /subprocess/, /os\.system/, /os\.popen/, /socket/, /urllib/, /requests/],
      cpp: [/system\s*\(/, /popen\s*\(/, /execve/, /fork/, /socket/, /connect/, /#include\s*<sys\/socket\.h>/, /#include\s*<netinet\/in\.h>/, /#include\s*<arpa\/inet\.h>/],
      java: [/Runtime\.getRuntime\(\)/, /ProcessBuilder/, /Process\./, /java\.net\.Socket/, /java\.net\.ServerSocket/, /java\.net\.URL/, /java\.net\.URLConnection/, /java\.io\.File.*\/etc/, /java\.io\.File.*\/proc/, /java\.io\.File.*\/sys/, /java\.lang\.reflect/, /java\.lang\.Class\.forName/, /System\.exit/, /System\.load/, /System\.loadLibrary/, /java\.security/, /javax\.crypto/, /java\.nio\.channels\.SocketChannel/]
    };
    const patterns = dangerousPatterns[language] || [];
    for (const pattern of patterns) {
      if (pattern.test(code)) {
        throw new Error(`Code contains potentially dangerous pattern: ${pattern}`);
      }
    }
  }
  static isLanguageSupported(language: string): language is Language {
    return language === "python" || language === "cpp" || language === "java";
  }
}