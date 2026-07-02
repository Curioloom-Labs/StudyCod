import type { LanguageId } from "../languages/types";

export type ErrorKind =
  | "syntax"
  | "type"
  | "name"
  | "index"
  | "null"
  | "io"
  | "memory"
  | "timeout"
  | "runtime"
  | "compile"
  | "unknown";

export interface ExplainedError {
  kind: ErrorKind;
  title: string;
  tips?: string[];
  location?: {
    line?: number;
    column?: number;
  };
}

function toLines(s: string): string[] {
  return String(s ?? "").split(/\r?\n/);
}

function lastNonEmptyLine(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const v = lines[i]?.trim();
    if (v) return v;
  }
  return "";
}

function parseIntSafe(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function formatExplained(e: ExplainedError): string {
  const parts: string[] = [];
  const loc = e.location?.line ? ` (рядок ${e.location.line}${e.location.column ? ", колонка " + e.location.column : ""})` : "";
  parts.push(`${e.title}${loc}`);
  if (e.tips?.length) {
    parts.push("Поради:");
    for (const t of e.tips) parts.push(`- ${t}`);
  }
  return parts.join("\n").trim();
}

function explainPython(stderr: string): ExplainedError | null {
  const lines = toLines(stderr);
  const last = lastNonEmptyLine(lines);

  const fileLine = lines.find(l => /File\s+".*"\s*,\s*line\s+\d+/.test(l));
  const mFile = fileLine?.match(/line\s+(\d+)/);
  const lineNo = parseIntSafe(mFile?.[1]);

  if (/\bIndentationError\b/.test(last) || /\bTabError\b/.test(last)) {
    return {
      kind: "syntax",
      title: "Помилка відступів (IndentationError)",
      tips: ["Перевірте пробіли/таби на початку рядків", "Використовуйте один стиль відступів у всьому файлі (краще 4 пробіли)"] ,
      location: lineNo ? { line: lineNo } : undefined
    };
  }
  if (/\bSyntaxError\b/.test(last)) {
    return {
      kind: "syntax",
      title: "Синтаксична помилка (SyntaxError)",
      tips: ["Перевірте дужки, двокрапки після if/for/while/def", "Переконайтеся, що рядки в лапках закриті"] ,
      location: lineNo ? { line: lineNo } : undefined
    };
  }

  const exc = last.match(/^([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Warning))(?:\:\s*(.*))?$/);
  const excName = exc?.[1];

  if (!excName) return null;

  const msg = (exc?.[2] ?? "").trim();

  switch (excName) {
    case "NameError":
      return {
        kind: "name",
        title: "Невідома змінна/ім'я (NameError)",
        tips: ["Перевірте, чи змінна оголошена до використання", "Перевірте опечатки у назві змінної/функції"],
        location: lineNo ? { line: lineNo } : undefined
      };
    case "UnboundLocalError":
      return {
        kind: "name",
        title: "Змінна використана до присвоєння (UnboundLocalError)",
        tips: ["Переконайтеся, що гілка if завжди присвоює значення", "Ініціалізуйте змінну перед умовами/циклами"],
        location: lineNo ? { line: lineNo } : undefined
      };
    case "TypeError":
      return {
        kind: "type",
        title: "Помилка типів (TypeError)",
        tips: [msg ? `Підказка з повідомлення: ${msg}` : "Перевірте типи змінних та операції над ними", "Не змішуйте числа і рядки без перетворення (int/str)"]
      };
    case "ValueError":
      return {
        kind: "type",
        title: "Неправильне значення (ValueError)",
        tips: [msg ? `Підказка з повідомлення: ${msg}` : "Перевірте формат вводу та перетворення типів (int(), float())", "Переконайтеся, що читаєте саме те, що подається у тесті"]
      };
    case "IndexError":
      return {
        kind: "index",
        title: "Вихід за межі індексу (IndexError)",
        tips: ["Перевірте межі циклів і довжину списку/рядка", "Пам'ятайте: останній індекс = len(x) - 1"]
      };
    case "KeyError":
      return {
        kind: "index",
        title: "Немає ключа в словнику (KeyError)",
        tips: ["Перевірте, чи ключ точно існує", "Використовуйте dict.get(key, default) або перевірку `if key in d:`"]
      };
    case "ZeroDivisionError":
      return {
        kind: "runtime",
        title: "Ділення на нуль (ZeroDivisionError)",
        tips: ["Перевіряйте знаменник перед діленням", "Для цілих чисел пам'ятайте про випадки, коли значення може бути 0"]
      };
    case "RecursionError":
      return {
        kind: "runtime",
        title: "Занадто глибока рекурсія (RecursionError)",
        tips: ["Спробуйте ітеративний розв'язок", "Переконайтеся, що є базовий випадок і він досяжний"]
      };
    case "AttributeError":
      return {
        kind: "type",
        title: "Немає атрибуту/методу (AttributeError)",
        tips: [msg ? `Підказка з повідомлення: ${msg}` : "Перевірте, що змінна має потрібний тип", "Переконайтеся, що викликаєте метод на правильному об'єкті"]
      };
    default:
      return {
        kind: "runtime",
        title: `Помилка виконання (${excName})`,
        tips: msg ? [`Повідомлення: ${msg}`] : undefined,
        location: lineNo ? { line: lineNo } : undefined
      };
  }
}

function explainJava(stderr: string): ExplainedError | null {
  const lines = toLines(stderr);
  const joined = lines.join("\n");

  const m = joined.match(/Exception in thread "main" ([a-zA-Z0-9_$.]+)(?::\s*(.*))?/);
  const exc = m?.[1];
  const msg = (m?.[2] ?? "").trim();

  const locM = joined.match(/\((?:Main|Solution)\.java:(\d+)\)/);
  const lineNo = parseIntSafe(locM?.[1]);

  if (exc?.includes("NullPointerException")) {
    return {
      kind: "null",
      title: "NullPointerException: звернення до null",
      tips: ["Перевірте, чи об'єкт/масив ініціалізований перед використанням", "Додайте перевірку на null перед викликом методів"],
      location: lineNo ? { line: lineNo } : undefined
    };
  }
  if (exc?.includes("ArrayIndexOutOfBoundsException")) {
    return {
      kind: "index",
      title: "ArrayIndexOutOfBoundsException: вихід за межі масиву",
      tips: ["Перевірте межі циклу", "Останній індекс = length - 1"],
      location: lineNo ? { line: lineNo } : undefined
    };
  }
  if (exc?.includes("NumberFormatException")) {
    return {
      kind: "type",
      title: "NumberFormatException: не вдалося перетворити в число",
      tips: [msg ? `Підказка з повідомлення: ${msg}` : "Перевірте формат вводу", "Не парсіть порожній рядок / зайві символи"]
    };
  }
  if (exc?.includes("StackOverflowError")) {
    return {
      kind: "runtime",
      title: "StackOverflowError: переповнення стеку",
      tips: ["Ймовірно нескінченна/дуже глибока рекурсія", "Перевірте базовий випадок або перейдіть на ітерацію"]
    };
  }
  if (exc?.includes("OutOfMemoryError")) {
    return {
      kind: "memory",
      title: "OutOfMemoryError: не вистачило пам'яті",
      tips: ["Оптимізуйте структури даних", "Уникайте збереження всього вводу, якщо можна обробляти потоково"]
    };
  }

  const javacErr = lines.find(l => /\.java:\d+:\s+error:/.test(l));
  if (javacErr) {
    const lm = javacErr.match(/\.java:(\d+):\s+error:\s*(.*)$/);
    const lno = parseIntSafe(lm?.[1]);
    const emsg = (lm?.[2] ?? "").trim();
    return {
      kind: "compile",
      title: "Помилка компіляції Java",
      tips: [emsg ? `Компілятор каже: ${emsg}` : "Перевірте синтаксис і назви змінних/методів"],
      location: lno ? { line: lno } : undefined
    };
  }

  if (exc) {
    return {
      kind: "runtime",
      title: `Помилка виконання Java (${exc.split(".").pop()})`,
      tips: msg ? [`Повідомлення: ${msg}`] : undefined,
      location: lineNo ? { line: lineNo } : undefined
    };
  }

  return null;
}

function explainCpp(stderr: string): ExplainedError | null {
  const s = String(stderr ?? "");
  const lower = s.toLowerCase();

  if (lower.includes("segmentation fault") || lower.includes("sigsegv")) {
    return {
      kind: "runtime",
      title: "Segmentation fault (SIGSEGV): звернення до недійсної пам'яті",
      tips: ["Перевірте межі масивів/векторів", "Перевірте, що вказівники не null і вказують на валідні дані", "Не виходьте за розмір рядка/масиву"]
    };
  }
  if (lower.includes("stack smashing detected")) {
    return {
      kind: "runtime",
      title: "Stack smashing detected: пошкодження стеку",
      tips: ["Ймовірно запис за межі масиву", "Перевірте індекси та розміри буферів"]
    };
  }
  if (lower.includes("std::bad_alloc") || lower.includes("out of memory") || lower.includes("oom")) {
    return {
      kind: "memory",
      title: "Не вистачило пам'яті (bad_alloc)",
      tips: ["Зменшіть використання пам'яті", "Уникайте великих масивів на стеку — краще vector/heap", "Перевірте, чи немає нескінченного зростання структури"]
    };
  }
  if (lower.includes("floating point exception") || lower.includes("sigfpe")) {
    return {
      kind: "runtime",
      title: "Floating point exception (SIGFPE): некоректна арифметика",
      tips: ["Перевірте ділення на нуль", "Перевірте переповнення (особливо int) і використовуйте long long за потреби"]
    };
  }
  if (lower.includes("terminate called after throwing")) {
    const what = s.match(/what\(\):\s*(.*)/);
    return {
      kind: "runtime",
      title: "Невпійманий виняток (C++)",
      tips: [what?.[1] ? `what(): ${what[1]}` : "Перевірте місце, де кидається exception, або додайте try/catch (якщо доречно)"]
    };
  }

  const mErr = s.match(/^(.*):(\d+):(\d+):\s+error:\s+(.*)$/m);
  if (mErr) {
    return {
      kind: "compile",
      title: "Помилка компіляції C++",
      tips: [`Компілятор каже: ${mErr[4]}`],
      location: {
        line: parseIntSafe(mErr[2]),
        column: parseIntSafe(mErr[3])
      }
    };
  }

  return null;
}

export function explainStderr(language: LanguageId, stderr: string): ExplainedError | null {
  const s = String(stderr ?? "").trim();
  if (!s) return null;

  switch (language) {
    case "python":
      return explainPython(s);
    case "java":
      return explainJava(s);
    case "kotlin":
      return explainJava(s);
    case "cpp":
    case "c":
    // Native runtime signals (SIGSEGV/SIGFPE/OOM) are shared, so reuse the C++ explainer.
    case "rust":
    case "pascal":
    case "d":
    case "swift":
    case "haskell":
      return explainCpp(s);
    default:
      // csharp, js, go, dart, lisp, lua, perl, php, ruby — no bespoke explainer yet.
      return null;
  }
}

export function buildUserFacingStderr(language: LanguageId, stderr: string): { stderr: string; kind?: ErrorKind } {
  const cleaned = String(stderr ?? "").trim();
  if (!cleaned) return { stderr: "" };
  const explained = explainStderr(language, cleaned);
  if (!explained) return { stderr: cleaned };

  const header = formatExplained(explained);
  const merged = cleaned.startsWith(header) ? cleaned : `${header}\n\n---\n${cleaned}`;
  return {
    stderr: merged.trim(),
    kind: explained.kind
  };
}
