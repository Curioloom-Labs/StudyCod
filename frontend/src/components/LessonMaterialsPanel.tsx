import React, { useCallback, useEffect, useState } from "react";
import { tr } from "../i18n";
import { MarkdownView } from "./MarkdownView";
import {
  getSessionMaterials,
  getClassLessonsList,
  setSessionLesson,
  type SessionMaterials,
  type LessonBrief,
} from "../lib/api/liveClassroom";

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
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMaterials(await getSessionMaterials(sessionId));
    } catch {
      setMaterials({ lessonId: null, title: null, theory: null, hasTheory: false, tasks: [] });
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isTeacher) return;
    getClassLessonsList(classId).then(setLessons).catch(() => setLessons([]));
  }, [isTeacher, classId]);

  const attach = useCallback(
    async (lessonId: number | null) => {
      setBusy(true);
      try {
        await setSessionLesson(sessionId, lessonId);
        await load();
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [sessionId, load]
  );

  return (
    <div className="flex h-full flex-col bg-bg-base">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate text-[11px] font-mono text-primary">
          📚 {materials?.title || tr("Матеріали уроку", "Lesson materials")}
        </span>
        {isTeacher && (
          <select
            value={materials?.lessonId ?? ""}
            disabled={busy}
            onChange={(e) => void attach(e.target.value === "" ? null : Number(e.target.value))}
            className="max-w-[12rem] rounded border border-border bg-bg-code px-2 py-0.5 text-[11px] font-mono text-text-primary focus:border-primary focus:outline-none"
          >
            <option value="">{tr("— без уроку —", "— no lesson —")}</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!materials ? (
          <p className="text-xs font-mono text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
        ) : materials.lessonId == null ? (
          <p className="text-xs font-mono text-text-secondary">
            {isTeacher
              ? tr("Оберіть урок угорі, щоб показати його теорію й задачі учням.", "Pick a lesson above to show its theory and tasks to students.")
              : tr("Вчитель ще не відкрив матеріали уроку.", "The teacher hasn't opened lesson materials yet.")}
          </p>
        ) : (
          <>
            {materials.hasTheory && materials.theory && (
              <div className="prose prose-invert mb-4 max-w-none text-sm">
                <MarkdownView content={materials.theory} />
              </div>
            )}
            {materials.tasks.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-mono text-text-secondary">{tr("Задачі", "Tasks")}</div>
                <ul className="space-y-1">
                  {materials.tasks.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => window.open(`/edu/tasks/${t.id}`, "_blank", "noopener")}
                        className="w-full truncate rounded bg-bg-hover/50 px-2 py-1 text-left text-xs font-mono text-text-primary hover:bg-bg-hover"
                        title={t.title}
                      >
                        → {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!materials.hasTheory && materials.tasks.length === 0 && (
              <p className="text-xs font-mono text-text-secondary">{tr("У цього уроку немає матеріалів.", "This lesson has no materials.")}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LessonMaterialsPanel;
