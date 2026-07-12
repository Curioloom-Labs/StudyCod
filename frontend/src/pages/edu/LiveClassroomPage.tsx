import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LiveKitRoom, VideoConference, PreJoin, ConnectionStateToast } from "@livekit/components-react";
import "@livekit/components-styles";
import {
  Video,
  ArrowLeft,
  PenSquare,
  BookOpen,
  Users,
  PhoneOff,
  Radio,
  WifiOff,
  Loader2,
  RotateCcw,
  LogOut,
  PlayCircle,
  Code2,
} from "lucide-react";
import { tr } from "../../i18n";
import { ClassLiveOverview } from "../../components/ClassLiveOverview";
import { StudentCodeStream } from "../../components/StudentCodeStream";
import { LiveChallengePanel } from "../../components/LiveChallengePanel";
import { LiveCodeBoard } from "../../components/LiveCodeBoard";
import { LivePairEditor } from "../../components/edu/LivePairEditor";
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
type LeftPanel = "none" | "board" | "materials" | "collab";
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
const LiveClassroomRuntime: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => {
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
      <div className="deep-workspace deep-workspace--live flex h-[calc(100vh-4rem)] flex-col bg-bg-base p-3 sm:p-5" data-lk-theme="default">
        <div className="flex items-center justify-between rounded-t-[26px] border border-border px-5 py-3.5 bg-bg-surface">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{tr("Перевірка", "Device check")}</span>
            <div className="mt-0.5 flex items-center gap-2">
              <Video className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold tracking-tight text-text-primary">
                {join.session.title || tr("Живий урок", "Live lesson")}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-text-secondary transition-fast hover:bg-bg-hover hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {tr("Назад", "Back")}
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-b-[26px] border-x border-b border-border bg-bg-surface/55 p-4">
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
      <div className="deep-workspace deep-workspace--live flex h-[calc(100vh-4rem)] flex-col bg-bg-base p-3 sm:p-5">
        <div className="flex items-center justify-between gap-3 rounded-t-[26px] border border-border bg-bg-surface px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight text-text-primary">
              {join.session.title || tr("Живий урок", "Live lesson")}
            </span>
            <span className="hidden shrink-0 rounded-full bg-bg-hover px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:inline">
              {join.role === "host" ? tr("ведучий", "host") : tr("учасник", "participant")}
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => togglePanel("board")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-fast ${
                leftPanel === "board" ? "border border-primary/40 bg-primary/15 text-primary" : "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <PenSquare className="h-3.5 w-3.5" />
              {tr("Дошка", "Board")}
            </button>
            <button
              type="button"
              onClick={() => togglePanel("materials")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-fast ${
                leftPanel === "materials" ? "border border-primary/40 bg-primary/15 text-primary" : "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {tr("Матеріали", "Materials")}
            </button>
            <button
              type="button"
              onClick={() => togglePanel("collab")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-fast ${
                leftPanel === "collab" ? "border border-primary/40 bg-primary/15 text-primary" : "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              {tr("Спільний код", "Live code")}
            </button>
            {isTeacher && (
              <button
                type="button"
                onClick={() => setBreakoutBarOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-fast ${
                  breakoutBarOpen ? "border border-primary/40 bg-primary/15 text-primary" : "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                {tr("Групи", "Groups")}
              </button>
            )}
            {isTeacher && (
              <button
                type="button"
                disabled={busy}
                onClick={handleEnd}
                className="inline-flex items-center gap-1.5 rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-1.5 text-xs font-mono text-secondary transition-fast hover:bg-secondary/20 disabled:opacity-50"
              >
                <PhoneOff className="h-3.5 w-3.5" />
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
          <div className="flex items-center gap-1.5 border-b border-border bg-primary/10 px-4 py-1.5 text-xs font-mono text-primary">
            <Users className="h-3.5 w-3.5" />
            {tr(`Ви в групі ${myBreakoutIndex + 1}`, `You're in group ${myBreakoutIndex + 1}`)}
          </div>
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden rounded-b-[26px] border-x border-b border-border bg-bg-surface">
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
                  {leftPanel === "collab" && (
                    <div className="min-w-0 flex-1 border-r border-border">
                      <LivePairEditor topic={`class-${classId}-collab`} userName={isTeacher ? tr("Викладач", "Teacher") : tr("Учень", "Student")} height="100%" />
                    </div>
                  )}
                  <div className={leftPanel === "none" ? "h-full w-full" : "w-72 shrink-0"}>
                    <VideoConference />
                  </div>
                </div>
              </div>
            </LiveKitRoom>

            {roomConn === "connecting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg-base/70 px-6 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-bg-surface px-8 py-6 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm font-mono text-text-secondary">
                    {tr("Підключення до відеосервера…", "Connecting to the video server…")}
                  </p>
                  <p className="max-w-xs text-center text-[11px] font-mono text-text-muted">{activeRoom.url}</p>
                </div>
              </div>
            )}

            {roomConn === "failed" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-base/85 px-6 backdrop-blur-sm">
                <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-secondary/40 bg-secondary/10 px-8 py-7 text-center shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/15">
                    <WifiOff className="h-5 w-5 text-secondary" />
                  </div>
                  <p className="text-base font-mono font-semibold text-secondary">
                    {tr("Не вдалося підключитися до відеосервера", "Couldn't connect to the video server")}
                  </p>
                  <p className="text-xs font-mono text-text-secondary">
                    {tr(
                      `Сервер ${activeRoom.url} не відповідає. Переконайтеся, що LiveKit запущено і доступний за цією адресою.`,
                      `The server ${activeRoom.url} is not responding. Make sure LiveKit is running and reachable at this address.`
                    )}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={retryConnect}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-mono text-primary transition-fast hover:bg-primary/25"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {tr("Повторити", "Retry")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLeave()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-mono text-text-secondary transition-fast hover:bg-bg-hover hover:text-text-primary"
                    >
                      <LogOut className="h-4 w-4" />
                      {tr("Вийти", "Leave")}
                    </button>
                  </div>
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
    <div className="deep-workspace deep-workspace--live flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-bg-base px-4 py-10">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-[26px] border border-border bg-bg-surface shadow-[0_18px_55px_-32px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 border-b border-border bg-bg-hover/35 px-6 py-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><Video className="h-4 w-4" /></span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              {tr("Живий урок", "Live classroom")}
            </span>
          </div>

          <div className="p-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{tr("Урок", "Live")}</span>
            <div className="mt-3 flex items-center gap-2">
              <Video className="h-6 w-6 shrink-0 text-primary" />
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-text-primary md:text-3xl">
                {tr("Живий урок", "Live classroom")}
              </h1>
            </div>
            <div className="mt-4 h-px bg-border" />

            {phase === "loading" && (
              <p className="mt-6 flex items-center gap-2 text-sm font-mono text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {tr("Завантаження…", "Loading…")}
              </p>
            )}

            {phase === "disabled" && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-bg-base/60 p-4">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                <p className="text-sm font-mono text-text-secondary">
                  {tr(
                    "Відеоуроки ще не налаштовані на цьому сервері (LiveKit вимкнено).",
                    "Live video is not configured on this server yet (LiveKit is disabled)."
                  )}
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="mt-6 rounded-xl border border-secondary/40 bg-secondary/10 p-4">
                <p className="flex items-center gap-2 text-sm font-mono text-secondary">
                  <WifiOff className="h-4 w-4 shrink-0" />
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => void refreshActive()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-mono text-primary transition-fast hover:bg-primary/25"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {tr("Спробувати ще раз", "Try again")}
                </button>
              </div>
            )}

            {phase === "lobby" && (
              <div className="mt-6">
                {error && (
                  <p className="mb-3 flex items-center gap-2 text-sm font-mono text-secondary">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    {error}
                  </p>
                )}

                {session ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                    <p className="flex items-center gap-2 text-sm font-mono text-text-primary">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-success/60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-success" />
                      </span>
                      {tr("Зараз триває урок:", "A lesson is live:")}
                    </p>
                    <p className="mt-1.5 flex items-center gap-2 font-mono text-base text-primary">
                      <Radio className="h-4 w-4 shrink-0" />
                      {session.title || tr("Без назви", "Untitled")}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleJoin()}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary/15 px-4 py-2.5 text-sm font-mono font-medium text-primary transition-fast hover:bg-primary/25 disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {tr("Приєднатися", "Join")}
                    </button>
                  </div>
                ) : isTeacher ? (
                  <div>
                    <p className="text-sm font-mono text-text-secondary">
                      {tr("Зараз немає активного уроку.", "No active lesson right now.")}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleStart()}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary/15 px-4 py-2.5 text-sm font-mono font-medium text-primary transition-fast hover:bg-primary/25 disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {tr("Розпочати урок", "Start lesson")}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-bg-base/40 p-6 text-center">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                    <p className="text-sm font-mono text-text-secondary">
                      {tr("Очікуємо, поки вчитель розпочне урок…", "Waiting for the teacher to start the lesson…")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const LiveClassroomPreview: React.FC = () => {
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();
  const [panel, setPanel] = useState<"chat" | "materials" | "code">("chat");
  const [raised, setRaised] = useState(false);
  const [note, setNote] = useState("");
  const participants = ["Олена", "Марія", "Андрій", "Софія", "Данило", "Іра"];

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#f4f6f4] px-4 py-5 text-[#17231b] dark:bg-[#09100c] dark:text-[#edf4ef] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => navigate(`/edu/classes/${classId}?preview=true`)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#65746a] hover:bg-[#e8eee9] hover:text-[#16834d] dark:text-[#a8b7ac] dark:hover:bg-white/[.06] dark:hover:text-[#72edb0]">
            <ArrowLeft className="size-4" />
            Python 9-Б
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#ff6b9d]/10 px-3 py-1.5 text-xs font-bold text-[#c4436b] dark:text-[#ff9abd]">
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              LIVE · 32:14
            </span>
            <button type="button" onClick={() => setRaised((value) => !value)} className={`rounded-xl px-4 py-2 text-sm font-bold ${raised ? "bg-[#ffd93d] text-[#3e3100]" : "bg-white text-[#324238] shadow-sm dark:bg-white/[.08] dark:text-white"}`}>
              {raised ? "Руку піднято" : "Підняти руку"}
            </button>
          </div>
        </header>

        <section className="grid min-h-[calc(100dvh-145px)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#101510] text-white shadow-[0_28px_70px_-45px_rgba(0,0,0,.8)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#7fedb2]">Live classroom</p>
                <h1 className="truncate text-lg font-bold sm:text-xl">Цикли: від ідеї до коду</h1>
              </div>
              <span className="hidden rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[#cbd8ce] sm:inline-flex">24 учні онлайн</span>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_230px]">
              <section className="relative grid min-h-[360px] place-items-center overflow-hidden rounded-[22px] bg-[#18251c]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(0,255,136,.16),transparent_36%),linear-gradient(135deg,#1d3a28,#0f1711)]" />
                <div className="relative text-center">
                  <span className="mx-auto grid size-24 place-items-center rounded-[30px] bg-[#f1f5f1] text-3xl font-bold text-[#147b47]">ОК</span>
                  <h2 className="mt-5 text-3xl font-bold tracking-[-.04em]">Олена Кравець</h2>
                  <p className="mt-2 text-sm text-[#bdd0c1]">пояснює приклад на дошці</p>
                </div>
                <div className="absolute bottom-4 left-4 rounded-xl bg-black/45 px-3 py-2 text-sm font-semibold backdrop-blur">Викладач</div>
              </section>

              <aside className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                {participants.slice(1).map((name, index) => (
                  <div key={name} className="relative min-h-28 overflow-hidden rounded-2xl bg-[#202b22] p-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-sm font-bold text-[#8df0bc]">{name.slice(0, 1)}</span>
                    <div className="absolute bottom-3 left-3 right-3 truncate text-xs font-semibold text-[#dce7df]">{name}</div>
                    {index === 1 && <span className="absolute right-3 top-3 rounded-full bg-[#ffd93d] px-2 py-0.5 text-[10px] font-bold text-[#3e3100]">рука</span>}
                  </div>
                ))}
              </aside>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
              <button className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">Мікрофон</button>
              <button className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15"><Video className="mr-2 inline size-4" />Камера</button>
              <button onClick={() => setPanel("materials")} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15"><BookOpen className="mr-2 inline size-4" />Матеріали</button>
              <button onClick={() => setPanel("code")} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15"><Code2 className="mr-2 inline size-4" />Код</button>
              <button className="rounded-full bg-[#d94f65] px-4 py-2 text-sm font-bold text-white"><PhoneOff className="mr-2 inline size-4" />Вийти</button>
            </div>
          </main>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-[#19291d]/10 bg-white dark:border-white/[.09] dark:bg-[#111b14]">
            <div className="grid grid-cols-3 gap-1 border-b border-[#19291d]/10 p-2 dark:border-white/[.08]">
              {(["chat", "materials", "code"] as const).map((item) => <button key={item} type="button" onClick={() => setPanel(item)} className={`rounded-xl px-3 py-2 text-xs font-bold ${panel === item ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "text-[#718075] hover:bg-[#f1f4f1] dark:text-[#a6b4a9] dark:hover:bg-white/[.06]"}`}>{item === "chat" ? "Чат" : item === "materials" ? "Матеріали" : "Код"}</button>)}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {panel === "chat" && <div className="space-y-3">
                <Message author="Олена" text="Після прикладу відкриваємо задачу «Сума парних»." />
                <Message author="Марія" text="Можна ще раз про умову в циклі?" />
                <Message author="Андрій" text="Я підняв руку, є питання по range()." />
              </div>}
              {panel === "materials" && <div>
                <div className="flex items-center gap-2"><BookOpen className="size-5 text-[#16834d] dark:text-[#72edb0]" /><h2 className="font-bold">Контекст уроку</h2></div>
                <p className="mt-4 text-sm leading-6 text-[#69796e] dark:text-[#a9b6ac]">Після пояснення учні самостійно розв’язують задачу й повертаються до обговорення помилок.</p>
                <button type="button" onClick={() => navigate(`/edu/tasks/1?preview=true`)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062211]">Відкрити задачу <Code2 className="size-4" /></button>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Нотатка для викладача..." className="mt-5 w-full resize-none rounded-xl bg-[#f4f7f4] p-3 text-sm outline-none ring-[#00ff88]/25 focus:ring-4 dark:bg-white/[.05]" />
              </div>}
              {panel === "code" && <pre className="rounded-2xl bg-[#101510] p-4 text-xs leading-6 text-[#9af2bf]">{`total = 0\nfor number in values:\n    if number % 2 == 0:\n        total += number\nprint(total)`}</pre>}
            </div>

            <div className="border-t border-[#19291d]/10 p-4 dark:border-white/[.08]">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 text-[#647369] dark:text-[#a6b4a9]"><Users className="size-4" />Учасники</span>
                <b>24</b>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

const Message: React.FC<{ author: string; text: string }> = ({ author, text }) => (
  <div className="rounded-2xl bg-[#f5f8f5] p-3 dark:bg-white/[.045]">
    <div className="text-xs font-bold text-[#16834d] dark:text-[#72edb0]">{author}</div>
    <div className="mt-1 text-sm leading-6 text-[#425149] dark:text-[#dbe6de]">{text}</div>
  </div>
);

export const LiveClassroomPage: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true" ? <LiveClassroomPreview /> : <LiveClassroomRuntime user={user} />;

export default LiveClassroomPage;
