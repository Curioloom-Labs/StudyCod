import React, { useCallback, useEffect, useState } from "react";
import { tr } from "../i18n";
import { ArrowRight, BookOpen, ClipboardList, FileText, Loader2, RefreshCw } from "lucide-react";
import { MarkdownView } from "./MarkdownView";
import {
  getSessionMaterials,
  getClassLessonsList,
  setSessionLesson,
  type SessionMaterials,
  type LessonBrief,
} from "../lib/api/liveClassroom";
import { withDevPreview } from "../lib/devPreview";

type Props = {
  classId: number;
  sessionId: number;
  isTeacher: boolean;
};

/**
 * In-room lesson materials: the attached lesson's theory + task list shown beside
 * the video, so a live session is an actual lesson, not just a call. A teacher
 * can attach/swap which lesson is shown; students get a read-only view and can
 * open a task in a new tab (which then streams their code back to the teacher).
 */
export const LessonMaterialsPanel: React.FC<Props> = ({ classId, sessionId, isTeacher }) => {
  const [materials, setMaterials] = useState<SessionMaterials | null>(null);
  const [lessons, setLessons] = useState<LessonBrief[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsError, setLessonsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStale, setSyncStale] = useState(false);
  const [updateNotice, setUpdateNotice] = useState(false);
  const materialsRef = React.useRef<SessionMaterials | null>(null);
  const receivedInitialRef = React.useRef(false);
  const noticeTimerRef = React.useRef<number | null>(null);

  const applyMaterials = useCallback((next: SessionMaterials) => {
    const current = materialsRef.current;
    const changed = receivedInitialRef.current && current != null && (
      current.lessonId !== next.lessonId
      || current.title !== next.title
      || current.hasTheory !== next.hasTheory
      || current.theory !== next.theory
      || current.tasks.map((task) => `${task.id}:${task.title}`).join("\n")
        !== next.tasks.map((task) => `${task.id}:${task.title}`).join("\n")
    );
    receivedInitialRef.current = true;
    materialsRef.current = next;
    setMaterials(next);
    setError(null);
    setSyncStale(false);
    if (changed && !isTeacher) {
      setUpdateNotice(true);
      if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => {
        noticeTimerRef.current = null;
        setUpdateNotice(false);
      }, 5000);
    }
  }, [isTeacher]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyMaterials(await getSessionMaterials(sessionId));
    } catch {
      setError(tr("Не вдалося завантажити матеріали уроку.", "Could not load lesson materials."));
    } finally {
      setLoading(false);
    }
  }, [sessionId, applyMaterials]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadLessons = useCallback(async () => {
    setLessonsLoading(true);
    setLessonsError(false);
    try {
      setLessons(await getClassLessonsList(classId));
    } catch {
      setLessonsError(true);
    } finally {
      setLessonsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (isTeacher) void loadLessons();
  }, [isTeacher, loadLessons]);

  useEffect(() => () => {
    if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  // A teacher can change the shared lesson while students are already in the
  // room. Keep the side panel in sync without forcing a tab switch or reload.
  useEffect(() => {
    if (isTeacher) return;
    let cancelled = false;
    let pending = false;
    const refreshSharedMaterials = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await getSessionMaterials(sessionId);
        if (!cancelled) applyMaterials(next);
      } catch {
        // Keep the last lesson visible during a transient network failure.
        if (!cancelled) {
          if (!materialsRef.current) {
            setError(tr("Не вдалося завантажити матеріали уроку.", "Could not load lesson materials."));
            setLoading(false);
          } else {
            setSyncStale(true);
          }
        }
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(() => void refreshSharedMaterials(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, isTeacher, applyMaterials]);

  const attach = useCallback(
    async (lessonId: number | null) => {
      setBusy(true);
      setError(null);
      try {
        await setSessionLesson(sessionId, lessonId);
        await load();
      } catch {
        setError(tr("Не вдалося змінити матеріал уроку. Спробуйте ще раз.", "Could not update lesson materials. Please try again."));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, load]
  );

  return (
    <div className="edu-live-materials flex h-full flex-col bg-bg-surface">
      <div className="edu-live-materials__head">
        <div className="min-w-0"><p><BookOpen className="size-4" />{tr("Тема онлайн-уроку", "Live lesson topic")}</p><h2 title={materials?.title || undefined}>{materials?.title || tr("Матеріали уроку", "Lesson materials")}</h2></div>
        {isTeacher && (
          <select
            value={materials?.lessonId ?? ""}
            disabled={busy || loading || lessonsLoading}
            onChange={(e) => void attach(e.target.value === "" ? null : Number(e.target.value))}
            aria-label={tr("Вибрати матеріал уроку", "Choose lesson materials")}
            className="edu-live-materials__select"
          >
            <option value="">{lessonsLoading || loading ? tr("Завантажуємо уроки…", "Loading lessons…") : lessonsError ? tr("Не вдалося завантажити уроки", "Could not load lessons") : lessons.length ? tr("— без прив’язаної теми —", "— no lesson attached —") : tr("У класі ще немає уроків", "No lessons in this class yet")}</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        )}
      </div>

      <div className="edu-live-materials__content min-h-0 flex-1 overflow-y-auto p-4">
        {updateNotice && <p role="status" aria-live="polite" className="edu-live-materials__updated">{tr("Викладач оновив матеріали уроку.", "The teacher updated the lesson materials.")}</p>}
        {isTeacher && lessonsError && <p role="status" className="edu-live-materials__stale">{tr("Список уроків не завантажився.", "The lesson list could not be loaded.")} <button type="button" onClick={() => void loadLessons()}>{tr("Спробувати знову", "Retry")}</button></p>}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-text-muted dark:text-text-secondary"><Loader2 className="size-4 animate-spin" />{tr("Завантажуємо матеріали…", "Loading materials…")}</div>
        ) : error && !materials ? (
          <div role="alert" className="edu-live-materials__empty"><p>{error}</p><button type="button" onClick={() => void load()}><RefreshCw className="size-4" />{tr("Повторити", "Retry")}</button></div>
        ) : !materials ? (
          <p className="text-sm text-text-secondary">{tr("Матеріали поки недоступні.", "Materials are currently unavailable.")}</p>
        ) : materials.lessonId == null ? (
          <div className="edu-live-materials__empty">
            {(error || syncStale) && <p role="status" className="edu-live-materials__stale">{tr("Показано останній стан. Не вдалося перевірити оновлення.", "Showing the last available state. Could not check for updates.")} <button type="button" onClick={() => void load()}>{tr("Оновити", "Refresh")}</button></p>}
            <span><FileText className="size-5" /></span>
            <strong>{tr("Тему ще не вибрано", "No topic selected yet")}</strong>
            <p>
            {isTeacher
                ? tr("Виберіть тему вище — її пояснення й практичні задачі одразу з’являться тут для всього класу.", "Choose a topic above to show its explanation and practice here for the class.")
                : tr("Викладач ще не прикріпив тему до заняття. Можна слухати пояснення й повернутися сюди пізніше.", "Your teacher has not attached a topic yet. You can follow the discussion and return here later.")}
            </p>
          </div>
        ) : (
          <>
            {(error || syncStale) && <p role="status" className="edu-live-materials__stale">{tr("Показано останній стан. Не вдалося перевірити оновлення.", "Showing the last available state. Could not check for updates.")} <button type="button" onClick={() => void load()}>{tr("Оновити", "Refresh")}</button></p>}
            {materials.hasTheory && materials.theory && <div className="edu-live-materials__section-title"><FileText className="size-4" />{tr("Пояснення", "Explanation")}</div>}
            {materials.hasTheory && materials.theory && (
              <div className="edu-live-materials__theory prose mb-5 max-w-none text-sm dark:prose-invert">
                <MarkdownView content={materials.theory} />
              </div>
            )}
            {materials.tasks.length > 0 && (
              <section className="edu-live-materials__tasks">
                <div className="edu-live-materials__section-title"><ClipboardList className="size-4" />{tr("Практика уроку", "Lesson practice")}<span>{materials.tasks.length}</span></div>
                <ul>
                  {materials.tasks.map((task, index) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const returnTo = `${window.location.pathname}${window.location.search}`;
                          const url = new URL(withDevPreview(`/edu/tasks/${task.id}`), window.location.origin);
                          url.searchParams.set("returnTo", returnTo);
                          window.open(url.toString(), "_blank", "noopener,noreferrer");
                        }}
                        className="edu-live-materials__task"
                        title={task.title}
                      >
                        <span className="edu-live-materials__task-index">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1"><strong>{task.title}</strong><small>{tr("Практична задача", "Practice problem")}</small></span>
                        <ArrowRight className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!materials.hasTheory && materials.tasks.length === 0 && (
              <div className="edu-live-materials__empty"><span><FileText className="size-5" /></span><strong>{tr("Матеріалів ще немає", "No materials yet")}</strong><p>{tr("Для цієї теми поки не додано пояснення або практичні задачі.", "This topic does not have an explanation or practice problems yet.")}</p></div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LessonMaterialsPanel;
