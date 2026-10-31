import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock3, LockKeyhole, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { getLesson, startLessonAttempt, submitQuizAnswers, type Lesson } from '../../lib/api/edu';
import { api } from '../../lib/api/client';
import { activateControlExamSession, clearControlExamSession } from '../../lib/controlExamSession';
import { scopedStorageKey } from '../../lib/storageScope';
import { MarkdownView } from '../../components/MarkdownView';
import { Modal } from '../../components/ui/Modal';
import { getEduErrorMessage } from '../../lib/eduError';
import { tr } from '../../i18n';
import { assessmentEndTime } from '../../../../shared/utils/assessmentClock';
import { legacyStudentQuestions } from '../../../../shared/utils/legacyQuiz';

/** One session owns the quiz, practice, clock and navigation lock. */
export const ControlAssessmentWorkspace: React.FC = () => {
  const { lessonId } = useParams();
  const id = Number(lessonId);
  const navigate = useNavigate();
  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [now, setNow] = React.useState(Date.now());
  const [answers, setAnswers] = React.useState<Record<number, string>>({});
  const finishing = React.useRef(false);
  const draftKey = scopedStorageKey('control-quiz-draft', id);
  const load = React.useCallback(async () => {
    const value = await getLesson(id, 'CONTROL', 'legacy');
    setLesson(value);
    if (value.assessmentAttempt?.status === 'IN_PROGRESS' && !value.reportOnly) activateControlExamSession(id, (value.tasks ?? []).map(task => task.id));
    else clearControlExamSession();
    return value;
  }, [id]);
  React.useEffect(() => {
    let alive = true;
    setLesson(null); setError(''); setQuestionIndex(0); finishing.current = false;
    try { setAnswers(JSON.parse(localStorage.getItem(draftKey) || '{}')); } catch { setAnswers({}); }
    void load().catch(e => { if (alive) setError(getEduErrorMessage(e, tr('Не вдалося відкрити контрольну.', 'Could not load assessment.'))); });
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    const poll = window.setInterval(() => { void load().catch(() => {}); }, 15_000);
    return () => { alive = false; window.clearInterval(tick); window.clearInterval(poll); };
  }, [load, draftKey]);
  const attempt = lesson?.assessmentAttempt;
  const end = attempt ? assessmentEndTime(attempt.startedAt, attempt.timeLimitMinutes, lesson?.deadline) : null;
  const remaining = end === null ? null : Math.max(0, Math.ceil((end - now) / 1000));
  const complete = lesson?.reportOnly || attempt?.status === 'COMPLETED' || remaining === 0;
  const active = attempt?.status === 'IN_PROGRESS' && !complete;
  const finish = React.useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true; setBusy(true);
    try {
      await api.post(`/edu/lessons/${id}/finish-attempt`);
      clearControlExamSession(); setConfirm(false);
      await load();
    } catch (e) { setError(getEduErrorMessage(e, tr('Не вдалося завершити роботу. Повторіть спробу.', 'Could not finish. Please retry.'))); }
    finally { finishing.current = false; setBusy(false); }
  }, [id, load]);
  React.useEffect(() => {
    if (remaining === 0 && attempt?.status === 'IN_PROGRESS') { clearControlExamSession(); void finish(); }
  }, [remaining, attempt?.status, finish]);
  if (!lesson) return <div className="edu-workspace p-8" role="status">{error || tr('Завантажуємо контрольну…', 'Loading assessment…')}</div>;
  const questions = legacyStudentQuestions(lesson.quizJson);
  const tasks = lesson.controlHasPractice === false ? [] : lesson.tasks ?? [];
  const question = questions[questionIndex];
  const answered = questions.filter((_, index) => !!answers[index]).length;
  const button = 'min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';
  return <div className="edu-workspace min-h-screen bg-bg-base p-4 text-text-primary sm:p-8">
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-bg-surface p-4 shadow-sm">
      <div><p className="text-xs font-bold uppercase tracking-wider text-text-muted">{tr('Контрольна робота', 'Assessment')}</p><h1 className="mt-1 text-xl font-bold">{lesson.title}</h1></div>
      <div className="flex items-center gap-3">{active && remaining !== null && <strong role="timer" aria-label={tr('Залишилось часу', 'Time remaining')} className={`flex items-center gap-2 rounded-xl px-4 py-3 font-mono text-xl ${remaining < 300 ? 'bg-accent-error/10 text-accent-error' : 'bg-primary/10 text-primary-strong'}`}><Clock3 className="size-5" />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong>}{active && <button className={button} disabled={busy} onClick={() => setConfirm(true)}>{tr('Здати роботу', 'Finish assessment')}</button>}</div>
    </header>
    {error && <p role="alert" className="mt-4 rounded-xl bg-accent-error/10 p-4 text-accent-error">{error}</p>}
    {!active && !complete && <section className="mx-auto mt-10 max-w-2xl rounded-3xl border border-border bg-bg-surface p-8">
      <LockKeyhole className="size-8 text-primary-strong" /><h2 className="mt-4 text-2xl font-bold">{tr('Готові почати?', 'Ready to start?')}</h2>
      <p className="mt-4 leading-7 text-text-secondary">{tr('Таймер запуститься після натискання «Почати контрольну». Він спільний для всіх частин і продовжує йти після оновлення чи закриття сторінки. Під час роботи навігація платформою обмежена.', 'The shared timer starts when you press Start. Reloading or closing the page does not pause it. Platform navigation is restricted during the assessment.')}</p>
      <dl className="my-6 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-text-muted">{tr('Час виконання', 'Time limit')}</dt><dd className="font-bold">{lesson.timeLimitMinutes || 45} {tr('хвилин', 'minutes')}</dd></div><div><dt className="text-sm text-text-muted">{tr('Склад роботи', 'Sections')}</dt><dd className="font-bold">{lesson.controlHasTheory ? tr('Тест', 'Quiz') : ''}{lesson.controlHasTheory && tasks.length ? ' + ' : ''}{tasks.length ? tr(`${tasks.length} практичних завдань`, `${tasks.length} practice tasks`) : ''}</dd></div>{lesson.deadline && <div className="sm:col-span-2"><dt className="text-sm text-text-muted">{tr('Дедлайн', 'Deadline')}</dt><dd>{new Date(lesson.deadline).toLocaleString()}</dd></div>}</dl>
      <p className="mb-5 text-sm text-text-muted">{tr('До завершення часу надішліть тест і розв’язки. Ненадіслані частини отримають 0 балів.', 'Submit the quiz and solutions before time expires. Unsubmitted sections receive zero points.')}</p>
      <button className={`${button} bg-primary text-primary-foreground`} disabled={busy} onClick={() => { setBusy(true); setError(''); void startLessonAttempt(id).then(() => load()).catch(e => setError(getEduErrorMessage(e, tr('Контрольна ще не готова до початку. Зверніться до вчителя.', 'Assessment is not ready. Contact your teacher.')))).finally(() => setBusy(false)); }}>{busy ? tr('Запускаємо…', 'Starting…') : tr('Почати контрольну', 'Start assessment')}</button>
    </section>}
    {complete && <section className="mx-auto mt-10 max-w-2xl rounded-3xl border border-border bg-bg-surface p-8"><CheckCircle2 className="size-9 text-primary-strong" /><h2 className="mt-4 text-2xl font-bold">{tr('Контрольну завершено', 'Assessment completed')}</h2><p className="mt-3 text-text-secondary">{remaining === 0 ? tr('Час вичерпано. Надсилання відповідей закрито.', 'Time has expired. Submissions are closed.') : tr('Відповіді збережено. Редагування закрито.', 'Submitted answers are saved. Editing is closed.')}</p><p className="my-6 text-4xl font-bold">{lesson.controlReport?.finalGrade ?? '—'}<span className="text-base font-normal text-text-muted"> / 100</span></p><button className={button} onClick={() => { clearControlExamSession(); navigate('/edu/lessons'); }}><ArrowLeft className="mr-2 inline size-4" />{tr('До моїх уроків', 'Back to lessons')}</button></section>}
    {active && <main className="mt-6 grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-border bg-bg-surface p-4"><h2 className="font-bold">{tr('Склад роботи', 'Assessment sections')}</h2>{lesson.controlHasTheory && <><p className="mt-4 text-sm">{tr('Тест', 'Quiz')}: {lesson.quizSubmitted ? tr('Надіслано', 'Submitted') : `${answered}/${questions.length}`}</p><nav aria-label={tr('Запитання тесту', 'Quiz questions')} className="mt-3 grid grid-cols-5 gap-2">{questions.map((_, index) => <button key={index} onClick={() => setQuestionIndex(index)} aria-current={index === questionIndex ? 'step' : undefined} className={`rounded-lg border p-2 text-sm ${index === questionIndex ? 'border-primary bg-primary/15' : 'border-border'} ${answers[index] ? 'font-bold text-primary-strong' : ''}`}>{index + 1}</button>)}</nav></>}{tasks.length > 0 && <p className="mt-5 text-sm">{tr('Практика', 'Practice')}: {lesson.studentControlProgress?.completedTasks ?? 0}/{tasks.length}</p>}</aside>
      <div className="space-y-6">{lesson.controlHasTheory && <section className="rounded-2xl border border-border bg-bg-surface p-5 sm:p-8"><h2 className="text-lg font-bold">{tr('Тестова частина', 'Quiz')}</h2>{lesson.quizSubmitted ? <p className="mt-4 text-primary-strong">{tr('Тест надіслано.', 'Quiz submitted.')}</p> : question ? <><p className="mb-5 mt-2 text-sm text-text-muted">{tr('Запитання', 'Question')} {questionIndex + 1} / {questions.length}</p><MarkdownView content={question.question} /><fieldset disabled={busy || !active} className="mt-6 space-y-3"><legend className="sr-only">{tr('Оберіть відповідь', 'Select an answer')}</legend>{Object.entries(question.options).map(([key, value]) => <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${answers[questionIndex] === key ? 'border-primary bg-primary/10' : 'border-border'}`}><input className="mt-1" type="radio" name={`control-question-${questionIndex}`} checked={answers[questionIndex] === key} onChange={() => setAnswers(old => { const next = { ...old, [questionIndex]: key }; localStorage.setItem(draftKey, JSON.stringify(next)); return next; })} /><span className="font-bold">{key}</span><div className="min-w-0"><MarkdownView content={value} /></div></label>)}</fieldset><div className="mt-6 flex flex-wrap justify-between gap-3"><button className={button} disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => index - 1)}>{tr('Назад', 'Previous')}</button>{questionIndex < questions.length - 1 ? <button className={button} onClick={() => setQuestionIndex(index => index + 1)}>{tr('Далі', 'Next')}</button> : <button className={`${button} bg-primary text-primary-foreground`} disabled={busy || answered !== questions.length} onClick={() => { setBusy(true); void submitQuizAnswers(id, answers, true).then(() => { localStorage.removeItem(draftKey); return load(); }).catch(e => setError(getEduErrorMessage(e, tr('Не вдалося надіслати тест.', 'Could not submit quiz.')))).finally(() => setBusy(false)); }}>{tr('Надіслати тест', 'Submit quiz')}</button>}</div></> : <p role="alert" className="mt-4">{tr('Запитання недоступні. Оновіть дані або зверніться до вчителя.', 'Questions are unavailable. Refresh or contact your teacher.')}</p>}</section>}
      {tasks.length > 0 && <section className="rounded-2xl border border-border bg-bg-surface p-5"><h2 className="text-lg font-bold">{tr('Практичні завдання', 'Practice tasks')}</h2><div className="mt-4 space-y-3">{tasks.map((task, index) => <button key={task.id} className={`${button} flex w-full items-center justify-between text-left`} disabled={!lesson.studentControlProgress?.unlockedTaskIds.includes(task.id)} onClick={() => navigate(`/edu/tasks/${task.id}?source=legacy`)}><span>{index + 1}. {task.title}</span><span>{task.progressCompleted ? tr('Завершено', 'Completed') : lesson.studentControlProgress?.unlockedTaskIds.includes(task.id) ? tr('Відкрити IDE', 'Open IDE') : tr('Заблоковано', 'Locked')}</span></button>)}</div></section>}</div>
    </main>}
    <Modal open={confirm} title={tr('Здати контрольну?', 'Finish assessment?')} onClose={() => !busy && setConfirm(false)}><p>{tr('Збережені надсилання буде враховано. Ненадіслані частини отримають 0 балів. Повернутися до виконання після здачі не можна.', 'Saved submissions will be graded. Unsubmitted sections receive zero points. Finishing is final.')}</p><div className="mt-6 flex gap-3"><button className={button} disabled={busy} onClick={() => setConfirm(false)}>{tr('Продовжити', 'Continue')}</button><button className={`${button} bg-primary text-primary-foreground`} disabled={busy} onClick={() => void finish()}>{tr('Здати роботу', 'Finish assessment')}</button></div></Modal>
  </div>;
};
