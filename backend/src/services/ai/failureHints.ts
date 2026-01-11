import { getLLMProvider } from "../llm/provider";
export type HintLanguage = "JAVA" | "PYTHON";
export interface FailureCase {
  testId?: number | string;
  input: string;
  expected: string;
  actual: string;
  verdict?: string;
  stderr?: string | null;
}
export async function generateAlgorithmicHints(params: {
  taskTitle: string;
  taskText: string;
  language: HintLanguage;
  code: string;
  failures: FailureCase[];
}): Promise<string[]> {
  const provider = getLLMProvider();
  const failures = (params.failures || []).slice(0, 3);
  if (failures.length === 0) return [];
  const systemPrompt = `Ти — наставник з алгоритмів та вводу/виводу. Твоя задача — дати КОРОТКІ підказки, чому рішення не проходить тести.

КРИТИЧНО:
- Пояснюй ЛИШЕ логічні/алгоритмічні проблеми та помилки формату вводу/виводу.
- ЗАБОРОНЕНО: поради про стиль, коментарі, форматування, імена змінних, "додай main()", "додай if __name__ == ..." тощо.
- ЗАБОРОНЕНО: давати повний розв'язок або готовий код.
- Якщо з наданих даних неможливо зробити корисні висновки — поверни порожній список hints.

Відповідай ТІЛЬКИ валідним JSON.`;
  const schema = {
    type: "object",
    properties: {
      hints: {
        type: "array",
        items: {
          type: "string"
        },
        minItems: 0,
        maxItems: 3
      }
    },
    required: ["hints"]
  };
  const userPrompt = `
Завдання: ${params.taskTitle}

Умова (скорочено):
${String(params.taskText || "").slice(0, 2000)}

Мова: ${params.language}

Код студента:
\n\n${String(params.code || "").slice(0, 8000)}

Невдалі тести (приклади):
${failures.map((f, idx) => {
    const id = f.testId !== undefined ? `#${f.testId}` : `#${idx + 1}`;
    const verdict = f.verdict ? ` (${f.verdict})` : "";
    const stderr = (f.stderr || "").trim();
    return [`Test ${id}${verdict}`, `Input: ${JSON.stringify((f.input ?? "").slice(0, 400))}`, `Expected: ${JSON.stringify((f.expected ?? "").slice(0, 400))}`, `Actual: ${JSON.stringify((f.actual ?? "").slice(0, 400))}`, stderr ? `Stderr: ${JSON.stringify(stderr.slice(0, 300))}` : null].filter(Boolean).join("\n");
  }).join("\n\n")}

Дай до 3 коротких підказок, що саме перевірити/виправити в логіці або I/O, щоб пройти тести.
Відповідай JSON у форматі {"hints": [..]}.
`.trim();
  try {
    const parsed = await provider.generateJSON<{
      hints: string[];
    }>(userPrompt, schema, systemPrompt, {
      temperature: 0.1
    });
    const hints = Array.isArray(parsed?.hints) ? parsed.hints : [];
    return hints.map(h => String(h).trim()).filter(Boolean).slice(0, 3);
  } catch {
    return [];
  }
}