import type { AiTaskGenerationResult } from './LLMOrchestrator';
import type { LLMGenerateOptions, LLMProvider } from './LLMProvider';
import { AIResponseValidator, FixedOutputContractMismatchError } from './AIResponseValidator';
import { reviewGeneratedTask } from './TaskContractReview';

/** Reconcile descriptive outputFormat only after the original contract is reviewed. */
export async function validateAndReviewGeneratedTask(
  provider: LLMProvider,
  raw: unknown,
  validation: {
    expectedTopic?: string;
    topicIndex?: number;
    allowedIoTypes?: Array<'STDIN_STDOUT' | 'NO_INPUT_FIXED_OUTPUT' | 'NO_INPUT_FREE_OUTPUT'>;
  },
  options: LLMGenerateOptions & { learningContract?: string } = {},
): Promise<AiTaskGenerationResult> {
  const validate = (candidate: unknown) => AIResponseValidator.validateGenerateTask(
    candidate, validation.expectedTopic, validation.topicIndex, validation.allowedIoTypes,
  );
  let task: AiTaskGenerationResult;
  try {
    task = validate(raw);
  } catch (error) {
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
  await reviewGeneratedTask(provider, task, options);
  return task;
}
