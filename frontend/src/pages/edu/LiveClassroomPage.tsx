import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LiveKitRoom, VideoConference, PreJoin, ConnectionStateToast } from "@livekit/components-react";
import "@livekit/components-styles";
import { tr } from "../../i18n";
import { ClassLiveOverview } from "../../components/ClassLiveOverview";
import { StudentCodeStream } from "../../components/StudentCodeStream";
import { LiveChallengePanel } from "../../components/LiveChallengePanel";
import { LiveCodeBoard } from "../../components/LiveCodeBoard";
import { RaiseHandButton, RaisedHandsBar } from "../../components/LiveRaiseHand";
import { LessonMaterialsPanel } from "../../components/LessonMaterialsPanel";
import { BreakoutPanel } from "../../components/BreakoutPanel";
import {
  getActiveLiveSession,
  startLiveSession,
  joinLiveSession,
  endLiveSession,
  getBreakouts,
  getMyBreakoutToken,
  getTeacherBreakoutToken,
  type LiveJoinInfo,
  type LiveSession,
} from "../../lib/api/liveClassroom";

type Phase = "loading" | "lobby" | "prejoin" | "in_room" | "disabled" | "error";
type LeftPanel = "none" | "board" | "materials";
type ActiveRoom = { token: string; url: string; kind: string }; // kind: "main" | "breakout:N"

type DeviceChoices = {
  username: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
};

type LiveClassroomUser = { studentId?: number; userMode?: string } | null | undefined;

/**
 * Live, code-aware classroom. Flow: lobby → pre-join device check → in-room.
 * The room layers code-aware panels (heatmap, student code stream, AI brief,
 * challenge, shared code board, raised hands), lesson materials, and breakout
 * rooms on top of the LiveKit video conference.
 */
export const LiveClassroomPage: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => {
  const { classId: classIdParam } = useParams<{ classId: string }>();
  const classId = Number(classIdParam);
  const navigate = useNavigate();

  const isTeacher = !user?.studentId;

  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [join, setJoin] = useState<LiveJoinInfo | null>(null);
  const [choices, setChoices] = useState<DeviceChoices | null>(null);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<{ studentId: number; name: string } | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("none");
  const [breakoutBarOpen, setBreakoutBarOpen] = useState(false);
  const [myBreakoutIndex, setMyBreakoutIndex] = useState<number | null>(null);
  const [roomConn, setRoomConn] = useState<"connecting" | "connected" | "failed">("connecting");
  const [retryNonce, setRetryNonce] = useState(0);

  const switchingRef = useRef(false);
  const connTimerRef = useRef<number | null>(null);
  const activeRoomRef = useRef<ActiveRoom | null>(null);
  activeRoomRef.current = activeRoom;

  // Guard the room connection: if the SFU is unreachable, LiveKit retries the
  // WebSocket forever and the user just sees an endless "connecting" spinner.
  // We arm a timeout on every (re)connect attempt and surface a clear failure.
  useEffect(() => {
    if (phase !== "in_room" || !activeRoom) return;
    setRoomConn("connecting");
    if (connTimerRef.current) window.clearTimeout(connTimerRef.current);
    connTimerRef.current = window.setTimeout(() => {
      setRoomConn((c) => (c === "connected" ? c : "failed"));
    }, 15000);
    return () => {
      if (connTimerRef.current) window.clearTimeout(connTimerRef.current);
    };
  }, [phase, activeRoom?.token, retryNonce]);

  const retryConnect = useCallback(() => {
    setRoomConn("connecting");
    setRetryNonce((n) => n + 1);
  }, []);

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

  // Auto-detect a live session while waiting in the lobby.
  useEffect(() => {
    if (phase !== "lobby" || !Number.isFinite(classId)) return;
    const id = window.setInterval(async () => {
      try {
        const { session: active } = await getActiveLiveSession(classId);
        setSession(active);
      } catch {
        /* transient */
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [phase, classId]);

  const switchRoom = useCallback((next: ActiveRoom) => {
    // Mark the imminent disconnect as a room switch, not a "leave the lesson".
    switchingRef.current = true;
    setActiveRoom(next);
    window.setTimeout(() => {
      switchingRef.current = false;
    }, 2500);
  }, []);

  // Student: follow breakout assignment — move into the assigned group room when
  // breakouts open, and back to the main room when they close.
  useEffect(() => {
    if (phase !== "in_room" || isTeacher || !join || !Number.isFinite(classId)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getBreakouts(classId);
        if (cancelled) return;
        const curKind = activeRoomRef.current?.kind ?? "main";
        if (s.active && s.myGroupIndex != null) {
          setMyBreakoutIndex(s.myGroupIndex);
          const wantKind = `breakout:${s.myGroupIndex}`;
          if (curKind !== wantKind) {
            const t = await getMyBreakoutToken(classId);
            if (!cancelled && t.active && t.token && t.url) {
              switchRoom({ token: t.token, url: t.url, kind: wantKind });
            }
          }
        } else {
          setMyBreakoutIndex(null);
          if (curKind !== "main") {
            switchRoom({ token: join.token, url: join.url, kind: "main" });
          }
        }
      } catch {
        /* transient */
      }
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase, isTeacher, classId, join, switchRoom]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await startLiveSession(classId);
      setJoin(info);
      setSession(info.session);
      setPhase("prejoin");
    } catch {
      setError(tr("Не вдалося розпочати урок.", "Failed to start the session."));
    } finally {
      setBusy(false);
    }
  }, [classId]);

  const handleJoin = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const info = await joinLiveSession(session.id);
      setJoin(info);
      setSession(info.session);
      setPhase("prejoin");
    } catch {
      setError(tr("Не вдалося приєднатися.", "Failed to join."));
    } finally {
      setBusy(false);
    }
  }, [session]);

  const enterRoom = useCallback(
    (values: DeviceChoices) => {
      if (!join) return;
      setChoices(values);
      setActiveRoom({ token: join.token, url: join.url, kind: "main" });
      setPhase("in_room");
    },
    [join]
  );

  const handleLeave = useCallback(async () => {
    setJoin(null);
    setChoices(null);
    setActiveRoom(null);
    setMyBreakoutIndex(null);
    setPhase("loading");
    await refreshActive();
  }, [refreshActive]);

  const handleEnd = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await endLiveSession(session.id);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      setJoin(null);
      navigate(`/edu/classes/${classId}`);
    }
  }, [session, classId, navigate]);

  // Teacher hops between the main room and breakout groups.
  const teacherJoinGroup = useCallback(
    async (index: number) => {
      try {
        const t = await getTeacherBreakoutToken(classId, index);
        if (t.token && t.url) switchRoom({ token: t.token, url: t.url, kind: `breakout:${index}` });
      } catch {
        /* ignore */
      }
    },
    [classId, switchRoom]
  );

  const teacherReturnMain = useCallback(() => {
    if (join) switchRoom({ token: join.token, url: join.url, kind: "main" });
  }, [join, switchRoom]);

  const togglePanel = (p: LeftPanel) => setLeftPanel((cur) => (cur === p ? "none" : p));

  // --- Pre-join device check -------------------------------------------------
  if (phase === "prejoin" && join) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col" data-lk-theme="default">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="text-sm font-mono text-primary">
            🎥 {join.session.title || tr("Живий урок", "Live lesson")} — {tr("перевірка пристроїв", "device check")}
          </div>
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="rounded-md bg-bg-hover/60 px-3 py-1 text-xs font-mono text-text-secondary hover:text-text-primary"
          >
            {tr("Назад", "Back")}
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <PreJoin
            defaults={{ username: tr("Учасник", "Participant"), videoEnabled: true, audioEnabled: true }}
            onSubmit={(values) => enterRoom(values)}
            onError={() => setError(tr("Помилка доступу до камери/мікрофона.", "Camera/microphone access error."))}
            joinLabel={tr("Увійти в урок", "Enter lesson")}
            micLabel={tr("Мікрофон", "Microphone")}
            camLabel={tr("Камера", "Camera")}
          />
        </div>
      </div>
    );
  }

  // --- In room ---------------------------------------------------------------
  if (phase === "in_room" && join && choices && activeRoom) {
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
              onClick={() => togglePanel("board")}
              className={`rounded-md px-3 py-1 text-xs font-mono ${
                leftPanel === "board" ? "bg-primary/25 text-primary" : "bg-bg-hover/60 text-text-secondary hover:text-text-primary"
              }`}
            >
              📝 {tr("Дошка", "Board")}
            </button>
            <button
              type="button"
              onClick={() => togglePanel("materials")}
              className={`rounded-md px-3 py-1 text-xs font-mono ${
                leftPanel === "materials" ? "bg-primary/25 text-primary" : "bg-bg-hover/60 text-text-secondary hover:text-text-primary"
              }`}
            >
              📚 {tr("Матеріали", "Materials")}
            </button>
            {isTeacher && (
              <button
                type="button"
                onClick={() => setBreakoutBarOpen((v) => !v)}
                className={`rounded-md px-3 py-1 text-xs font-mono ${
                  breakoutBarOpen ? "bg-primary/25 text-primary" : "bg-bg-hover/60 text-text-secondary hover:text-text-primary"
                }`}
              >
                👥 {tr("Групи", "Groups")}
              </button>
            )}
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
        {isTeacher && breakoutBarOpen && (
          <BreakoutPanel
            classId={classId}
            currentKind={activeRoom.kind}
            onJoinGroup={(i) => void teacherJoinGroup(i)}
            onReturnMain={teacherReturnMain}
          />
        )}
        {!isTeacher && myBreakoutIndex != null && (
          <div className="border-b border-border bg-primary/10 px-4 py-1.5 text-xs font-mono text-primary">
            👥 {tr(`Ви в групі ${myBreakoutIndex + 1}`, `You're in group ${myBreakoutIndex + 1}`)}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 flex-1" data-lk-theme="default">
            <LiveKitRoom
              key={`${activeRoom.token}:${retryNonce}`}
              token={activeRoom.token}
              serverUrl={activeRoom.url}
              connect
              video={choices.videoEnabled}
              audio={choices.audioEnabled}
              options={{
                videoCaptureDefaults: { deviceId: choices.videoDeviceId || undefined },
                audioCaptureDefaults: { deviceId: choices.audioDeviceId || undefined },
              }}
              style={{ height: "100%" }}
              onConnected={() => {
                switchingRef.current = false;
                setRoomConn("connected");
                if (connTimerRef.current) window.clearTimeout(connTimerRef.current);
              }}
              onError={(e) => {
                console.error("LiveKit room error", e);
                setRoomConn("failed");
              }}
              onDisconnected={() => {
                if (switchingRef.current) return; // room switch, not a leave
                void handleLeave();
              }}
            >
              <ConnectionStateToast />
              <div className="flex h-full flex-col">
                {isTeacher ? (
                  <RaisedHandsBar />
                ) : (
                  <div className="flex items-center justify-end border-b border-border px-4 py-1.5">
                    <RaiseHandButton />
                  </div>
                )}
                <div className="flex min-h-0 flex-1">
                  {leftPanel === "board" && (
                    <div className="min-w-0 flex-1 border-r border-border">
                      <LiveCodeBoard isTeacher={isTeacher} />
                    </div>
                  )}
                  {leftPanel === "materials" && (
                    <div className="min-w-0 flex-1 border-r border-border">
                      <LessonMaterialsPanel classId={classId} sessionId={join.session.id} isTeacher={isTeacher} />
                    </div>
                  )}
                  <div className={leftPanel === "none" ? "h-full w-full" : "w-72 shrink-0"}>
                    <VideoConference />
                  </div>
                </div>
              </div>
            </LiveKitRoom>

            {roomConn === "connecting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-base/70 backdrop-blur-sm">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm font-mono text-text-secondary">
                  {tr("Підключення до відеосервера…", "Connecting to the video server…")}
                </p>
                <p className="max-w-xs text-center text-[11px] font-mono text-text-muted">{activeRoom.url}</p>
              </div>
            )}

            {roomConn === "failed" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-base/85 px-6 backdrop-blur-sm">
                <p className="text-base font-mono text-secondary">
                  {tr("Не вдалося підключитися до відеосервера", "Couldn't connect to the video server")}
                </p>
                <p className="max-w-md text-center text-xs font-mono text-text-secondary">
                  {tr(
                    `Сервер ${activeRoom.url} не відповідає. Переконайтеся, що LiveKit запущено і доступний за цією адресою.`,
                    `The server ${activeRoom.url} is not responding. Make sure LiveKit is running and reachable at this address.`
                  )}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={retryConnect}
                    className="rounded-md bg-primary/20 px-4 py-2 text-sm font-mono text-primary hover:bg-primary/30"
                  >
                    {tr("Повторити", "Retry")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLeave()}
                    className="rounded-md bg-bg-hover/60 px-4 py-2 text-sm font-mono text-text-secondary hover:text-text-primary"
                  >
                    {tr("Вийти", "Leave")}
                  </button>
                </div>
              </div>
            )}
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

  // --- Lobby / loading / disabled / error ------------------------------------
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
              <p className="flex items-center gap-2 text-sm font-mono text-text-primary">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent-success" />
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
            <p className="flex items-center gap-2 text-sm font-mono text-text-secondary">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-text-muted" />
              {tr("Очікуємо, поки вчитель розпочне урок…", "Waiting for the teacher to start the lesson…")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveClassroomPage;
