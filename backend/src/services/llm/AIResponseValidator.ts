import { z } from 'zod';
import { AiQuizResult, AiTaskGenerationResult, AiTheoryResult, TestDataExample } from './LLMOrchestrator';
import { isFunctionsTopic, looksLikeFunctionImplementationTask } from '../ai/curriculumPolicy';

const TaskGenerationSchema = z.object({
  title: z.string().min(1, 'title must be a non-empty string'),
  topic: z.string().min(1, 'topic must be a non-empty string'),
  difficulty: z.number().int().min(1).max(5, 'difficulty must be between 1 and 5'),
  theoryMarkdown: z.string().min(1, 'theoryMarkdown must be a non-empty string'),
  practicalTask: z.string().min(1, 'practicalTask must be a non-empty string'),
  ioType: z.enum(["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"]).optional().default("STDIN_STDOUT"),
  inputFormat: z.string().min(1, 'inputFormat must be a non-empty string'),
  outputFormat: z.string().min(1, 'outputFormat must be a non-empty string'),
  constraints: z.string().min(1, 'constraints must be a non-empty string'),
  examples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string().min(1, 'example output must be a non-empty string'),
        explanation: z.string().min(1, 'example explanation must be a non-empty string'),
      })
    )
    .min(1, 'examples array must contain at least one example'),
  codeTemplate: z.string().min(1, 'codeTemplate must be a non-empty string'),
});

function looksLikeEmptyOutputTemplate(text: string): boolean {
  const s = String(text ?? '').trim();
  if (!s) return true;
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  // Template-like output such as:
  // "Ціле число:" (no value) / "integer:" (no value)
  const templateLines = lines.filter(l => /[:：]\s*$/.test(l));
  return templateLines.length === lines.length;
}

function looksLikeCodeSnippet(text: string): boolean {
  const s = String(text ?? "");
  if (!s.trim()) return false;

  const patterns = [
    /(^|\n)\s*def\s+[a-z_][a-z0-9_]*\s*\(/i,
    /(^|\n)\s*class\s+[a-z_][a-z0-9_]*\s*[:{]/i,
    /(^|\n)\s*public\s+class\s+\w+/i,
    /#include\s*[<"]/i,
    /\bint\s+main\s*\(/i,
    /\bSystem\.out\.print/i,
    /\bstd::cout\b|\bcout\s*<<|\bcin\s*>>/i,
    /\bprintf\s*\(/i,
    /\bif\s+__name__\s*==\s*["']__main__["']/i
  ];

  if (patterns.some((p) => p.test(s))) return true;

  const hasBraces = /[{}]/.test(s);
  const hasSemicolons = /;/.test(s);
  if (hasBraces && hasSemicolons) return true;

  return false;
}

function mentionsNoInput(text: string): boolean {
  const s = String(text ?? '').toLowerCase();
  return /вхідн(их|і)\s+дан(их|і)\s+нема|вхідні\s+дані\s+відсутн|не\s+потрібно\s+вводити|нічого\s+не\s+ввод(ити|иться)|без\s+введенн(я|я\s+даних)|дані\s+не\s+пода(ю|ю)ться|stdin\s*(?:is\s*)?empty|no\s+input|without\s+input|input\s+is\s+not\s+provided|there\s+is\s+no\s+input/.test(s);
}

function defaultNoInputFormat(preferUkrainian: boolean): string {
  return preferUkrainian
    ? 'Вхідні дані відсутні (нічого не вводиться).'
    : 'There is no input (stdin is empty).';
}

function defaultInputFormatByIo(ioType: string): string {
  if (ioType === 'NO_INPUT_FIXED_OUTPUT' || ioType === 'NO_INPUT_FREE_OUTPUT') {
    return 'Вхідні дані відсутні (нічого не вводиться).';
  }
  return 'Зчитайте вхідні дані зі стандартного потоку вводу (stdin) у форматі, описаному в умові.';
}

function defaultOutputFormatByIo(ioType: string): string {
  if (ioType === 'NO_INPUT_FREE_OUTPUT') {
    return 'Виведіть будь-який непорожній коректний рядок у stdout згідно вимоги задачі.';
  }
  return 'Виведіть результат у стандартний потік виводу (stdout) у форматі, описаному в умові.';
}

function defaultConstraintsText(): string {
  return 'Час виконання: до 1 с. Обмеження памʼяті: до 256 МБ. Використовуйте допустимі межі вхідних значень для вибраних типів даних.';
}

function normalizeIoType(raw: unknown, context?: { practicalTask?: string; inputFormat?: string; outputFormat?: string }): "STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT" {
  const source = typeof raw === 'string' ? raw.trim() : '';
  const compact = source
    .toUpperCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (compact === 'STDIN_STDOUT' || compact === 'STDIN' || compact === 'INPUT_OUTPUT' || compact === 'WITH_INPUT') {
    return 'STDIN_STDOUT';
  }

  if (
    compact === 'NO_INPUT_FIXED_OUTPUT' ||
    compact === 'NOINPUT_FIXED_OUTPUT' ||
    compact === 'NO_INPUT_FIXED' ||
    compact === 'NO_INPUT_EXACT_OUTPUT' ||
    compact === 'NO_INPUT_DETERMINISTIC_OUTPUT' ||
    compact === 'FIXED_OUTPUT'
  ) {
    return 'NO_INPUT_FIXED_OUTPUT';
  }

  if (
    compact === 'NO_INPUT_FREE_OUTPUT' ||
    compact === 'NOINPUT_FREE_OUTPUT' ||
    compact === 'NO_INPUT_FREE' ||
    compact === 'NO_INPUT_ANY_OUTPUT' ||
    compact === 'ANY_NON_EMPTY_OUTPUT' ||
    compact === 'FREE_OUTPUT'
  ) {
    return 'NO_INPUT_FREE_OUTPUT';
  }

  // Semantic fallback if model returns unsupported enum labels.
  const practical = String(context?.practicalTask ?? '').trim();
  const inputFmt = String(context?.inputFormat ?? '').trim();
  const outputFmt = String(context?.outputFormat ?? '').trim().toLowerCase();
  const noInput = mentionsNoInput(`${practical}\n${inputFmt}`);
  if (noInput) {
    const freeOutputHint = /(будь-як|непорожн|any\s+non-?empty|any\s+output|free\s+output)/i.test(outputFmt);
    return freeOutputHint ? 'NO_INPUT_FREE_OUTPUT' : 'NO_INPUT_FIXED_OUTPUT';
  }

  return 'STDIN_STDOUT';
}

function looksLikeJudgeSuccessMessage(text: string): boolean {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return false;
  // Common “meta output” that occasionally leaks into outputFormat/examples.
  // UA
  if (/програма\s+скомпілювал/i.test(s) && /виконал/i.test(s) && /без\s+помил/i.test(s)) return true;
  if (/програм[а-яіїє]+\s+(?:завершил|завершил|завершила|завершилас|завершилась)\s+робот/i.test(s) && /без\s+помил/i.test(s)) return true;
  // EN
  if (/(compiled|build)\s+(successfully|ok)/i.test(s) && /(executed|ran|run)/i.test(s)) return true;
  if (/program\s+(?:has\s+)?(?:compiled|executed|ran)\s+(?:successfully|without\s+errors)/i.test(s)) return true;
  if (/successfully\s+(?:compiled|executed|ran)/i.test(s)) return true;
  return false;
}

function looksLikeDefaultPlaceholder(text: string, field: 'inputFormat' | 'outputFormat' | 'constraints'): boolean {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return true;

  const placeholders = new Set<string>([
    'default inputformat',
    'default outputformat',
    'default constraints',
    'inputformat',
    'outputformat',
    'constraints',
    'n/a',
    'na',
    '-',
    'todo',
    'tbd'
  ]);
  if (placeholders.has(s)) return true;

  if (field === 'inputFormat' && /default\s*input\s*format/i.test(s)) return true;
  if (field === 'outputFormat' && /default\s*output\s*format/i.test(s)) return true;
  if (field === 'constraints' && /default\s*constraints?/i.test(s)) return true;

  return false;
}

function looksLikeMultiTaskInstruction(text: string): boolean {
  const src = String(text ?? '').toLowerCase();
  if (!src.trim()) return false;

  const count = (re: RegExp) => (src.match(re) || []).length;
  const writeProgramUa = count(/\bнапиш(?:іть|и)\s+програм/gi);
  const writeProgramEn = count(/\bwrite\s+a\s+program\b/gi);
  if (writeProgramUa + writeProgramEn >= 2) return true;

  // Common “two tasks in one” pattern: "... . Також ..."
  if (/\bтакож\b[\s\S]{0,120}\b(напиш(?:іть|и)|зробіть|реалізуйте|write|implement)\b/i.test(src)) return true;

  // Explicit numbered multi-task markers.
  if (/\b(завдання|задача|task)\s*[1-9]\b/i.test(src)) return true;

  return false;
}

function hasVagueOutputContract(text: string): boolean {
  const s = String(text ?? '').toLowerCase();
  if (!s.trim()) return true;
  return /(тощо|і\s*т\.д\.|і\s*тд|або\s+щось\s+подібне|будь-як|any\s+output|anything|etc\.?|and\s+so\s+on)/i.test(s);
}

function looksTooShortOrVaguePracticalTask(text: string): boolean {
  const s = String(text ?? '').trim();
  if (!s) return true;
  // Heuristic: we want more expanded conditions; single-line stubs are not helpful.
  const compact = s.replace(/\s+/g, ' ');
  if (compact.length < 180) return true;
  const sentences = (compact.match(/[.!?…]+/g) || []).length;
  const hasBullets = /\n\s*[-*]\s+/.test(s);
  if (sentences >= 2 || hasBullets) return false;
  return true;
}

function looksLikeNumberedChecklistPracticalTask(text: string): boolean {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^#{1,6}\s+/.test(line));

  if (lines.length < 3) return false;

  const sample = lines.slice(0, Math.min(lines.length, 8));
  const numbered = sample.filter(line => /^\d+[\.)]\s+/.test(line)).length;
  const bullets = sample.filter(line => /^[-*•]\s+/.test(line)).length;
  const markers = numbered + bullets;

  if (numbered < 2 && markers < 4) return false;
  return markers / sample.length >= 0.55;
}

function rewriteChecklistPracticalTaskToNarrative(text: string): string {
  const source = String(text ?? '').trim();
  if (!source) return '';
  if (!looksLikeNumberedChecklistPracticalTask(source)) return source;

  const fragments = source
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^#{1,6}\s+/.test(line))
    .map(line => line.replace(/^\s*(?:\d+[\.)]|[-*•])\s+/, '').trim())
    .filter(Boolean)
    .map(part => {
      const compact = part.replace(/\s+/g, ' ').trim();
      if (!compact) return '';
      return /[.!?…:]$/.test(compact) ? compact : `${compact}.`;
    })
    .filter(Boolean);

  if (fragments.length < 2) return source;
  return fragments.join(' ');
}

const TheoryResponseSchema = z.object({
  theory: z.string().min(1, 'theory must be a non-empty string'),
});

const QuizQuestionSchema = z.object({
  q: z.string().min(1, 'question text must be a non-empty string'),
  options: z.array(z.string().min(1)).length(5, 'question must have exactly 5 options'),
  correct: z.number().int().min(0).max(4, 'correct must be between 0 and 4'),
});

const QuizResponseSchema = z.array(QuizQuestionSchema).min(1, 'quiz must contain at least one question');

const TaskConditionSchema = z.object({
  description: z.string().min(1, 'description must be a non-empty string'),
});

const TaskTemplateSchema = z.object({
  template: z.string().min(1, 'template must be a non-empty string'),
});

const TestDataItemSchema = z.object({
  input: z.string(),
  output: z.string().min(1, 'test output must be a non-empty string'),
  explanation: z.string().optional(),
});

const TestDataResponseSchema = z.array(TestDataItemSchema).min(1, 'test data must contain at least one test');

function zodMessages(err: z.ZodError): string {
  return err.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
}

function unknownErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emptyZod(): z.ZodError {
  return new z.ZodError([] as any);
}
export class AIValidationError extends Error {
  public rawResponse?: unknown;
  constructor(public readonly mode: string, public readonly errors: z.ZodError, message?: string, rawResponse?: unknown) {
    super(message || `AI response validation failed for mode: ${mode}`);
    this.name = 'AIValidationError';
    this.rawResponse = rawResponse;
  }
}

export function makeAIValidationError(mode: string, message: string, rawResponse?: unknown): AIValidationError {
  return new AIValidationError(mode, emptyZod(), message, rawResponse);
}

// Declarative rule registry for generateTask responses.
// Each rule owns its own predicate + canonical error message. `applies`
// optionally gates the rule on IO type so we don't run e.g. STDIN_STDOUT
// rules against no-input tasks. Messages are kept BYTE-IDENTICAL to the
// previous linear if/throw chain so client-side error strings stay stable.
type TaskValidationContext = {
  topicTitle: string;
  ioType: "STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT";
  practical: string;
  outFmt: string;
  inFmt: string;
  constraints: string;
  exInput: string;
  exOutput: string;
};

type TaskValidationRule = {
  id: string;
  message: string;
  applies?: (ctx: TaskValidationContext) => boolean;
  fails: (ctx: TaskValidationContext) => boolean;
};

const TASK_VALIDATION_RULES: TaskValidationRule[] = [
  {
    id: "practical.too_short",
    message: "Task generation validation failed: practicalTask is too short/vague; must be a detailed multi-sentence narrative",
    fails: c => looksTooShortOrVaguePracticalTask(c.practical),
  },
  {
    id: "practical.checklist",
    message: "Task generation validation failed: practicalTask must be a natural narrative statement, not a numbered checklist",
    fails: c => looksLikeNumberedChecklistPracticalTask(c.practical),
  },
  {
    id: "practical.function_impl",
    message: "Task generation validation failed: practicalTask appears to require implementing a function/method/class instead of a full program",
    fails: c => !isFunctionsTopic(c.topicTitle) && looksLikeFunctionImplementationTask(c.practical),
  },
  {
    id: "outFmt.meta_success",
    message: 'Task generation validation failed: outputFormat looks like judge meta message (e.g., "program compiled/executed without errors")',
    fails: c => looksLikeJudgeSuccessMessage(c.outFmt),
  },
  {
    id: "exOutput.meta_success",
    message: 'Task generation validation failed: examples[0].output looks like judge meta message (e.g., "program compiled/executed without errors")',
    fails: c => looksLikeJudgeSuccessMessage(c.exOutput),
  },
  {
    id: "outFmt.code_snippet",
    message: "Task generation validation failed: outputFormat looks like source code instead of an output contract",
    fails: c => looksLikeCodeSnippet(c.outFmt),
  },
  {
    id: "exOutput.code_snippet",
    message: "Task generation validation failed: examples[0].output looks like source code instead of expected stdout",
    fails: c => looksLikeCodeSnippet(c.exOutput),
  },
  {
    id: "inFmt.placeholder",
    message: "Task generation validation failed: inputFormat is placeholder/default text",
    fails: c => looksLikeDefaultPlaceholder(c.inFmt, "inputFormat"),
  },
  {
    id: "outFmt.placeholder",
    message: "Task generation validation failed: outputFormat is placeholder/default text",
    fails: c => looksLikeDefaultPlaceholder(c.outFmt, "outputFormat"),
  },
  {
    id: "constraints.placeholder",
    message: "Task generation validation failed: constraints is placeholder/default text",
    fails: c => looksLikeDefaultPlaceholder(c.constraints, "constraints"),
  },
  {
    id: "practical.multi_task",
    message: "Task generation validation failed: practicalTask appears to contain multiple tasks/programs",
    fails: c => looksLikeMultiTaskInstruction(c.practical),
  },
  // IO-type gated rules.
  {
    id: "stdin.requires_example_input",
    applies: c => c.ioType === "STDIN_STDOUT",
    message: "Task generation validation failed: STDIN_STDOUT requires non-empty examples[0].input",
    fails: c => !c.exInput,
  },
  {
    id: "no_input.empty_example_input",
    applies: c => c.ioType !== "STDIN_STDOUT",
    message: "Task generation validation failed: NO_INPUT_* requires empty examples[0].input",
    fails: c => Boolean(c.exInput),
  },
  {
    id: "no_input.no_stdin_in_practical",
    applies: c => c.ioType !== "STDIN_STDOUT",
    message: "Task generation validation failed: NO_INPUT_* task statement must not require reading input",
    fails: c => /\b(input\s*\(|stdin|system\.in|scanner\b|bufferedreader\b|зчитай|прочитай|введіть|введи)\b/i.test(c.practical.toLowerCase()),
  },
  {
    id: "fixed_output.outFmt_must_be_concrete",
    applies: c => c.ioType === "NO_INPUT_FIXED_OUTPUT",
    message: "Task generation validation failed: NO_INPUT_FIXED_OUTPUT requires outputFormat to contain the exact expected stdout (not just labels/templates)",
    fails: c => !c.outFmt || looksLikeEmptyOutputTemplate(c.outFmt),
  },
  {
    id: "fixed_output.outFmt_not_meta",
    applies: c => c.ioType === "NO_INPUT_FIXED_OUTPUT",
    message: "Task generation validation failed: NO_INPUT_FIXED_OUTPUT outputFormat must be exact expected output, not a meta success message",
    fails: c => looksLikeJudgeSuccessMessage(c.outFmt),
  },
  {
    id: "fixed_output.exOutput_must_be_concrete",
    applies: c => c.ioType === "NO_INPUT_FIXED_OUTPUT",
    message: "Task generation validation failed: NO_INPUT_FIXED_OUTPUT requires examples[0].output with concrete values",
    fails: c => !c.exOutput || looksLikeEmptyOutputTemplate(c.exOutput),
  },
  {
    id: "fixed_output.exOutput_not_meta",
    applies: c => c.ioType === "NO_INPUT_FIXED_OUTPUT",
    message: "Task generation validation failed: NO_INPUT_FIXED_OUTPUT examples[0].output must be exact expected output, not a meta success message",
    fails: c => looksLikeJudgeSuccessMessage(c.exOutput),
  },
  {
    id: "deterministic.no_vague_outFmt",
    applies: c => c.ioType !== "NO_INPUT_FREE_OUTPUT",
    message: "Task generation validation failed: outputFormat is vague for deterministic task type; specify exact output contract",
    fails: c => hasVagueOutputContract(c.outFmt),
  },
  {
    id: "non_fixed.outFmt_min_length",
    applies: c => c.ioType !== "NO_INPUT_FIXED_OUTPUT",
    message: "Task generation validation failed: outputFormat is too short; must describe the output contract clearly",
    fails: c => !c.outFmt || c.outFmt.length < 12,
  },
];

export class AIResponseValidator {
  private static assertTheoryIsPure(theory: string): void {
    const t = String(theory ?? "").trim();
    if (!t) {
      throw new AIValidationError('generateTheory', emptyZod(), 'Theory generation validation failed: theory is empty');
    }
    const forbiddenHeaders = /(###\s*(Практика|Practice)\b)|(###\s*(Завдання|Вправа|Task|Exercise)\b)|(Умова\s+задачі)|(Формат\s+вхідних\s+даних)|(Формат\s+вихідних\s+даних)/i;
    if (forbiddenHeaders.test(t)) {
      throw new AIValidationError('generateTheory', emptyZod(), 'Theory generation validation failed: contains practice/task sections');
    }
    const forbiddenPhrases = /\b(Практика|Завдання)\b/i;
    if (forbiddenPhrases.test(t)) {
      throw new AIValidationError('generateTheory', emptyZod(), 'Theory generation validation failed: contains forbidden phrases (Практика/Завдання)');
    }
    const forbiddenImperatives = /\b(виконайте|обчисліть|знайдіть|розв\s*яжіть|напис(ати|іть)\s+програм(у|у)|зчитайте|прочитайте|введіть|input\s*\(|read\s+from\s+stdin)\b/i;
    if (forbiddenImperatives.test(t)) {
      throw new AIValidationError('generateTheory', emptyZod(), 'Theory generation validation failed: contains task-like instructions');
    }
  }
  static validateGenerateTask(data: unknown, expectedTopic?: string): AiTaskGenerationResult {
    try {
      const fixed = this.fixTaskGenerationData(data);
      const validated = TaskGenerationSchema.parse(fixed);

      // Conditional IO semantics validation.
      const ioType = (validated as any).ioType as ("STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT");
      const firstExample = Array.isArray(validated.examples) && validated.examples.length ? validated.examples[0] : null;
      const exInput = String((firstExample as any)?.input ?? '').trim();
      const exOutput = String((firstExample as any)?.output ?? '').trim();

      const practical = String(validated.practicalTask ?? '').trim();
      const outFmt = String(validated.outputFormat ?? '').trim();
      const inFmt = String(validated.inputFormat ?? '').trim();
      const constraints = String(validated.constraints ?? '').trim();

      // Normalise inputFormat for no-input IO types before rule evaluation:
      // many models forget the canonical phrasing — we fill it in rather than
      // fail the whole generation.
      if (ioType !== 'STDIN_STDOUT' && !mentionsNoInput(validated.inputFormat)) {
        const practicalHasCyrillic = /[а-яіїєґ]/i.test(practical);
        (validated as any).inputFormat = defaultNoInputFormat(practicalHasCyrillic);
      }

      const ctx: TaskValidationContext = {
        topicTitle: String(expectedTopic ?? '').trim(),
        ioType,
        practical,
        outFmt,
        inFmt,
        constraints,
        exInput,
        exOutput
      };

      // Iterate the declarative rule registry. The previous implementation
      // was 100+ lines of linear `if/throw` blocks; this version keeps the
      // exact same predicates and error messages but routes them through a
      // single typed registry so new rules can be added or audited cleanly.
      for (const rule of TASK_VALIDATION_RULES) {
        if (rule.applies && !rule.applies(ctx)) continue;
        if (rule.fails(ctx)) {
          throw new AIValidationError('generateTask', emptyZod(), rule.message, data);
        }
      }

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
        throw new AIValidationError('generateTask', error, `Task generation validation failed: ${zodMessages(error)}`);
      }
      throw new AIValidationError('generateTask', emptyZod(), `Task generation validation failed: ${unknownErr(error)}`);
    }
  }
  private static fixTaskGenerationData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const fixed = { ...data };

    fixed.ioType = normalizeIoType(fixed.ioType, {
      practicalTask: fixed.practicalTask,
      inputFormat: fixed.inputFormat,
      outputFormat: fixed.outputFormat,
    });

    const ioTypeHint = typeof fixed.ioType === 'string' ? String(fixed.ioType).trim() : '';
    const isNoInputIoType = ioTypeHint === 'NO_INPUT_FIXED_OUTPUT' || ioTypeHint === 'NO_INPUT_FREE_OUTPUT';

    // difficulty is often the first thing models get "creative" about.
    if (typeof fixed.difficulty === 'number') {
      fixed.difficulty = Math.max(1, Math.min(5, Math.round(fixed.difficulty)));
    } else if (typeof fixed.difficulty === 'string') {
      const parsed = parseInt(fixed.difficulty, 10);
      fixed.difficulty = isNaN(parsed) ? 3 : Math.max(1, Math.min(5, parsed));
    } else {
      fixed.difficulty = 3;
    }

    const defaultExample = {
      input: isNoInputIoType ? '' : '1',
      output: '1',
      explanation: 'Default example',
    };

    if (Array.isArray(fixed.examples)) {
      fixed.examples = fixed.examples
        .filter((ex: any) => {
          if (!ex || typeof ex !== 'object') return false;
          const output = String(ex.output || '').trim();
          // For NO_INPUT_* tasks, empty input is required and must be preserved.
          // For STDIN_STDOUT tasks, input may still be empty in broken model outputs; let semantic validator handle it.
          return output.length > 0;
        })
        .map((ex: any) => ({
          input: String(ex.input ?? '').trim(),
          output: String(ex.output || '').trim(),
          explanation: String(ex.explanation || '').trim() || 'Example',
        }));

      if (fixed.examples.length === 0) {
        fixed.examples = [defaultExample];
      }
    } else {
      fixed.examples = [defaultExample];
    }

    if (
      ioTypeHint === 'STDIN_STDOUT'
      && fixed.examples.length > 0
      && fixed.examples.every((ex: any) => String(ex?.input ?? '').trim().length === 0)
    ) {
      fixed.examples[0].input = '1';
    }

    const stringFields = ['title', 'theoryMarkdown', 'practicalTask', 'codeTemplate'] as const;
    for (const field of stringFields) {
      const raw = fixed[field];
      if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
        if (field === 'title') {
          fixed[field] = 'Untitled Task';
        } else if (field === 'codeTemplate') {
          fixed[field] = fixed.lang === 'PYTHON'
            ? '# write code here\n'
            : 'public class Main {\n  public static void main(String[] args) {\n  }\n}';
        } else {
          fixed[field] = `Default ${field}`;
        }
      } else {
        fixed[field] = String(raw).trim();
      }
    }

    if (typeof fixed.practicalTask === 'string') {
      fixed.practicalTask = rewriteChecklistPracticalTaskToNarrative(fixed.practicalTask);
    }

    const inputFormat = typeof fixed.inputFormat === 'string' ? fixed.inputFormat.trim() : '';
    const outputFormat = typeof fixed.outputFormat === 'string' ? fixed.outputFormat.trim() : '';
    const constraints = typeof fixed.constraints === 'string' ? fixed.constraints.trim() : '';
    fixed.inputFormat = inputFormat || defaultInputFormatByIo(ioTypeHint);
    fixed.outputFormat = outputFormat || defaultOutputFormatByIo(ioTypeHint);
    fixed.constraints = constraints || defaultConstraintsText();

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
        throw new AIValidationError('generateTheory', error, `Theory generation validation failed: ${zodMessages(error)}`);
      }
      throw new AIValidationError('generateTheory', emptyZod(), `Theory generation validation failed: ${unknownErr(error)}`);
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
        throw new AIValidationError('generateQuiz', emptyZod(), `Quiz validation failed: expected ${expectedCount} questions, got ${questions.length}`);
      }
      questions.forEach((q, idx) => {
        try {
          QuizQuestionSchema.parse(q);
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new AIValidationError('generateQuiz', err, `Question ${idx + 1} validation failed: ${zodMessages(err)}`);
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
        throw new AIValidationError('generateQuiz', error, `Quiz generation validation failed: ${zodMessages(error)}`);
      }
      throw new AIValidationError('generateQuiz', emptyZod(), `Quiz generation validation failed: ${unknownErr(error)}`);
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
        throw new AIValidationError('generateTaskCondition', error, `Task condition validation failed: ${zodMessages(error)}`);
      }
      throw new AIValidationError('generateTaskCondition', emptyZod(), `Task condition validation failed: ${unknownErr(error)}`);
    }
  }
  static validateGenerateTaskTemplate(data: unknown): {
    template: string;
  } {
    try {
      const validated = TaskTemplateSchema.parse(data);
      const template = validated.template.trim().toLowerCase();
      const forbiddenPatterns = [/for\s*\([^)]*\)\s*\{[^}]*[^/][^/]/i, /while\s*\([^)]*\)\s*\{[^}]*[^/][^/]/i, /if\s*\([^)]*\)\s*\{[^}]*[^/][^/]/i, /return\s+[^;]+;/i, /system\.out\.print/i, /print\s*\(/i, /console\.log/i];
      const hasImplementation = forbiddenPatterns.some(pattern => pattern.test(template));
      const hasTODO = /todo|#\s*todo|\/\/\s*todo/i.test(template);
      if (hasImplementation && !hasTODO) {
        throw new AIValidationError('generateTaskTemplate', emptyZod(), 'Template contains implementation code. Template must be empty with only TODO comment.');
      }
      return validated;
    } catch (error) {
      if (error instanceof AIValidationError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new AIValidationError('generateTaskTemplate', error, `Task template validation failed: ${zodMessages(error)}`);
      }
      throw new AIValidationError('generateTaskTemplate', emptyZod(), `Task template validation failed: ${unknownErr(error)}`);
    }
  }
  static validateGenerateTestData(data: unknown, expectedCount?: number): TestDataExample[] {
    try {
      const tests = TestDataResponseSchema.parse(this.normalizeTestDataContainer(data));
      if (expectedCount !== undefined && tests.length !== expectedCount) {
        throw new AIValidationError('generateTestData', emptyZod(), `Test data validation failed: expected ${expectedCount} tests, got ${tests.length}`, data);
      }
      tests.forEach((test, idx) => {
        try {
          TestDataItemSchema.parse(test);
        } catch (err) {
          if (err instanceof z.ZodError) {
            const errorMessages = (err.issues || []).map((e: any) => {
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
          throw new AIValidationError('generateTestData', emptyZod(), `Test data validation failed: ${emptyInputs} tests have empty input, but task requires input`, data);
        }
      }
      const pairKey = (t: {
        input: string;
        output: string;
      }) => `${t.input}\n<<<>>>\n${t.output}`;
      const uniquePairs = new Set(normalized.map(pairKey));
      if (uniquePairs.size !== normalized.length) {
        throw new AIValidationError('generateTestData', emptyZod(), 'Test data validation failed: duplicate tests detected', data);
      }
      const placeholderCount = normalized.filter(t => t.input === '1' && t.output === '1').length;
      if (expectedCount !== undefined && expectedCount > 1 && placeholderCount > 0) {
        throw new AIValidationError('generateTestData', emptyZod(), 'Test data validation failed: placeholder tests (input=1/output=1) detected', data);
      }
      if (expectedCount !== undefined && expectedCount >= 5) {
        const uniqueInputs = new Set(normalized.map(t => t.input));
        const minUniqueInputs = Math.min(expectedCount, Math.max(3, Math.ceil(expectedCount * 0.6)));
        if (uniqueInputs.size < minUniqueInputs) {
          throw new AIValidationError('generateTestData', emptyZod(), `Test data validation failed: inputs are not diverse enough (unique inputs: ${uniqueInputs.size}, expected at least ${minUniqueInputs})`, data);
        }
      }
      return normalized;
    } catch (error) {
      if (error instanceof AIValidationError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        const errorMessages = (error.issues || []).map((e: any) => {
          const path = e?.path ? e.path.join('.') : 'unknown';
          const message = e?.message || 'unknown error';
          return `${path}: ${message}`;
        }).join('; ');
        throw new AIValidationError('generateTestData', error, `Test data validation failed: ${errorMessages}`);
      }
      throw new AIValidationError('generateTestData', emptyZod(), `Test data validation failed: ${unknownErr(error)}`);
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
