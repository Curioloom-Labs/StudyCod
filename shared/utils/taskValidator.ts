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
  ioType?: "STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT";
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

export function validateTaskGenerationResponse(data: unknown): TaskGenerationSchema {
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

  const examples = data.examples;
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    if (!isObject(ex)) {
      fail(`Invalid response: example ${i} must be object`);
    }
    if (typeof ex.input !== 'string') fail(`Invalid response: example ${i}.input must be string`);
    if (typeof ex.output !== 'string') fail(`Invalid response: example ${i}.output must be string`);
    if (ex.explanation && typeof ex.explanation !== 'string') {
      fail(`Invalid response: example ${i}.explanation must be string if present`);
    }
  }

  return {
    title: String(data.title).trim(),
    topic: String(data.topic).trim(),
    difficulty: Number(data.difficulty),
    theoryMarkdown: String(data.theoryMarkdown).trim(),
    practicalTask: String(data.practicalTask).trim(),
    ioType: data.ioType === "STDIN_STDOUT" || data.ioType === "NO_INPUT_FIXED_OUTPUT" || data.ioType === "NO_INPUT_FREE_OUTPUT"
      ? data.ioType
      : undefined,
    inputFormat: String(data.inputFormat).trim(),
    outputFormat: String(data.outputFormat).trim(),
    constraints: String(data.constraints).trim(),
    examples: examples.map(ex => {
      const item = ex as Record<string, unknown>;
      return {
        input: String(item.input).trim(),
        output: String(item.output).trim(),
        explanation: item.explanation ? String(item.explanation).trim() : '',
      };
    }),
    codeTemplate: String(data.codeTemplate).trim(),
  };
}

export function tryFixJsonResponse(text: string): unknown {
  let cleaned = text.trim();

  // Cheap fence stripping (it’s not a markdown parser; it just covers the usual case)
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const escaped = repairJsonStringEscapes(cleaned);
  try {
    return JSON.parse(escaped);
  } catch (e) {
    const jsonMatch = escaped.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        let fixed = jsonMatch[0]
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)(\w+)(\s*):/g, '$1"$2"$3:') // Quote unquoted keys
          .replace(/:\s*'([^']*)'/g, ': "$1"'); // Replace single quotes with double
        fixed = repairJsonStringEscapes(fixed);
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

/**
 * Preserve literal backslashes in model-authored JSON strings (for example,
 * LaTeX commands such as `\le`) when the model forgot JSON's extra escape.
 * Valid JSON escapes are left intact unless they clearly start a common LaTeX command.
 */
export function repairJsonStringEscapes(json: string): string {
  const latexCommandsWithJsonEscapePrefixes = new Set([
    "begin", "beta", "big", "binom", "boldsymbol", "mathbf", "bar",
    "fbox", "frac", "forall", "floor", "flushleft", "flushright",
    "neq", "neg", "nleq", "ngeq", "not", "nabla", "newline",
    "right", "rho", "rangle", "rbrace", "rfloor", "rvert", "rm",
    "rule", "rightarrow", "Rightarrow", "text", "textbf", "textit",
    "texttt", "times", "theta", "tan", "to", "top", "tau", "tilde",
  ]);
  let result = '';
  let inString = false;

  for (let i = 0; i < json.length; i += 1) {
    const character = json[i];
    if (!inString) {
      result += character;
      if (character === '"') inString = true;
      continue;
    }

    if (character === '"') {
      result += character;
      inString = false;
      continue;
    }

    if (character !== '\\') {
      result += character;
      continue;
    }

    const next = json[i + 1];
    const command = json.slice(i + 1).match(/^[a-zA-Z]+/)?.[0];
    const isLatexCommandWithJsonEscapePrefix = Boolean(command && latexCommandsWithJsonEscapePrefixes.has(command));
    const isSimpleEscape = next !== undefined && '"\\/bfnrt'.includes(next);
    const isUnicodeEscape = next === 'u' && /^[\da-fA-F]{4}$/.test(json.slice(i + 2, i + 6));
    if ((isSimpleEscape && !isLatexCommandWithJsonEscapePrefix) || isUnicodeEscape) {
      result += character + next;
      if (isUnicodeEscape) result += json.slice(i + 2, i + 6);
      i += isUnicodeEscape ? 5 : 1;
      continue;
    }

    // This is either an invalid JSON escape or an ambiguous JSON escape that
    // starts a common LaTeX command (for example, \frac starts with \f).
    // Double the slash and process the following character normally.
    result += '\\\\';
  }

  return result;
}

