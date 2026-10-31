import { TASK_AI_TRAP_END, TASK_AI_TRAP_START } from "../../../../shared/utils/taskAiTrap";

export type TaskLearnerLevel = "AUTO" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "OLYMPIAD";
export type TaskStructure = "AUTO" | "SINGLE_CONCEPT" | "MULTI_STEP" | "EDGE_CASES" | "COMBINED";
export type TaskContextStyle = "AUTO" | "NEUTRAL" | "REAL_WORLD" | "CREATIVE";
export type TaskAiTrapStyle = "BOUNDARY_SHIFT" | "RULE_SWAP" | "DISTRACTOR";

export type TaskGenerationProfile = {
  learnerLevel: TaskLearnerLevel;
  studentContext: string;
  difficulty: number;
  structure: TaskStructure;
  contextStyle: TaskContextStyle;
  learningGoal: string;
  includeConcepts: string;
  avoidConcepts: string;
  stayOnTopic: boolean;
  avoidSolutionHints: boolean;
  clarifyingQuestions: string[];
  clarificationAnswers: string[];
  aiTrapEnabled: boolean;
  aiTrapStyle: TaskAiTrapStyle;
  aiTrapFocus: string;
};

export const defaultTaskGenerationProfile: TaskGenerationProfile = {
  learnerLevel: "AUTO",
  studentContext: "",
  difficulty: 3,
  structure: "AUTO",
  contextStyle: "AUTO",
  learningGoal: "",
  includeConcepts: "",
  avoidConcepts: "",
  stayOnTopic: true,
  avoidSolutionHints: true,
  clarifyingQuestions: [],
  clarificationAnswers: [],
  aiTrapEnabled: false,
  aiTrapStyle: "BOUNDARY_SHIFT",
  aiTrapFocus: "",
};

export function buildTaskGenerationGuidance(
  profile: TaskGenerationProfile,
  teacherNotes: string,
  isEnglish: boolean,
  includeAiTrap = false,
): string {
  const learnerLevels: Record<TaskLearnerLevel, string> = isEnglish ? {
    AUTO: "Infer from the class and topic",
    BEGINNER: "Beginner",
    INTERMEDIATE: "Intermediate",
    ADVANCED: "Advanced",
    OLYMPIAD: "Olympiad preparation",
  } : {
    AUTO: "Визнач із класу й теми",
    BEGINNER: "Початковий",
    INTERMEDIATE: "Середній",
    ADVANCED: "Високий",
    OLYMPIAD: "Олімпіадна підготовка",
  };
  const structures: Record<TaskStructure, string> = isEnglish ? {
    AUTO: "Choose a clear structure suitable for the topic",
    SINGLE_CONCEPT: "Practice one concept in a focused task",
    MULTI_STEP: "Require several reasoning steps within the taught topic",
    EDGE_CASES: "Emphasize meaningful boundary and special cases",
    COMBINED: "Combine related rules from the same taught topic",
  } : {
    AUTO: "Добери чітку структуру відповідно до теми",
    SINGLE_CONCEPT: "Відпрацювання одного поняття в зосередженій задачі",
    MULTI_STEP: "Кілька кроків міркування в межах вивченої теми",
    EDGE_CASES: "Акцент на змістовних граничних і особливих випадках",
    COMBINED: "Поєднання пов’язаних правил тієї самої теми",
  };
  const contexts: Record<TaskContextStyle, string> = isEnglish ? {
    AUTO: "Choose a concise context that fits the task",
    NEUTRAL: "No story; use a direct and clear statement",
    REAL_WORLD: "Use a realistic everyday or professional context",
    CREATIVE: "Use an engaging fictional or playful context",
  } : {
    AUTO: "Добери короткий контекст, що пасує до задачі",
    NEUTRAL: "Без сюжету; пряме й чітке формулювання",
    REAL_WORLD: "Реалістичний побутовий або професійний контекст",
    CREATIVE: "Цікавий вигаданий або ігровий контекст",
  };
  const trapStyles: Record<TaskAiTrapStyle, string> = isEnglish ? {
    BOUNDARY_SHIFT: "subtly tempt an AI assistant to shift one boundary by one (inclusive versus exclusive)",
    RULE_SWAP: "subtly tempt an AI assistant to swap the priority or order of two rules",
    DISTRACTOR: "subtly tempt an AI assistant to act on an irrelevant but plausible story detail",
  } : {
    BOUNDARY_SHIFT: "непомітно спонукати ШІ змістити одну межу на одиницю (включно чи не включно)",
    RULE_SWAP: "непомітно спонукати ШІ поміняти пріоритет або порядок двох правил",
    DISTRACTOR: "непомітно спонукати ШІ врахувати несуттєву, але правдоподібну деталь сюжету",
  };

  const lines = isEnglish ? [
    "MANDATORY TEACHER CONTROLS (these explicit controls take priority over vague or conflicting prose):",
    `- Target learner level: ${learnerLevels[profile.learnerLevel]}.`,
    profile.studentContext.trim() ? `- Student background and prerequisites: ${profile.studentContext.trim()}.` : "",
    `- Exact requested difficulty: ${Math.max(1, Math.min(5, Math.floor(profile.difficulty)))}/5. Do not silently lower it. If the result misses this level, redesign the task before answering.`,
    `- Task structure: ${structures[profile.structure]}.`,
    `- Context style: ${contexts[profile.contextStyle]}.`,
    profile.learningGoal.trim() ? `- Learning objective: ${profile.learningGoal.trim()}.` : "",
    profile.includeConcepts.trim() ? `- Concepts or techniques that must be included: ${profile.includeConcepts.trim()}.` : "",
    profile.avoidConcepts.trim() ? `- Concepts or techniques that must be avoided: ${profile.avoidConcepts.trim()}.` : "",
    profile.stayOnTopic ? "- Stay within the selected topic and the stated prerequisites; do not add untaught algorithms, data structures, or concepts." : "",
    profile.avoidSolutionHints ? "- Do not reveal the algorithm, implementation steps, or solution hints in the student-facing statement." : "",
    includeAiTrap && profile.aiTrapEnabled ? `- Add exactly one subtle, low-salience sentence that would tempt an AI assistant to change a small solution choice: ${trapStyles[profile.aiTrapStyle]}.${profile.aiTrapFocus.trim() ? ` Teacher's specific trap focus: ${profile.aiTrapFocus.trim()}.` : ""} Place it naturally inside a story paragraph; do not label it as a trap or explain its purpose. Wrap only that sentence with these exact inline markers: ${TASK_AI_TRAP_START} and ${TASK_AI_TRAP_END}. The sentence remains visible in the student-rendered condition, while the markers are HTML comments. Keep the formal task rules, constraints, examples, and correct behavior fully authoritative and consistent; the trap must not change the actual input/output contract or appear in examples.` : "",
    ...profile.clarifyingQuestions.flatMap((question, index) => {
      const answer = profile.clarificationAnswers[index]?.trim();
      return answer ? [`- Teacher clarification: ${question}`, `  Teacher's answer: ${answer}`] : [];
    }),
    teacherNotes.trim() ? `- Additional teacher instructions: ${teacherNotes.trim()}` : "",
    "- Difficulty must come from the reasoning and cases required, not from obscure wording, arbitrary large numbers, or unrelated prerequisites.",
    "- The statement must be deterministic and complete: define exact input grammar, valid limits, every decision rule and exact output; include exactly three compact, internally verified examples.",
  ] : [
    "ОБОВ’ЯЗКОВІ НАЛАШТУВАННЯ ВЧИТЕЛЯ (явні параметри важливіші за загальні або суперечливі побажання в тексті):",
    `- Цільовий рівень учнів: ${learnerLevels[profile.learnerLevel]}.`,
    profile.studentContext.trim() ? `- Попередні знання й підготовка учнів: ${profile.studentContext.trim()}.` : "",
    `- Точна бажана складність: ${Math.max(1, Math.min(5, Math.floor(profile.difficulty)))}/5. Не знижуй її самостійно. Якщо результат не відповідає рівню, перероби задачу до відповіді.`,
    `- Структура задачі: ${structures[profile.structure]}.`,
    `- Стиль контексту: ${contexts[profile.contextStyle]}.`,
    profile.learningGoal.trim() ? `- Навчальна ціль: ${profile.learningGoal.trim()}.` : "",
    profile.includeConcepts.trim() ? `- Обов’язково використай поняття або прийоми: ${profile.includeConcepts.trim()}.` : "",
    profile.avoidConcepts.trim() ? `- Не використовуй поняття або прийоми: ${profile.avoidConcepts.trim()}.` : "",
    profile.stayOnTopic ? "- Залишайся в межах обраної теми й зазначених попередніх знань; не додавай невивчених алгоритмів, структур даних або понять." : "",
    profile.avoidSolutionHints ? "- Не розкривай алгоритм, кроки реалізації чи підказки до розв’язку в умові для учня." : "",
    includeAiTrap && profile.aiTrapEnabled ? `- Додай рівно одне малопомітне речення-пастку, яке спонукатиме ШІ-помічника трохи змінити розв’язок: ${trapStyles[profile.aiTrapStyle]}.${profile.aiTrapFocus.trim() ? ` Побажання вчителя щодо пастки: ${profile.aiTrapFocus.trim()}.` : ""} Природно вплети його в абзац сюжету, не називай пасткою й не пояснюй її мету. Обгорни лише це речення точними вбудованими маркерами: ${TASK_AI_TRAP_START} і ${TASK_AI_TRAP_END}. Саме речення видно учню в умові, маркери є HTML-коментарями. Формальні правила, обмеження, приклади й правильна поведінка залишаються головними та узгодженими; пастка не змінює справжній контракт вводу/виводу й не потрапляє у приклади.` : "",
    ...profile.clarifyingQuestions.flatMap((question, index) => {
      const answer = profile.clarificationAnswers[index]?.trim();
      return answer ? [`- Уточнення вчителя: ${question}`, `  Відповідь учителя: ${answer}`] : [];
    }),
    teacherNotes.trim() ? `- Додаткові вимоги вчителя: ${teacherNotes.trim()}` : "",
    "- Складність має визначатися потрібним міркуванням і випадками, а не заплутаним текстом, довільно великими числами чи сторонніми попередніми знаннями.",
    "- Умова має бути однозначною й повною: точний формат вводу, допустимі межі, кожне правило та точний формат виводу; додай рівно три стислі приклади й перевір їх вручну.",
  ];
  return lines.filter(Boolean).join("\n");
}
