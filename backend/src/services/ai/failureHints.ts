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
  maxHints?: number;
}): Promise<string[]> {
  const provider = getLLMProvider();
  const failures = (params.failures || []).slice(0, 3);
  if (failures.length === 0) return [];
  const maxHints = Math.max(0, Math.min(5, Number(params.maxHints ?? 3) || 3));

  const buildFallbackHints = (): string[] => {
    // Deterministic, safe, non-solution hints for when LLM is unavailable (rate limit / outage).
    // Keep them short and actionable.
    const stderrAll = failures.map(f => (f.stderr || "").toString()).filter(Boolean).join("\n");
    const verdictAll = failures.map(f => (f.verdict || "").toString()).filter(Boolean).join(" ");

    const hints: string[] = [];
    const push = (h: string) => {
      const s = String(h || "").trim();
      if (!s) return;
      if (hints.includes(s)) return;
      hints.push(s);
    };

    const lower = `${stderrAll}\n${verdictAll}`.toLowerCase();

    const looksLikeTimeout = /\b(timeout|time\s*limit|tl|killed|timelimit)\b/i.test(lower);
    const looksLikeCE = /\b(compile|compilation|cannot\s+find\s+symbol|syntax\s+error|error:|javac|kotlinc|type\s+error)\b/i.test(lower);
    const looksLikePythonTrace = /traceback \(most recent call last\)/i.test(stderrAll);

    const hasAnyInput = failures.some(f => (f.input ?? "").toString().trim().length > 0);
    const hasAnyExpected = failures.some(f => (f.expected ?? "").toString().trim().length > 0);
    const hasAnyActual = failures.some(f => (f.actual ?? "").toString().trim().length > 0);
    const sampleExpected = (failures.find(f => (f.expected ?? "").toString().trim())?.expected ?? "").toString();
    const sampleActual = (failures.find(f => (f.actual ?? "").toString().trim())?.actual ?? "").toString();

    // 1) Compile / syntax
    if (looksLikeCE || looksLikePythonTrace) {
      if (params.language === "PYTHON") {
        if (/indentationerror|taberror/i.test(stderrAll)) {
          push("Перевір відступи: у Python вони критичні (змішані tab/space теж ламають виконання).");
        }
        if (/syntaxerror/i.test(stderrAll)) {
          push("Є синтаксична помилка. Знайди рядок, на який вказує повідомлення, і перевір дужки/двокрапки/лапки.");
        }
        if (/nameerror/i.test(stderrAll)) {
          push("Схоже, використовується змінна/функція, яка не визначена. Перевір назви та область видимості.");
        }
        if (/valueerror|typeerror/i.test(stderrAll)) {
          push("Перевір перетворення типів під час зчитування: можливий ValueError/TypeError через неправильний формат вводу.");
        }
        if (/eoferror/i.test(stderrAll)) {
          push("Схоже, програма очікує більше вводу, ніж реально подається. Перевір, скільки рядків/значень ти зчитуєш.");
        }
      } else {
        // JAVA
        push("Є помилка компіляції. Перевір синтаксис, імена класів/методів і чи імпорти потрібні/коректні.");
        if (/class\s+main\b|public\s+class\s+main\b/i.test(stderrAll) || /class\s+Main\s+is\s+public/i.test(stderrAll)) {
          push("Переконайся, що точка входу оформлена правильно (наприклад, public class Main і main-method).");
        }
        if (/cannot\s+find\s+symbol/i.test(stderrAll)) {
          push("Помилка 'cannot find symbol' зазвичай означає: змінна/метод не оголошені або помилка в назві.");
        }
      }

      // keep it a ladder
      if (hints.length < maxHints) {
        push("Після виправлення помилки спробуй ще раз: підказки по логіці зʼявляються лише коли код запускається і падає на тестах.");
      }
      return hints.slice(0, maxHints);
    }

    // 2) Time limit
    if (looksLikeTimeout) {
      push("Схоже на перевищення ліміту часу. Оціни складність: чи немає вкладених циклів по довжині рядка/масиву?");
      push("Подумай, чи можна рахувати частоти/суми за один прохід замість повторних перевірок.");
      push("При великих вхідних даних перевір швидкість вводу/виводу (але без зайвого форматування).");
      return hints.slice(0, maxHints);
    }

    // 3) Wrong answer / formatting
    // Try to detect whitespace/case issues or missing output.
    if (!hasAnyActual && (hasAnyExpected || hasAnyInput)) {
      push("Схоже, програма нічого не виводить або вивід не потрапляє у stdout. Перевір, що є print/вивід у кінці.");
    }
    if (sampleExpected.trim() && sampleActual.trim()) {
      if (sampleExpected.trim().toLowerCase() === sampleActual.trim().toLowerCase() && sampleExpected.trim() !== sampleActual.trim()) {
        push("Перевір регістр у відповіді: інколи потрібно саме YES/NO у верхньому регістрі.");
      }
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      if (norm(sampleExpected) === norm(sampleActual) && sampleExpected.trim() !== sampleActual.trim()) {
        push("Ймовірно проблема у пробілах/переносах рядків. Порівняй формат виводу: зайві пробіли, \n в кінці, порожні рядки.");
      }
    }
    push("Перевір, що ти зчитуєш рівно те, що сказано у 'Вхідні дані' (кількість рядків/значень, порядок, пробіли)." );
    push("Перевір, що виводиш рівно те, що сказано у 'Вихідні дані' (без додаткового тексту, лише відповідь)." );

    // 4) If task expects two lines, remind gently.
    if (hasAnyInput || params.taskText) {
      if (/два\s+рядк|two\s+lines/i.test(String(params.taskText ?? ""))) {
        push("Умова згадує 2 рядки: переконайся, що ти зчитуєш обидва рядки повністю (включно з пробілами, якщо потрібно)." );
      }
    }

    return hints.slice(0, maxHints);
  };
  const systemPrompt = `Ти — наставник з алгоритмів та вводу/виводу. Твоя задача — дати КОРОТКІ підказки, чому рішення не проходить тести.

ФОРМАТ ПІДКАЗОК (hint ladder):
- Підказка #1 має бути найзагальніша (напрямок/ідея).
- Кожна наступна — трохи конкретніша, але без готового розв'язку.
- Не пиши код і не давай повний алгоритм.

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
        maxItems: maxHints
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

Дай до ${maxHints} коротких підказок у форматі "hint ladder" (кожна наступна конкретніша), що саме перевірити/виправити в логіці або I/O, щоб пройти тести.
Відповідай JSON у форматі {"hints": [..]}.
`.trim();
  try {
    const parsed = await provider.generateJSON<{
      hints: string[];
    }>(userPrompt, schema, systemPrompt, {
      temperature: 0.1
    });
    const hints = Array.isArray(parsed?.hints) ? parsed.hints : [];
    const cleaned = hints.map(h => String(h).trim()).filter(Boolean).slice(0, maxHints);
    // If AI returns no useful hints, fall back to deterministic hints.
    if (cleaned.length === 0) return buildFallbackHints();
    return cleaned;
  } catch {
    return buildFallbackHints();
  }
}