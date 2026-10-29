import React from "react";
import { ArrowLeft, ChevronRight, ClipboardCheck, Code2, History, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/Modal";
import { tr } from "../../i18n";
import { getControlWorkStudentWork, getTopicTaskStudentWork, type ControlWorkStudentWork, type TopicTaskStudentWork } from "../../lib/api/edu";
import { getEduErrorMessage } from "../../lib/eduError";
import { formatGradeForSystem, type ClassGradingSystem, type GradeScaleMode } from "../../lib/gradingSystems";
import "./studentWorkReview.css";

type Props = {
  studentId: number; studentName: string; taskId: number; taskTitle: string; isControl: boolean;
  gradingSystem: ClassGradingSystem; scaleMode: GradeScaleMode; onClose: () => void;
};
type Scale = Pick<Props, "gradingSystem" | "scaleMode">;
const formatScore = (value: number | null | undefined, scale: Scale) => value == null ? "—" : formatGradeForSystem(value, scale.gradingSystem, scale.scaleMode);
const dateLabel = (value: string | null, language: string) => value ? new Date(value).toLocaleString(language.startsWith("en") ? "en-US" : "uk-UA") : "—";

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="student-work__error" role="alert"><p>{message}</p><button type="button" className="student-work__button" onClick={retry}><RefreshCw size={16} aria-hidden="true" />{tr("Спробувати ще раз", "Try again")}</button></div>;
}

function SubmissionHistory({ taskId, studentId, ...scale }: Pick<Props, "taskId" | "studentId"> & Scale) {
  const { i18n } = useTranslation();
  const [data, setData] = React.useState<TopicTaskStudentWork | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const generation = React.useRef(0);
  const paging = React.useRef(false);
  React.useEffect(() => {
    const current = ++generation.current;
    setData(null); setError(null); setSelectedId(null); setLoadingMore(false); paging.current = false;
    void getTopicTaskStudentWork(taskId, studentId, { limit: 20 }).then(result => {
      if (generation.current !== current) return;
      setData(result); setSelectedId(result.submissions[0]?.id ?? null);
    }).catch(caught => {
      if (generation.current === current) setError(getEduErrorMessage(caught, tr("Не вдалося завантажити подачі.", "Could not load submissions.")));
    });
    return () => { ++generation.current; };
  }, [taskId, studentId, retry]);
  const loadMore = async () => {
    if (!data?.hasMore || !data.nextCursor || paging.current) return;
    const current = generation.current;
    paging.current = true; setLoadingMore(true); setError(null);
    try {
      const next = await getTopicTaskStudentWork(taskId, studentId, { limit: 20, beforeId: data.nextCursor });
      if (generation.current !== current) return;
      setData(old => old ? { ...next, submissions: [...old.submissions, ...next.submissions.filter(item => !old.submissions.some(existing => existing.id === item.id))] } : next);
    } catch (caught) {
      if (generation.current === current) setError(getEduErrorMessage(caught, tr("Не вдалося завантажити старіші спроби.", "Could not load older submissions.")));
    } finally {
      if (generation.current === current) { paging.current = false; setLoadingMore(false); }
    }
  };
  if (!data) return error ? <LoadError message={error} retry={() => setRetry(value => value + 1)} /> : <div className="student-work__loading" role="status">{tr("Завантажуємо подачі…", "Loading submissions…")}</div>;
  if (!data.submissions.length) return <div className="student-work__empty"><Code2 size={28} aria-hidden="true" /><h3>{tr("Подач ще немає", "No submissions yet")}</h3><p>{tr("Коли учень надішле розв’язок, тут з’являться його код і результати перевірки.", "The student's code and test results will appear here after a submission.")}</p></div>;
  const selected = data.submissions.find(item => item.id === selectedId) ?? data.submissions[0];
  const selectedIndex = data.submissions.findIndex(item => item.id === selected.id);
  return <div className="student-work__history">
    <aside className="student-work__attempts" aria-label={tr("Історія подач", "Submission history")}>
      <div className="student-work__section-heading"><History size={17} aria-hidden="true" /><h3>{tr("Усі спроби", "All attempts")}</h3><span>{data.submissionsTotal}</span></div>
      <div className="student-work__attempt-list">{data.submissions.map((item, index) => <button type="button" key={item.id} aria-pressed={selected.id === item.id} onClick={() => setSelectedId(item.id)} className="student-work__attempt">
        <span className="student-work__attempt-title">{tr("Спроба", "Attempt")} {Math.max(1, data.submissionsTotal - index)}<strong>{formatScore(item.total, scale)}</strong></span>
        <time dateTime={item.createdAt ?? undefined}>{dateLabel(item.createdAt, i18n.language)}</time>
        <span>{item.testsTotal ? String(item.testsPassed) + "/" + item.testsTotal + " " + tr("тестів", "tests") : tr("Без результатів тестів", "No test results")}{index === 0 ? " · " + tr("Остання", "Latest") : ""}</span>
      </button>)}</div>
      {data.hasMore && <button type="button" className="student-work__button student-work__load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? tr("Завантажуємо…", "Loading…") : tr("Старіші спроби", "Older attempts")}</button>}
      {error && <LoadError message={error} retry={() => void loadMore()} />}
    </aside>
    <section className="student-work__solution" aria-label={tr("Вибрана подача", "Selected submission")}>
      <header className="student-work__solution-heading"><div><p className="student-work__eyebrow">{tr("Відправлений розв’язок", "Submitted solution")}</p><h3>{tr("Спроба", "Attempt")} {Math.max(1, data.submissionsTotal - selectedIndex)}</h3><time dateTime={selected.createdAt ?? undefined}>{dateLabel(selected.createdAt, i18n.language)}</time></div><span className="student-work__score">{formatScore(selected.total, scale)}</span></header>
      <div className="student-work__meta"><span><ClipboardCheck size={16} aria-hidden="true" />{selected.testsTotal ? String(selected.testsPassed) + "/" + selected.testsTotal + " " + tr("тестів пройдено", "tests passed") : tr("Немає результатів тестів", "No test results")}</span>{selected.isManuallyGraded && <span>{tr("Оцінено викладачем", "Teacher graded")}</span>}</div>
      {selected.feedback && <section className="student-work__feedback"><h4>{tr("Коментар до подачі", "Submission feedback")}</h4><p>{selected.feedback}</p></section>}
      <div className="student-work__code-label"><Code2 size={16} aria-hidden="true" />{tr("Код учня", "Student code")}<span>#{selected.id}</span></div>
      {selected.submittedCode ? <pre className="student-work__code" tabIndex={0} aria-label={tr("Код учня", "Student code")}><code>{selected.submittedCode}</code></pre> : <p className="student-work__no-code">{tr("У цій подачі немає збереженого коду.", "No code was saved for this submission.")}</p>}
    </section>
  </div>;
}

function ControlReview({ taskId, studentId, ...scale }: Pick<Props, "taskId" | "studentId"> & Scale) {
  const [data, setData] = React.useState<ControlWorkStudentWork | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [practice, setPractice] = React.useState<{ id: number; title: string } | null>(null);
  const [tab, setTab] = React.useState<"practice" | "quiz">("practice");
  React.useEffect(() => {
    let active = true;
    setData(null); setError(null); setPractice(null);
    void getControlWorkStudentWork(taskId, studentId).then(result => {
      if (!active) return;
      setData(result); setTab(result.controlWork.hasPractice ? "practice" : "quiz");
    }).catch(caught => { if (active) setError(getEduErrorMessage(caught, tr("Не вдалося завантажити роботу.", "Could not load the assessment."))); });
    return () => { active = false; };
  }, [taskId, studentId, retry]);
  if (!data) return error ? <LoadError message={error} retry={() => setRetry(value => value + 1)} /> : <div className="student-work__loading" role="status">{tr("Завантажуємо контрольну…", "Loading assessment…")}</div>;
  if (practice) return <><div className="student-work__practice-back"><button type="button" className="student-work__button" onClick={() => setPractice(null)}><ArrowLeft size={16} aria-hidden="true" />{tr("До контрольної", "Back to assessment")}</button><h3>{practice.title}</h3></div><SubmissionHistory key={practice.id} taskId={practice.id} studentId={studentId} {...scale} /></>;
  return <div>
    <div className="student-work__summary"><div><span>{tr("Підсумкова оцінка", "Final grade")}</span><strong>{formatScore(data.summaryGrade?.grade, scale)}</strong></div><div><span>{tr("Оцінка за теорію", "Theory grade")}</span><strong>{formatScore(data.summaryGrade?.theoryGrade, scale)}</strong></div><div><span>{tr("Практичні завдання", "Practice tasks")}</span><strong>{data.practiceTasks.length}</strong></div></div>
    <div className="student-work__tabs" role="group" aria-label={tr("Частини контрольної", "Assessment sections")}><button type="button" aria-pressed={tab === "practice"} onClick={() => setTab("practice")}>{tr("Практика", "Practice")} · {data.practiceTasks.length}</button><button type="button" aria-pressed={tab === "quiz"} onClick={() => setTab("quiz")}>{tr("Теорія", "Theory")}{data.quizReview ? " · " + data.quizReview.correctAnswers + "/" + data.quizReview.totalQuestions : ""}</button></div>
    {tab === "practice" ? <div className="student-work__practice-list">{!data.practiceTasks.length && <p className="student-work__empty">{tr("Практичних завдань немає.", "No practice tasks.")}</p>}{data.practiceTasks.map(item => <article key={item.taskId} className="student-work__practice-card"><div><h3>{item.taskTitle}</h3><p>{item.testsTotal ? String(item.testsPassed) + "/" + item.testsTotal + " " + tr("тестів", "tests") : tr("Ще немає результату", "No result yet")}</p>{item.feedback && <p className="student-work__practice-feedback">{item.feedback}</p>}</div><strong className="student-work__score">{formatScore(item.grade, scale)}</strong><button type="button" className="student-work__button" onClick={() => setPractice({ id: item.taskId, title: item.taskTitle })}>{tr("Переглянути подачі", "View submissions")}<ChevronRight size={16} aria-hidden="true" /></button></article>)}</div>
      : <div className="student-work__quiz">{!data.quizReview ? <p className="student-work__empty">{tr("Відповідей на теорію ще немає.", "No theory responses yet.")}</p> : data.quizReview.questions.map(question => <article key={question.index} className="student-work__question"><div className="student-work__question-heading"><h3>{question.index + 1}. {question.question}</h3><span data-correct={question.isCorrect}>{question.isCorrect ? tr("Правильно", "Correct") : tr("Неправильно", "Incorrect")}</span></div><div className="student-work__options">{Object.entries(question.options).map(([key, text]) => {
        const correct = key.toUpperCase() === String(question.correct).toUpperCase();
        const chosen = key.toUpperCase() === String(question.student ?? "").toUpperCase();
        return <div key={key} data-correct={correct} data-chosen={chosen}><span><b>{key}.</b> {text}</span><small>{[chosen ? tr("Вибір учня", "Student answer") : "", correct ? tr("Правильна відповідь", "Correct answer") : ""].filter(Boolean).join(" · ")}</small></div>;
      })}</div>{!question.student && <p>{tr("Учень не відповів.", "No student answer.")}</p>}</article>)}</div>}
  </div>;
}

export function StudentWorkReview(props: Props) {
  useTranslation();
  return <Modal open title={tr("Подачі учня", "Student submissions")} description={props.studentName + " · " + props.taskTitle} onClose={props.onClose} panelClassName="student-work-review" bodyClassName="student-work-review__body">
    {props.isControl ? <ControlReview taskId={props.taskId} studentId={props.studentId} gradingSystem={props.gradingSystem} scaleMode={props.scaleMode} /> : <SubmissionHistory taskId={props.taskId} studentId={props.studentId} gradingSystem={props.gradingSystem} scaleMode={props.scaleMode} />}
  </Modal>;
}
