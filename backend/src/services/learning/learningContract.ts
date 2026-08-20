/**
 * Versioned learning contract shared by curriculum sync, task generation and
 * project readiness.  Keeping this data deterministic is intentional: an AI
 * model may phrase a task, but it must not decide which learning stage the
 * learner is in or silently remove the evidence required for that stage.
 */

export type PracticeStage = "FOUNDATION" | "EDGE_CASES" | "TRANSFER";

export type PracticeEvidence = {
  id: string;
  label: string;
  description: string;
};

export type PracticeContract = {
  version: 2;
  stage: PracticeStage;
  objective: string;
  taskIntent: string;
  evidence: PracticeEvidence[];
  minimumExamples: number;
  forbiddenShortcuts: string[];
};

export type ProjectAssessmentMode = "EXACT_IO" | "WEB_BEHAVIOR" | "STATIC_REVIEW";

export type ProjectAssessmentContract = {
  version: 2;
  mode: ProjectAssessmentMode;
  requiredEvidence: PracticeEvidence[];
  checkBeforeSubmit: boolean;
};

function normalized(value: string, fallback: string): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

export function practiceStageFor(sequence: number, total: number): PracticeStage {
  if (total <= 1 || sequence <= 1) return "FOUNDATION";
  if (sequence >= total) return "TRANSFER";
  return "EDGE_CASES";
}

export function buildPracticeContract(input: {
  courseKey: string;
  topicKey: string;
  topicTitle: string;
  topicDescription?: string;
  exerciseFocus?: string;
  sequence: number;
  total: number;
}): PracticeContract {
  const stage = practiceStageFor(input.sequence, input.total);
  const topic = normalized(input.topicTitle, "поточну тему");
  const objective = normalized(
    input.exerciseFocus || input.topicDescription || "Закріпити ключову навичку теми через код.",
    `Закріпити навичку теми «${topic}».`,
  );

  if (stage === "FOUNDATION") {
    return {
      version: 2,
      stage,
      objective,
      taskIntent: `Реалізуйте базовий сценарій за темою «${topic}» із чітким вводом, обробкою та результатом. Спочатку доведіть, що основний випадок працює, а потім поясніть ключове рішення.`,
      evidence: [
        { id: "happy-path", label: "Основний сценарій", description: "Рішення працює на типовому валідному прикладі." },
        { id: "explanation", label: "Пояснення рішення", description: "Учень може пояснити роль основних конструкцій у коді." },
      ],
      minimumExamples: 3,
      forbiddenShortcuts: ["Не підставляйте очікуваний результат константою.", "Не копіюйте готове рішення без пояснення."],
    };
  }

  if (stage === "EDGE_CASES") {
    return {
      version: 2,
      stage,
      objective,
      taskIntent: `Розширте рішення за темою «${topic}» граничними, порожніми та помилковими даними. Перевірте, що програма не ламається і зберігає визначений контракт.`,
      evidence: [
        { id: "edge-cases", label: "Граничні випадки", description: "Рішення обробляє мінімальні, порожні або повторні дані." },
        { id: "invalid-input", label: "Помилкові дані", description: "Некоректний сценарій має контрольовану поведінку." },
        { id: "regression", label: "Регресійна перевірка", description: "Після додавання перевірок основний сценарій не зламаний." },
      ],
      minimumExamples: 5,
      forbiddenShortcuts: ["Не видаляйте обробку помилок заради проходження основного прикладу.", "Не використовуйте один і той самий приклад для всіх перевірок."],
    };
  }

  return {
    version: 2,
    stage,
    objective,
    taskIntent: `Застосуйте навичку «${topic}» у новому контексті: спроєктуйте невелике рішення, обґрунтуйте структуру та покажіть, як воно взаємодіє з іншими вивченими конструкціями.`,
    evidence: [
      { id: "transfer", label: "Новий контекст", description: "Рішення переносить навичку на сценарій, якого не було в теорії." },
      { id: "design-choice", label: "Проєктне рішення", description: "Є свідомо обране розбиття на кроки, функції або модулі." },
      { id: "verification", label: "Самоперевірка", description: "Учень додає власні перевірки та описує відоме обмеження." },
    ],
    minimumExamples: 4,
    forbiddenShortcuts: ["Не зводьте задачу до копіювання прикладу з теорії.", "Не вважайте компіляцію або запуск доказом коректності."],
  };
}

export function projectAssessmentContract(input: {
  hasAuthoredTests: boolean;
  hasWebHarness: boolean;
  milestones: Array<{ id: string; title: string; description: string }>;
}): ProjectAssessmentContract {
  const mode: ProjectAssessmentMode = input.hasWebHarness
    ? "WEB_BEHAVIOR"
    : input.hasAuthoredTests
      ? "EXACT_IO"
      : "STATIC_REVIEW";
  const requiredEvidence = input.milestones.slice(0, 6).map((milestone) => ({
    id: String(milestone.id),
    label: String(milestone.title),
    description: String(milestone.description),
  }));
  return { version: 2, mode, requiredEvidence, checkBeforeSubmit: mode !== "STATIC_REVIEW" };
}

