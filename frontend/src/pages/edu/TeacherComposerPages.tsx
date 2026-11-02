import React from "react";
import "./eduWorkspace.css";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Save } from "lucide-react";
import { api } from "../../lib/api/client";
import { type EduLanguage } from "../../lib/api/edu";
import { enabledJudgeLanguages, JUDGE_LANGUAGE_LABELS } from "../../lib/judgeLanguages";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { withDevPreview } from "../../lib/devPreview";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const shell = "edu-workspace edu-composer-page mx-auto max-w-[1180px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12";
const input = "mt-2 w-full rounded-2xl border border-border/12 bg-white px-4 py-3 text-base outline-none ring-primary/25 transition placeholder:text-text-secondary focus:ring-4 dark:border-white/10 dark:bg-bg-surface";
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => <label className="block"><span className="text-sm font-bold text-text-primary dark:text-text-primary">{label}</span>{hint && <span className="ml-2 text-xs text-text-muted dark:text-text-secondary">{hint}</span>}{children}</label>;

const ComposerHeader: React.FC<{ eyebrow: string; title: string; text: string; classId?: string }> = ({ eyebrow, title, text, classId }) => { const navigate = useNavigate(); return <header className="edu-composer-hero grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><button type="button" onClick={() => navigate(withDevPreview(`/edu/classes/${classId}`, window.location.search, "teacher"))} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted transition hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"><ArrowLeft className="size-4" />{tr("До класу", "Back to class")}</button><p className="text-xs font-bold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{eyebrow}</p><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{title}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-text-muted dark:text-text-secondary">{text}</p></div><div className="edu-composer-hero__status rounded-2xl border border-border/10 bg-white px-5 py-4 text-sm text-text-muted shadow-[0_14px_40px_rgba(12,36,20,.05)] dark:border-white/10 dark:bg-bg-surface dark:text-text-secondary"><b className="block text-text-primary dark:text-white">{tr("Чернетка", "Draft")}</b><span className="mt-1 block">{tr("Зміни збережуться після створення.", "Changes will be saved after creation.")}</span></div></header> };

export const CreateTopicWorkspace: React.FC = () => {
  useTranslation();
  const { classId } = useParams<{ classId: string }>(); const navigate = useNavigate();
  const [title, setTitle] = React.useState(""); const [description, setDescription] = React.useState(""); const [language, setLanguage] = React.useState<EduLanguage>("PYTHON"); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (busy || !title.trim()) return; setBusy(true); try { if (!preview()) await api.post("/topics", { title: title.trim(), description: description.trim() || null, language, classId: Number(classId) }); navigate(withDevPreview(`/edu/classes/${classId}`, window.location.search, "teacher")); } catch (caught) { setError(getErrorMessageFromUnknown(caught, tr("Не вдалося створити тему.", "Could not create the topic."))); } finally { setBusy(false); } };
 return <div className={shell}><ComposerHeader eyebrow={tr("EDU / структура курсу", "EDU / course structure")} title={tr("Нова тема", "New topic")} text={tr("Зберіть практику, пояснення й контрольні в одній темі.", "Bring practice, explanations, and tests together in one topic.")} classId={classId} /><form onSubmit={submit} className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="space-y-6 rounded-[30px] border border-border/10 bg-white p-6 shadow-[0_20px_56px_rgba(12,36,20,.06)] dark:border-white/[.09] dark:bg-bg-surface sm:p-8"><Field label={tr("Назва теми", "Topic title")}><input required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} className={input} placeholder={tr("Наприклад, Масиви та цикли", "For example, Arrays and loops")} /></Field><Field label={tr("Навчальний контекст", "Learning context")} hint={tr("Побачать учні перед стартом", "Students see this before starting")}><textarea value={description} onChange={(event) => setDescription(event.target.value)} className={`${input} min-h-40 resize-y`} placeholder={tr("Що учні навчаться робити, чому це важливо і з якої практики почати.", "What students will learn, why it matters, and which practice to start with.")} /></Field><Field label={tr("Мова теми", "Topic language")}><select value={language} onChange={(event) => setLanguage(event.target.value as EduLanguage)} className={input}>{enabledJudgeLanguages().map((item) => <option key={item} value={item.toUpperCase()}>{JUDGE_LANGUAGE_LABELS[item]}</option>)}</select></Field>{error && <p role="alert" className="rounded-2xl bg-accent-error/10 px-4 py-3 text-sm font-medium text-accent-error dark:text-accent-error">{error}</p>}<button type="submit" disabled={busy || !title.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_12px_26px_rgba(14,60,31,.18)] disabled:opacity-45 dark:bg-primary dark:text-primary-foreground"><Save className="size-4" />{busy ? tr("Створюємо…", "Creating…") : tr("Створити тему", "Create topic")}</button></section><aside className="edu-composer-steps rounded-[28px] bg-bg-surface p-6 text-text-primary"><span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary-strong"><BookOpen className="size-5" /></span><h2 className="mt-6 text-xl font-bold">{tr("Що буде далі", "What happens next")}</h2><ol className="mt-5 space-y-4 text-sm leading-6 text-text-secondary"><li><b className="mr-2 text-primary-strong">01</b>{tr("Додайте уроки або контрольну.", "Add lessons or a test.")}</li><li><b className="mr-2 text-primary-strong">02</b>{tr("Під’єднайте задачі з бібліотеки.", "Add tasks from the library.")}</li><li><b className="mr-2 text-primary-strong">03</b>{tr("Відкрийте тему для класу, коли все готово.", "Open the topic to the class when everything is ready.")}</li></ol></aside></form></div>;
};


export const CreateLessonWorkspace: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const topicId = Number(searchParams.get("topicId") || 0);

  React.useEffect(() => {
    const destination = Number.isSafeInteger(topicId) && topicId > 0
      ? `/edu/topics/${topicId}?createClasswork=1`
      : `/edu/classes/${classId}`;
    navigate(withDevPreview(destination, window.location.search, "teacher"), { replace: true });
  }, [classId, topicId, navigate]);

  return null;
};
