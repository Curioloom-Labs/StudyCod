/**
 * Shared helpers for validating/parsing task-generation payloads.
 *
 * Kept dependency-free on purpose: it runs in a couple of places and it’s
 * handy to be able to copy/ship as-is.
 */

export interface TaskGenerationSchema {
  title: string;
  topic: string;
  difficulty: number;
  theoryMarkdown: string;
  practicalTask: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: Array<{
    input: string;
    output: string;
    explanation: string;
  }>;
  codeTemplate: string;
}

const REQUIRED_FIELDS = [
  'title',
  'topic',
  'difficulty',
  'theoryMarkdown',
  'practicalTask',
  'inputFormat',
  'outputFormat',
  'constraints',
  'examples',
  'codeTemplate',
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function validateTaskGenerationResponse(data: any): TaskGenerationSchema {
  if (!isObject(data)) {
    fail('Invalid response: expected object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      fail(`Invalid response: missing required field '${field}'`);
    }
  }

  if (typeof data.title !== 'string') fail('Invalid response: title must be string');
  if (typeof data.topic !== 'string') fail('Invalid response: topic must be string');
  if (typeof data.difficulty !== 'number') fail('Invalid response: difficulty must be number');
  if (typeof data.theoryMarkdown !== 'string') fail('Invalid response: theoryMarkdown must be string');
  if (typeof data.practicalTask !== 'string') fail('Invalid response: practicalTask must be string');
  if (typeof data.inputFormat !== 'string') fail('Invalid response: inputFormat must be string');
  if (typeof data.outputFormat !== 'string') fail('Invalid response: outputFormat must be string');
  if (typeof data.constraints !== 'string') fail('Invalid response: constraints must be string');
  if (!Array.isArray(data.examples)) fail('Invalid response: examples must be array');
  if (typeof data.codeTemplate !== 'string') fail('Invalid response: codeTemplate must be string');

  for (let i = 0; i < data.examples.length; i++) {
    const ex = data.examples[i];
    if (!isObject(ex)) {
      fail(`Invalid response: example ${i} must be object`);
    }
    if (typeof (ex as any).input !== 'string') fail(`Invalid response: example ${i}.input must be string`);
    if (typeof (ex as any).output !== 'string') fail(`Invalid response: example ${i}.output must be string`);
    if ((ex as any).explanation && typeof (ex as any).explanation !== 'string') {
      fail(`Invalid response: example ${i}.explanation must be string if present`);
    }
  }

  return {
    title: String(data.title).trim(),
    topic: String(data.topic).trim(),
    difficulty: Number(data.difficulty),
    theoryMarkdown: String(data.theoryMarkdown).trim(),
    practicalTask: String(data.practicalTask).trim(),
    inputFormat: String(data.inputFormat).trim(),
    outputFormat: String(data.outputFormat).trim(),
    constraints: String(data.constraints).trim(),
    examples: data.examples.map((ex: any) => ({
      input: String(ex.input).trim(),
      output: String(ex.output).trim(),
      explanation: ex.explanation ? String(ex.explanation).trim() : '',
    })),
    codeTemplate: String(data.codeTemplate).trim(),
  };
}

export function tryFixJsonResponse(text: string): any {
  let cleaned = text.trim();

  // Cheap fence stripping (it’s not a markdown parser; it just covers the usual case)
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        let fixed = jsonMatch[0]
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)(\w+)(\s*):/g, '$1"$2"$3:') // Quote unquoted keys
          .replace(/:\s*'([^']*)'/g, ': "$1"'); // Replace single quotes with double
        try {
          return JSON.parse(fixed);
        } catch (e3) {
          throw new Error(`Failed to parse JSON: ${e3 instanceof Error ? e3.message : 'Unknown error'}`);
        }
      }
    }
    throw new Error(`No JSON object found in response: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

