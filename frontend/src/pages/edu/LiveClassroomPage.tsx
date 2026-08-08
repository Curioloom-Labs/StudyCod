import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConnectionStateToast, LiveKitRoom, PreJoin, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, BookOpen, Code2, Loader2, Mic, MonitorUp, PenSquare, PhoneOff, PlayCircle, Radio, RotateCcw, Users, Video, WifiOff } from "lucide-react";
import { BreakoutPanel } from "../../components/BreakoutPanel";
import { ClassLiveOverview } from "../../components/ClassLiveOverview";
import { LessonMaterialsPanel } from "../../components/LessonMaterialsPanel";
import { LiveChallengePanel } from "../../components/LiveChallengePanel";
import { LiveCodeBoard } from "../../components/LiveCodeBoard";
import { LivePairEditor } from "../../components/edu/LivePairEditor";
import { RaiseHandButton, RaisedHandsBar } from "../../components/LiveRaiseHand";
import { StudentCodeStream } from "../../components/StudentCodeStream";
import {
  endLiveSession,
  getActiveLiveSession,
  getBreakouts,
  getMyBreakoutToken,
  getTeacherBreakoutToken,
  joinLiveSession,
  startLiveSession,
  type LiveJoinInfo,
  type LiveSession,
} from "../../lib/api/liveClassroom";

type Phase = "loading" | "lobby" | "prejoin" | "in_room" | "disabled" | "error";
type SidePanel = "people" | "materials" | "code" | "board";
type ActiveRoom = { token: string; url: string; kind: string };
type DeviceChoices = {
  username: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
};
type LiveClassroomUser = { studentId?: number; userMode?: string; username?: string; firstName?: string } | null | undefined;

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

const LiveClassroomRuntime: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => {
  const { classId: classIdParam } = useParams<{ classId: string }>();
  const classId = Number(classIdParam);
  const navigate = useNavigate();
  const isTeacher = !user?.studentId;

  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [joinInfo, setJoinInfo] = useState<LiveJoinInfo | null>(null);
  const [choices, setChoices] = useState<DeviceChoices | null>(null);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>("people");
  const [breakoutsOpen, setBreakoutsOpen] = useState(false);
  const [myBreakoutIndex, setMyBreakoutIndex] = useState<number | null>(null);
  const [watched, setWatched] = useState<{ studentId: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomConn, setRoomConn] = useState<"connecting" | "connected" | "failed">("connecting");
  const [retryNonce, setRetryNonce] = useState(0);

  const switchingRef = useRef(false);
  const connTimerRef = useRef<number | null>(null);
  const activeRoomRef = useRef<ActiveRoom | null>(null);
  activeRoomRef.current = activeRoom;

  const refreshActive = useCallback(async () => {
    if (!Number.isFinite(classId)) {
      setPhase("error");
      setError("Невірний клас.");
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
      setError("Не вдалося завантажити live-сесію.");
    }
  }, [classId]);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

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

  useEffect(() => {
    if (phase !== "in_room" || !activeRoom) return;
    setRoomConn("connecting");
    if (connTimerRef.current) window.clearTimeout(connTimerRef.current);
    connTimerRef.current = window.setTimeout(() => setRoomConn((conn) => conn === "connected" ? conn : "failed"), 15000);
    return () => {
      if (connTimerRef.current) window.clearTimeout(connTimerRef.current);
    };
  }, [phase, activeRoom?.token, retryNonce]);

  const switchRoom = useCallback((next: ActiveRoom) => {
    switchingRef.current = true;
    setActiveRoom(next);
    window.setTimeout(() => { switchingRef.current = false; }, 2500);
  }, []);

  useEffect(() => {
    if (phase !== "in_room" || isTeacher || !joinInfo || !Number.isFinite(classId)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const state = await getBreakouts(classId);
        if (cancelled) return;
        const currentKind = activeRoomRef.current?.kind ?? "main";
        if (state.active && state.myGroupIndex != null) {
          setMyBreakoutIndex(state.myGroupIndex);
          const wantedKind = `breakout:${state.myGroupIndex}`;
          if (currentKind !== wantedKind) {
            const token = await getMyBreakoutToken(classId);
            if (!cancelled && token.active && token.token && token.url) switchRoom({ token: token.token, url: token.url, kind: wantedKind });
          }
        } else {
          setMyBreakoutIndex(null);
          if (currentKind !== "main") switchRoom({ token: joinInfo.token, url: joinInfo.url, kind: "main" });
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
  }, [phase, isTeacher, classId, joinInfo, switchRoom]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await startLiveSession(classId);
      setJoinInfo(info);
      setSession(info.session);
      setPhase("prejoin");
    } catch {
      setError("Не вдалося розпочати урок.");
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
      setJoinInfo(info);
      setSession(info.session);
      setPhase("prejoin");
    } catch {
      setError("Не вдалося приєднатися до уроку.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  const enterRoom = useCallback((values: DeviceChoices) => {
    if (!joinInfo) return;
    setChoices(values);
    setActiveRoom({ token: joinInfo.token, url: joinInfo.url, kind: "main" });
    setPhase("in_room");
  }, [joinInfo]);

  const handleLeave = useCallback(async () => {
    setJoinInfo(null);
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
    } finally {
      setBusy(false);
      setJoinInfo(null);
      navigate(`/edu/classes/${classId}`);
    }
  }, [session, classId, navigate]);

  const teacherJoinGroup = useCallback(async (index: number) => {
    const token = await getTeacherBreakoutToken(classId, index);
    if (token.token && token.url) switchRoom({ token: token.token, url: token.url, kind: `breakout:${index}` });
  }, [classId, switchRoom]);

  const teacherReturnMain = useCallback(() => {
    if (joinInfo) switchRoom({ token: joinInfo.token, url: joinInfo.url, kind: "main" });
  }, [joinInfo, switchRoom]);

  if (phase === "prejoin" && joinInfo) {
    return (
      <LiveShell>
        <section className="mx-auto grid h-full w-full max-w-6xl place-items-center px-4 py-8">
          <div className="w-full overflow-hidden rounded-[32px] border border-white/10 bg-[#101812] shadow-[0_34px_90px_-56px_rgba(0,0,0,.95)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[.16em] text-[#72edb0]">Перевірка пристроїв</div>
                <h1 className="mt-1 text-xl font-bold text-white">{joinInfo.session.title || "Живий урок"}</h1>
              </div>
              <button onClick={() => void handleLeave()} className="inline-flex items-center gap-2 rounded-xl bg-white/8 px-4 py-2 text-sm font-bold text-white hover:bg-white/12"><ArrowLeft className="size-4" />Назад</button>
            </div>
            <div className="min-h-[560px] p-4" data-lk-theme="default">
              <PreJoin
                defaults={{ username: user?.firstName || user?.username || "Учасник", videoEnabled: true, audioEnabled: true }}
                onSubmit={(values) => enterRoom(values)}
                onError={() => setError("Помилка доступу до камери або мікрофона.")}
                joinLabel="Увійти в урок"
                micLabel="Мікрофон"
                camLabel="Камера"
              />
            </div>
          </div>
        </section>
      </LiveShell>
    );
  }

  if (phase === "in_room" && joinInfo && choices && activeRoom) {
    return (
      <LiveShell>
        <div className="flex h-[calc(100dvh-72px)] flex-col gap-3 p-3 sm:p-4">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-[#101812]/92 px-4 py-3 text-white shadow-[0_20px_60px_-46px_rgba(0,0,0,.95)]">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative flex size-3 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#00ff88]/50" />
                <span className="relative inline-flex size-3 rounded-full bg-[#00ff88]" />
              </span>
              <div className="min-w-0">
                <div className="truncate font-bold">{joinInfo.session.title || "Живий урок"}</div>
                <div className="text-xs text-[#aab8ad]">{joinInfo.role === "host" ? "Викладач" : "Учасник"} · {activeRoom.kind === "main" ? "головна кімната" : `група ${activeRoom.kind.split(":")[1]}`}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              <Tool active={sidePanel === "people"} onClick={() => setSidePanel("people")} icon={<Users className="size-4" />} label="Люди" />
              <Tool active={sidePanel === "materials"} onClick={() => setSidePanel("materials")} icon={<BookOpen className="size-4" />} label="Матеріали" />
              <Tool active={sidePanel === "board"} onClick={() => setSidePanel("board")} icon={<PenSquare className="size-4" />} label="Дошка" />
              <Tool active={sidePanel === "code"} onClick={() => setSidePanel("code")} icon={<Code2 className="size-4" />} label="Код" />
              {isTeacher && <Tool active={breakoutsOpen} onClick={() => setBreakoutsOpen((value) => !value)} icon={<Users className="size-4" />} label="Групи" />}
              {isTeacher && <button disabled={busy} onClick={() => void handleEnd()} className="inline-flex items-center gap-2 rounded-xl border border-[#ff6b9d]/35 bg-[#ff6b9d]/12 px-3 py-2 text-sm font-bold text-[#ff9ab8] hover:bg-[#ff6b9d]/18 disabled:opacity-50"><PhoneOff className="size-4" />Завершити</button>}
            </div>
          </header>

          {Number.isFinite(classId) && <LiveChallengePanel classId={classId} isTeacher={isTeacher} />}
          {isTeacher && breakoutsOpen && <BreakoutPanel classId={classId} currentKind={activeRoom.kind} onJoinGroup={(index) => void teacherJoinGroup(index)} onReturnMain={teacherReturnMain} />}
          {!isTeacher && myBreakoutIndex != null && <div className="rounded-2xl border border-[#00ff88]/20 bg-[#00ff88]/10 px-4 py-2 text-sm font-bold text-[#72edb0]">Ви в групі {myBreakoutIndex + 1}</div>}

          <main className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="relative min-h-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#101812] shadow-[0_30px_80px_-56px_rgba(0,0,0,.95)]" data-lk-theme="default">
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
                onError={() => setRoomConn("failed")}
                onDisconnected={() => {
                  if (switchingRef.current) return;
                  void handleLeave();
                }}
              >
                <ConnectionStateToast />
                <div className="flex h-full min-h-0 flex-col">
                  {isTeacher ? <RaisedHandsBar /> : <div className="flex items-center justify-end border-b border-white/10 px-4 py-2"><RaiseHandButton /></div>}
                  <div className="min-h-0 flex-1"><VideoConference /></div>
                </div>
              </LiveKitRoom>

              {roomConn === "connecting" && <ConnectionOverlay icon={<Loader2 className="size-6 animate-spin text-[#72edb0]" />} title="Підключення до відеосервера…" subtitle={activeRoom.url} />}
              {roomConn === "failed" && (
                <ConnectionOverlay
                  icon={<WifiOff className="size-6 text-[#ff9ab8]" />}
                  title="Не вдалося підключитися до відеосервера"
                  subtitle={`Сервер ${activeRoom.url} не відповідає. Перевірте LiveKit і мережу.`}
                  action={<button onClick={() => { setRoomConn("connecting"); setRetryNonce((n) => n + 1); }} className="inline-flex items-center gap-2 rounded-xl bg-[#00d978] px-4 py-2 text-sm font-bold text-[#062211]"><RotateCcw className="size-4" />Повторити</button>}
                />
              )}
            </section>

            <aside className="min-h-0 overflow-hidden rounded-[28px] border border-[#19291d]/10 bg-white dark:border-white/10 dark:bg-[#111b14]">
              <PanelHeader panel={sidePanel} onPanel={setSidePanel} />
              <div className="h-[calc(100%-56px)] min-h-0 overflow-auto p-3">
                {sidePanel === "people" && isTeacher && Number.isFinite(classId) && (watched ? <StudentCodeStream classId={classId} studentId={watched.studentId} studentName={watched.name} onBack={() => setWatched(null)} /> : <ClassLiveOverview classId={classId} enableCopilot onSelectStudent={(studentId, name) => setWatched({ studentId, name })} />)}
                {sidePanel === "people" && !isTeacher && <StudentSide />}
                {sidePanel === "materials" && <LessonMaterialsPanel classId={classId} sessionId={joinInfo.session.id} isTeacher={isTeacher} />}
                {sidePanel === "board" && <div className="h-full min-h-[560px] overflow-hidden rounded-2xl border border-[#19291d]/10 dark:border-white/10"><LiveCodeBoard isTeacher={isTeacher} /></div>}
                {sidePanel === "code" && <div className="h-full min-h-[560px] overflow-hidden rounded-2xl border border-[#19291d]/10 dark:border-white/10"><LivePairEditor topic={`class-${classId}-collab`} userName={isTeacher ? "Викладач" : "Учень"} height="100%" /></div>}
              </div>
            </aside>
          </main>
        </div>
      </LiveShell>
    );
  }

  return (
    <LiveShell>
      <section className="grid min-h-[calc(100dvh-72px)] place-items-center px-4 py-10">
        <div className="w-full max-w-xl overflow-hidden rounded-[32px] border border-[#19291d]/10 bg-white shadow-[0_28px_80px_-54px_rgba(0,0,0,.65)] dark:border-white/10 dark:bg-[#111b14]">
          <div className="border-b border-[#19291d]/10 p-6 dark:border-white/10">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#147b47] dark:text-[#72edb0]"><Radio className="size-4" />Live classroom</div>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.055em]">Живий урок</h1>
            <p className="mt-2 text-sm leading-6 text-[#647369] dark:text-[#a6b4a9]">Одна кімната для відео, матеріалів, коду й швидкої допомоги учням.</p>
          </div>
          <div className="p-6">
            {phase === "loading" && <StatusLine icon={<Loader2 className="size-4 animate-spin" />} text="Завантаження…" />}
            {phase === "disabled" && <StatusCard tone="warn" title="LiveKit не налаштовано" text="Відеоуроки вимкнені на цьому сервері. Потрібно налаштувати LiveKit перед запуском кімнат." />}
            {phase === "error" && <StatusCard tone="danger" title="Помилка live-кімнати" text={error || "Не вдалося завантажити live-сесію."} action={<button onClick={() => void refreshActive()} className="mt-4 rounded-xl bg-[#00d978] px-4 py-2 text-sm font-bold text-[#062211]">Спробувати ще раз</button>} />}
            {phase === "lobby" && (
              session ? (
                <div className="rounded-2xl border border-[#00ff88]/25 bg-[#00ff88]/8 p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#147b47] dark:text-[#72edb0]"><span className="size-2 rounded-full bg-[#00d978]" />Урок уже триває</div>
                  <div className="mt-2 text-lg font-bold">{session.title || "Без назви"}</div>
                  <button disabled={busy} onClick={() => void handleJoin()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3 text-sm font-bold text-[#062211] disabled:opacity-50"><PlayCircle className="size-4" />Приєднатися</button>
                </div>
              ) : isTeacher ? (
                <div>
                  <p className="text-sm text-[#647369] dark:text-[#a6b4a9]">Активного уроку зараз немає. Запустіть кімнату, перевірте камеру й запросіть клас.</p>
                  <button disabled={busy} onClick={() => void handleStart()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3 text-sm font-bold text-[#062211] disabled:opacity-50"><PlayCircle className="size-4" />Розпочати урок</button>
                </div>
              ) : (
                <StatusCard title="Очікуємо викладача" text="Кімната відкриється автоматично, коли викладач розпочне урок." />
              )
            )}
          </div>
        </div>
      </section>
    </LiveShell>
  );
};

const LiveClassroomPreview: React.FC = () => {
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();
  const [panel, setPanel] = useState<SidePanel>("people");

  return (
    <LiveShell>
      <div className="flex h-[calc(100dvh-72px)] flex-col gap-3 p-3 sm:p-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-[#101812]/92 px-4 py-3 text-white">
          <button onClick={() => navigate(`/edu/classes/${classId}?preview=true`)} className="inline-flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-sm font-bold hover:bg-white/12"><ArrowLeft className="size-4" />11-А · Python</button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#00ff88]/12 px-3 py-1.5 text-xs font-bold text-[#72edb0]"><span className="size-1.5 animate-pulse rounded-full bg-current" />LIVE · 32:14</span>
            <Tool active={panel === "people"} onClick={() => setPanel("people")} icon={<Users className="size-4" />} label="Люди" />
            <Tool active={panel === "materials"} onClick={() => setPanel("materials")} icon={<BookOpen className="size-4" />} label="Матеріали" />
            <Tool active={panel === "code"} onClick={() => setPanel("code")} icon={<Code2 className="size-4" />} label="Код" />
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#101812] text-white shadow-[0_30px_80px_-56px_rgba(0,0,0,.95)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[.16em] text-[#72edb0]">Live classroom</div>
                <h1 className="mt-1 text-xl font-bold">Цикли: від ідеї до коду</h1>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[#cbd8ce]">24 учні онлайн</span>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="relative grid min-h-[380px] place-items-center overflow-hidden rounded-[22px] bg-[#18251c]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(0,255,136,.16),transparent_36%),linear-gradient(135deg,#1d3a28,#0f1711)]" />
                <div className="relative text-center">
                  <span className="mx-auto grid size-24 place-items-center rounded-[30px] bg-[#f1f5f1] text-3xl font-bold text-[#147b47]">ОК</span>
                  <h2 className="mt-5 text-3xl font-bold tracking-[-.04em]">Олена Кравець</h2>
                  <p className="mt-2 text-sm text-[#bdd0c1]">пояснює приклад на дошці</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                {["Марія", "Андрій", "Софія", "Данило"].map((name, index) => <div key={name} className="relative min-h-28 overflow-hidden rounded-2xl bg-[#202b22] p-3"><span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-sm font-bold text-[#8df0bc]">{name[0]}</span><div className="absolute bottom-3 left-3 right-3 truncate text-xs font-semibold">{name}</div>{index === 1 && <span className="absolute right-3 top-3 rounded-full bg-[#ffd93d] px-2 py-0.5 text-[10px] font-bold text-[#3e3100]">рука</span>}</div>)}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
              <MeetButton icon={<Mic className="size-4" />} label="Мікрофон" />
              <MeetButton icon={<Video className="size-4" />} label="Камера" />
              <MeetButton icon={<MonitorUp className="size-4" />} label="Екран" />
              <button className="rounded-full bg-[#d94f65] px-4 py-2 text-sm font-bold text-white"><PhoneOff className="mr-2 inline size-4" />Вийти</button>
            </div>
          </section>

          <aside className="min-h-0 overflow-hidden rounded-[28px] border border-[#19291d]/10 bg-white dark:border-white/10 dark:bg-[#111b14]">
            <PanelHeader panel={panel} onPanel={setPanel} />
            <div className="min-h-0 overflow-auto p-5">
              {panel === "people" && <StudentSide />}
              {panel === "materials" && <div className="space-y-4"><h2 className="font-bold">Матеріали уроку</h2><p className="text-sm leading-6 text-[#69796e] dark:text-[#a9b6ac]">Після пояснення учні відкривають практику, виконують задачу й повертаються до обговорення помилок.</p><button className="rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062211]">Відкрити задачу</button></div>}
              {panel === "code" && <pre className="rounded-2xl bg-[#101510] p-4 text-xs leading-6 text-[#9af2bf]">{`total = 0\nfor number in values:\n    if number % 2 == 0:\n        total += number\nprint(total)`}</pre>}
            </div>
          </aside>
        </main>
      </div>
    </LiveShell>
  );
};

const LiveShell: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="min-h-[calc(100dvh-72px)] bg-[#07100a] text-[#edf4ef]">{children}</div>;
const Tool: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? "bg-[#edf3ef] text-[#0b120e]" : "bg-white/8 text-[#dbe6de] hover:bg-white/12"}`}>{icon}{label}</button>;
const MeetButton: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => <button className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">{icon}{label}</button>;
const PanelHeader: React.FC<{ panel: SidePanel; onPanel: (panel: SidePanel) => void }> = ({ panel, onPanel }) => <div className="grid grid-cols-4 gap-1 border-b border-[#19291d]/10 p-2 dark:border-white/10">{(["people", "materials", "board", "code"] as SidePanel[]).map((item) => <button key={item} onClick={() => onPanel(item)} className={`rounded-xl px-2 py-2 text-xs font-bold ${panel === item ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "text-[#718075] hover:bg-[#f1f4f1] dark:text-[#a6b4a9] dark:hover:bg-white/[.06]"}`}>{item === "people" ? "Люди" : item === "materials" ? "Матеріали" : item === "board" ? "Дошка" : "Код"}</button>)}</div>;
const StudentSide: React.FC = () => <div className="space-y-3">{["Олена Кравець", "Марія Бондар", "Андрій Шевченко", "Софія Ткаченко"].map((name, index) => <div key={name} className="flex items-center justify-between rounded-2xl bg-[#f5f8f5] p-3 dark:bg-white/[.045]"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#153321] text-sm font-bold text-[#72edb0]">{name[0]}</span><span className="text-sm font-semibold">{name}</span></div>{index === 2 ? <span className="rounded-full bg-[#ffd93d] px-2 py-0.5 text-[10px] font-bold text-[#3e3100]">рука</span> : <span className="size-2 rounded-full bg-[#00d978]" />}</div>)}</div>;
const StatusLine: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => <div className="flex items-center gap-2 text-sm font-semibold text-[#647369] dark:text-[#a6b4a9]">{icon}{text}</div>;
const StatusCard: React.FC<{ tone?: "default" | "warn" | "danger"; title: string; text: string; action?: React.ReactNode }> = ({ tone = "default", title, text, action }) => <div className={`rounded-2xl p-5 ${tone === "danger" ? "bg-[#fff0f4] text-[#bd3c62] dark:bg-[#ff6b9d]/10 dark:text-[#ff9ab8]" : tone === "warn" ? "bg-[#fff8ec] text-[#9a5a00] dark:bg-[#ff8c00]/10 dark:text-[#ffbf72]" : "bg-[#f5f8f5] text-[#647369] dark:bg-white/[.045] dark:text-[#a6b4a9]"}`}><div className="font-bold">{title}</div><p className="mt-2 text-sm leading-6">{text}</p>{action}</div>;
const ConnectionOverlay: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; action?: React.ReactNode }> = ({ icon, title, subtitle, action }) => <div className="absolute inset-0 grid place-items-center bg-[#07100a]/80 px-6 backdrop-blur-sm"><div className="max-w-md rounded-3xl border border-white/10 bg-[#101812] p-6 text-center text-white shadow-2xl">{<div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/8">{icon}</div>}<h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 break-words text-xs leading-5 text-[#9caaa0]">{subtitle}</p>{action && <div className="mt-4">{action}</div>}</div></div>;

export const LiveClassroomPage: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => isPreview() ? <LiveClassroomPreview /> : <LiveClassroomRuntime user={user} />;

export default LiveClassroomPage;
