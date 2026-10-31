import React from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { tr } from "../../i18n";
import { MarkdownView } from "../../components/MarkdownView";
import { TaskGenerationGuidanceField } from "./TaskGenerationGuidanceField";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import type { TaskGenerationProfile } from "./taskGenerationSettings";

export type TaskAuthoringTab = "statement" | "code" | "theory" | "settings";
export type TaskAuthoringDraft = {
  title: string;
  description: string;
  template: string;
  maxAttempts: string;
  theory: string;
  projectSpecJson: string;
};

type TaskAuthoringFieldsProps = {
  idPrefix: string;
  topicId?: number;
  taskType: "PRACTICE" | "CONTROL";
  responseLanguage: "uk" | "en";
  value: TaskAuthoringDraft;
  onChange: (patch: Partial<TaskAuthoringDraft>) => void;
  generationGuidance: string;
  onGenerationGuidanceChange: (value: string) => void;
  generationProfile: TaskGenerationProfile;
  onGenerationProfileChange: (profile: TaskGenerationProfile) => void;
  guidanceEnabled: boolean;
  selectedTab: TaskAuthoringTab;
  onSelectedTabChange: (value: TaskAuthoringTab) => void;
  aiBusy: "condition" | "template" | "theory" | null;
  busy: boolean;
  onGenerateCondition: () => void;
  onGenerateTemplate: () => void;
  onGenerateTheory: () => void;
};

export const TaskAuthoringFields: React.FC<TaskAuthoringFieldsProps> = ({
  idPrefix,
  topicId,
  taskType,
  responseLanguage,
  value,
  onChange,
  generationGuidance,
  onGenerationGuidanceChange,
  generationProfile,
  onGenerationProfileChange,
  guidanceEnabled,
  selectedTab,
  onSelectedTabChange,
  aiBusy,
  busy,
  onGenerateCondition,
  onGenerateTemplate,
  onGenerateTheory,
}) => {
  const descriptionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const theoryRef = React.useRef<HTMLTextAreaElement | null>(null);
  const tabs: Array<{ id: TaskAuthoringTab; label: string }> = [
    { id: "statement", label: tr("Умова", "Statement") },
    { id: "code", label: tr("Стартовий код", "Starter code") },
    { id: "theory", label: tr("Теорія", "Theory") },
    { id: "settings", label: tr("Налаштування", "Settings") },
  ];
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  const templateId = `${idPrefix}-template`;
  const theoryId = `${idPrefix}-theory`;
  const attemptsId = `${idPrefix}-max-attempts`;
  const projectId = `${idPrefix}-project-spec`;
  const unansweredClarification = generationProfile.clarifyingQuestions.some((_, index) => !generationProfile.clarificationAnswers[index]?.trim());

  return (
    <>
      <label className="task-authoring__label" htmlFor={titleId}>{tr("Назва завдання", "Task title")}</label>
      <input id={titleId} name="taskTitle" required maxLength={512} value={value.title} onChange={event => { onChange({ title: event.target.value }); if (generationProfile.clarifyingQuestions.length) onGenerationProfileChange({ ...generationProfile, clarifyingQuestions: [], clarificationAnswers: [] }); }} placeholder={tr("Наприклад, Словник частот", "For example, Frequency map")} disabled={busy} className="task-authoring__title" />
      <TaskGenerationGuidanceField topicId={topicId} taskTitle={value.title} taskType={taskType} responseLanguage={responseLanguage} value={generationGuidance} onChange={onGenerationGuidanceChange} profile={generationProfile} onProfileChange={onGenerationProfileChange} busy={busy} enabled={guidanceEnabled} />
      <div className="classroom-tabs" role="tablist" aria-label={tr("Розділи редактора", "Editor sections")}>
        {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`${idPrefix}-tab-${tab.id}`} aria-selected={selectedTab === tab.id} aria-controls={`${idPrefix}-panel-${tab.id}`} onClick={() => onSelectedTabChange(tab.id)}>{tab.label}</button>)}
      </div>
      <div className="task-authoring__panel" role="tabpanel" id={`${idPrefix}-panel-${selectedTab}`} aria-labelledby={`${idPrefix}-tab-${selectedTab}`}>
        {selectedTab === "statement" && <>
          <div className="classroom-toolbar">
            <label className="task-authoring__label" htmlFor={descriptionId}>{tr("Що потрібно зробити учню", "What the student needs to do")}</label>
            <div className="flex flex-wrap items-center gap-2">
              <MarkdownImageInsertButton value={value.description} onChange={description => onChange({ description })} textareaRef={descriptionRef} className="classroom-text-button" />
              <button type="button" className="classroom-text-button" disabled={!!aiBusy || busy || !value.title.trim() || unansweredClarification} title={unansweredClarification ? tr("Відповідайте на уточнення, щоб умова не спиралася на вигадані правила.", "Answer the clarifications so the statement does not rely on invented rules.") : undefined} onClick={onGenerateCondition}><Sparkles className="size-4" aria-hidden="true" />{aiBusy === "condition" ? tr("Генеруємо…", "Generating…") : tr("Допомога AI", "AI assistance")}</button>
            </div>
          </div>
          <textarea ref={descriptionRef} id={descriptionId} name="taskDescription" value={value.description} onChange={event => onChange({ description: event.target.value })} placeholder={tr("Опишіть завдання, вхідні та вихідні дані, обмеження й приклади.", "Describe the problem, input, output, constraints, and examples.")} rows={13} disabled={busy} />
          <p className="classroom-caption">{tr("Підтримуються Markdown, приклади коду та математичні формули.", "Supports Markdown, code examples, and mathematical formulae.")}</p>
          {generationProfile.aiTrapEnabled && <p className="classroom-caption">{tr("Залишайте маркери STUDYCOD_AI_TRAP_START та STUDYCOD_AI_TRAP_END навколо фрази-пастки: генератор тестів виключає лише цей фрагмент.", "Keep the STUDYCOD_AI_TRAP_START and STUDYCOD_AI_TRAP_END markers around the trap phrase; test generation excludes only that fragment.")}</p>}
          <details className="task-authoring__preview"><summary>{tr("Переглянути як учень", "Preview as a student")}</summary><MarkdownView content={value.description || tr("Тут з’явиться умова завдання.", "The problem statement will appear here.")} /></details>
        </>}
        {selectedTab === "code" && <>
          <div className="classroom-toolbar">
            <label className="task-authoring__label" htmlFor={templateId}>{tr("Код, із якого учень почне розв’язання", "Code the student starts with")}</label>
            <button type="button" className="classroom-text-button" disabled={!!aiBusy || busy || !value.title.trim()} onClick={onGenerateTemplate}><Sparkles className="size-4" aria-hidden="true" />{aiBusy === "template" ? tr("Генеруємо…", "Generating…") : tr("Згенерувати", "Generate")}</button>
          </div>
          <textarea id={templateId} name="taskTemplate" value={value.template} onChange={event => onChange({ template: event.target.value })} rows={14} spellCheck={false} className="task-authoring__code" disabled={busy} />
          <p className="classroom-caption">{tr("Необов’язково. Можна залишити редактор учня порожнім.", "Optional. You can leave the student editor empty.")}</p>
        </>}
        {selectedTab === "theory" && <>
          <div className="classroom-toolbar">
            <label className="task-authoring__label" htmlFor={theoryId}>{tr("Пояснення перед практикою", "Explanation before practice")}</label>
            <div className="flex flex-wrap items-center gap-2">
              <MarkdownImageInsertButton value={value.theory} onChange={theory => onChange({ theory })} textareaRef={theoryRef} className="classroom-text-button" />
              <button type="button" className="classroom-text-button" disabled={!!aiBusy || busy || !value.description.trim()} onClick={onGenerateTheory}><BookOpen className="size-4" aria-hidden="true" />{aiBusy === "theory" ? tr("Генеруємо…", "Generating…") : tr("Допомога AI", "AI assistance")}</button>
            </div>
          </div>
          <textarea ref={theoryRef} id={theoryId} name="taskTheory" value={value.theory} onChange={event => onChange({ theory: event.target.value })} rows={13} placeholder={tr("Додайте поняття, приклад і підказки для самостійної роботи.", "Add concepts, an example, and guidance for independent work.")} disabled={busy} />
          <details className="task-authoring__preview"><summary>{tr("Переглянути теорію", "Preview theory")}</summary><MarkdownView content={value.theory || tr("Теорію ще не додано.", "No theory added yet.")} /></details>
        </>}
        {selectedTab === "settings" && <>
          <label className="task-authoring__label" htmlFor={attemptsId}>{tr("Максимальна кількість спроб", "Maximum attempts")}</label>
          <input id={attemptsId} name="maxAttempts" type="number" min="1" required value={value.maxAttempts} onChange={event => onChange({ maxAttempts: event.target.value })} className="task-authoring__attempts" disabled={busy} />
          <p className="classroom-caption">{tr("Скільки разів учень може надіслати розв’язання на перевірку.", "How many times a student can submit a solution for checking.")}</p>
          <details className="task-authoring__advanced" open={!!value.projectSpecJson}>
            <summary>{tr("Налаштування мініпроєкту", "Mini-project settings")}</summary>
            <p className="classroom-caption">{tr("Для завдань з етапами та окремими критеріями. Вставте наявну специфікацію проєкту у форматі JSON.", "For tasks with milestones and individual criteria. Paste an existing project specification in JSON format.")}</p>
            <label className="task-authoring__label" htmlFor={projectId}>{tr("Специфікація мініпроєкту JSON", "Mini project JSON specification")}</label>
            <textarea id={projectId} name="projectSpecJson" value={value.projectSpecJson} onChange={event => onChange({ projectSpecJson: event.target.value })} rows={9} spellCheck={false} className="task-authoring__code" disabled={busy} />
          </details>
        </>}
      </div>
    </>
  );
};
