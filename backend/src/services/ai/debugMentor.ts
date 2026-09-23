/**
 * Multi-turn Socratic debugging mentor.
 *
 * Builds on the one-shot "explain my error": instead of a single explanation,
 * the student can have a back-and-forth where the mentor guides with questions.
 * Hard pedagogical contract (enforced in the prompt AND post-filtered):
 *  - guide with questions / confirm-or-deny hypotheses,
 *  - point at WHAT to inspect, never hand over a full/ready solution,
 *  - no code blocks in replies.
 *
 * Stateless on the server: the client replays the (bounded) transcript each
 * turn, so no session storage is needed.
 */
import { getLLMProvider } from "../llm/provider";
import { logger } from "../../utils/logger";
import { classifyErrorKind, type FailureCase, type HintLanguage } from "./failureHints";

export type DebugChatRole = "student" | "mentor";
export interface DebugChatMessage {
  role: DebugChatRole;
  content: string;
}

export interface DebugMentorContext {
  taskTitle: string;
  taskText: string;
  language: HintLanguage;
  code: string;
  verdict?: string;
  stderr?: string | null;
  failures?: FailureCase[];
}

export const DEBUG_CHAT_MAX_HISTORY = 12;
export const DEBUG_CHAT_MAX_MESSAGE_CHARS = 1500;

export const DEBUG_MENTOR_SYSTEM_PROMPT = `Ти — уважний наставник з програмування. Допомагай учневі зрозуміти помилку й поступово дійти до власного розв’язання.

ПРАВИЛА:
- Відповідай простою українською, коротко (2–4 речення), дружньо; задай одне посильне питання для наступного кроку.
- Спирайся на умову, приклади та фактичний ввід/очікуваний результат невдалого тесту. Порада має відповідати формату вводу й виводу задачі.
- Якщо умова допускає кілька форматів вводу, поясни підхід, який працює для всіх них; не радь зчитувати окремі рядки, якщо приклад містить кілька значень в одному рядку.
- Не давай повний код чи повне розв’язання задачі й не використовуй блоки коду. Але якщо учень прямо питає назву методу, функції чи оператора, назви її чітко; можна додати короткий приклад у рядку, який пояснює лише це поняття.
- Якщо учень каже «не знаю», повторно просить назву поняття або застряг після попередньої підказки, поясни потрібне поняття прямо й доступно — не продовжуй загадки та не відсилай шукати відповідь у документації чи перекладачі.
- Якщо потрібного поняття немає в наданій теорії, коротко навчи його тут і пов’яжи з конкретним кроком задачі.
- Якщо учень просить «просто дай код», ввічливо відмов у повному рішенні, але все одно допоможи з найближчим конкретним поняттям чи кроком.
- Не давай порад про стиль, іменування чи коментарі.`;

/** Remove fenced/large code blocks so a reply can never leak a ready solution. */
export function stripCodeFromMentorReply(text: string): string {
  let out = String(text ?? "");
  // Fenced code blocks → a gentle nudge instead of code.
  out = out.replace(/```[\s\S]*?```/g, " (код прибрано — спробуй сформулювати ідею словами) ");
  out = out.replace(/~~~[\s\S]*?~~~/g, " (код прибрано — спробуй сформулювати ідею словами) ");
  // Collapse any stray remaining triple backticks.
  out = out.replace(/```+/g, "`");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

function buildContextBlock(ctx: DebugMentorContext): string {
  const failures = (ctx.failures ?? []).slice(0, 2);
  const stderr = String(ctx.stderr ?? "").slice(0, 1200);
  const failuresBlock = failures.length
    ? failures
        .map((f, i) => {
          const id = f.testId !== undefined ? `#${f.testId}` : `#${i + 1}`;
          return [
            `Тест ${id}${f.verdict ? ` (${f.verdict})` : ""}`,
            `Вхід: ${JSON.stringify(String(f.input ?? "").slice(0, 300))}`,
            `Очікувалося: ${JSON.stringify(String(f.expected ?? "").slice(0, 300))}`,
            `Отримано: ${JSON.stringify(String(f.actual ?? "").slice(0, 300))}`,
          ].join("\n");
        })
        .join("\n\n")
    : "(немає невдалих тестів — ймовірно помилка компіляції/виконання)";

  return [
    `Завдання: ${ctx.taskTitle}`,
    `Умова (скорочено):\n${String(ctx.taskText || "").slice(0, 1200)}`,
    `Мова: ${ctx.language}`,
    `Вердикт: ${String(ctx.verdict || "(невідомо)")}`,
    `Код студента:\n${String(ctx.code || "").slice(0, 5000)}`,
    stderr ? `Повідомлення про помилку:\n${JSON.stringify(stderr)}` : "",
    `Невдалі тести:\n${failuresBlock}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function deterministicReply(ctx: DebugMentorContext, history: DebugChatMessage[]): string {
  const stderr = String(ctx.stderr ?? (ctx.failures ?? []).map(f => f.stderr || "").join("\n"));
  const kind = classifyErrorKind(String(ctx.verdict ?? ""), stderr);
  const opener = history.filter(m => m.role === "mentor").length === 0;
  switch (kind) {
    case "compile":
      return "Схоже на помилку компіляції. На який рядок вказує повідомлення компілятора, і що там може бути не так із дужками, типами чи крапкою з комою?";
    case "timeout":
      return "Програма не вкладається в час. Де в коді найбільше повторень — чи немає вкладених циклів, які можна звести до одного проходу? Як гадаєш, скільки операцій робить твій код на найбільшому вводі?";
    case "runtime":
      return "Програма падає під час виконання. Який саме тип помилки в повідомленні і на якому рядку? Що могло б призвести до виходу за межі чи звернення до неіснуючого значення?";
    default:
      return opener
        ? "Порівняй свій вивід з очікуваним на першому невдалому тесті: де саме вони починають різнитися — у значеннях, у форматі (пробіли/переноси) чи в порядку? З чого почнемо?"
        : "Добре. Звузимо пошук: на якому конкретному вхідному прикладі твій результат відрізняється від очікуваного, і яким ти очікував його побачити?";
  }
}

export async function debugMentorReply(params: {
  context: DebugMentorContext;
  history: DebugChatMessage[];
}): Promise<{ reply: string; source: "ai" | "deterministic" }> {
  const history = (params.history ?? []).slice(-DEBUG_CHAT_MAX_HISTORY);

  const transcript = history
    .map(m => `${m.role === "student" ? "Учень" : "Наставник"}: ${String(m.content ?? "").slice(0, DEBUG_CHAT_MAX_MESSAGE_CHARS)}`)
    .join("\n");

  const prompt = `${buildContextBlock(params.context)}

--- ДІАЛОГ ---
${transcript || "Учень: (ще нічого не написав)"}

Дай наступну коротку відповідь Наставника: підтверди/спростуй, вкажи, що перевірити, і постав одне навідне питання. Без готового коду.`;

  try {
    const provider = getLLMProvider();
    const raw = await provider.generateText(prompt, DEBUG_MENTOR_SYSTEM_PROMPT, { temperature: 0.3, maxTokens: 320 });
    const reply = stripCodeFromMentorReply(raw).slice(0, 1200).trim();
    if (reply) return { reply, source: "ai" };
  } catch (err: unknown) {
    logger.debug("[debugMentor] AI reply failed, using deterministic fallback", { error: err instanceof Error ? err.message : String(err) });
  }
  return { reply: deterministicReply(params.context, history), source: "deterministic" };
}
