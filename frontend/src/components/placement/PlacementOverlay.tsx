import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CourseLanguage, User } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Modal } from "../ui/Modal";
import { completePlacement } from "../../lib/api/profile";
import { computeMasteredUntilTopicIndex, getPlacementQuestions, recommendLevel, type PlacementLevel } from "./placementQuestions";

type Step = "pick" | "quiz" | "confirm";

function levelLabel(level: PlacementLevel, lang: "uk" | "en") {
  const isUk = lang === "uk";
  if (level === "BEGINNER") return isUk ? "Початковий" : "Beginner";
  if (level === "INTERMEDIATE") return isUk ? "Середній" : "Intermediate";
  return isUk ? "Просунутий" : "Advanced";
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

  const title = step === "pick" ? t("placementPickTitle") : step === "quiz" ? t("placementQuickTestTitle") : t("placementConfirmTitle");

  const description = step === "pick"
    ? t("placementPickBody")
    : step === "quiz"
      ? t("placementQuickTestBody")
      : (lang === "uk" ? "Можна прийняти рекомендацію або вибрати інший рівень." : "Accept the recommendation or choose another level.");

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
      setError(typeof msg === "string" ? msg : (lang === "uk" ? "Не вдалося зберегти." : "Failed to save."));
    } finally {
      setSubmitting(false);
    }
  }

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
                {(["JAVA", "PYTHON"] as CourseLanguage[]).map(c => (
                  <Button
                    key={c}
                    variant={c === pickedCourse ? "primary" : "ghost"}
                    onClick={() => {
                      setPickedCourse(c);
                      setAnswers({});
                      setError(null);
                    }}
                    disabled={submitting}
                  >
                    {c === "JAVA" ? "Java" : "Python"}
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
                    onClick={() => setPickedLevel(l)}
                  >
                    {levelLabel(l, lang)}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            onClick={() => {
              // allow skipping: keep chosen level, no quiz.
              void save(pickedLevel, null, null);
            }}
            disabled={submitting}
          >
            {t("skip")}
          </Button>

          <div className="flex gap-2">
            {step !== "pick" && (
              <Button
                variant="ghost"
                onClick={() => {
                  setError(null);
                  setStep(step === "confirm" ? "quiz" : "pick");
                }}
                disabled={submitting}
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
                  onClick={() => void save(pickedLevel, null, null)}
                  disabled={submitting}
                >
                  {t("placementContinue")}
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
                  setStep("confirm");
                }}
                disabled={submitting}
              >
                {lang === "uk" ? "Далі" : "Next"}
              </Button>
            )}

            {step === "confirm" && (
              <Button
                onClick={() => void save(pickedLevel, correct, masteredUntilTopicIndex)}
                disabled={submitting}
              >
                {submitting ? t("placementSaving") : t("placementDone")}
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
