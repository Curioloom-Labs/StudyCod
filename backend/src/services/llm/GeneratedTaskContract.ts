import type { AiTaskGenerationResult } from './LLMOrchestrator';
import type { LLMGenerateOptions, LLMProvider } from './LLMProvider';
import { AIResponseValidator, AIValidationError, FixedOutputContractMismatchError } from './AIResponseValidator';
import { reviewGeneratedTask } from './TaskContractReview';

const VAGUE_OUTPUT_FORMAT_ERROR = 'Task generation validation failed: outputFormat is vague for deterministic task type; specify exact output contract';
const VAGUE_OUTPUT_FORMAT_PATTERN = /(тощо|і\s*т\.?\s*д\.?|і\s*тд|або\s+щось\s+подібне|будь-як[а-яіїєґ]*|any\s+output|anything|etc\.?|and\s+so\s+on)/gi;

function isOlympiadLearningContract(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const contract = JSON.parse(raw) as { kind?: unknown };
    return contract?.kind === 'OLYMPIAD_ALGORITHMIC_PRACTICE';
  } catch {
    return false;
  }
}

function removeVagueOutputCatchAll(outputFormat: string): string {
  return outputFormat
    .replace(VAGUE_OUTPUT_FORMAT_PATTERN, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[,;:]+([.!?]|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reconcile descriptive outputFormat only after the original contract is reviewed. */
export async function validateAndReviewGeneratedTask(
  provider: LLMProvider,
  raw: unknown,
  validation: {
    expectedTopic?: string;
    topicIndex?: number;
    allowedIoTypes?: Array<'STDIN_STDOUT' | 'NO_INPUT_FIXED_OUTPUT' | 'NO_INPUT_FREE_OUTPUT'>;
  },
  options: LLMGenerateOptions & {
    learningContract?: string;
    beforeReview?: (task: AiTaskGenerationResult) => void;
  } = {},
): Promise<AiTaskGenerationResult> {
  const validate = (candidate: unknown) => AIResponseValidator.validateGenerateTask(
    candidate, validation.expectedTopic, validation.topicIndex, validation.allowedIoTypes,
  );
  let task: AiTaskGenerationResult;
  try {
    task = validate(raw);
  } catch (error) {
    if (error instanceof AIValidationError
      && error.message === VAGUE_OUTPUT_FORMAT_ERROR
      && isOlympiadLearningContract(options.learningContract)
      && error.rawResponse && typeof error.rawResponse === 'object' && !Array.isArray(error.rawResponse)) {
      const candidate = error.rawResponse as Record<string, unknown>;
      const originalFormat = typeof candidate.outputFormat === 'string' ? candidate.outputFormat : '';
      const preciseFormat = removeVagueOutputCatchAll(originalFormat);
      if (preciseFormat !== originalFormat) {
        task = validate({ ...candidate, outputFormat: preciseFormat });
        options.beforeReview?.(task);
        task = validate(task);
        await reviewGeneratedTask(provider, task, options);
        return task;
      }
    }

    if (!(error instanceof FixedOutputContractMismatchError)) throw error;
    const candidate = error.task;
    const first = candidate.examples[0];
    const normalizeOutput = (output: string) => output.replace(/\r\n/g, '\n').trim();
    if (!first || candidate.examples.some(example => example.input !== ''
      || normalizeOutput(example.output) !== normalizeOutput(first.output))) throw error;

    // Review the untouched output description and every expected answer first.
    // Copying an unchecked example would conceal genuine contradictions.
    await reviewGeneratedTask(provider, candidate, options);
    return validate({ ...candidate, outputFormat: first.output });
  }
  options.beforeReview?.(task);
  task = validate(task);
  await reviewGeneratedTask(provider, task, options);
  return task;
}
