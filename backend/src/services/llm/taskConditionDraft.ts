export interface TaskConditionDraftExample {
  input: string;
  output: string;
}

export interface TaskConditionDraft {
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: [TaskConditionDraftExample, TaskConditionDraftExample, TaskConditionDraftExample];
}

export const TASK_CONDITION_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    statement: { type: "string", minLength: 1, maxLength: 6000 },
    inputFormat: { type: "string", minLength: 1, maxLength: 2000 },
    outputFormat: { type: "string", minLength: 1, maxLength: 2000 },
    constraints: { type: "string", maxLength: 2000 },
    examples: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          input: { type: "string", maxLength: 4000 },
          output: { type: "string", minLength: 1, maxLength: 4000 },
        },
        required: ["input", "output"],
        additionalProperties: false,
      },
    },
  },
  required: ["statement", "inputFormat", "outputFormat", "constraints", "examples"],
  additionalProperties: false,
} as const;

function markdownFenceFor(values: string[]): string {
  let longestRun = 0;
  for (const value of values) {
    for (const match of value.matchAll(/`+/g)) longestRun = Math.max(longestRun, match[0].length);
  }
  return "`".repeat(Math.max(3, longestRun + 1));
}

export function formatTaskConditionDraft(draft: TaskConditionDraft, locale: "uk" | "en"): string {
  const isEnglish = locale === "en";
  const fence = markdownFenceFor(draft.examples.flatMap(example => [example.input, example.output]));
  const examples = draft.examples.map((example, index) => [
    `### ${isEnglish ? "Example" : "Приклад"} ${index + 1}`,
    "",
    `${isEnglish ? "Input" : "Вхідні дані"}:`,
    fence,
    example.input,
    fence,
    `${isEnglish ? "Output" : "Вихідні дані"}:`,
    fence,
    example.output,
    fence,
  ].join("\n"));

  const sections = [
    `## ${isEnglish ? "Problem" : "Умова"}`,
    draft.statement.trim(),
    "",
    `## ${isEnglish ? "Input" : "Вхідні дані"}`,
    draft.inputFormat.trim(),
    "",
    `## ${isEnglish ? "Output" : "Вихідні дані"}`,
    draft.outputFormat.trim(),
    ...(draft.constraints.trim() ? ["", `## ${isEnglish ? "Constraints" : "Обмеження"}`, draft.constraints.trim()] : []),
    "",
    `## ${isEnglish ? "Examples" : "Приклади"}`,
    ...examples.flatMap((example, index) => index === 0 ? [example] : ["", example]),
  ];

  return sections.join("\n").trim();
}
