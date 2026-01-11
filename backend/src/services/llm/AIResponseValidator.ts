import { z } from 'zod';
import { AiTaskGenerationResult, AiTheoryResult, AiQuizResult, TestDataExample } from './LLMOrchestrator';
const TaskGenerationSchema = z.object({
  title: z.string().min(1, 'title must be a non-empty string'),
  topic: z.string().min(1, 'topic must be a non-empty string'),
  difficulty: z.number().int().min(1).max(5, 'difficulty must be between 1 and 5'),
  theoryMarkdown: z.string().min(1, 'theoryMarkdown must be a non-empty string'),
  practicalTask: z.string().min(1, 'practicalTask must be a non-empty string'),
  inputFormat: z.string(),
  outputFormat: z.string(),
  constraints: z.string(),
  examples: z.array(z.object({
    input: z.string().min(1, 'example input must be a non-empty string'),
    output: z.string().min(1, 'example output must be a non-empty string'),
    explanation: z.string().min(1, 'example explanation must be a non-empty string')
  })).min(1, 'examples array must contain at least one example'),
  codeTemplate: z.string().min(1, 'codeTemplate must be a non-empty string')
});
const TheoryResponseSchema = z.object({
  theory: z.string().min(1, 'theory must be a non-empty string')
});
const QuizQuestionSchema = z.object({
  q: z.string().min(1, 'question text must be a non-empty string'),
  options: z.array(z.string().min(1)).length(5, 'question must have exactly 5 options'),
  correct: z.number().int().min(0).max(4, 'correct must be between 0 and 4')
});
const QuizResponseSchema = z.array(QuizQuestionSchema).min(1, 'quiz must contain at least one question');
const TaskConditionSchema = z.object({
  description: z.string().min(1, 'description must be a non-empty string')
});
const TaskTemplateSchema = z.object({
  template: z.string().min(1, 'template must be a non-empty string')
});
const TestDataItemSchema = z.object({
  input: z.string(),
  output: z.string().min(1, 'test output must be a non-empty string'),
  explanation: z.string().optional()
});
const TestDataResponseSchema = z.array(TestDataItemSchema).min(1, 'test data must contain at least one test');
export class AIValidationError extends Error {
  public rawResponse?: unknown;
  constructor(public readonly mode: string, public readonly errors: z.ZodError, message?: string, rawResponse?: unknown) {
    super(message || `AI response validation failed for mode: ${mode}`);
    this.name = 'AIValidationError';
    this.rawResponse = rawResponse;
  }
}
export class AIResponseValidator {
  private static assertTheoryIsPure(theory: string): void {
    const t = String(theory ?? "").trim();
    if (!t) {
      throw new AIValidationError('generateTheory', z.ZodError.create([]), 'Theory generation validation failed: theory is empty');
    }
    const forbiddenHeaders = /(###\s*(Практика|Practice)\b)|(###\s*(Завдання|Вправа|Task|Exercise)\b)|(Умова\s+задачі)|(Формат\s+вхідних\s+даних)|(Формат\s+вихідних\s+даних)/i;
    if (forbiddenHeaders.test(t)) {
      throw new AIValidationError('generateTheory', z.ZodError.create([]), 'Theory generation validation failed: contains practice/task sections');
    }
    const forbiddenPhrases = /\b(Практика|Завдання)\b/i;
    if (forbiddenPhrases.test(t)) {
      throw new AIValidationError('generateTheory', z.ZodError.create([]), 'Theory generation validation failed: contains forbidden phrases (Практика/Завдання)');
    }
    const forbiddenImperatives = /\b(виконайте|обчисліть|знайдіть|розв\s*яжіть|напис(ати|іть)\s+програм(у|у)|зчитайте|прочитайте|введіть|input\s*\(|read\s+from\s+stdin)\b/i;
    if (forbiddenImperatives.test(t)) {
      throw new AIValidationError('generateTheory', z.ZodError.create([]), 'Theory generation validation failed: contains task-like instructions');
    }
  }
  static validateGenerateTask(data: unknown, expectedTopic?: string): AiTaskGenerationResult {
    try {
      const fixed = this.fixTaskGenerationData(data);
      const validated = TaskGenerationSchema.parse(fixed);
      if (expectedTopic) {
        const expectedTopicLower = expectedTopic.toLowerCase().trim();
        let out: any = validated;
        const validatedTopicLower = validated.topic.toLowerCase().trim();
        if (validatedTopicLower !== expectedTopicLower) {
          out = {
            ...out,
            topic: expectedTopic
          };
        }
        const titleLower = String(out.title || "").toLowerCase();
        if (!titleLower.includes(expectedTopicLower)) {
          out = {
            ...out,
            title: `${expectedTopic}: ${out.title}`
          };
        }
        const practicalTaskLower = String(out.practicalTask || "").toLowerCase();
        if (!practicalTaskLower.includes(expectedTopicLower)) {
          out = {
            ...out,
            practicalTask: `${expectedTopic}\n\n${out.practicalTask}`
          };
        }
        return out as AiTaskGenerationResult;
      }
      return validated as AiTaskGenerationResult;
    } catch (error) {
      if (error instanceof AIValidationError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new AIValidationError('generateTask', error, `Task generation validation failed: ${errorMessages}`);
      }
      throw new AIValidationError('generateTask', z.ZodError.create([]), `Task generation validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private static fixTaskGenerationData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }
    const fixed = {
      ...data
    };
    if (typeof fixed.difficulty === 'number') {
      fixed.difficulty = Math.max(1, Math.min(5, Math.round(fixed.difficulty)));
    } else if (typeof fixed.difficulty === 'string') {
      const parsed = parseInt(fixed.difficulty, 10);
      fixed.difficulty = isNaN(parsed) ? 3 : Math.max(1, Math.min(5, parsed));
    } else {
      fixed.difficulty = 3;
    }
    if (Array.isArray(fixed.examples)) {
      fixed.examples = fixed.examples.filter((ex: any) => {
        if (!ex || typeof ex !== 'object') return false;
        const input = String(ex.input || '').trim();
        const output = String(ex.output || '').trim();
        return input.length > 0 && output.length > 0;
      }).map((ex: any) => ({
        input: String(ex.input || '').trim(),
        output: String(ex.output || '').trim(),
        explanation: String(ex.explanation || '').trim()
      }));
      if (fixed.examples.length === 0) {
        fixed.examples = [{
          input: '1',
          output: '1',
          explanation: 'Default example'
        }];
      }
    } else {
      fixed.examples = [{
        input: '1',
        output: '1',
        explanation: 'Default example'
      }];
    }
    const stringFields = ['title', 'theoryMarkdown', 'practicalTask', 'inputFormat', 'outputFormat', 'constraints', 'codeTemplate'];
    for (const field of stringFields) {
      if (!fixed[field] || typeof fixed[field] !== 'string' || fixed[field].trim().length === 0) {
        fixed[field] = field === 'title' ? 'Untitled Task' : field === 'codeTemplate' ? fixed.lang === 'PYTHON' ? '# write code here\n' : 'public class Main {\n  public static void main(String[] args) {\n  }\n}' : `Default ${field}`;
      } else {
        fixed[field] = String(fixed[field]).trim();
      }
    }
    if (fixed.topic && typeof fixed.topic === 'string') {
      fixed.topic = fixed.topic.trim();
    }
    return fixed;
  }
  static validateGenerateTheory(data: unknown): AiTheoryResult {
    try {
      const validated = TheoryResponseSchema.parse(data);
      this.assertTheoryIsPure(validated.theory);
      return validated as AiTheoryResult;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new AIValidationError('generateTheory', error, `Theory generation validation failed: ${errorMessages}`);
      }
      throw new AIValidationError('generateTheory', z.ZodError.create([]), `Theory generation validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  static validateGenerateQuiz(data: unknown, expectedCount?: number): AiQuizResult {
    try {
      let questions: z.infer<typeof QuizQuestionSchema>[];
      if (Array.isArray(data)) {
        questions = QuizResponseSchema.parse(data);
      } else if (typeof data === 'object' && data !== null && 'quizJson' in data) {
        const quizJson = (data as any).quizJson;
        if (typeof quizJson === 'string') {
          const parsed = JSON.parse(quizJson);
          questions = QuizResponseSchema.parse(parsed);
        } else {
          questions = QuizResponseSchema.parse(quizJson);
        }
      } else {
        questions = QuizResponseSchema.parse(data);
      }
      if (expectedCount !== undefined && questions.length !== expectedCount) {
        throw new AIValidationError('generateQuiz', z.ZodError.create([]), `Quiz validation failed: expected ${expectedCount} questions, got ${questions.length}`);
      }
      questions.forEach((q, idx) => {
        try {
          QuizQuestionSchema.parse(q);
        } catch (err) {
          if (err instanceof z.ZodError) {
            const errorMessages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            throw new AIValidationError('generateQuiz', err, `Question ${idx + 1} validation failed: ${errorMessages}`);
          }
        }
      });
      return {
        quizJson: JSON.stringify(questions)
      };
    } catch (error) {
      if (error instanceof AIValidationError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new AIValidationError('generateQuiz', error, `Quiz generation validation failed: ${errorMessages}`);
      }
      throw new AIValidationError('generateQuiz', z.ZodError.create([]), `Quiz generation validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  static validateGenerateTaskCondition(data: unknown): {
    description: string;
  } {
    try {
      const validated = TaskConditionSchema.parse(data);
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new AIValidationError('generateTaskCondition', error, `Task condition validation failed: ${errorMessages}`);
      }
      throw new AIValidationError('generateTaskCondition', z.ZodError.create([]), `Task condition validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  static validateGenerateTaskTemplate(data: unknown): {
    template: string;
  } {
    try {
      const validated = TaskTemplateSchema.parse(data);
      const template = validated.template.trim().toLowerCase();
      const forbiddenPatterns = [/for\s*\([^)]*\)\s*\{[^}]*[^\/\/][^\/\/]/i, /while\s*\([^)]*\)\s*\{[^}]*[^\/\/][^\/\/]/i, /if\s*\([^)]*\)\s*\{[^}]*[^\/\/][^\/\/]/i, /return\s+[^;]+;/i, /system\.out\.print/i, /print\s*\(/i, /console\.log/i];
      const hasImplementation = forbiddenPatterns.some(pattern => pattern.test(template));
      const hasTODO = /todo|#\s*todo|\/\/\s*todo/i.test(template);
      if (hasImplementation && !hasTODO) {
        throw new AIValidationError('generateTaskTemplate', z.ZodError.create([]), 'Template contains implementation code. Template must be empty with only TODO comment.');
      }
      return validated;
    } catch (error) {
      if (error instanceof AIValidationError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new AIValidationError('generateTaskTemplate', error, `Task template validation failed: ${errorMessages}`);
      }
      throw new AIValidationError('generateTaskTemplate', z.ZodError.create([]), `Task template validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  static validateGenerateTestData(data: unknown, expectedCount?: number): TestDataExample[] {
    try {
      const tests = TestDataResponseSchema.parse(this.normalizeTestDataContainer(data));
      if (expectedCount !== undefined && tests.length !== expectedCount) {
        throw new AIValidationError('generateTestData', z.ZodError.create([]), `Test data validation failed: expected ${expectedCount} tests, got ${tests.length}`, data);
      }
      tests.forEach((test, idx) => {
        try {
          TestDataItemSchema.parse(test);
        } catch (err) {
          if (err instanceof z.ZodError) {
            const errorMessages = (err.errors || []).map((e: any) => {
              const path = e?.path ? e.path.join('.') : 'unknown';
              const message = e?.message || 'unknown error';
              return `${path}: ${message}`;
            }).join('; ');
            throw new AIValidationError('generateTestData', err, `Test ${idx + 1} validation failed: ${errorMessages}`);
          }
        }
      });
      const normalized = tests.map(t => ({
        input: String(t.input ?? '').trim(),
        output: String(t.output ?? '').trim(),
        explanation: t.explanation ? String(t.explanation).trim() : undefined
      }));
      if (expectedCount !== undefined && expectedCount > 1) {
        const emptyInputs = normalized.filter(t => !t.input).length;
        if (emptyInputs > 0) {
          throw new AIValidationError('generateTestData', z.ZodError.create([]), `Test data validation failed: ${emptyInputs} tests have empty input, but task requires input`, data);
        }
      }
      const pairKey = (t: {
        input: string;
        output: string;
      }) => `${t.input}\n<<<>>>\n${t.output}`;
      const uniquePairs = new Set(normalized.map(pairKey));
      if (uniquePairs.size !== normalized.length) {
        throw new AIValidationError('generateTestData', z.ZodError.create([]), 'Test data validation failed: duplicate tests detected', data);
      }
      const placeholderCount = normalized.filter(t => t.input === '1' && t.output === '1').length;
      if (expectedCount !== undefined && expectedCount > 1 && placeholderCount > 0) {
        throw new AIValidationError('generateTestData', z.ZodError.create([]), 'Test data validation failed: placeholder tests (input=1/output=1) detected', data);
      }
      if (expectedCount !== undefined && expectedCount >= 5) {
        const uniqueInputs = new Set(normalized.map(t => t.input));
        const minUniqueInputs = Math.min(expectedCount, Math.max(3, Math.ceil(expectedCount * 0.6)));
        if (uniqueInputs.size < minUniqueInputs) {
          throw new AIValidationError('generateTestData', z.ZodError.create([]), `Test data validation failed: inputs are not diverse enough (unique inputs: ${uniqueInputs.size}, expected at least ${minUniqueInputs})`, data);
        }
      }
      return normalized;
    } catch (error) {
      if (error instanceof AIValidationError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        const errorMessages = (error.errors || []).map((e: any) => {
          const path = e?.path ? e.path.join('.') : 'unknown';
          const message = e?.message || 'unknown error';
          return `${path}: ${message}`;
        }).join('; ');
        throw new AIValidationError('generateTestData', error, `Test data validation failed: ${errorMessages}`);
      }
      throw new AIValidationError('generateTestData', z.ZodError.create([]), `Test data validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private static normalizeTestDataContainer(data: any): any {
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null) {
      if ('tests' in data && Array.isArray((data as any).tests)) return (data as any).tests;
    }
    return data;
  }
}