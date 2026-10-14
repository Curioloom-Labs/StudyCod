import "./eduWorkspace.css";
import React from "react";
import { MarkdownView } from "../../components/MarkdownView";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, FileUp, Plus, Save, Send, Trash2, UsersRound } from "lucide-react";
import { api } from "../../lib/api/client";
import { getTaskRubric, setTaskRubric, type RubricCriterion } from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

const root = "edu-workspace mx-auto max-w-[1160px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10";
const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
type Submission = { studentId?: number; studentName?: string; text: string | null; hasFile: boolean; fileName: string | null; status: string; updatedAt?: string; revision?: string; grade?: { score: number | null; maxScore: number | null; total: number | null; feedback: string | null } | null };
const studentDemo: Submission = { text: "Я обрав словник, бо він дозволяє зберігати частоту кожного слова за ключем.", hasFile: true, fileName: "analysis.pdf", status: "SUBMITTED", updatedAt: new Date().toISOString() };
const listDemo: Submission[] = [{ studentId: 1, studentName: "Марія Коваль", text: "Додаю пояснення алгоритму та приклади.", hasFile: true, fileName: "solution.pdf", status: "SUBMITTED" }, { studentId: 2, studentName: "Дмитро Левченко", text: "Посилання на репозиторій і короткий опис.", hasFile: false, fileName: null, status: "DRAFT" }];

export const ManualSubmissionCanvas: React.FC<{ user?: { id: number; studentId?: number | null } }> = ({ user }) => {
  useTranslation();
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [taskInfo, setTaskInfo] = React.useState<{ title: string; description: string; lessonId: number; deadline?: string | null; isClosed?: boolean; submissionAllowed?: boolean; submissionBlockedReason?: string | null; rubric?: RubricCriterion[] } | null>(null);
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [existing, setExisting] = React.useState<Submission | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const draftKey = user?.studentId ? `studycod.edu.manual.${user.studentId}.${taskId}` : null;
  const [draftSaved, setDraftSaved] = React.useState(false);
  const serverRevision = React.useRef<string | null>(null);
  const clearDraft = () => {
    try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* Storage can be unavailable. */ }
    setDraftSaved(false);
  };
  const changeText = (value: string) => {
    setText(value); setSubmitted(false);
    if (draftKey && !preview()) {
      try { localStorage.setItem(draftKey, JSON.stringify({ text: value, revision: serverRevision.current })); setDraftSaved(true); }
      catch { setDraftSaved(false); }
    }
  };
  const generation = React.useRef(0);
  const pending = React.useRef(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const load = React.useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const { data } = await api.get(`/edu/manual-tasks/${taskId}/submission`);
      if (current !== generation.current) return;
      setTaskInfo(data?.task ?? null);
      const value = data?.submission ?? null;
      setExisting(value);
      serverRevision.current = value?.revision ?? null;
      let nextText = value?.text || "";
      if (value?.status === "GRADED") {
        try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* Storage can be unavailable. */ }
        setDraftSaved(false);
      } else if (draftKey) {
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
          if (typeof draft?.text === "string" && draft.text.length <= 50000 && draft.revision === serverRevision.current) {
            nextText = draft.text; setDraftSaved(true);
          }
        } catch { /* Ignore invalid or unavailable drafts. */ }
      }
      setText(nextText);
      setError(null);
    } catch (caught) {
      if (current !== generation.current) return;
      if (preview()) { setExisting(studentDemo); setText(studentDemo.text || ""); }
      else {
        setLoadFailed(true);
        setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити відповідь.", "Could not load the submission.")));
      }
    } finally { if (current === generation.current) setLoading(false); }
  }, [taskId, draftKey]);
  React.useEffect(() => {
    setTaskInfo(null); setText(""); setFile(null); setExisting(null); setError(null); setSubmitted(false); setDraftSaved(false);
    if (fileInput.current) fileInput.current.value = "";
    void load();
    return () => { ++generation.current; };
  }, [load]);
  const taskClosed = Boolean(taskInfo?.submissionAllowed === false || taskInfo?.isClosed || (taskInfo?.deadline && Date.now() > new Date(taskInfo.deadline).getTime()));
  const disabled = taskClosed || busy || loading || loadFailed || existing?.status === "GRADED";
  const submit = async () => {
    if (pending.current || disabled) return;
    if (!text.trim() && !file && !existing?.hasFile) {
      setError(tr("Додайте текст відповіді або файл.", "Add response text or attach a file.")); return;
    }
    pending.current = true;
    setBusy(true); setError(null); setSubmitted(false);
    const current = generation.current;
    try {
      let saved: Submission = { text: text.trim(), hasFile: Boolean(file || existing?.hasFile), fileName: file?.name ?? existing?.fileName ?? null, status: "SUBMITTED" };
      if (!preview()) {
        const form = new FormData();
        form.append("text", text.trim());
        if (file) form.append("file", file);
        const response = await api.post(`/edu/manual-tasks/${taskId}/submit`, form);
        saved = { ...saved, ...response.data.submission };
      }
      if (current !== generation.current) return;
      serverRevision.current = saved.revision ?? null;
      setExisting(saved); setText(saved.text || ""); setFile(null); setSubmitted(true); clearDraft();
      if (fileInput.current) fileInput.current.value = "";
    } catch (caught) {
      if (current === generation.current) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося надіслати роботу.", "Could not submit the work.")));
    } finally { pending.current = false; setBusy(false); }
  };
  return <div className={root}><button type="button" onClick={() => taskInfo?.lessonId ? navigate(`/edu/lessons/${taskInfo.lessonId}?source=course`) : navigate(-1)} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"><ArrowLeft className="h-4 w-4" />{tr("Назад", "Back")}</button><header className="rounded-[32px] bg-bg-surface p-6 dark:bg-bg-base sm:p-10"><p className="text-xs font-bold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{tr("Практика з ручною перевіркою", "Practice with manual review")}</p><h1 className="mt-3 max-w-2xl font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] sm:text-5xl">{taskInfo?.title || tr("Завдання з ручною перевіркою", "Task with manual review")}</h1><p className="mt-4 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary">{tr("Додайте пояснення, посилання або файл. Відповідь можна оновити до моменту перевірки.", "Add an explanation, a link, or a file. You can update your response until it is reviewed.")}</p></header>{error && <div role="alert" aria-live="polite" className="mt-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm text-accent-error dark:text-accent-error">{error}</div>}{loadFailed && <button type="button" onClick={() => void load()} className="mt-4 text-sm font-bold text-primary-strong">{tr("Спробувати ще раз", "Try again")}</button>}{submitted && <p role="status" className="mt-5 text-sm font-bold text-primary-strong">{tr("Роботу збережено та надіслано на перевірку.", "Your work is saved and submitted for review.")}</p>}<main className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]"><section className="rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface sm:p-8">{taskInfo?.description && <section className="mb-7 border-b border-border pb-7"><h2 className="mb-4 text-lg font-bold">{tr("Умова завдання", "Task instructions")}</h2><div className="min-w-0 break-words"><MarkdownView content={taskInfo.description} variant="task" /></div></section>}<h2 className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">{tr("Ваша відповідь", "Your response")}</h2><label htmlFor="manual-submission-text" className="sr-only">{tr("Текст відповіді", "Response text")}</label><textarea id="manual-submission-text" name="submissionText" disabled={disabled} maxLength={50000} value={text} onChange={(event) => changeText(event.target.value)} placeholder={tr("Опишіть хід думок, прикріпіть посилання або додайте короткий висновок…", "Explain your reasoning, attach a link, or add a short conclusion…")} rows={12} className="mt-4 w-full resize-none rounded-2xl border border-border/10 bg-bg-surface px-4 py-4 text-sm leading-7 outline-none dark:border-white/10 dark:bg-bg-code" />{draftSaved && <p role="status" className="mt-3 text-xs text-text-muted">{tr("Текст чернетки збережено у цьому браузері. Після перезавантаження файл потрібно обрати знову.", "Draft text is saved in this browser. Choose the file again after reloading.")}</p>}<label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-border/20 bg-bg-hover p-4 transition hover:bg-bg-hover dark:border-white/15 dark:bg-white/[.035] dark:hover:bg-white/[.06]"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-primary-strong shadow-sm dark:bg-bg-base dark:text-primary-soft"><FileUp className="h-5 w-5" /></span><div><p className="text-sm font-bold">{tr("Додати файл", "Add file")}</p><p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{tr("PDF, зображення, документ, архів або код · до 15 МБ", "PDF, image, document, archive, or code · up to 15 MB")}</p></div></div><span className="text-xs font-bold text-primary-strong dark:text-primary-soft">{file?.name || tr("Обрати", "Choose file")}</span><input id="manual-submission-file" name="submissionFile" disabled={disabled} ref={fileInput} type="file" accept=".pdf,.txt,.md,.zip,.png,.jpg,.jpeg,.docx,.py,.java,.cpp,.js" className="sr-only" onChange={(event) => {
        const selected = event.target.files?.[0] || null;
        if (selected && selected.size > 15 * 1024 * 1024) {
          setError(tr("Розмір файлу має бути до 15 МБ.", "The file must be 15 MB or smaller."));
          event.target.value = ""; setFile(null); return;
        }
        setFile(selected); setError(null); setSubmitted(false);
      }} /></label><button type="button" disabled={disabled || (!text.trim() && !file && !existing?.hasFile)} onClick={() => void submit()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"><Send className="h-4 w-4" />{busy ? tr("Надсилаємо…", "Submitting…") : tr("Надіслати на перевірку", "Submit for review")}</button></section><aside className="space-y-5">{taskInfo?.deadline && <p className="rounded-2xl border border-border p-4 text-sm">{tr("Здати до:", "Due:")} <time dateTime={taskInfo.deadline}>{new Date(taskInfo.deadline).toLocaleString()}</time></p>}{taskClosed && <p role="status" className="rounded-2xl bg-accent-warn/10 p-4 text-sm">{taskInfo?.submissionBlockedReason ? getErrorMessageFromUnknown({ response: { data: { message: taskInfo.submissionBlockedReason } } }, tr("Здача зараз недоступна.", "Submissions are currently unavailable.")) : tr("Здачу закрито або термін минув. Збережені відповіді та результати доступні для перегляду.", "Submissions are closed or the deadline has passed. Saved work and results remain available.")}</p>}{Boolean(taskInfo?.rubric?.length) && <section className="rounded-[30px] border border-border bg-bg-surface p-6"><h2 className="text-lg font-bold">{tr("Критерії оцінювання", "Grading criteria")}</h2><ul className="mt-4 space-y-3">{taskInfo?.rubric?.map(criterion => <li key={criterion.id} className="flex justify-between gap-4 text-sm"><span className="min-w-0 break-words">{criterion.label}</span><span className="shrink-0 font-bold">{criterion.maxPoints} {tr("балів", "points")}</span></li>)}</ul></section>}{existing?.grade && <section className="rounded-[30px] border border-primary/20 bg-bg-surface p-6"><h2 className="text-lg font-bold">{tr("Результат перевірки", "Review result")}</h2><p className="mt-3 text-3xl font-bold">{existing.grade.score ?? existing.grade.total ?? 0}<span className="ml-2 text-base text-text-muted">/ {existing.grade.maxScore ?? 100}</span></p>{existing.grade.feedback && <div className="mt-4"><h3 className="text-sm font-bold">{tr("Коментар учителя", "Teacher feedback")}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{existing.grade.feedback}</p></div>}</section>}<section className="rounded-[30px] bg-bg-hover p-6 dark:bg-[var(--surface-warning)]"><p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn dark:text-accent-warn">{tr("Статус", "Status")}</p><p className="mt-3 text-2xl font-bold">{loading ? tr("Завантажуємо…", "Loading…") : existing?.status === "GRADED" ? tr("Перевірено", "Reviewed") : existing ? tr("На перевірці", "Under review") : tr("Чернетка", "Draft")}</p><p className="mt-3 text-sm leading-6 text-accent-warn dark:text-accent-warn">{existing?.hasFile ? tr(`Прикріплено: ${existing.fileName || "файл"}`, `Attached: ${existing.fileName || "file"}`) : tr("Файл не прикріплено.", "No file attached.")}</p></section><section className="rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface"><Check className="h-5 w-5 text-primary-strong dark:text-primary-soft" /><p className="mt-3 text-sm font-bold">{tr("Що допоможе перевірці", "Tips for review")}</p><ul className="mt-3 space-y-2 text-sm leading-6 text-text-muted dark:text-text-secondary"><li>{tr("Коротко поясніть рішення.", "Briefly explain your solution.")}</li><li>{tr("Підпишіть, що саме у файлі.", "Label what is included in the file.")}</li><li>{tr("Перевірте посилання перед надсиланням.", "Check links before submitting.")}</li></ul></section></aside></main></div>;
};

export const ManualReviewCanvas: React.FC = () => {
  useTranslation();
  const { taskId } = useParams<{ taskId: string }>(); const navigate = useNavigate(); const [submissions, setSubmissions] = React.useState<Submission[]>([]); const [rubric, setRubric] = React.useState<RubricCriterion[]>([]); const [loading, setLoading] = React.useState(true); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { setLoading(true); try { const [subs, current] = await Promise.all([api.get(`/edu/manual-tasks/${taskId}/submissions`), getTaskRubric(Number(taskId)).catch(() => ({ rubric: [] as RubricCriterion[] }))]); setSubmissions(subs.data?.submissions ?? []); setRubric(current.rubric || []); setError(null); } catch (caught) { if (preview()) { setSubmissions(listDemo); setRubric([{ id: "logic", label: "Логіка рішення", maxPoints: 6 }, { id: "clarity", label: "Пояснення", maxPoints: 4 }]); } else setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити роботи.", "Could not load submissions."))); } finally { setLoading(false); } }, [taskId]);
  React.useEffect(() => { void load(); }, [load]);
  const update = (id: string, patch: Partial<RubricCriterion>) => setRubric((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const save = async () => { setBusy(true); try { const cleaned = rubric.filter((item) => item.label.trim() && item.maxPoints > 0); if (!preview()) { const result = await setTaskRubric(Number(taskId), cleaned); setRubric(result.rubric); } } catch (caught) { setError(getErrorMessageFromUnknown(caught, tr("Не вдалося зберегти рубрику.", "Could not save the rubric."))); } finally { setBusy(false); } };
  return <div className={root}><button type="button" onClick={() => navigate(-1)} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"><ArrowLeft className="h-4 w-4" />{tr("До класу", "Back to class")}</button><header className="flex flex-col justify-between gap-5 rounded-[32px] bg-bg-base p-6 text-text-primary sm:p-10 lg:flex-row lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary-soft">{tr("Ручна перевірка", "Manual review")}</p><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] sm:text-5xl">{tr("Черга робіт і критерії", "Submission queue and rubric")}</h1><p className="mt-4 max-w-xl text-base leading-7 text-text-secondary">{tr("Подивіться, що надійшло, і зробіть очікування для учнів видимими через коротку рубрику.", "Review submissions and make expectations clear with a short rubric.")}</p></div><span className="rounded-2xl bg-white/10 px-5 py-4 text-sm font-bold">{submissions.length} {tr("робіт", "submissions")}</span></header>{error && <div className="mt-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm text-accent-error dark:text-accent-error">{error}</div>}<main className="mt-8 grid gap-6 xl:grid-cols-[1fr_390px]"><section><div className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-accent-warn" /><h2 className="text-2xl font-bold tracking-[-.04em]">{tr("Надіслані роботи", "Submitted work")}</h2></div><div className="mt-5 space-y-3">{loading ? <div className="h-60 animate-pulse rounded-[28px] bg-bg-hover dark:bg-white/[.05]" /> : submissions.map((entry, index) => <article key={`${entry.studentId}-${index}`} className="rounded-[24px] border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold">{entry.studentName || `${tr("Учень", "Student")} ${index + 1}`}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted dark:text-text-secondary">{entry.text || tr("Текстової відповіді немає.", "No written response.")}</p>{entry.hasFile && <p className="mt-3 text-xs font-bold text-primary-strong dark:text-primary-soft">{tr("Файл:", "File:")} {entry.fileName || tr("вкладення", "attachment")}</p>}</div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${entry.status === "GRADED" ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-bg-hover text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn"}`}>{entry.status === "GRADED" ? tr("Перевірено", "Reviewed") : tr("Очікує", "Pending")}</span></div></article>)}{!loading && !submissions.length && <div className="rounded-[28px] border border-dashed border-border/15 px-6 py-20 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Роботи ще не надійшли.", "No submissions yet.")}</div>}</div></section><aside className="rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface"><p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">{tr("Рубрика", "Rubric")}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">{tr("Критерії", "Criteria")}</h2><div className="mt-6 space-y-3">{rubric.map((item) => <div key={item.id} className="grid grid-cols-[1fr_72px_30px] items-center gap-2"><label htmlFor={`rubric-label-${item.id}`} className="sr-only">{tr("Назва критерію", "Criterion name")}</label><input id={`rubric-label-${item.id}`} name={`rubric-label-${item.id}`} value={item.label} onChange={(event) => update(item.id, { label: event.target.value })} placeholder={tr("Критерій", "Criterion")} className="rounded-xl border border-border/10 bg-bg-surface px-3 py-2.5 text-sm dark:border-white/10 dark:bg-bg-code" /><label htmlFor={`rubric-points-${item.id}`} className="sr-only">{tr("Максимум балів", "Maximum points")}</label><input id={`rubric-points-${item.id}`} name={`rubric-points-${item.id}`} value={item.maxPoints} onChange={(event) => update(item.id, { maxPoints: Number(event.target.value) || 0 })} type="number" min="1" className="rounded-xl border border-border/10 bg-bg-surface px-3 py-2.5 text-sm dark:border-white/10 dark:bg-bg-code" /><button type="button" onClick={() => setRubric((items) => items.filter((value) => value.id !== item.id))} className="text-accent-error dark:text-accent-error"><Trash2 className="h-4 w-4" /></button></div>)}</div><button type="button" onClick={() => setRubric((items) => [...items, { id: `c_${Date.now()}`, label: "", maxPoints: 10 }])} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary-strong dark:text-primary-soft"><Plus className="h-4 w-4" />{tr("Додати критерій", "Add criterion")}</button><button type="button" disabled={busy} onClick={() => void save()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"><Save className="h-4 w-4" />{busy ? tr("Зберігаємо…", "Saving…") : tr("Зберегти рубрику", "Save rubric")}</button></aside></main></div>;
};
