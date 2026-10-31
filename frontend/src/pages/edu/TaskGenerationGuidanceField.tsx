import React from "react";
import { Sparkles } from "lucide-react";
import { api } from "../../lib/api/client";
import { getEduErrorMessage } from "../../lib/eduError";
import { tr } from "../../i18n";
import { defaultTaskGenerationProfile, type TaskGenerationProfile } from "./taskGenerationSettings";

type TaskGenerationGuidanceFieldProps = {
  topicId?: number;
  taskTitle: string;
  taskType: "PRACTICE" | "CONTROL";
  responseLanguage: "uk" | "en";
  value: string;
  onChange: (value: string) => void;
  profile: TaskGenerationProfile;
  onProfileChange: (profile: TaskGenerationProfile) => void;
  busy: boolean;
  enabled: boolean;
};

type SuggestionStatus = "idle" | "waiting" | "loading" | "ready" | "edited" | "failed";

export const TaskGenerationGuidanceField: React.FC<TaskGenerationGuidanceFieldProps> = ({
  topicId,
  taskTitle,
  taskType,
  responseLanguage,
  value,
  onChange,
  profile,
  onProfileChange,
  busy,
  enabled,
}) => {
  const [status, setStatus] = React.useState<SuggestionStatus>("idle");
  const [retryKey, setRetryKey] = React.useState(0);
  const [error, setError] = React.useState("");
  const teacherEditedRef = React.useRef(false);
  const forceGenerationRef = React.useRef(false);
  const requestRef = React.useRef<AbortController | null>(null);
  const onChangeRef = React.useRef(onChange);
  const onProfileChangeRef = React.useRef(onProfileChange);
  onChangeRef.current = onChange;
  onProfileChangeRef.current = onProfileChange;

  React.useEffect(() => {
    const title = taskTitle.trim();
    if (!enabled || !topicId || !title) {
      setStatus("idle");
      return;
    }
    if (teacherEditedRef.current && !forceGenerationRef.current) {
      setStatus("edited");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    const generateImmediately = forceGenerationRef.current;
    forceGenerationRef.current = false;
    setError("");
    setStatus(generateImmediately ? "loading" : "waiting");

    const generate = async () => {
      setStatus("loading");
      try {
        const response = await api.post(`/topics/${topicId}/tasks/generate-guidance`, {
          taskTitle: title,
          taskType,
          responseLanguage,
        }, { signal: controller.signal });
        if (controller.signal.aborted || teacherEditedRef.current) return;
        const guidance = String(response.data?.guidance ?? "").trim();
        if (!guidance) throw new Error("EMPTY_GUIDANCE");
        onChangeRef.current(guidance);
        const suggested = response.data?.settings as Partial<TaskGenerationProfile> | undefined;
        if (suggested && typeof suggested === "object") {
          const clarifyingQuestions = Array.isArray(response.data?.clarifyingQuestions)
            ? response.data.clarifyingQuestions.filter((question: unknown): question is string => typeof question === "string" && Boolean(question.trim())).slice(0, 3)
            : [];
          const learnerLevels: TaskGenerationProfile["learnerLevel"][] = ["AUTO", "BEGINNER", "INTERMEDIATE", "ADVANCED", "OLYMPIAD"];
          const structures: TaskGenerationProfile["structure"][] = ["AUTO", "SINGLE_CONCEPT", "MULTI_STEP", "EDGE_CASES", "COMBINED"];
          const contexts: TaskGenerationProfile["contextStyle"][] = ["AUTO", "NEUTRAL", "REAL_WORLD", "CREATIVE"];
          onProfileChangeRef.current({
            learnerLevel: learnerLevels.includes(suggested.learnerLevel as TaskGenerationProfile["learnerLevel"]) ? suggested.learnerLevel as TaskGenerationProfile["learnerLevel"] : defaultTaskGenerationProfile.learnerLevel,
            studentContext: typeof suggested.studentContext === "string" ? suggested.studentContext.slice(0, 240) : "",
            difficulty: Math.max(1, Math.min(5, Number(suggested.difficulty) || defaultTaskGenerationProfile.difficulty)),
            structure: structures.includes(suggested.structure as TaskGenerationProfile["structure"]) ? suggested.structure as TaskGenerationProfile["structure"] : defaultTaskGenerationProfile.structure,
            contextStyle: contexts.includes(suggested.contextStyle as TaskGenerationProfile["contextStyle"]) ? suggested.contextStyle as TaskGenerationProfile["contextStyle"] : defaultTaskGenerationProfile.contextStyle,
            learningGoal: typeof suggested.learningGoal === "string" ? suggested.learningGoal.slice(0, 240) : "",
            includeConcepts: typeof suggested.includeConcepts === "string" ? suggested.includeConcepts.slice(0, 240) : "",
            avoidConcepts: typeof suggested.avoidConcepts === "string" ? suggested.avoidConcepts.slice(0, 240) : "",
            stayOnTopic: typeof suggested.stayOnTopic === "boolean" ? suggested.stayOnTopic : defaultTaskGenerationProfile.stayOnTopic,
            avoidSolutionHints: typeof suggested.avoidSolutionHints === "boolean" ? suggested.avoidSolutionHints : defaultTaskGenerationProfile.avoidSolutionHints,
            clarifyingQuestions,
            clarificationAnswers: clarifyingQuestions.map(() => ""),
            aiTrapEnabled: profile.aiTrapEnabled,
            aiTrapStyle: profile.aiTrapStyle,
            aiTrapFocus: profile.aiTrapFocus,
          });
        }
        setStatus("ready");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(getEduErrorMessage(caught, tr("Не вдалося запропонувати налаштування. Спробуйте ще раз.", "Could not suggest settings. Try again.")));
        setStatus("failed");
      }
    };

    const timer = setTimeout(() => { void generate(); }, generateImmediately ? 0 : 850);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [enabled, topicId, taskTitle, taskType, responseLanguage, retryKey]);

  const requestAgain = () => {
    teacherEditedRef.current = false;
    forceGenerationRef.current = true;
    requestRef.current?.abort();
    setRetryKey((value) => value + 1);
  };

  const handleChange = (nextValue: string) => {
    teacherEditedRef.current = true;
    requestRef.current?.abort();
    onChange(nextValue);
    setStatus("edited");
    setError("");
  };

  const handleProfileChange = (patch: Partial<TaskGenerationProfile>) => {
    teacherEditedRef.current = true;
    requestRef.current?.abort();
    onProfileChange({ ...profile, ...patch });
    setStatus("edited");
    setError("");
  };

  if (!enabled) return null;

  const fieldId = `task-generation-guidance-${taskType.toLowerCase()}`;
  const statusText = status === "waiting"
    ? tr("ШІ підготує пропозицію за назвою…", "AI will suggest settings from the title…")
    : status === "loading"
      ? tr("ШІ підбирає налаштування…", "AI is suggesting settings…")
      : status === "ready"
        ? tr("Готово. Перегляньте й відкоригуйте пропозицію.", "Ready. Review and adjust the suggestion.")
        : status === "edited"
          ? tr("Ваші зміни збережені. За потреби можна запросити нову пропозицію.", "Your edits are kept. Request a new suggestion if needed.")
          : "";

  const difficultyLabels = [
    tr("Початкова", "Introductory"),
    tr("Легка", "Easy"),
    tr("Середня", "Intermediate"),
    tr("Складна", "Hard"),
    tr("Дуже складна", "Very hard"),
  ];

  return (
    <section className="mb-6 rounded-2xl border border-border/10 bg-white/60 p-4 dark:border-white/10 dark:bg-black/10" aria-label={tr("Налаштування генератора", "Generator settings")}>
      <div className="classroom-toolbar">
        <div><label className="task-authoring__label" htmlFor={`${fieldId}-difficulty`}>{tr("Керування генерацією", "Generation controls")}</label><p className="classroom-caption">{tr("ШІ запропонує налаштування за назвою. Змініть рівень, складність і стиль простими перемикачами.", "AI suggests settings from the title. Adjust learner level, difficulty, and style with simple controls.")}</p></div>
        {taskTitle.trim() && <button type="button" className="classroom-text-button" onClick={requestAgain} disabled={status === "loading"}>
          <Sparkles className="size-4" aria-hidden="true" />
          {status === "failed" ? tr("Спробувати ще раз", "Try again") : tr("Запропонувати знову", "Suggest again")}
        </button>}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">{tr("Рівень учнів", "Learner level")}<select aria-label={tr("Рівень учнів", "Learner level")} value={profile.learnerLevel} onChange={event => handleProfileChange({ learnerLevel: event.target.value as TaskGenerationProfile["learnerLevel"] })} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code"><option value="AUTO">{tr("Підібрати за класом і темою", "Infer from class and topic")}</option><option value="BEGINNER">{tr("Початківець", "Beginner")}</option><option value="INTERMEDIATE">{tr("Має базові знання", "Has the basics")}</option><option value="ADVANCED">{tr("Впевнений рівень", "Confident")}</option><option value="OLYMPIAD">{tr("Олімпіадний рівень", "Olympiad level")}</option></select></label>
        <label className="text-xs font-bold" htmlFor={`${fieldId}-difficulty`}>{tr("Складність задачі", "Task difficulty")}<span className="ml-2 font-semibold text-primary-strong dark:text-primary-soft">{profile.difficulty}/5 · {difficultyLabels[Math.max(1, Math.min(5, profile.difficulty)) - 1]}</span><input id={`${fieldId}-difficulty`} aria-label={tr("Складність задачі", "Task difficulty")} type="range" min="1" max="5" step="1" value={profile.difficulty} onChange={event => handleProfileChange({ difficulty: Number(event.target.value) })} disabled={busy} className="mt-2 block w-full accent-primary" /><span className="mt-1 flex justify-between text-[10px] font-normal text-text-muted dark:text-text-secondary"><span>{tr("Базова", "Basic")}</span><span>{tr("Дуже складна", "Very hard")}</span></span></label>
        <label className="text-xs font-bold">{tr("Будова задачі", "Task structure")}<select aria-label={tr("Будова задачі", "Task structure")} value={profile.structure} onChange={event => handleProfileChange({ structure: event.target.value as TaskGenerationProfile["structure"] })} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code"><option value="AUTO">{tr("Підібрати автоматично", "Choose automatically")}</option><option value="SINGLE_CONCEPT">{tr("Одне поняття", "One concept")}</option><option value="MULTI_STEP">{tr("Кілька кроків міркування", "Several reasoning steps")}</option><option value="EDGE_CASES">{tr("Граничні випадки", "Boundary cases")}</option><option value="COMBINED">{tr("Поєднати правила теми", "Combine topic rules")}</option></select></label>
        <label className="text-xs font-bold">{tr("Контекст і сюжет", "Context and story")}<select aria-label={tr("Контекст задачі", "Task context")} value={profile.contextStyle} onChange={event => handleProfileChange({ contextStyle: event.target.value as TaskGenerationProfile["contextStyle"] })} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code"><option value="AUTO">{tr("Підібрати автоматично", "Choose automatically")}</option><option value="NEUTRAL">{tr("Без сюжету, прямо й коротко", "No story, direct and concise")}</option><option value="REAL_WORLD">{tr("Реалістична ситуація", "Realistic situation")}</option><option value="CREATIVE">{tr("Творчий або ігровий сюжет", "Creative or playful story")}</option></select></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">{tr("Клас і що учні вже знають", "Class and prior knowledge")}<input value={profile.studentContext} onChange={event => handleProfileChange({ studentContext: event.target.value })} maxLength={240} placeholder={tr("Наприклад: 8 клас, знають цикли, ще не вчили списки", "For example: grade 8; knows loops, has not learned lists")} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
        <label className="text-xs font-bold">{tr("Що учень має потренувати", "What the student should practice")}<input value={profile.learningGoal} onChange={event => handleProfileChange({ learningGoal: event.target.value })} maxLength={240} placeholder={tr("Наприклад: обґрунтувати вибір граничної умови", "For example: justify the boundary condition")} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
        <label className="text-xs font-bold">{tr("Обов’язково використати", "Must include")}<input value={profile.includeConcepts} onChange={event => handleProfileChange({ includeConcepts: event.target.value })} maxLength={240} placeholder={tr("Наприклад: цикл і підрахунок кількості", "For example: a loop and counting occurrences")} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
        <label className="text-xs font-bold">{tr("Не використовувати", "Avoid using")}<input value={profile.avoidConcepts} onChange={event => handleProfileChange({ avoidConcepts: event.target.value })} maxLength={240} placeholder={tr("Наприклад: масиви, функції або готові алгоритми", "For example: arrays, functions, or built-in algorithms")} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
      </div>
      {profile.clarifyingQuestions.length > 0 && <div className="mt-3 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3 dark:bg-primary/10">
        <div><p className="text-xs font-bold">{tr("Потрібні уточнення", "A few details are needed")}</p><p className="classroom-caption mt-1">{tr("Щоб не вигадувати важливі правила задачі, відповідайте на ці запитання перед генерацією умови.", "Answer these before generating so the task does not rely on invented rules.")}</p></div>
        {profile.clarifyingQuestions.map((question, index) => <label key={`${index}-${question}`} className="block text-xs font-semibold">{question}<textarea value={profile.clarificationAnswers[index] ?? ""} onChange={event => handleProfileChange({ clarificationAnswers: profile.clarifyingQuestions.map((_, answerIndex) => answerIndex === index ? event.target.value : profile.clarificationAnswers[answerIndex] ?? "") })} rows={2} maxLength={600} disabled={busy} placeholder={tr("Ваша відповідь…", "Your answer…")} className="mt-1 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-2 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>)}
      </div>}
      <div className="mt-4 rounded-xl border border-border/10 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[.025]">
        <label className="flex items-start gap-2 text-xs font-bold"><input type="checkbox" checked={profile.aiTrapEnabled} onChange={event => handleProfileChange({ aiTrapEnabled: event.target.checked })} disabled={busy} className="mt-0.5 size-4 accent-primary" />{tr("Додати малопомітну пастку для ШІ", "Add a subtle AI trap")}</label>
        <p className="classroom-caption mt-1 pl-6">{tr("В умові з’явиться непомітна фраза, яка може схилити ШІ до трохи іншого розв’язку. Тести генеруються без цього фрагмента.", "The statement will contain a subtle phrase that may nudge AI toward a slightly different solution. Tests are generated without this fragment.")}</p>
        {profile.aiTrapEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">{tr("Тип пастки", "Trap style")}<select value={profile.aiTrapStyle} onChange={event => handleProfileChange({ aiTrapStyle: event.target.value as TaskGenerationProfile["aiTrapStyle"] })} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code"><option value="BOUNDARY_SHIFT">{tr("Зсув межі на 1", "Shift a boundary by 1")}</option><option value="RULE_SWAP">{tr("Зміна пріоритету правил", "Swap rule priority")}</option><option value="DISTRACTOR">{tr("Відволікальна деталь", "Distracting detail")}</option></select></label>
          <label className="text-xs font-bold">{tr("Що має змінити ШІ? (необов’язково)", "What should AI be nudged to change? (optional)")}<input value={profile.aiTrapFocus} onChange={event => handleProfileChange({ aiTrapFocus: event.target.value })} maxLength={240} placeholder={tr("Наприклад: трактування рівності порогу", "For example: how equality at a threshold is handled")} disabled={busy} className="mt-1 w-full rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-normal dark:border-white/10 dark:bg-bg-code" /></label>
        </div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <label className="flex items-start gap-2"><input type="checkbox" checked={profile.stayOnTopic} onChange={event => handleProfileChange({ stayOnTopic: event.target.checked })} disabled={busy} className="mt-0.5 size-4 accent-primary" />{tr("Тільки вивчена тема й зазначені знання", "Only taught topic and stated prerequisites")}</label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={profile.avoidSolutionHints} onChange={event => handleProfileChange({ avoidSolutionHints: event.target.checked })} disabled={busy} className="mt-0.5 size-4 accent-primary" />{tr("Не показувати підказки до розв’язку", "Do not reveal solution hints")}</label>
      </div>
      <p className="classroom-caption mt-2">{tr("Повзунок задає точний бажаний рівень складності. Решта параметрів пояснює генератору, як саме його досягти.", "The slider sets the exact requested difficulty. Other controls explain how the task should reach it.")}</p>
      <details className="mt-3 rounded-xl border border-border/10 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[.025]">
        <summary className="cursor-pointer text-xs font-bold">{tr("Рекомендація ШІ та додаткові побажання", "AI recommendation and extra instructions")}</summary>
        <p className="classroom-caption mt-2" aria-live="polite">{error || statusText || tr("Після введення назви ШІ автоматично запропонує ціль, важливі поняття й правила для тестів. Ви можете змінити текст тут.", "After you enter the title, AI suggests a goal, relevant concepts, and test requirements. You can edit the text here.")}</p>
        <textarea id={fieldId} name="generationGuidance" value={value} onChange={event => handleChange(event.target.value)} rows={4} maxLength={4000} placeholder={tr("Додайте будь-які додаткові вимоги до задачі.", "Add any other requirements for the task.")} disabled={busy} className="mt-2 w-full resize-y rounded-xl border border-border/10 bg-white px-3 py-3 text-sm font-normal leading-6 dark:border-white/10 dark:bg-bg-code" />
      </details>
    </section>
  );
};
