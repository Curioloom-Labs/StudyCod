import { createHash } from "crypto";
import { z } from "zod";
import type { JudgeFile } from "./judgeWorker/types";

export const talentHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const talentJson = <T,>(value: unknown, fallback: T): T => {
  try { return typeof value === "string" ? JSON.parse(value) as T : value == null ? fallback : value as T; } catch { return fallback; }
};
export const interviewKitSchema = z.object({
  title: z.string().trim().min(3).max(160), kind: z.enum(["HR", "TECHNICAL"]),
  runtime: z.enum(["PYTHON", "JAVA", "CPP"]), durationMinutes: z.number().int().min(15).max(180),
  agenda: z.array(z.string().trim().min(3).max(240)).min(1).max(8),
  prompt: z.string().trim().max(8000), questions: z.array(z.string().trim().min(3).max(500)).max(8),
  files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(65536) })).min(1).max(16),
  tests: z.array(z.object({ input: z.string().max(4096), output: z.string().max(4096), hidden: z.boolean(), group: z.string().min(1).max(80) })).max(10),
  quiz: z.array(z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(3).max(500), options: z.array(z.string().trim().min(1).max(300)).min(2).max(5), correctIndex: z.number().int().min(0).max(4) })).max(8),
  rubric: z.array(z.string().trim().min(3).max(200)).min(2).max(6),
}).superRefine((kit, ctx) => {
  const paths = new Set<string>(); let bytes = 0;
  for (const file of kit.files) {
    if (!/^[A-Za-z0-9_.\-/]+$/.test(file.path) || file.path.startsWith("/") || file.path.split("/").some(part => !part || part === "." || part === "..") || paths.has(file.path)) ctx.addIssue({ code: "custom", message: "INVALID_FILE_PATH" });
    paths.add(file.path); bytes += Buffer.byteLength(file.content, "utf8");
    if (Buffer.byteLength(file.content, "utf8") > 65536) ctx.addIssue({ code: "custom", message: "FILE_TOO_LARGE" });
  }
  if (bytes > 262144) ctx.addIssue({ code: "custom", message: "FILES_TOO_LARGE" });
  if (kit.tests.reduce((sum, item) => sum + Buffer.byteLength(item.input, "utf8") + Buffer.byteLength(item.output, "utf8"), 0) > 32768) ctx.addIssue({ code: "custom", message: "TESTS_TOO_LARGE" });
  if (new Set(kit.quiz.map(question => question.id)).size !== kit.quiz.length || kit.quiz.some(question => question.correctIndex >= question.options.length)) ctx.addIssue({ code: "custom", message: "INVALID_QUIZ" });
});
export type InterviewKit = z.infer<typeof interviewKitSchema>;

export function publicInterviewKit(kit: InterviewKit) {
  const { tests, quiz, files: _files, ...rest } = kit;
  return { ...rest, examples: tests.filter(item => !item.hidden).map(({ input, output }) => ({ input, output })), quiz: quiz.map(({ correctIndex: _answer, ...question }) => question), testCount: tests.length };
}
export function gradeInterviewQuiz(kit: InterviewKit, answers: Record<string, number>) {
  if (Object.keys(answers).some(key => !kit.quiz.some(question => question.id === key)) || kit.quiz.some(question => !Number.isInteger(answers[question.id]) || answers[question.id] < 0 || answers[question.id] >= question.options.length)) return null;
  return { correct: kit.quiz.filter(question => answers[question.id] === question.correctIndex).length, total: kit.quiz.length };
}
export function interviewFiles(raw: unknown): JudgeFile[] | null {
  const parsed = interviewKitSchema.shape.files.safeParse(raw);
  if (!parsed.success) return null;
  const base = { ...BUILTIN_INTERVIEW_KITS[0].kit, files: parsed.data };
  const validated = interviewKitSchema.safeParse(base);
  return validated.success ? [...validated.data.files].sort((a, b) => a.path.localeCompare(b.path)) : null;
}
const rubric = ["Розуміння вимог / Understanding requirements", "Обґрунтування рішень / Reasoning", "Перевірка крайових випадків / Edge cases", "Співпраця та пояснення / Collaboration"];
const stub = (runtime: InterviewKit["runtime"]): JudgeFile[] => runtime === "PYTHON" ? [{ path: "main.py", content: "# Read input, normalize valid emails, print the result.\ndef main():\n    pass\n\nif __name__ == '__main__':\n    main()\n" }] : runtime === "JAVA" ? [{ path: "Main.java", content: "import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        // Read input, normalize valid emails, print the result.\n    }\n}\n" }] : [{ path: "main.cpp", content: "#include <iostream>\n#include <string>\n#include <set>\nint main() {\n    // Read input, normalize valid emails, print the result.\n    return 0;\n}\n" }];
export const BUILTIN_INTERVIEW_KITS: Array<{ id: string; kit: InterviewKit }> = [
  { id: "builtin:hr:v1", kit: { title: "Знайомство та досвід / Introduction", kind: "HR", runtime: "PYTHON", durationMinutes: 30, agenda: ["Знайомство та очікування / Introduction and expectations", "Приклади роботи та співпраці / Work and collaboration", "Питання кандидата / Candidate questions"], prompt: "Обговоріть досвід кандидата на конкретних прикладах. Кодова задача необов’язкова. / Discuss concrete examples from the candidate's experience. Coding is optional.", questions: ["Якою роботою ти пишаєшся і якою була твоя роль? / Which work are you proud of and what was your role?", "Розкажи про складну зміну вимог та як ви її узгодили. / Describe a difficult requirement change and how you agreed on it.", "Чого ти хочеш навчитися на наступній роботі? / What would you like to learn in your next role?"], files: [{ path: "main.py", content: "# Optional shared scratchpad\n" }], tests: [], quiz: [], rubric } },
  ...(["PYTHON", "JAVA", "CPP"] as const).map(runtime => ({ id: `builtin:normalize:${runtime}:v1`, kit: { title: `Нормалізація імпорту / Import normalization · ${runtime}`, kind: "TECHNICAL" as const, runtime, durationMinutes: 45, agenda: ["Уточнити контракт / Clarify requirements", "Реалізувати й перевірити / Implement and test", "Обговорити зміну вимоги / Discuss a requirement change", "Питання й зворотний зв’язок / Questions and feedback"], prompt: "Ввід: перший рядок — n (0..100), далі n email-рядків. Прибери пробіли на краях і переведи ASCII-літери у нижній регістр. Дійсний email містить рівно один @, непорожні частини до й після нього і не містить пробілів. Надрукуй унікальні дійсні адреси в лексикографічному порядку, по одній у рядку. Останній рядок — INVALID k, де k — кількість недійсних рядків. Дублікати дійсних адрес не є недійсними. Не потрібні мережа, файли чи встановлення залежностей. / Input: n (0..100), then n email lines. Trim surrounding spaces and lowercase ASCII letters. A valid address has exactly one @, nonempty sides and no internal whitespace. Print unique valid addresses in lexical order, then INVALID k for the number of invalid records. Valid duplicates are not invalid records. No network, files or dependencies.", questions: ["Які крайові випадки потрібно перевірити? / Which edge cases should we test?", "Як змінити рішення, щоб зберегти порядок першої появи адрес? / How would you preserve first-seen order instead?"], files: stub(runtime), tests: [{ input: "4\n ANA@EXAMPLE.COM \nana@example.com\nbad\nbob@example.com\n", output: "ana@example.com\nbob@example.com\nINVALID 1\n", hidden: false, group: "example" }, { input: "5\na@@b\n@x\na@\na b@c\n OK@D \n", output: "ok@d\nINVALID 4\n", hidden: true, group: "validation" }, { input: "0\n", output: "INVALID 0\n", hidden: true, group: "empty" }], quiz: [{ id: "idempotence", text: "Повторний імпорт тих самих адрес не має створювати дублікати. Яку властивість перевіряємо? / Repeating the import should not add duplicates. Which property is this?", options: ["Ідемпотентність / Idempotence", "Рекурсія / Recursion", "Паралельність / Parallelism"], correctIndex: 0 }, { id: "regression", text: "Після зміни правила сортування що слід перевірити? / After changing sorting, what should be checked?", options: ["Лише новий приклад / Only the new example", "Нову поведінку та старі незмінені вимоги / New behavior and unchanged earlier requirements", "Лише швидкість / Only speed"], correctIndex: 1 }], rubric } })),
];
