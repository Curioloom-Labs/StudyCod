import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { createLesson, generateTheoryPreview, generateInteractiveLesson, getClasses, type CreateLessonRequest } from "../../lib/api/edu";
import { ArrowLeft, Sparkles } from "lucide-react";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { LessonBlocksEditor } from "../../components/lesson/LessonBlocksEditor";
import { normalizeInteractiveLesson, type InteractiveLesson } from "../../lib/lessonBlocks";

const EMPTY_LESSON: InteractiveLesson = { objectives: [], sections: [{ heading: "", blocks: [] }], summary: [] };
export const CreateLessonPage: React.FC = () => {
  const {
    i18n
  } = useTranslation();
  const {
    classId
  } = useParams<{
    classId: string;
  }>();
  const navigate = useNavigate();
  const [type, setType] = useState<"LESSON" | "CONTROL">("LESSON");
  const [title, setTitle] = useState("");
  const [theory, setTheory] = useState("");
  const [hasTheory, setHasTheory] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | undefined>();
  const [controlHasTheory, setControlHasTheory] = useState(false);
  const [controlHasPractice, setControlHasPractice] = useState(true);
  const [generatingTheory, setGeneratingTheory] = useState(false);
  const [theoryMode, setTheoryMode] = useState<"markdown" | "interactive">("markdown");
  const [lessonBlocks, setLessonBlocks] = useState<InteractiveLesson>(EMPTY_LESSON);
  const [generatingInteractive, setGeneratingInteractive] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [language, setLanguage] = useState<"JAVA" | "PYTHON" | "CPP">("JAVA");
  const safeServerMessage = (value: unknown) => {
    const msg = typeof value === "string" ? value : String(value ?? "");
    if (typeof i18n.language === "string" && i18n.language.startsWith("en") && /[А-Яа-яІіЇїЄєҐґ]/.test(msg)) return "";
    return msg;
  };
  useEffect(() => {
    const loadClassInfo = async () => {
      if (!classId) return;
      try {
        const classes = await getClasses();
        const classData = classes.find(c => c.id === parseInt(classId, 10));
        if (classData && (classData.language === "JAVA" || classData.language === "PYTHON" || classData.language === "CPP")) {
          setLanguage(classData.language);
        }
      } catch (error) {
        console.error("Failed to load class info:", error);
      }
    };
    loadClassInfo();
  }, [classId]);
  const handleSubmit = async () => {
    if (!classId || !title.trim()) {
      showToast({ type: "error", message: tr("Заповніть назву уроку", "Enter a lesson title") });
      return;
    }
    if (type === "CONTROL" && !controlHasTheory && !controlHasPractice) {
      showToast({ type: "error", message: tr("Хоча б одна частина контрольної повинна бути включена", "At least one control work section must be enabled") });
      return;
    }
    try {
      const lessonData: CreateLessonRequest = {
        type,
        title,
        theory: hasTheory ? theory : undefined,
        hasTheory,
        timeLimitMinutes,
        controlHasTheory,
        controlHasPractice
      };
      const newLesson = await createLesson(parseInt(classId, 10), lessonData);
      navigate(`/edu/lessons/${newLesson.id}`);
    } catch (error: unknown) {
      console.error("Failed to create lesson:", error);
      const raw = safeServerMessage(getErrorMessageFromUnknown(error, ""));
      showToast({ type: "error", message: raw || tr("Не вдалося створити урок", "Failed to create lesson") });
    }
  };
  const handleGenerateTheory = async () => {
    if (!topicTitle.trim()) {
      showToast({ type: "error", message: tr("Введіть назву теми", "Enter a topic name") });
      return;
    }
    setGeneratingTheory(true);
    try {
      const result = await generateTheoryPreview(topicTitle, language);
      setTheory(result.theory);
      setHasTheory(true);
    } catch (error: unknown) {
      console.error("Failed to generate theory:", error);
      const raw = safeServerMessage(getErrorMessageFromUnknown(error, ""));
      showToast({ type: "error", message: raw || tr("Не вдалося згенерувати теорію", "Failed to generate theory") });
    } finally {
      setGeneratingTheory(false);
    }
  };
  const handleGenerateInteractive = async () => {
    if (!topicTitle.trim()) {
      showToast({ type: "error", message: tr("Введіть назву теми", "Enter a topic name") });
      return;
    }
    setGeneratingInteractive(true);
    try {
      const { lesson } = await generateInteractiveLesson(topicTitle, language);
      const normalized = normalizeInteractiveLesson(lesson);
      if (!normalized) throw new Error("INVALID_LESSON");
      setLessonBlocks(normalized);
      setTheory(JSON.stringify(normalized));
      showToast({ type: "success", message: tr("Урок згенеровано", "Lesson generated") });
    } catch (error: unknown) {
      const raw = safeServerMessage(getErrorMessageFromUnknown(error, ""));
      showToast({ type: "error", message: raw || tr("Не вдалося згенерувати урок", "Failed to generate lesson") });
    } finally {
      setGeneratingInteractive(false);
    }
  };
  return <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrow="// new lesson"
        title={tr("Створити урок", "Create lesson")}
        subtitle={tr("Урок або контрольна — з теорією, практикою та обмеженням часу.", "A lesson or control work — with theory, practice and a time limit.")}
        maxWidth="3xl"
        actions={
          <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/classes/${classId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
        }
      />

      <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto">
        <div className="rounded-xl border border-border bg-bg-surface p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-3">{tr("Тип", "Type")}</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant={type === "LESSON" ? "primary" : "ghost"} onClick={() => setType("LESSON")} className="flex-1">
                {tr("Урок", "Lesson")}
              </Button>
              <Button variant={type === "CONTROL" ? "primary" : "ghost"} onClick={() => setType("CONTROL")} className="flex-1">
                {tr("Контрольна", "Control work")}
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-6 space-y-6">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Зміст", "Content")}</h2>
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Назва уроку *", "Lesson title *")}
              </label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary transition-fast" placeholder={tr("Наприклад: Вступ до масивів", "Example: Introduction to arrays")} />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-mono text-text-secondary">
                <input type="checkbox" checked={hasTheory} onChange={e => setHasTheory(e.target.checked)} className="w-4 h-4" />
                {tr("Додати теорію", "Add theory")}
              </label>
              {hasTheory && <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <Button variant={theoryMode === "markdown" ? "primary" : "ghost"} size="sm" onClick={() => setTheoryMode("markdown")}>Markdown</Button>
                    <Button
                      variant={theoryMode === "interactive" ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => {
                        const parsed = normalizeInteractiveLesson(theory);
                        if (parsed) setLessonBlocks(parsed);
                        setTheoryMode("interactive");
                      }}
                    >
                      {tr("Інтерактивний", "Interactive")}
                    </Button>
                  </div>
                  {theoryMode === "markdown" ? (
                    <>
                      <textarea value={theory} onChange={e => setTheory(e.target.value)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[200px] transition-fast" placeholder={tr("Введіть теорію або згенеруйте через ШІ...", "Write theory or generate it with AI...")} />
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input type="text" value={topicTitle} onChange={e => setTopicTitle(e.target.value)} placeholder={tr("Назва теми для генерації", "Topic name for generation")} className="flex-1 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary transition-fast" />
                        <Button variant="ghost" onClick={handleGenerateTheory} disabled={generatingTheory} className="text-xs">
                          <Sparkles className="w-4 h-4 mr-1" />
                          {generatingTheory ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input type="text" value={topicTitle} onChange={e => setTopicTitle(e.target.value)} placeholder={tr("Назва теми для генерації", "Topic name for generation")} className="flex-1 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary transition-fast" />
                        <Button variant="ghost" onClick={handleGenerateInteractive} disabled={generatingInteractive} className="text-xs">
                          <Sparkles className="w-4 h-4 mr-1" />
                          {generatingInteractive ? tr("Генерація...", "Generating...") : tr("Згенерувати", "Generate")}
                        </Button>
                      </div>
                      <LessonBlocksEditor value={lessonBlocks} onChange={(l) => { setLessonBlocks(l); setTheory(JSON.stringify(l)); }} />
                    </>
                  )}
                </div>}
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Обмеження по часу (хвилини)", "Time limit (minutes)")}
              </label>
              <input type="number" value={timeLimitMinutes || ""} onChange={e => setTimeLimitMinutes(e.target.value ? parseInt(e.target.value, 10) : undefined)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary transition-fast" placeholder={tr("Необов'язково", "Optional")} />
            </div>
          </div>

          {type === "CONTROL" && <div className="space-y-3 rounded-xl p-4 border border-primary/40 bg-primary/5">
              <h3 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Частини контрольної:", "Control work sections:")}</h3>
              <label className="flex items-center gap-2 text-sm font-mono text-text-secondary">
                <input type="checkbox" checked={controlHasTheory} onChange={e => setControlHasTheory(e.target.checked)} className="w-4 h-4" />
                {tr("Теоретична частина (питання)", "Theory section (questions)")}
              </label>
              <label className="flex items-center gap-2 text-sm font-mono text-text-secondary">
                <input type="checkbox" checked={controlHasPractice} onChange={e => setControlHasPractice(e.target.checked)} className="w-4 h-4" />
                {tr("Практична частина (завдання)", "Practice section (task)")}
              </label>
            </div>}

          <div className="flex flex-wrap gap-2 justify-end border-t border-border pt-6">
            <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={handleSubmit}>{tr("Створити урок", "Create lesson")}</Button>
          </div>
        </div>
      </div>
    </div>;
};
