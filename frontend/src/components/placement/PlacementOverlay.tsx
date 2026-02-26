import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CourseLanguage, User } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Modal } from "../ui/Modal";
import { completePlacement, getPlacementCodingChallenge, submitPlacementCoding, type PlacementCodingChallenge, type PlacementCodingSubmitResult } from "../../lib/api/profile";
import { computeMasteredUntilTopicIndex, getPlacementQuestions, recommendLevel, type PlacementLevel } from "./placementQuestions";
import { CodeEditor } from "../CodeEditor";

type Step = "pick" | "quiz" | "confirm" | "coding";

function levelLabel(level: PlacementLevel, lang: "uk" | "en") {
  const isUk = lang === "uk";
  if (level === "BEGINNER") return isUk ? "Початковий" : "Beginner";
  if (level === "INTERMEDIATE") return isUk ? "Середній" : "Intermediate";
  return isUk ? "Просунутий" : "Advanced";
}

function courseLabel(course: CourseLanguage) {
  if (course === "JAVA") return "Java";
  if (course === "PYTHON") return "Python";
  return "C++";
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
  const questions = useMemo(() => getPlacementQuestions(pickedCourse), [pickedCourse]);

  const [step, setStep] = useState<Step>("pick");
  const [pickedLevel, setPickedLevel] = useState<PlacementLevel>("BEGINNER");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codingChallenge, setCodingChallenge] = useState<PlacementCodingChallenge | null>(null);
  const [codingCode, setCodingCode] = useState<string>("");
  const [codingResult, setCodingResult] = useState<PlacementCodingSubmitResult | null>(null);
  const [codingSubmitting, setCodingSubmitting] = useState(false);

  const total = questions.length;
  const correct = useMemo(() => {
    let c = 0;
    for (const q of questions) {
      const a = answers[q.id];
      if (typeof a === "number" && a === q.correctIndex) c++;
    }
    return c;
  }, [answers, questions]);

  const recommended = useMemo(() => recommendLevel(correct, total), [correct, total]);

  const masteredUntilTopicIndex = useMemo(() => computeMasteredUntilTopicIndex(questions, answers), [questions, answers]);

  const title = step === "pick" ? t("placementPickTitle") : step === "quiz" ? t("placementQuickTestTitle") : step === "confirm" ? t("placementConfirmTitle") : (lang === "uk" ? "Практична частина" : "Practical part");

  const description = step === "pick"
    ? t("placementPickBody")
    : step === "quiz"
      ? t("placementQuickTestBody")
      : step === "confirm"
        ? (lang === "uk" ? "Можна прийняти рекомендацію або вибрати інший рівень." : "Accept the recommendation or choose another level.")
        : (lang === "uk" ? "Розв’яжи коротку задачу — це потрібно, щоб підтвердити рівень." : "Solve a short task — required to confirm your level.");

  const canFinishQuiz = step !== "quiz" || Object.keys(answers).length === total;

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
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      if (msg === "PLACEMENT_CODING_REQUIRED") {
        setError(lang === "uk" ? "Спочатку пройди практичну частину (задачу)." : "Please complete the practical task first.");
      } else if (msg === "PLACEMENT_CODING_LEVEL_MISMATCH") {
        setError(lang === "uk" ? "Практична задача має відповідати обраному рівню. Повернись і пройди практику ще раз." : "The practical task must match your chosen level. Please redo the practice step.");
      } else if (msg === "PLACEMENT_SCORE_REQUIRED") {
        setError(lang === "uk" ? "Потрібно пройти тест (квіз) перед збереженням." : "You need to complete the quiz before saving.");
      } else {
        setError(typeof msg === "string" ? msg : (lang === "uk" ? "Не вдалося зберегти." : "Failed to save."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (step !== "coding") return;
    let cancelled = false;
    setCodingSubmitting(true);
    setCodingResult(null);
    setError(null);
    getPlacementCodingChallenge({
      level: pickedLevel,
      course: pickedCourse
    })
      .then(ch => {
        if (cancelled) return;
        setCodingChallenge(ch);
        setCodingCode(ch.starterCode || "");
      })
      .catch(e => {
        const msg = (e as any)?.response?.data?.message;
        setError(typeof msg === "string" ? msg : (lang === "uk" ? "Не вдалося завантажити задачу." : "Failed to load the task."));
      })
      .finally(() => {
        if (!cancelled) setCodingSubmitting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, lang, pickedLevel, pickedCourse]);

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
                      setAnswers({});
                      setCodingChallenge(null);
                      setCodingCode("");
                      setCodingResult(null);
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
                  ? "Обери мову — тест визначить теми, які можна пропустити."
                  : "Pick a language — the test will determine which topics we can skip."}
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["BEGINNER", "INTERMEDIATE", "ADVANCED"] as PlacementLevel[]).map(l => (
                <button
                  key={l}
                  onClick={() => setPickedLevel(l)}
                  className={
                    "text-left p-4 border transition-fast bg-bg-surface " +
                    (pickedLevel === l ? "border-primary" : "border-border hover:bg-bg-hover")
                  }
                >
                  <div className="text-sm font-mono text-text-primary">{levelLabel(l, lang)}</div>
                  <div className="text-xs text-text-secondary mt-2">
                    {l === "BEGINNER"
                      ? (lang === "uk" ? "Я тільки починаю." : "I’m just starting.")
                      : l === "INTERMEDIATE"
                        ? (lang === "uk" ? "Базу знаю, хочу практику." : "I know the basics, want practice.")
                        : (lang === "uk" ? "Хочу складніші задачі." : "I want harder tasks.")}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "quiz" && (
          <div className="space-y-3">
            {questions.map((q, idx) => {
              const prompt = lang === "uk" ? q.promptUk : q.promptEn;
              const opts = lang === "uk" ? q.optionsUk : q.optionsEn;
              const selected = answers[q.id];
              return (
                <Card key={q.id} className="p-4">
                  <div className="text-xs font-mono text-text-secondary mb-2">
                    {lang === "uk" ? "Питання" : "Question"} {idx + 1}/{total}
                  </div>
                  <div className="text-sm font-mono text-text-primary whitespace-pre-line">{prompt}</div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {opts.map((o, oi) => (
                      <button
                        key={oi}
                        onClick={() => setAnswers(prev => ({ ...prev, [q.id]: oi }))}
                        className={
                          "text-left px-3 py-2 border text-sm font-mono transition-fast " +
                          (selected === oi ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover/60")
                        }
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {step === "coding" && (
          <div className="space-y-3">
            <Card className="p-4">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {lang === "uk" ? "Задача" : "Task"}
              </div>
              <div className="text-sm font-mono text-text-primary whitespace-pre-line">
                {lang === "uk" ? (codingChallenge?.promptUk || "") : (codingChallenge?.promptEn || "")}
              </div>

              {codingChallenge && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Приклад вводу" : "Sample input"}</div>
                    <pre className="text-xs font-mono bg-bg-code border border-border p-3 overflow-auto">{codingChallenge.sampleInput}</pre>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Приклад виводу" : "Sample output"}</div>
                    <pre className="text-xs font-mono bg-bg-code border border-border p-3 overflow-auto">{codingChallenge.sampleOutput}</pre>
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-3">
              <div className="text-xs font-mono text-text-secondary mb-2">
                {lang === "uk" ? "Код" : "Code"}
                {codingChallenge?.language ? <span className="text-text-muted"> ({courseLabel(codingChallenge.language)})</span> : null}
              </div>
              <div className="border border-border h-[52vh] min-h-[360px] max-h-[720px]">
                <CodeEditor language={codingChallenge?.language || pickedCourse} value={codingCode} onChange={setCodingCode} />
              </div>
            </Card>

            {codingResult && !codingResult.passed && (
              <Card className="p-4 border border-accent-error">
                <div className="text-xs font-mono text-accent-error mb-2">
                  {lang === "uk" ? "Помилка перевірки" : "Check failed"}
                </div>
                {typeof codingResult.caseIndex === "number" && (
                  <div className="text-xs font-mono text-text-secondary mb-2">
                    {lang === "uk" ? "Тест" : "Test"}: {codingResult.caseIndex + 1}/{codingResult.total}
                  </div>
                )}
                {codingResult.stderr ? (
                  <pre className="text-xs font-mono bg-bg-code border border-border p-3 overflow-auto">{codingResult.stderr}</pre>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Очікувалося" : "Expected"}</div>
                      <pre className="text-xs font-mono bg-bg-code border border-border p-3 overflow-auto">{codingResult.expected ?? ""}</pre>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">{lang === "uk" ? "Отримали" : "Actual"}</div>
                      <pre className="text-xs font-mono bg-bg-code border border-border p-3 overflow-auto">{codingResult.actual ?? ""}</pre>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {step === "confirm" && (
          <Card className="p-5">
            <div className="text-sm font-mono text-text-primary">
              {t("placementResult")}: {correct}/{total}
            </div>
            <div className="text-sm text-text-secondary mt-2">
              {t("placementRecommended")}: <span className="text-text-primary font-mono">{levelLabel(recommended, lang)}</span>
            </div>

            <div className="text-sm text-text-secondary mt-2">
              {lang === "uk" ? "Теми, які можна пропустити" : "Topics we can skip"}: {" "}
              <span className="text-text-primary font-mono">
                {masteredUntilTopicIndex === null ? (lang === "uk" ? "немає" : "none") : `${masteredUntilTopicIndex + 1}`}
              </span>
              <span className="text-text-muted">{lang === "uk" ? " (з початку курсу)" : " (from the start)"}</span>
            </div>
            <div className="mt-4">
              <div className="text-xs text-text-secondary font-mono mb-2">
                {t("placementOrChoose")}{lang === "uk" ? ":" : ":"}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["BEGINNER", "INTERMEDIATE", "ADVANCED"] as PlacementLevel[]).map(l => (
                  <Button
                    key={l}
                    variant={l === pickedLevel ? "primary" : "ghost"}
                    onClick={() => {
                      setPickedLevel(l);
                      setCodingChallenge(null);
                      setCodingCode("");
                      setCodingResult(null);
                      setError(null);
                    }}
                  >
                    {levelLabel(l, lang)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-4 text-xs text-text-muted font-mono">
              {pickedLevel === "BEGINNER"
                ? (lang === "uk" ? "BEGINNER: стартуєш з самого початку (результати тесту не застосовуємо)." : "BEGINNER: you start from the beginning (we won’t apply quiz results).")
                : (lang === "uk" ? "INTERMEDIATE/ADVANCED: потрібно пройти практичну задачу для підтвердження рівня." : "INTERMEDIATE/ADVANCED: you must complete a practical task to confirm this level.")}
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between pt-2">
          <div />

          <div className="flex gap-2">
            {step !== "pick" && (
              <Button
                variant="ghost"
                onClick={() => {
                  setError(null);
                  setStep(step === "coding" ? "confirm" : step === "confirm" ? "quiz" : "pick");
                }}
                disabled={submitting || codingSubmitting}
              >
                {t("back")}
              </Button>
            )}

            {step === "pick" && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setError(null);
                    setStep("quiz");
                  }}
                  disabled={submitting || total === 0}
                >
                  {t("placementTakeTest")}
                </Button>
                <Button
                  onClick={() => {
                    if (pickedLevel === "BEGINNER") {
                      void save("BEGINNER", null, null);
                      return;
                    }
                    setError(null);
                    setStep("quiz");
                  }}
                  disabled={submitting}
                >
                  {pickedLevel === "BEGINNER"
                    ? (lang === "uk" ? "Почати з нуля" : "Start from scratch")
                    : (lang === "uk" ? "Продовжити" : "Continue")}
                </Button>
              </>
            )}

            {step === "quiz" && (
              <Button
                onClick={() => {
                  if (!canFinishQuiz) {
                    setError(t("pleaseAnswerAllQuestions"));
                    return;
                  }
                  setError(null);
                  setPickedLevel(recommended);
                  setCodingChallenge(null);
                  setCodingCode("");
                  setCodingResult(null);
                  setStep("confirm");
                }}
                disabled={submitting}
              >
                {lang === "uk" ? "Далі" : "Next"}
              </Button>
            )}

            {step === "confirm" && (
              <Button
                onClick={() => {
                  if (pickedLevel === "BEGINNER") {
                    void save("BEGINNER", null, null);
                    return;
                  }
                  setError(null);
                  setStep("coding");
                }}
                disabled={submitting}
              >
                {pickedLevel === "BEGINNER"
                  ? (lang === "uk" ? "Почати з нуля" : "Start from scratch")
                  : (lang === "uk" ? "До практики" : "Go to practice")}
              </Button>
            )}

            {step === "coding" && (
              <Button
                onClick={async () => {
                  if (!codingCode.trim()) {
                    setCodingResult({
                      passed: false,
                      passedCount: 0,
                      total: 0,
                      stderr: lang === "uk" ? "Встав код перед відправкою." : "Please enter code before submitting."
                    });
                    return;
                  }
                  setCodingSubmitting(true);
                  setCodingResult(null);
                  setError(null);
                  try {
                    const r = await submitPlacementCoding({
                      code: codingCode,
                      level: pickedLevel,
                      challengeId: codingChallenge?.id || "",
                      course: pickedCourse
                    });
                    setCodingResult(r);
                    if (r.passed) {
                      await save(pickedLevel, correct, masteredUntilTopicIndex);
                    }
                  } catch (e: any) {
                    const msg = e?.response?.data?.message;
                    if (msg === "CHALLENGE_MISMATCH") {
                      setError(lang === "uk" ? "Задача змінилася (можливо, ти змінив рівень/мову). Онови практику і спробуй ще раз." : "The challenge changed (maybe you changed level/language). Reload practice and try again.");
                    } else if (msg === "LEVEL_REQUIRED") {
                      setError(lang === "uk" ? "Потрібно вибрати рівень." : "Level is required.");
                    } else {
                      setError(typeof msg === "string" ? msg : (lang === "uk" ? "Не вдалося перевірити код." : "Failed to check code."));
                    }
                  } finally {
                    setCodingSubmitting(false);
                  }
                }}
                disabled={submitting || codingSubmitting || !codingChallenge || !codingChallenge?.id}
              >
                {codingSubmitting ? (lang === "uk" ? "Перевіряю…" : "Checking…") : (lang === "uk" ? "Відправити на перевірку" : "Submit for check")}
              </Button>
            )}
          </div>
        </div>

        <div className="text-xs text-text-muted font-mono">
          {lang === "uk"
            ? "Можна змінити рівень пізніше (у профілі — додамо в наступних ітераціях)."
            : "You can change this later (we’ll add it to Profile in a next iteration)."}
        </div>
      </div>
    </Modal>
  );
};

export default PlacementOverlay;
