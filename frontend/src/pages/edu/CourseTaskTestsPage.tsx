import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { getCourseTaskTests, saveCourseTaskTests, type CourseTestConfig } from "../../lib/api/edu";
import { getEduErrorMessage } from "../../lib/eduError";
import { tr } from "../../i18n";
import { useTranslation } from "react-i18next";
import { CourseTaskTestFields, validCourseTests } from "./CourseTaskTestFields";
import { Modal } from "../../components/ui/Modal";
import "./eduWorkspace.css";
export const CourseTaskTestsPage: React.FC = () => {
  useTranslation();
  const { taskId } = useParams(); const id = Number(taskId);
  const navigate = useNavigate();
  const [discardAction, setDiscardAction] = React.useState<"leave" | "reload" | null>(null);
  const [config, setConfig] = React.useState<CourseTestConfig | null>(null);
  const [draft, setDraft] = React.useState<CourseTestConfig | null>(null);
  const [loading, setLoading] = React.useState(true); const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null); const [saved, setSaved] = React.useState(false);
  const [reload, setReload] = React.useState(0); const generation = React.useRef(0); const saving = React.useRef(false);
  const dirty = Boolean(config && draft && (config.maxAttempts !== draft.maxAttempts || JSON.stringify(config.testData) !== JSON.stringify(draft.testData)));
  React.useEffect(() => { const token = ++generation.current; setLoading(true); setConfig(null); setDraft(null); setError(null); setSaved(false);
    getCourseTaskTests(id).then(next => { if (token === generation.current) { setConfig(next); setDraft(next); } })
      .catch(caught => { if (token === generation.current) setError(getEduErrorMessage(caught, tr("Не вдалося завантажити тести.", "Could not load tests."))); })
      .finally(() => { if (token === generation.current) setLoading(false); });
    return () => { ++generation.current; };
  }, [id, reload]);
  React.useEffect(() => { if (!dirty) return; const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", preventLoss); return () => window.removeEventListener("beforeunload", preventLoss); }, [dirty]);
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (!draft || !config || saving.current || !dirty || !validCourseTests(draft.testData)) return;
    const token = generation.current; saving.current = true; setBusy(true); setError(null); setSaved(false);
    try { const next = await saveCourseTaskTests(id, { testData: draft.testData, maxAttempts: draft.maxAttempts, expectedRevision: config.revision });
      if (token === generation.current) { setConfig(next); setDraft(next); setSaved(true); }
    } catch (caught) { if (token === generation.current) setError(getEduErrorMessage(caught, tr("Не вдалося зберегти тести. Ваші зміни залишилися у формі.", "Could not save tests. Your changes remain in the form."))); }
    finally { saving.current = false; setBusy(false); }
  };
  return <main className="edu-workspace mx-auto max-w-[960px] px-4 py-8 sm:px-6">
    {config && <Link to={`/edu/lessons/${config.task.lessonId}?source=course`} onClick={event => { if (busy || dirty) { event.preventDefault(); if (!busy) setDiscardAction("leave"); } }} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-strong"><ArrowLeft className="size-4" />{tr("До уроку", "Back to lesson")}</Link>}
    <header className="mt-4 border-b border-border pb-6"><p className="text-sm text-primary-strong">{tr("Автоматична перевірка", "Automatic grading")}</p><h1 className="mt-2 text-3xl font-bold">{config?.task.title || tr("Тести завдання", "Task tests")}</h1></header>
    {error && <div role="alert" className="mt-5 rounded-xl bg-accent-error/10 p-4 text-sm text-accent-error"><p>{error}</p>{dirty && <p className="mt-3">{tr("Оновлення замінить незбережені зміни поточними даними сервера.", "Reloading will replace unsaved changes with current server data.")}</p>}<button type="button" disabled={busy} onClick={() => dirty ? setDiscardAction("reload") : setReload(value => value + 1)} className="mt-3 min-h-11 font-semibold">{tr("Завантажити актуальні тести", "Load current tests")}</button></div>}
    {loading ? <p role="status" className="mt-6">{tr("Завантажуємо…", "Loading…")}</p> : draft && <form onSubmit={event => void save(event)} className="mt-6 space-y-6">
      {config?.gradingLocked && <p className="rounded-xl bg-bg-hover p-4 text-sm">{tr("Учні вже почали контрольну або здали роботу. Тести й бали зафіксовано. Ви можете надати додаткові спроби.", "Students have started this assessment or submitted work. Tests and points are frozen. You can grant extra attempts.")}</p>}
      <CourseTaskTestFields disabled={busy || config?.gradingLocked} tests={draft.testData} onChange={testData => { setDraft({ ...draft, testData }); setSaved(false); }} />
      <label className="block max-w-xs text-sm font-semibold">{tr("Спроб на учня", "Attempts per student")}<input disabled={busy} required type="number" min={1} max={100} step={1} value={draft.maxAttempts} onChange={event => { setDraft({ ...draft, maxAttempts: Number(event.target.value) }); setSaved(false); }} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg-base px-4 py-3" /></label>
      <div className="flex flex-wrap items-center gap-4"><button type="submit" disabled={busy || !dirty || !validCourseTests(draft.testData) || !Number.isSafeInteger(draft.maxAttempts) || draft.maxAttempts < 1 || draft.maxAttempts > 100} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"><Save className="size-4" />{busy ? tr("Зберігаємо…", "Saving…") : tr("Зберегти перевірку", "Save grading setup")}</button>{saved && <p role="status" className="text-sm text-primary-strong">{tr("Перевірку збережено.", "Grading setup saved.")}</p>}</div>
    </form>}
    <Modal open={discardAction !== null} title={tr("Є незбережені зміни", "You have unsaved changes")} onClose={() => setDiscardAction(null)}>
      <p className="text-sm text-text-secondary">{tr("Залиште форму відкритою, щоб зберегти налаштовані тести, або відкиньте зміни.", "Keep this form open to save your test setup, or discard the changes.")}</p>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setDiscardAction(null)} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground">{tr("Продовжити редагування", "Keep editing")}</button><button type="button" onClick={() => { const action = discardAction; setDiscardAction(null); if (action === "reload") setReload(value => value + 1); else if (config) navigate(`/edu/lessons/${config.task.lessonId}?source=course`); }} className="min-h-11 rounded-xl border border-border px-4 font-semibold text-accent-error">{tr("Відкинути зміни", "Discard changes")}</button></div>
    </Modal>
  </main>;
};
