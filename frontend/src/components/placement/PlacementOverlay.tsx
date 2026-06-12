import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CourseLanguage, User } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Modal } from "../ui/Modal";
import {
  completePlacement,
  getPlacementAssessmentPack,
  submitPlacementAssessment,
  type PlacementAssessmentPack,
  type PlacementAssessmentSubmitResult,
  type PlacementAssessmentTrack,
} from "../../lib/api/profile";
import { type PlacementLevel } from "./placementQuestions";
import { CodeEditor } from "../CodeEditor";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

type Step = "pick" | "assessment" | "result";
type PlacementChoice = PlacementLevel | "UNDECIDED";

const getApiErrorMessage = (error: unknown): string | null => {
  const message = getErrorMessageFromUnknown(error, "");
  return message || null;
};

function levelLabel(level: PlacementLevel, lang: "uk" | "en") {
  const isUk = lang === "uk";
  if (level === "BEGINNER") return isUk ? "Початковий" : "Beginner";
  if (level === "INTERMEDIATE") return isUk ? "Середній" : "Intermediate";
  return isUk ? "Просунутий" : "Advanced";
}

function choiceLabel(choice: PlacementChoice, lang: "uk" | "en"): string {
  if (choice === "UNDECIDED") return lang === "uk" ? "Не визначився" : "Undecided";
  return levelLabel(choice, lang);
}

function courseLabel(course: CourseLanguage) {
  if (course === "JAVA") return "Java";
  if (course === "PYTHON") return "Python";
  return "C++";
}

function choiceToTrack(choice: PlacementChoice): PlacementAssessmentTrack | null {
  if (choice === "INTERMEDIATE") return "INTERMEDIATE";
  if (choice === "ADVANCED") return "ADVANCED";
  if (choice === "UNDECIDED") return "UNDECIDED";
  return null;
}

function getTaskReportMap(result: PlacementAssessmentSubmitResult | null): Map<string, PlacementAssessmentSubmitResult["taskReports"][number]> {
  return new Map((result?.taskReports || []).map((r) => [r.taskId, r]));
}

export const PlacementOverlay: React.FC<{
  open: boolean;
  user: User;
  onUserChange: (u: User) => void;
  onClose: () => void;
}> = ({ open, user, onUserChange, onClose }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.toLowerCase().startsWith("en") ? "en" : "uk";

  const [pickedCourse, setPickedCourse] = useState<CourseLanguage>(() => user.course || "JAVA");
  const [step, setStep] = useState<Step>("pick");
  const [pickedChoice, setPickedChoice] = useState<PlacementChoice>("BEGINNER");

  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentPack, setAssessmentPack] = useState<PlacementAssessmentPack | null>(null);
  const [assessmentQuizAnswers, setAssessmentQuizAnswers] = useState<Record<string, number>>({});
  const [assessmentTaskCodes, setAssessmentTaskCodes] = useState<Record<string, string>>({});
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<PlacementAssessmentSubmitResult | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assessmentTrack = useMemo(() => choiceToTrack(pickedChoice), [pickedChoice]);
  const quizTotal = assessmentPack?.quizQuestions.length ?? 0;
  const quizAnswered = Object.keys(assessmentQuizAnswers).length;
  const taskTotal = assessmentPack?.tasks.length ?? 0;
  const taskFilled = useMemo(() => {
    if (!assessmentPack) return 0;
    return assessmentPack.tasks.filter((task) => String(assessmentTaskCodes[task.id] ?? "").trim().length > 0).length;
  }, [assessmentPack, assessmentTaskCodes]);

  const taskReportMap = useMemo(() => getTaskReportMap(assessmentResult), [assessmentResult]);

  const title = step === "pick"
    ? t("placementPickTitle")
    : step === "assessment"
      ? (lang === "uk" ? "Комплексне тестування" : "Comprehensive assessment")
      : (lang === "uk" ? "Результати assessment" : "Assessment results");

  const description = step === "pick"
    ? t("placementPickBody")
    : step === "assessment"
      ? (lang === "uk"
        ? "Тестова частина + 5 практичних задач для підтвердження рівня."
        : "Quiz section + 5 practical tasks to confirm level.")
      : (lang === "uk"
        ? "Детальний розбір тестової та практичної частини."
        : "Detailed breakdown of quiz and practical sections.");

  async function save(level: PlacementLevel, score?: number | null, masteredUntil?: number | null) {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await completePlacement({
        level,
        score,
        course: pickedCourse,
        masteredUntilTopicIndex: masteredUntil
      });
      onUserChange(updated);
      onClose();
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e);
      if (msg === "PLACEMENT_CODING_REQUIRED") {
        setError(lang === "uk" ? "Спочатку пройди комплексну практичну частину." : "Please complete the comprehensive practical section first.");
      } else if (msg === "PLACEMENT_CODING_LEVEL_MISMATCH") {
        setError(lang === "uk" ? "Результат практичної частини не відповідає обраному рівню." : "Practical section result does not match the selected level.");
      } else if (msg === "PLACEMENT_SCORE_REQUIRED") {
        setError(lang === "uk" ? "Потрібно завершити тестову частину перед збереженням." : "You need to complete the quiz section before saving.");
      } else {
        setError(typeof msg === "string" ? msg : (lang === "uk" ? "Не вдалося зберегти." : "Failed to save."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function openAssessment(track: PlacementAssessmentTrack) {
    setAssessmentLoading(true);
    setError(null);
    setAssessmentResult(null);
    try {
      const pack = await getPlacementAssessmentPack({
        track,
        course: pickedCourse,
      });
      setAssessmentPack(pack);
      setAssessmentQuizAnswers({});
      const nextCodes: Record<string, string> = {};
      for (const task of pack.tasks) {
        nextCodes[task.id] = task.starterCode || "";
      }
      setAssessmentTaskCodes(nextCodes);
      setActiveTaskId(pack.tasks[0]?.id ?? null);
      setStep("assessment");
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e);
      setError(typeof msg === "string" ? msg : (lang === "uk" ? "Не вдалося завантажити комплексне тестування." : "Failed to load comprehensive assessment."));
    } finally {
      setAssessmentLoading(false);
    }
  }

  async function submitAssessment() {
    if (!assessmentPack || !assessmentTrack) return;
    setSubmitting(true);
    setError(null);
    try {
      const quizAnswers = assessmentPack.quizQuestions.map((q) => ({
        questionId: q.id,
        selectedIndex: Number(assessmentQuizAnswers[q.id] ?? -1),
      }));
      if (quizAnswers.some((x) => !Number.isFinite(x.selectedIndex) || x.selectedIndex < 0)) {
        setError(lang === "uk" ? "Дай відповіді на всі питання тесту." : "Please answer all quiz questions.");
        return;
      }

      const taskSolutions = assessmentPack.tasks.map((task) => ({
        taskId: task.id,
        code: String(assessmentTaskCodes[task.id] ?? ""),
      }));
      if (taskSolutions.some((x) => !x.code.trim())) {
        setError(lang === "uk" ? "Заповни код для всіх 5 задач." : "Please provide code for all 5 tasks.");
        return;
      }

      const result = await submitPlacementAssessment({
        track: assessmentTrack,
        course: pickedCourse,
        quizAnswers,
        taskSolutions,
      });
      setAssessmentResult(result);
      onUserChange(result.user);
      setStep("result");
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e);
      setError(typeof msg === "string" ? msg : (lang === "uk" ? "Не вдалося завершити тестування." : "Failed to finish assessment."));
    } finally {
      setSubmitting(false);
    }
  }

  const activeTask = useMemo(() => {
    if (!assessmentPack || !activeTaskId) return null;
    return assessmentPack.tasks.find((t) => t.id === activeTaskId) || null;
  }, [assessmentPack, activeTaskId]);

  const quizReportById = useMemo(() => {
    return new Map((assessmentResult?.quizReports || []).map((r) => [r.questionId, r]));
  }, [assessmentResult]);

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      closable={false}
      showCloseButton={false}
      panelClassName="max-w-[980px]"
    >
      <div className="space-y-4">
        {error && (
          <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
            {error}
          </div>
        )}

        {step === "pick" && (
          <div className="space-y-3">
            <Card className="p-4">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {lang === "uk" ? "Мова" : "Language"}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["JAVA", "PYTHON", "CPP"] as CourseLanguage[]).map(c => (
                  <Button
                    key={c}
                    variant={c === pickedCourse ? "primary" : "ghost"}
                    onClick={() => {
                      setPickedCourse(c);
                      setAssessmentPack(null);
                      setAssessmentQuizAnswers({});
                      setAssessmentTaskCodes({});
                      setActiveTaskId(null);
                      setAssessmentResult(null);
                      setError(null);
                    }}
                    disabled={submitting}
                  >
                    {courseLabel(c)}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-text-muted font-mono mt-2">
                {lang === "uk"
                  ? "Обери мову — для non-beginner працює окреме комплексне середовище (тест + 5 задач)."
                  : "Pick a language — non-beginner levels use a separate comprehensive environment (quiz + 5 tasks)."}
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {(["BEGINNER", "INTERMEDIATE", "ADVANCED", "UNDECIDED"] as PlacementChoice[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setPickedChoice(l)}
                  className={
                    "text-left p-4 border transition-fast bg-bg-surface " +
                    (pickedChoice === l ? "border-primary" : "border-border hover:bg-bg-hover")
                  }
                >
                  <div className="text-sm font-mono text-text-primary">{choiceLabel(l, lang)}</div>
                  <div className="text-xs text-text-secondary mt-2">
                    {l === "BEGINNER"
                      ? (lang === "uk" ? "Я тільки починаю." : "I’m just starting.")
                      : l === "INTERMEDIATE"
                        ? (lang === "uk" ? "Комплексне середовище на середній рівень." : "Dedicated medium-level environment.")
                        : l === "ADVANCED"
                          ? (lang === "uk" ? "Комплексне середовище на просунутий рівень." : "Dedicated advanced-level environment.")
                          : (lang === "uk" ? "Пройду повне комплексне тестування для визначення рівня." : "Take full comprehensive testing to determine level.")}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "assessment" && assessmentPack && (
          <div className="space-y-3">
            <Card className="p-4 border border-primary/40">
              <div className="text-sm font-mono text-text-primary mb-2">
                {lang === "uk" ? "Поточне середовище" : "Current environment"}: {assessmentPack.track}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono">
                <div className="border border-border p-2 bg-bg-code">
                  {lang === "uk" ? "Тест" : "Quiz"}: {quizAnswered}/{quizTotal}
                </div>
                <div className="border border-border p-2 bg-bg-code">
                  {lang === "uk" ? "Практика" : "Practice"}: {taskFilled}/{taskTotal}
                </div>
                <div className="border border-border p-2 bg-bg-code">
                  {lang === "uk" ? "Мова" : "Language"}: {courseLabel(assessmentPack.language)}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {lang === "uk" ? "Тестова частина" : "Quiz section"}
              </div>
              <div className="space-y-3">
                {assessmentPack.quizQuestions.map((q, idx) => {
                  const selected = assessmentQuizAnswers[q.id];
                  const prompt = lang === "uk" ? q.promptUk : q.promptEn;
                  const opts = lang === "uk" ? q.optionsUk : q.optionsEn;
                  return (
                    <div key={q.id} className="border border-border p-3 bg-bg-code/60">
                      <div className="text-xs font-mono text-text-secondary mb-1">
                        {lang === "uk" ? "Питання" : "Question"} {idx + 1}/{quizTotal}
                      </div>
                      <div className="text-sm font-mono text-text-primary mb-2">{prompt}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {opts.map((o, oi) => (
                          <button
                            key={`${q.id}-${oi}`}
                            onClick={() => setAssessmentQuizAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                            className={
                              "text-left px-3 py-2 border text-sm font-mono transition-fast " +
                              (selected === oi ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover/60")
                            }
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {lang === "uk" ? "Практична частина (5 задач)" : "Practical section (5 tasks)"}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {assessmentPack.tasks.map((task, idx) => {
                  const report = taskReportMap.get(task.id);
                  const isActive = activeTaskId === task.id;
                  return (
                    <button
                      key={task.id}
                      onClick={() => setActiveTaskId(task.id)}
                      className={
                        "px-2.5 py-1 border text-xs font-mono transition-fast " +
                        (isActive ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover/60")
                      }
                    >
                      {lang === "uk" ? "Задача" : "Task"} {idx + 1}
                      {report ? <span className={report.passed ? "text-accent-success ml-1" : "text-accent-error ml-1"}>{report.passed ? "✓" : "✕"}</span> : null}
                    </button>
                  );
                })}
              </div>

              {activeTask && (
                <div className="space-y-3">
                  <div className="border border-border p-3 bg-bg-code/60">
                    <div className="text-sm font-mono text-text-primary mb-2">
                      {lang === "uk" ? activeTask.titleUk : activeTask.titleEn}
                    </div>
                    <div className="text-sm font-mono text-text-primary whitespace-pre-line">
                      {lang === "uk" ? activeTask.promptUk : activeTask.promptEn}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Приклад вводу" : "Sample input"}</div>
                      <pre className="text-xs font-mono bg-bg-code border border-border p-3 overflow-auto">{activeTask.sampleInput}</pre>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Приклад виводу" : "Sample output"}</div>
                      <pre className="text-xs font-mono bg-bg-code border border-border p-3 overflow-auto">{activeTask.sampleOutput}</pre>
                    </div>
                  </div>

                  <div className="border border-border h-[46vh] min-h-[320px] max-h-[700px] mt-3">
                    <CodeEditor
                      language={activeTask.language}
                      value={assessmentTaskCodes[activeTask.id] ?? ""}
                      onChange={(next) => setAssessmentTaskCodes((prev) => ({ ...prev, [activeTask.id]: next }))}
                    />
                  </div>

                  {taskReportMap.get(activeTask.id) && !taskReportMap.get(activeTask.id)?.passed ? (
                    <div className="border border-accent-error p-3 bg-bg-code/60">
                      <div className="text-xs font-mono text-accent-error mb-1">
                        {lang === "uk" ? "Останній результат" : "Last result"}
                      </div>
                      {taskReportMap.get(activeTask.id)?.stderr ? (
                        <pre className="text-xs font-mono bg-bg-code border border-border p-2 overflow-auto">{taskReportMap.get(activeTask.id)?.stderr}</pre>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Очікувалося" : "Expected"}</div>
                            <pre className="text-xs font-mono bg-bg-code border border-border p-2 overflow-auto">{taskReportMap.get(activeTask.id)?.expected ?? ""}</pre>
                          </div>
                          <div>
                            <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Отримали" : "Actual"}</div>
                            <pre className="text-xs font-mono bg-bg-code border border-border p-2 overflow-auto">{taskReportMap.get(activeTask.id)?.actual ?? ""}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </div>
        )}

        {step === "result" && assessmentPack && assessmentResult && (
          <div className="space-y-3">
            <Card className="p-4 border border-primary/40">
              <div className="text-sm font-mono text-text-primary mb-2">
                {lang === "uk" ? "Підсумок" : "Summary"}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs font-mono">
                <div className="border border-border p-2 bg-bg-code">
                  {lang === "uk" ? "Фінальний рівень" : "Final level"}: {assessmentResult.summary.finalLevel}
                </div>
                <div className="border border-border p-2 bg-bg-code">
                  {lang === "uk" ? "Тестова частина" : "Quiz"}: {assessmentResult.summary.quizCorrect}/{assessmentResult.summary.quizTotal} ({assessmentResult.summary.quizPct}%)
                </div>
                <div className="border border-border p-2 bg-bg-code">
                  {lang === "uk" ? "Практична частина" : "Practical"}: {assessmentResult.summary.practicalPassed}/{assessmentResult.summary.practicalTotal} ({assessmentResult.summary.practicalPct}%)
                </div>
                <div className="border border-border p-2 bg-bg-code">
                  {lang === "uk" ? "Загальний бал" : "Overall"}: {assessmentResult.summary.overallPct}%
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {lang === "uk" ? "Детально: тестова частина" : "Details: quiz section"}
              </div>
              <div className="space-y-3">
                {assessmentPack.quizQuestions.map((q, idx) => {
                  const report = quizReportById.get(q.id);
                  const options = lang === "uk" ? q.optionsUk : q.optionsEn;
                  const prompt = lang === "uk" ? q.promptUk : q.promptEn;
                  const selectedLabel = report && report.selectedIndex >= 0 ? options[report.selectedIndex] : (lang === "uk" ? "Немає відповіді" : "No answer");
                  const correctLabel = report && report.correctIndex >= 0 ? options[report.correctIndex] : "—";
                  return (
                    <div key={q.id} className={`border p-3 ${report?.isCorrect ? "border-accent-success" : "border-accent-error"}`}>
                      <div className="text-xs font-mono text-text-secondary mb-1">
                        {lang === "uk" ? "Питання" : "Question"} {idx + 1}
                      </div>
                      <div className="text-sm font-mono text-text-primary mb-2">{prompt}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                        <div className="border border-border p-2 bg-bg-code">
                          {lang === "uk" ? "Твоя відповідь" : "Your answer"}: {selectedLabel}
                        </div>
                        <div className="border border-border p-2 bg-bg-code">
                          {lang === "uk" ? "Правильна відповідь" : "Correct answer"}: {correctLabel}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {lang === "uk" ? "Детально: практична частина (5 задач)" : "Details: practical section (5 tasks)"}
              </div>
              <div className="space-y-3">
                {assessmentPack.tasks.map((task, idx) => {
                  const report = taskReportMap.get(task.id);
                  return (
                    <div key={task.id} className={`border p-3 ${report?.passed ? "border-accent-success" : "border-accent-error"}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-sm font-mono text-text-primary">
                          {lang === "uk" ? "Задача" : "Task"} {idx + 1}: {lang === "uk" ? task.titleUk : task.titleEn}
                        </div>
                        <div className={report?.passed ? "text-accent-success text-xs font-mono" : "text-accent-error text-xs font-mono"}>
                          {report?.passed ? (lang === "uk" ? "Пройдено" : "Passed") : (lang === "uk" ? "Не пройдено" : "Failed")}
                        </div>
                      </div>
                      <div className="text-xs font-mono text-text-secondary mb-2">
                        {lang === "uk" ? "Тести" : "Tests"}: {report?.passedTests ?? 0}/{report?.totalTests ?? 0}
                      </div>

                      {report && !report.passed ? (
                        report.stderr ? (
                          <pre className="text-xs font-mono bg-bg-code border border-border p-2 overflow-auto">{report.stderr}</pre>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Очікувалося" : "Expected"}</div>
                              <pre className="text-xs font-mono bg-bg-code border border-border p-2 overflow-auto">{report.expected ?? ""}</pre>
                            </div>
                            <div>
                              <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Отримали" : "Actual"}</div>
                              <pre className="text-xs font-mono bg-bg-code border border-border p-2 overflow-auto">{report.actual ?? ""}</pre>
                            </div>
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div />

          <div className="flex gap-2">
            {step === "assessment" && (
              <Button
                variant="ghost"
                onClick={() => {
                  setError(null);
                  setStep("pick");
                }}
                disabled={submitting || assessmentLoading}
              >
                {t("back")}
              </Button>
            )}

            {step === "pick" && (
              <>
                <Button
                  onClick={async () => {
                    if (pickedChoice === "BEGINNER") {
                      void save("BEGINNER", null, null);
                      return;
                    }
                    const track = choiceToTrack(pickedChoice);
                    if (!track) {
                      setError(lang === "uk" ? "Оберіть валідний режим тестування." : "Please choose a valid testing mode.");
                      return;
                    }
                    setError(null);
                    await openAssessment(track);
                  }}
                  disabled={submitting || assessmentLoading}
                >
                  {assessmentLoading
                    ? (lang === "uk" ? "Завантаження..." : "Loading...")
                    : pickedChoice === "BEGINNER"
                    ? (lang === "uk" ? "Почати з нуля" : "Start from scratch")
                    : (lang === "uk" ? "Відкрити середовище" : "Open environment")}
                </Button>
              </>
            )}

            {step === "assessment" && (
              <Button
                onClick={() => void submitAssessment()}
                disabled={submitting}
              >
                {submitting ? (lang === "uk" ? "Перевіряю..." : "Evaluating...") : (lang === "uk" ? "Завершити тестування" : "Finish assessment")}
              </Button>
            )}

            {step === "result" && (
              <Button onClick={onClose}>
                {lang === "uk" ? "Завершити" : "Done"}
              </Button>
            )}
          </div>
        </div>

        <div className="text-xs text-text-muted font-mono">
          {lang === "uk"
            ? "Для non-beginner і режиму «не визначився» застосовується окреме комплексне середовище: тест + 5 практичних задач."
            : "For non-beginner and undecided modes, a dedicated comprehensive environment is used: quiz + 5 practical tasks."}
        </div>
      </div>
    </Modal>
  );
};

export default PlacementOverlay;
