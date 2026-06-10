import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { tr } from "../../i18n";
import { ClassLiveOverview } from "../../components/ClassLiveOverview";
import { StudentCodeStream } from "../../components/StudentCodeStream";
import { LiveChallengePanel } from "../../components/LiveChallengePanel";
import { LiveCodeBoard } from "../../components/LiveCodeBoard";
import {
  getActiveLiveSession,
  startLiveSession,
  joinLiveSession,
  endLiveSession,
  type LiveJoinInfo,
  type LiveSession,
} from "../../lib/api/liveClassroom";

type Phase = "loading" | "lobby" | "in_room" | "disabled" | "error";

/**
 * Live, code-aware classroom for a class. Teachers can open a session; students
 * join an active one. Video/audio is handled by a self-hosted LiveKit SFU; this
 * page is the lobby + room shell. Code-aware overlays (live heatmap, per-student
 * editor stream) are layered on top in follow-up increments.
 */
type LiveClassroomUser = { studentId?: number; userMode?: string } | null | undefined;

export const LiveClassroomPage: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => {
  const { classId: classIdParam } = useParams<{ classId: string }>();
  const classId = Number(classIdParam);
  const navigate = useNavigate();

  // Role comes from the authenticated user, never from localStorage: in EDU
  // mode a teacher has no studentId, a student does. (localStorage "userType"
  // is stale if both roles were used in the same browser, which mislabels a
  // teacher as a student and hides the "Start lesson" control.)
  const isTeacher = !user?.studentId;

  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [join, setJoin] = useState<LiveJoinInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<{ studentId: number; name: string } | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);

  const refreshActive = useCallback(async () => {
    if (!Number.isFinite(classId)) {
      setPhase("error");
      setError(tr("Невірний клас.", "Invalid class."));
      return;
    }
    try {
      const { session: active, enabled } = await getActiveLiveSession(classId);
      if (!enabled) {
        setPhase("disabled");
        return;
      }
      setSession(active);
      setPhase("lobby");
    } catch {
      setPhase("error");
      setError(tr("Не вдалося завантажити сесію.", "Failed to load the session."));
    }
  }, [classId]);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  const enterRoom = useCallback((info: LiveJoinInfo) => {
    setJoin(info);
    setSession(info.session);
    setPhase("in_room");
    setError(null);
  }, []);

  const handleStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      enterRoom(await startLiveSession(classId));
    } catch {
      setError(tr("Не вдалося розпочати урок.", "Failed to start the session."));
    } finally {
      setBusy(false);
    }
  }, [classId, enterRoom]);

  const handleJoin = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      enterRoom(await joinLiveSession(session.id));
    } catch {
      setError(tr("Не вдалося приєднатися.", "Failed to join."));
    } finally {
      setBusy(false);
    }
  }, [session, enterRoom]);

  const handleLeave = useCallback(async () => {
    setJoin(null);
    setPhase("loading");
    await refreshActive();
  }, [refreshActive]);

  const handleEnd = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await endLiveSession(session.id);
    } catch {
      /* ignore — we leave regardless */
    } finally {
      setBusy(false);
      setJoin(null);
      navigate(`/edu/classes/${classId}`);
    }
  }, [session, classId, navigate]);

  if (phase === "in_room" && join) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="text-sm font-mono text-primary">
            🔴 {join.session.title || tr("Живий урок", "Live lesson")}
            <span className="ml-2 text-text-secondary">
              {join.role === "host" ? tr("(ведучий)", "(host)") : tr("(учасник)", "(participant)")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBoardOpen((v) => !v)}
              className={`rounded-md px-3 py-1 text-xs font-mono ${
                boardOpen ? "bg-primary/25 text-primary" : "bg-bg-hover/60 text-text-secondary hover:text-text-primary"
              }`}
            >
              📝 {tr("Дошка коду", "Code board")}
            </button>
            {isTeacher && (
              <button
                type="button"
                disabled={busy}
                onClick={handleEnd}
                className="rounded-md bg-secondary/15 px-3 py-1 text-xs font-mono text-secondary hover:bg-secondary/25 disabled:opacity-50"
              >
                {tr("Завершити урок", "End lesson")}
              </button>
            )}
          </div>
        </div>
        {Number.isFinite(classId) && <LiveChallengePanel classId={classId} isTeacher={isTeacher} />}

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1" data-lk-theme="default">
            <LiveKitRoom
              token={join.token}
              serverUrl={join.url}
              connect
              video
              audio
              style={{ height: "100%" }}
              onDisconnected={() => void handleLeave()}
            >
              <div className="flex h-full">
                {boardOpen && (
                  <div className="min-w-0 flex-1 border-r border-border">
                    <LiveCodeBoard isTeacher={isTeacher} />
                  </div>
                )}
                <div className={boardOpen ? "w-72 shrink-0" : "h-full w-full"}>
                  <VideoConference />
                </div>
              </div>
            </LiveKitRoom>
          </div>
          {isTeacher && Number.isFinite(classId) && (
            <aside className="hidden w-80 shrink-0 border-l border-border p-2 lg:block">
              {watched ? (
                <StudentCodeStream
                  classId={classId}
                  studentId={watched.studentId}
                  studentName={watched.name}
                  onBack={() => setWatched(null)}
                />
              ) : (
                <ClassLiveOverview
                  classId={classId}
                  enableCopilot
                  onSelectStudent={(studentId, name) => setWatched({ studentId, name })}
                />
              )}
            </aside>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-lg font-mono text-text-primary">{tr("Живий урок", "Live classroom")}</h1>

      {phase === "loading" && (
        <p className="mt-6 text-sm font-mono text-text-secondary">{tr("Завантаження…", "Loading…")}</p>
      )}

      {phase === "disabled" && (
        <div className="mt-6 rounded-lg border border-border bg-bg-base/60 p-4">
          <p className="text-sm font-mono text-text-secondary">
            {tr(
              "Відеоуроки ще не налаштовані на цьому сервері (LiveKit вимкнено).",
              "Live video is not configured on this server yet (LiveKit is disabled)."
            )}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-6 rounded-lg border border-border bg-bg-base/60 p-4">
          <p className="text-sm font-mono text-secondary">{error}</p>
          <button
            type="button"
            onClick={() => void refreshActive()}
            className="mt-3 rounded-md bg-primary/15 px-3 py-1 text-xs font-mono text-primary hover:bg-primary/25"
          >
            {tr("Спробувати ще раз", "Try again")}
          </button>
        </div>
      )}

      {phase === "lobby" && (
        <div className="mt-6 rounded-lg border border-border bg-bg-base/60 p-5">
          {error && <p className="mb-3 text-sm font-mono text-secondary">{error}</p>}

          {session ? (
            <>
              <p className="text-sm font-mono text-text-primary">
                {tr("Зараз триває урок:", "A lesson is live:")}{" "}
                <span className="text-primary">{session.title || tr("Без назви", "Untitled")}</span>
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleJoin()}
                className="mt-4 rounded-md bg-primary/20 px-4 py-2 text-sm font-mono text-primary hover:bg-primary/30 disabled:opacity-50"
              >
                {tr("Приєднатися", "Join")}
              </button>
            </>
          ) : isTeacher ? (
            <>
              <p className="text-sm font-mono text-text-secondary">
                {tr("Зараз немає активного уроку.", "No active lesson right now.")}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStart()}
                className="mt-4 rounded-md bg-primary/20 px-4 py-2 text-sm font-mono text-primary hover:bg-primary/30 disabled:opacity-50"
              >
                {tr("Розпочати урок", "Start lesson")}
              </button>
            </>
          ) : (
            <p className="text-sm font-mono text-text-secondary">
              {tr("Зараз немає активного уроку. Зачекайте, поки вчитель розпочне.", "No active lesson right now. Wait for the teacher to start.")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveClassroomPage;
