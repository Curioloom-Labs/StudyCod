import React, { useCallback, useEffect, useRef, useState } from "react";
import { revealLivePanel } from "./livePanelNavigation";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CarouselLayout, Chat, ConnectionQualityIndicator, ConnectionStateToast, ControlBar, FocusLayout, FocusLayoutContainer, FocusToggle, GridLayout, LayoutContextProvider, LiveKitRoom, ParticipantName, ParticipantTile, PreJoin, RoomAudioRenderer, TrackMutedIndicator, VideoTrack, useCreateLayoutContext, useParticipantContext, useParticipants, usePinnedTracks, useTrackRefContext, useTracks } from "@livekit/components-react";
import "@livekit/components-styles";
import { DisconnectReason, RoomEvent, Track } from "livekit-client";
import { isEqualTrackRef, isTrackReference, type TrackReferenceOrPlaceholder, type WidgetState } from "@livekit/components-core";
import { ArrowLeft, ArrowRight, BookOpen, Clock3, Code2, Flag, Loader2, MessageCircle, Mic, MicOff, MonitorUp, PenSquare, PhoneOff, PlayCircle, Radio, RotateCcw, Users, Video, VideoOff, WifiOff } from "lucide-react";
import { BreakoutPanel } from "../../components/BreakoutPanel";
import { ClassLiveOverview } from "../../components/ClassLiveOverview";
import { LessonMaterialsPanel } from "../../components/LessonMaterialsPanel";
import { LiveChallengePanel } from "../../components/LiveChallengePanel";
import { LiveCodeBoard } from "../../components/LiveCodeBoard";
import { LivePairEditor } from "../../components/edu/LivePairEditor";
import { RaiseHandButton, RaisedHandsBar } from "../../components/LiveRaiseHand";
import { StudentCodeStream } from "../../components/StudentCodeStream";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { getCurrentTheme, type AppTheme } from "../../theme";
import {
  endLiveSession,
  getActiveLiveSession,
  getClassLessonsList,
  getBreakouts,
  getMyBreakoutToken,
  getTeacherBreakoutToken,
  joinLiveSession,
  startLiveSession,
  type LiveJoinInfo,
  type LiveSession,
  type LessonBrief,
  type LiveOverview,
} from "../../lib/api/liveClassroom";
import "./eduWorkspace.css";
import "./eduVisualQuality.css";

type Phase = "loading" | "lobby" | "prejoin" | "in_room" | "disabled" | "error";
type SidePanel = "people" | "materials" | "code" | "board";
type ActiveRoom = { token: string; url: string; kind: string };
type LiveParticipant = { identity: string; name: string; isLocal: boolean };
type DeviceChoices = {
  username: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
};
type LiveClassroomUser = { studentId?: number; classId?: number; userMode?: string; username?: string; firstName?: string } | null | undefined;

const isInterfacePreview = () => import.meta.env.DEV
  && new URLSearchParams(window.location.search).get("preview") === "true"
  && new URLSearchParams(window.location.search).get("liveRoomPreview") === "design";

const EduParticipantTileContent: React.FC = () => {
  const participant = useParticipantContext();
  const trackRef = useTrackRefContext();
  const microphoneRef = React.useMemo(() => ({ participant, source: Track.Source.Microphone }), [participant]);
  const displayName = participant.name?.trim() || participant.identity;
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("") || "SC";

  return <>
    {isTrackReference(trackRef) && (trackRef.publication?.kind === "video" || trackRef.source === Track.Source.Camera || trackRef.source === Track.Source.ScreenShare) && <VideoTrack trackRef={trackRef} />}
    <div className="lk-participant-placeholder edu-live-room__participant-placeholder" aria-hidden="true"><span>{initials}</span></div>
    <div className="lk-participant-metadata">
      <div className="lk-participant-metadata-item">
        {trackRef.source === Track.Source.Camera ? <><TrackMutedIndicator trackRef={microphoneRef} show="muted" /><ParticipantName /></> : <><MonitorUp className="size-4" aria-hidden="true" /><ParticipantName>&apos;s screen</ParticipantName></>}
      </div>
      <ConnectionQualityIndicator className="lk-participant-metadata-item" />
    </div>
    <FocusToggle trackRef={trackRef} />
  </>;
};

const EduParticipantTile: React.FC<{ trackRef?: TrackReferenceOrPlaceholder }> = (props) => <ParticipantTile {...props}><EduParticipantTileContent /></ParticipantTile>;

/** LiveKit's standard conference layout with a branded, name-aware camera-off tile. */
const EduVideoConference: React.FC = () => {
  const [widgetState, setWidgetState] = useState<WidgetState>({ showChat: false, unreadMessages: 0, showSettings: false });
  const lastAutoFocusedScreenShareTrack = useRef<TrackReferenceOrPlaceholder | null>(null);
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
  const layoutContext = useCreateLayoutContext();
  const screenShareTracks = tracks.filter(isTrackReference).filter((track) => track.publication.source === Track.Source.ScreenShare);
  const focusTrack = usePinnedTracks(layoutContext)?.[0];
  const carouselTracks = tracks.filter((track) => !isEqualTrackRef(track, focusTrack));

  useEffect(() => {
    if (screenShareTracks.some((track) => track.publication.isSubscribed) && lastAutoFocusedScreenShareTrack.current === null) {
      layoutContext.pin.dispatch?.({ msg: "set_pin", trackReference: screenShareTracks[0] });
      lastAutoFocusedScreenShareTrack.current = screenShareTracks[0];
    } else if (lastAutoFocusedScreenShareTrack.current && !screenShareTracks.some((track) => track.publication.trackSid === lastAutoFocusedScreenShareTrack.current?.publication?.trackSid)) {
      layoutContext.pin.dispatch?.({ msg: "clear_pin" });
      lastAutoFocusedScreenShareTrack.current = null;
    }
    if (focusTrack && !isTrackReference(focusTrack)) {
      const updatedFocusTrack = tracks.find((track) => track.participant.identity === focusTrack.participant.identity && track.source === focusTrack.source);
      if (updatedFocusTrack !== focusTrack && isTrackReference(updatedFocusTrack)) layoutContext.pin.dispatch?.({ msg: "set_pin", trackReference: updatedFocusTrack });
    }
  }, [screenShareTracks.map((ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`).join(), focusTrack?.publication?.trackSid, tracks]);

  return <div className="lk-video-conference">
    <LayoutContextProvider value={layoutContext} onWidgetChange={setWidgetState}>
      <div className="lk-video-conference-inner">
        {!focusTrack ? <div className="lk-grid-layout-wrapper"><GridLayout tracks={tracks}><EduParticipantTile /></GridLayout></div>
          : <div className="lk-focus-layout-wrapper"><FocusLayoutContainer><CarouselLayout tracks={carouselTracks}><EduParticipantTile /></CarouselLayout>{focusTrack && <FocusLayout trackRef={focusTrack} />}</FocusLayoutContainer></div>}
        <ControlBar controls={{ chat: true, settings: false }} />
      </div>
      <Chat style={{ display: widgetState.showChat ? "grid" : "none" }} />
    </LayoutContextProvider>
    <RoomAudioRenderer />
    <ConnectionStateToast />
  </div>;
};

const LiveClassroomRuntime: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => {
  useTranslation();
  const { classId: classIdParam } = useParams<{ classId: string }>();
  const classId = Number(classIdParam);
  const navigate = useNavigate();
  const isTeacher = !user?.studentId;
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getCurrentTheme());

  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [classLessons, setClassLessons] = useState<LessonBrief[]>([]);
  const [classLessonsLoading, setClassLessonsLoading] = useState(false);
  const [classLessonsError, setClassLessonsError] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<number | "">("");
  const [joinInfo, setJoinInfo] = useState<LiveJoinInfo | null>(null);
  const [choices, setChoices] = useState<DeviceChoices | null>(null);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  // Students land directly on the lesson, while teachers land on their live
  // class overview. Both roles can switch tools without unmounting their state.
  const [sidePanel, setSidePanel] = useState<SidePanel>(() => user?.studentId ? "materials" : "people");
  const sidePanelRef = useRef<HTMLElement>(null);
  const selectSidePanel = (panel: SidePanel) => {
    setSidePanel(panel);
    revealLivePanel(sidePanelRef.current);
  };
  const [breakoutsOpen, setBreakoutsOpen] = useState(false);
  const [myBreakoutIndex, setMyBreakoutIndex] = useState<number | null>(null);
  const [watched, setWatched] = useState<{ studentId: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomConn, setRoomConn] = useState<"connecting" | "connected" | "failed">("connecting");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setAppTheme(getCurrentTheme());
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const onStorage = (event: StorageEvent) => {
      if (event.key === "studycod_theme") syncTheme();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const switchingRef = useRef(false);
  const connTimerRef = useRef<number | null>(null);
  const activeRoomRef = useRef<ActiveRoom | null>(null);
  activeRoomRef.current = activeRoom;
  const syncParticipants = useCallback((next: LiveParticipant[]) => setParticipants((current) => {
    const unchanged = current.length === next.length && current.every((item, index) => {
      const candidate = next[index];
      return item.identity === candidate.identity && item.name === candidate.name && item.isLocal === candidate.isLocal;
    });
    return unchanged ? current : next;
  }), []);

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
      setError(tr("Не вдалося завантажити live-сесію.", "Could not load the live session."));
    }
  }, [classId]);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  const loadClassLessons = useCallback(async (canUpdate: () => boolean = () => true) => {
    if (!isTeacher || !Number.isFinite(classId)) return;
    setClassLessonsLoading(true);
    try {
      const items = await getClassLessonsList(classId);
      if (!canUpdate()) return;
      setClassLessons(items);
      setClassLessonsError(false);
    } catch {
      if (canUpdate()) setClassLessonsError(true);
    } finally {
      if (canUpdate()) setClassLessonsLoading(false);
    }
  }, [isTeacher, classId]);

  useEffect(() => {
    if (!isTeacher || !Number.isFinite(classId)) return;
    let cancelled = false;
    void loadClassLessons(() => !cancelled);
    return () => { cancelled = true; };
  }, [isTeacher, classId, loadClassLessons]);

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
      const info = await startLiveSession(classId, selectedLessonId === "" ? undefined : selectedLessonId);
      setJoinInfo(info);
      setSession(info.session);
      setPhase("prejoin");
    } catch {
      setError(tr("Не вдалося розпочати урок.", "Could not start the lesson."));
    } finally {
      setBusy(false);
    }
  }, [classId, selectedLessonId]);

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
      setError(tr("Не вдалося приєднатися до уроку.", "Could not join the lesson."));
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
    setParticipants([]);
    setMyBreakoutIndex(null);
    setPhase("loading");
    await refreshActive();
  }, [refreshActive]);

  const handleBackToLobby = useCallback(async () => {
    // Returning to device setup must not end the room: students may already be
    // waiting there. The teacher can still end it from the active room.
    setJoinInfo(null);
    setChoices(null);
    setActiveRoom(null);
    setParticipants([]);
    setMyBreakoutIndex(null);
    setPhase("loading");
    await refreshActive();
  }, [refreshActive]);

  const handleEnd = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await endLiveSession(session.id);
      setJoinInfo(null);
      navigate(`/edu/classes/${classId}`);
    } catch {
      setError(tr("Не вдалося завершити урок. Спробуйте ще раз.", "Could not end the lesson. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [session, classId, navigate]);

  const teacherJoinGroup = useCallback(async (index: number) => {
    const token = await getTeacherBreakoutToken(classId, index);
    if (token.token && token.url) switchRoom({ token: token.token, url: token.url, kind: `breakout:${index}` });
  }, [classId, switchRoom]);

  const teacherReturnMain = useCallback(() => {
    if (joinInfo) switchRoom({ token: joinInfo.token, url: joinInfo.url, kind: "main" });
  }, [joinInfo, switchRoom]);

  if (user?.studentId && user.classId && Number.isFinite(classId) && user.classId !== classId) {
    return <Navigate to="/edu/lessons" replace />;
  }

  if (phase === "prejoin" && joinInfo) {
    return (
      <LiveShell>
        <section className="edu-live-prejoin mx-auto grid w-full max-w-6xl place-items-center px-4 py-8">
          <div className="edu-live-prejoin__card w-full overflow-hidden rounded-[28px] border border-border bg-bg-surface shadow-[var(--workshop-panel-shadow)]">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
              <div className="text-xs font-bold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">{tr("Перед входом · перевірка пристроїв", "Before you join · device check")}</div>
                <h1 className="mt-1 text-xl font-bold text-text-primary">{joinInfo.session.title || tr("Живий урок", "Live lesson")}</h1>
              </div>
              <button type="button" onClick={() => void handleBackToLobby()} className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-base px-4 py-2 text-sm font-bold text-text-primary hover:bg-bg-hover"><ArrowLeft className="size-4" />{tr("До лобі", "Back to lobby")}</button>
            </div>
            {error && <p role="alert" className="edu-live-prejoin__error">{error}</p>}
            <div className="edu-live-prejoin__layout">
              <aside className="edu-live-prejoin__intro">
                <span className="edu-live-prejoin__class"><BookOpen className="size-4" />{tr("Клас", "Class")} {classId}</span>
                <h2>{tr("Підготуйтеся до заняття", "Get ready for the lesson")}</h2>
                <p>{tr("Перевірте ім’я та пристрої. Після входу поруч із відео будуть матеріали уроку, спільна дошка й код.", "Check your name and devices. After joining, you’ll find lesson materials, a shared board, and code beside the video.")}</p>
                <ol aria-label={tr("Що буде в кімнаті", "What is in the classroom")}>
                  <li><span>01</span>{tr("Відео й учасники класу", "Video and your class")}</li>
                  <li><span>02</span>{tr("Матеріал поточного уроку", "Materials for this lesson")}</li>
                  <li><span>03</span>{tr("Дошка та спільний код", "A shared board and code")}</li>
                </ol>
                <p className="edu-live-prejoin__privacy">{tr("Якщо камера або мікрофон недоступні, їх можна вимкнути й усе одно приєднатися.", "If your camera or microphone is unavailable, turn it off and join anyway.")}</p>
              </aside>
              <div className="edu-live-prejoin__device-check">
                <div className="edu-live-prejoin__device-title"><span>{tr("Перевірка пристроїв", "Device check")}</span><small>{tr("Камера · мікрофон · ім’я", "Camera · microphone · name")}</small></div>
                <div className="edu-live-prejoin__body" data-lk-theme="default">
                  <PreJoin
                    defaults={{ username: user?.firstName || user?.username || tr("Учасник", "Participant"), videoEnabled: true, audioEnabled: true }}
                    onSubmit={(values) => enterRoom(values)}
                    onError={() => setError(tr("Помилка доступу до камери або мікрофона.", "Could not access the camera or microphone."))}
                    joinLabel={tr("Увійти в урок", "Join lesson")}
                    micLabel={tr("Мікрофон", "Microphone")}
                    camLabel={tr("Камера", "Camera")}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </LiveShell>
    );
  }

  if (phase === "in_room" && joinInfo && choices && activeRoom) {
    return (
      <LiveShell>
        <div className="edu-live-room">
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
            className="edu-live-room__provider"
            style={{ height: "100%" }}
            onConnected={() => {
              switchingRef.current = false;
              setRoomConn("connected");
              if (connTimerRef.current) window.clearTimeout(connTimerRef.current);
            }}
            onError={() => setRoomConn("failed")}
            onDisconnected={(reason) => {
              if (switchingRef.current) return;
              if (reason === DisconnectReason.CLIENT_INITIATED) {
                void handleLeave();
                return;
              }
              setRoomConn("failed");
            }}
          >
            <ConnectionStateToast />
            <ParticipantReporter onChange={syncParticipants} />
          <header className="edu-live-room__header flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-bg-surface px-4 py-3 text-text-primary shadow-[var(--workshop-panel-shadow)]">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`edu-live-room__status-dot is-${roomConn}`} aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate font-bold">{joinInfo.session.title || tr("Живий урок", "Live lesson")}</div>
                <div className="edu-live-room__session-meta" aria-live="polite">
                  <span>{joinInfo.role === "host" ? tr("Викладач", "Teacher") : tr("Учасник", "Participant")}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeRoom.kind === "main" ? tr("основна кімната", "main room") : `${tr("група", "group")} ${activeRoom.kind.split(":")[1]}`}</span>
                  <span className="edu-live-room__connection-state">
                    {roomConn === "connected" ? tr("З’єднано", "Connected") : roomConn === "failed" ? tr("Немає з’єднання", "Connection lost") : tr("Підключення…", "Connecting…")}
                  </span>
                  <span className="edu-live-room__participant-count">{participants.length} {participants.length === 1 ? tr("учасник", "participant") : tr("учасників", "participants")}</span>
                </div>
              </div>
            </div>
            <nav aria-label={tr("Інструменти онлайн-уроку", "Live lesson tools")} className={`edu-live-room__tools flex items-center gap-2 overflow-x-auto${isTeacher ? " edu-live-room__tools--teacher" : ""}`}>
              <Tool active={sidePanel === "people"} controls="live-panel-people" onClick={() => selectSidePanel("people")} icon={<Users className="size-4" />} label={tr("Люди", "People")} />
              <Tool active={sidePanel === "materials"} controls="live-panel-materials" onClick={() => selectSidePanel("materials")} icon={<BookOpen className="size-4" />} label={tr("Матеріали", "Materials")} />
              <Tool active={sidePanel === "board"} controls="live-panel-board" onClick={() => selectSidePanel("board")} icon={<PenSquare className="size-4" />} label={tr("Дошка", "Board")} />
              <Tool active={sidePanel === "code"} controls="live-panel-code" onClick={() => selectSidePanel("code")} icon={<Code2 className="size-4" />} label={tr("Код", "Code")} />
              {isTeacher && <Tool active={breakoutsOpen} onClick={() => setBreakoutsOpen((value) => !value)} icon={<Users className="size-4" />} label={tr("Групи", "Groups")} />}
              {!isTeacher && <button type="button" onClick={() => void handleLeave()} className="edu-live-room__leave inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold text-text-secondary hover:bg-bg-hover"><ArrowLeft className="size-4" />{tr("Вийти з уроку", "Leave lesson")}</button>}
              {isTeacher && <button type="button" disabled={busy} onClick={() => void handleEnd()} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent-error/35 bg-accent-error/10 px-3 py-2 text-sm font-bold text-accent-error hover:bg-accent-error/15 disabled:opacity-50"><PhoneOff className="size-4" />{tr("Завершити", "End")}</button>}
            </nav>
          </header>

          {error && <div role="alert" className="edu-live-room__error rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-2 text-sm text-accent-error">{error}</div>}
          {Number.isFinite(classId) && <LiveChallengePanel classId={classId} isTeacher={isTeacher} />}
          {isTeacher && breakoutsOpen && <BreakoutPanel classId={classId} currentKind={activeRoom.kind} onJoinGroup={(index) => void teacherJoinGroup(index)} onReturnMain={teacherReturnMain} />}
          {!isTeacher && myBreakoutIndex != null && <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-bold text-primary-soft">{tr("Ви в групі", "You are in group")} {myBreakoutIndex + 1}</div>}

          <main className="edu-live-room__body grid min-h-0 flex-1 gap-3">
            <section aria-label={tr("Відеозустріч", "Video meeting")} className="edu-live-room__stage relative min-h-0 overflow-hidden rounded-[24px] border border-border bg-bg-code shadow-[0_28px_64px_-46px_rgba(0,0,0,.82)]" data-lk-theme="default">
              <div className="flex h-full min-h-0 flex-col">
                {isTeacher ? <RaisedHandsBar /> : <div className="flex items-center justify-end border-b border-white/10 px-4 py-2"><RaiseHandButton /></div>}
                <div className="min-h-0 flex-1"><EduVideoConference /></div>
              </div>

              {roomConn === "connecting" && <ConnectionOverlay icon={<Loader2 className="size-6 animate-spin text-primary-soft" />} title={tr("Підключення до відеосервера…", "Connecting to video server…")} subtitle={activeRoom.url} />}
              {roomConn === "failed" && (
                <ConnectionOverlay
                  icon={<WifiOff className="size-6 text-accent-error" />}
              title={tr("Не вдалося підключитися до відеосервера", "Could not connect to the video server")}
              subtitle={tr(`Сервер ${activeRoom.url} не відповідає. Перевірте LiveKit і мережу.`, `Server ${activeRoom.url} is not responding. Check LiveKit and your network.`)}
              action={<button type="button" onClick={() => { setRoomConn("connecting"); setRetryNonce((n) => n + 1); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><RotateCcw className="size-4" />{tr("Повторити", "Retry")}</button>}
                />
              )}
            </section>

            <aside ref={sidePanelRef} className="edu-live-room__aside min-h-0 overflow-hidden rounded-[24px] border border-border bg-bg-surface">
              <PanelHeading panel={sidePanel} />
              <div className="edu-live-room__panel-body h-[calc(100%-56px)] min-h-0">
                <section id="live-panel-people" role="region" aria-label={tr("Учасники уроку", "Lesson participants")} aria-hidden={sidePanel !== "people"} className="h-full min-h-0 overflow-auto p-3" hidden={sidePanel !== "people"}>
                  {sidePanel === "people" && isTeacher && Number.isFinite(classId) && (watched ? <StudentCodeStream classId={classId} studentId={watched.studentId} studentName={watched.name} onBack={() => setWatched(null)} /> : <ClassLiveOverview classId={classId} enableCopilot onSelectStudent={(studentId, name) => setWatched({ studentId, name })} />)}
                  {sidePanel === "people" && !isTeacher && <StudentSide participants={participants} />}
                </section>
                <section id="live-panel-materials" role="region" aria-label={tr("Матеріали уроку", "Lesson materials")} aria-hidden={sidePanel !== "materials"} className="h-full min-h-0 overflow-auto" hidden={sidePanel !== "materials"}>
                  {sidePanel === "materials" && <LessonMaterialsPanel classId={classId} sessionId={joinInfo.session.id} isTeacher={isTeacher} />}
                </section>
                <section id="live-panel-board" role="region" aria-label={tr("Спільна дошка", "Shared board")} aria-hidden={sidePanel !== "board"} className="edu-live-room__collaboration-surface h-full min-h-0" hidden={sidePanel !== "board"}>
                  {sidePanel === "board" && <LiveCodeBoard isTeacher={isTeacher} />}
                </section>
                <section id="live-panel-code" role="region" aria-label={tr("Спільний код", "Shared code")} aria-hidden={sidePanel !== "code"} className="edu-live-room__collaboration-surface h-full min-h-0" hidden={sidePanel !== "code"}>
                  {sidePanel === "code" && <LivePairEditor topic={`class-${classId}-collab`} userName={isTeacher ? tr("Викладач", "Teacher") : tr("Учень", "Student")} theme={appTheme} height="100%" />}
                </section>
              </div>
            </aside>
          </main>
          </LiveKitRoom>
        </div>
      </LiveShell>
    );
  }

  return (
    <LiveShell>
      <section className="edu-live-lobby">
        <div className="edu-live-lobby__intro">
          <button type="button" onClick={() => navigate(`/edu/classes/${classId}`)} className="edu-live-lobby__back"><ArrowLeft className="size-4" />{tr("До класу", "Back to class")}</button>
          <p className="edu-live-lobby__eyebrow"><Radio className="size-4" />StudyCod EDU <span>/</span> {tr("онлайн-урок", "live lesson")}</p>
          <h1>{tr("Урок наживо", "Live lesson")}</h1>
          <p>{tr("Відеозустріч, матеріали й спільна робота з кодом зібрані в одному місці.", "Video, lesson materials, and shared coding tools are together in one classroom.")}</p>
        </div>
        <div className="edu-live-lobby__card">
          <div className="edu-live-lobby__card-head">
            <div className="edu-live-lobby__class-icon"><BookOpen className="size-5" /></div>
            <div className="min-w-0"><span>{tr("Клас", "Class")} {classId}</span><h2>{session?.title || tr("Кімната класу", "Classroom")}</h2></div>
            {session && <span className="edu-live-lobby__live-badge"><span />{tr("Урок триває", "Live now")}</span>}
          </div>
          <div className="edu-live-lobby__content">
            {phase === "loading" && <StatusLine icon={<Loader2 className="size-4 animate-spin" />} text={tr("Перевіряємо кімнату класу…", "Checking the classroom…")} />}
            {phase === "disabled" && <StatusCard tone="warn" title={tr("Онлайн-уроки тимчасово недоступні", "Live lessons are temporarily unavailable")} text={tr("Відеозв’язок ще не налаштований на цьому сервері. Повідомлення про уроки та матеріали класу залишаються доступними.", "Video calling is not configured on this server yet. Class announcements and lesson materials remain available.")} />}
            {phase === "error" && <StatusCard tone="danger" title={tr("Не вдалося завантажити кімнату", "Could not load the classroom")} text={error || tr("Перевірте з’єднання та спробуйте ще раз.", "Check your connection and try again.")} action={<button type="button" onClick={() => void refreshActive()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-accent-error/35 px-4 py-2 text-sm font-bold text-accent-error"><RotateCcw className="size-4" />{tr("Спробувати ще раз", "Try again")}</button>} />}
            {phase === "lobby" && (
              session ? (
                <div className="edu-live-lobby__state">
                  <div><strong>{tr("Зустріч відкрита", "The room is open")}</strong><p>{tr("Перевірте камеру та мікрофон перед входом. Матеріали уроку будуть у боковій панелі.", "Check your camera and microphone before joining. Lesson materials will be in the side panel.")}</p></div>
                  <button type="button" disabled={busy} onClick={() => void handleJoin()} className="edu-live-lobby__primary"><PlayCircle className="size-4" />{busy ? tr("Підключаємо…", "Connecting…") : tr("Приєднатися до уроку", "Join lesson")}<ArrowLeft className="size-4 rotate-180" /></button>
                </div>
              ) : isTeacher ? (
                <div className="edu-live-lobby__state">
                  <div><strong>{tr("Кімната готова до уроку", "Your classroom is ready")}</strong><p>{tr("За бажанням прикріпіть тему: учні одразу побачать її теорію й задачі поруч із відео.", "Optionally attach a topic so students see its explanation and practice beside the video.")}</p></div>
                  <label className="edu-live-lobby__lesson-field"><span>{tr("Тема уроку", "Lesson topic")}</span><select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value ? Number(event.target.value) : "")} disabled={busy || classLessonsLoading}>
                    <option value="">{classLessonsLoading ? tr("Завантажуємо теми…", "Loading topics…") : classLessonsError ? tr("Не вдалося завантажити теми", "Could not load topics") : classLessons.length ? tr("Без прив’язаної теми", "No topic attached") : tr("У класі ще немає тем", "No class topics yet")}</option>
                    {classLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                  </select>{classLessonsError && <span role="status" className="edu-live-lobby__lesson-error">{tr("Можна повторити завантаження або почати без теми.", "Retry loading topics, or start without an attached lesson.")} <button type="button" onClick={() => void loadClassLessons()}>{classLessonsLoading ? tr("Завантажуємо…", "Loading…") : tr("Повторити", "Retry")}</button></span>}</label>
                  <button type="button" disabled={busy || classLessonsLoading} onClick={() => void handleStart()} className="edu-live-lobby__primary"><PlayCircle className="size-4" />{busy ? tr("Створюємо кімнату…", "Starting the room…") : tr("Почати онлайн-урок", "Start live lesson")}<ArrowLeft className="size-4 rotate-180" /></button>
                </div>
              ) : (
                <div className="edu-live-lobby__waiting"><div className="edu-live-lobby__waiting-icon"><Radio className="size-5" /></div><div><strong>{tr("Тут з’явиться ваш онлайн-урок", "Your live lesson will appear here")}</strong><p>{tr("Кімната оновлюється автоматично. Коли викладач розпочне заняття, кнопка входу з’явиться на цій сторінці.", "This room updates automatically. When your teacher starts a lesson, the join button will appear here.")}</p></div><span>{tr("Перевіряємо кожні 5 секунд", "Checks every 5 seconds")}</span></div>
              )
            )}
            {error && phase === "lobby" && <p role="alert" className="mt-4 text-sm text-accent-error">{error}</p>}
          </div>
        </div>
      </section>
    </LiveShell>
  );
};

const PREVIEW_LIVE_OVERVIEW: LiveOverview = {
  totals: { stuck: 0, in_progress: 0, passed: 0, not_started: 0 },
  students: [],
  generatedAtMs: Date.now(),
};

const LiveClassroomPreview: React.FC = () => {
  useTranslation();
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();
  const [panel, setPanel] = useState<SidePanel>("people");
  const [previewMicOn, setPreviewMicOn] = useState(false);
  const [previewCameraOn, setPreviewCameraOn] = useState(false);
  const sidePanelRef = useRef<HTMLElement>(null);
  const selectPanel = (next: SidePanel) => {
    setPanel(next);
    revealLivePanel(sidePanelRef.current);
  };

  return (
    <LiveShell>
      <div className="edu-live-room edu-live-room--preview">
        <header className="edu-live-room__header edu-live-room__preview-header">
          <div className="edu-live-room__preview-title">
            <button type="button" onClick={() => navigate(`/edu/classes/${classId}?preview=true`)} aria-label={tr("Повернутися до класу 11-А", "Back to class 11-A")}><ArrowLeft className="size-4" /></button>
            <span className="edu-live-room__status-dot is-connected" aria-hidden="true" />
            <div className="min-w-0"><p className="edu-live-room__preview-label">{tr("Урок наживо · 11-А · Python", "Live lesson · Class 11-A · Python")}</p><h1 className="truncate">{tr("Цикли: від ідеї до коду", "Loops: from idea to code")}</h1></div>
            <span className="edu-live-room__preview-count"><Users className="size-3.5" aria-hidden="true" />16 {tr("учнів", "learners")}</span>
          </div>
          <nav aria-label={tr("Інструменти уроку", "Lesson tools")} className="edu-live-room__tools">
            <Tool active={panel === "people"} controls="live-preview-panel-people" onClick={() => selectPanel("people")} icon={<Users className="size-4" />} label={tr("Люди", "People")} />
            <Tool active={panel === "materials"} controls="live-preview-panel-materials" onClick={() => selectPanel("materials")} icon={<BookOpen className="size-4" />} label={tr("Матеріали", "Materials")} />
            <Tool active={panel === "board"} controls="live-preview-panel-board" onClick={() => selectPanel("board")} icon={<PenSquare className="size-4" />} label={tr("Дошка", "Board")} />
            <Tool active={panel === "code"} controls="live-preview-panel-code" onClick={() => selectPanel("code")} icon={<Code2 className="size-4" />} label={tr("Код", "Code")} />
            <button type="button" className="edu-live-room__preview-end" onClick={() => navigate(`/edu/classes/${classId}?preview=true`)}><PhoneOff className="size-4" />{tr("Завершити", "End")}</button>
          </nav>
        </header>

        <section className="edu-live-challenge edu-live-challenge--setup edu-live-challenge--preview" aria-label={tr("Швидка практика", "Quick practice")}>
          <div className="edu-live-challenge__identity"><span><Flag className="size-4" aria-hidden="true" /></span><div><strong>{tr("Швидка практика", "Quick practice")}</strong><small>{tr("Коротка задача для всього класу", "A short task for the class")}</small></div></div>
          <label><span>{tr("Задача", "Problem")}</span><select aria-label={tr("Задача челенджу", "Challenge task")} disabled><option>{tr("Задачі поки недоступні", "No problems available")}</option></select></label>
          <label className="edu-live-challenge__duration"><span>{tr("Час", "Time")}</span><select aria-label={tr("Тривалість челенджу", "Challenge duration")} defaultValue="90" disabled><option value="90">1:30</option></select></label>
          <button type="button" disabled className="edu-live-challenge__launch"><PlayCircle className="size-4" aria-hidden="true" />{tr("Запустити", "Start")}</button>
        </section>

        <main className="edu-live-room__body grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section aria-label={tr("Демонстраційний відеодзвінок", "Demo video call")} className="edu-live-room__stage edu-live-room__preview-stage">
            <div className="edu-live-room__preview-stage-head"><span><i aria-hidden="true" />{tr("Зустріч відкрита", "Room is open")}</span><span>{tr("Приклад інтерфейсу · камера вимкнена", "Interface preview · camera off")}</span></div>
            <div className="edu-live-room__preview-camera">
              <div className="edu-live-room__preview-person"><span>ОК</span><strong>{tr("Олена Коваль", "Olena Koval")}</strong><small><VideoOff className="size-3.5" aria-hidden="true" />{tr("Камера вимкнена", "Camera is off")}</small></div>
              <span className="edu-live-room__preview-speaker-tag"><MicOff className="size-3.5" aria-hidden="true" />{tr("Олена Коваль · викладач", "Olena Koval · teacher")}</span>
            </div>
            <div className="edu-live-room__preview-controls" aria-label={tr("Керування дзвінком", "Call controls")}>
              <button type="button" aria-pressed={previewMicOn} onClick={() => setPreviewMicOn((value) => !value)}><span>{previewMicOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}</span>{tr("Мікрофон", "Microphone")}</button>
              <button type="button" aria-pressed={previewCameraOn} onClick={() => setPreviewCameraOn((value) => !value)}><span>{previewCameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}</span>{tr("Камера", "Camera")}</button>
              <button type="button" onClick={() => selectPanel("board")}><span><MonitorUp className="size-4" /></span>{tr("Показ екрана", "Share screen")}</button>
              <button type="button" onClick={() => selectPanel("materials")}><span><MessageCircle className="size-4" /></span>{tr("Чат", "Chat")}</button>
              <button type="button" className="is-leave" onClick={() => navigate(`/edu/classes/${classId}?preview=true`)}><span><PhoneOff className="size-4" /></span>{tr("Вийти", "Leave")}</button>
            </div>
          </section>

          <aside ref={sidePanelRef} className="edu-live-room__aside min-h-0 overflow-hidden rounded-[24px] border border-border bg-bg-surface">
            <PanelHeading panel={panel} />
            <div className="edu-live-room__panel-body h-[calc(100%-56px)] min-h-0 overflow-auto p-3">
              <p className="edu-live-room__preview-notice mb-3">{tr("Попередній перегляд. Керування дзвінком тут демонстраційне.", "Design preview. Call controls are illustrative.")}</p>
              <section id="live-preview-panel-people" role="region" aria-label={tr("Учасники уроку", "Lesson participants")} hidden={panel !== "people"}>
                {panel === "people" && <ClassLiveOverview classId={Number(classId) || 31} enableCopilot previewData={PREVIEW_LIVE_OVERVIEW} />}
              </section>
              <section id="live-preview-panel-materials" role="region" aria-label={tr("Матеріали уроку", "Lesson materials")} hidden={panel !== "materials"}>
                {panel === "materials" && <div className="space-y-4"><div className="edu-live-room__demo-material"><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft">{tr("Матеріал до зустрічі", "Lesson material")}</p><h2 className="mt-2 text-lg font-bold">{tr("Цикли: діапазон і сума", "Loops: range and sum")}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{tr("Розберіть приклад разом із викладачем, а потім перевірте ту саму ідею у практиці.", "Work through the example with the teacher, then test the same idea in practice.")}</p></div><div><p className="mb-1 text-xs font-bold uppercase tracking-[.1em] text-text-secondary">{tr("Практика уроку", "Lesson practice")}</p><button type="button" onClick={() => setPanel("code")} className="edu-live-room__demo-task"><strong>{tr("Сума від 1 до n", "Sum from 1 to n")}</strong><span>PY · 1 test</span></button><button type="button" onClick={() => setPanel("board")} className="edu-live-room__demo-task"><strong>{tr("Знайди межу циклу", "Find the loop boundary")}</strong><span>{tr("дошка", "board")}</span></button></div></div>}
              </section>
              <section id="live-preview-panel-board" role="region" aria-label={tr("Спільна дошка", "Shared board")} hidden={panel !== "board"}>
                {panel === "board" && <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft">{tr("Спільна дошка · демо", "Shared board · demo")}</p><h2 className="mt-2 font-bold">{tr("Крок 1. Знайди межу циклу", "Step 1. Find the loop boundary")}</h2><div className="mt-5 grid grid-cols-5 gap-2 text-center text-xs"><span>1</span><span>2</span><span>3</span><span>4</span><span className="rounded-lg bg-primary/15 py-2 font-bold text-primary-strong dark:text-primary-soft">5</span></div><p className="mt-4 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Верхня межа range у Python не входить до послідовності.", "The upper bound of Python's range is exclusive.")}</p></div>}
              </section>
              <section id="live-preview-panel-code" role="region" aria-label={tr("Спільний код", "Shared code")} hidden={panel !== "code"}>
                {panel === "code" && <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft">Python · {tr("приклад", "example")}</p><pre className="mt-3 overflow-auto rounded-xl bg-bg-code p-4 text-xs leading-6 text-emerald-200"><code>{`n = 5\ntotal = 0\nfor number in range(1, n):\n    total += number\nprint(total)  # 10`}</code></pre><p className="mt-3 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Очікувана сума від 1 до 5 — 15. Зараз range зупиняється перед 5.", "The expected sum from 1 through 5 is 15. This range stops before 5.")}</p></div>}
              </section>
            </div>
          </aside>
        </main>
      </div>
    </LiveShell>
  );
};

const LiveShell: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="edu-live-shell min-h-[calc(100dvh-72px)] bg-bg-base text-text-primary">{children}</div>;
const Tool: React.FC<{ active: boolean; controls?: string; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, controls, onClick, icon, label }) => <button type="button" aria-pressed={active} aria-controls={controls} onClick={onClick} className={`edu-live-tool inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? "bg-primary/12 text-primary-strong dark:text-primary-soft" : "bg-bg-hover text-text-muted hover:text-text-primary dark:bg-white/[.045] dark:text-text-secondary dark:hover:bg-white/[.08]"}`}>{icon}{label}</button>;
const PanelHeading: React.FC<{ panel: SidePanel }> = ({ panel }) => {
  const icon = panel === "people" ? <Users className="size-4" /> : panel === "materials" ? <BookOpen className="size-4" /> : panel === "board" ? <PenSquare className="size-4" /> : <Code2 className="size-4" />;
  const title = panel === "people" ? tr("Учасники уроку", "Lesson participants") : panel === "materials" ? tr("Матеріали уроку", "Lesson materials") : panel === "board" ? tr("Спільна дошка", "Shared board") : tr("Спільний код", "Shared code");
  return <div className="edu-live-panel-heading" aria-live="polite"><span>{icon}</span><strong>{title}</strong></div>;
};
const ParticipantReporter: React.FC<{ onChange: (participants: LiveParticipant[]) => void }> = ({ onChange }) => {
  const participants = useParticipants();
  useEffect(() => {
    onChange(participants.map((participant) => ({
      identity: participant.identity,
      name: participant.name?.trim() || participant.identity,
      isLocal: participant.isLocal,
    })));
  }, [participants, onChange]);
  return null;
};

const StudentSide: React.FC<{ participants: LiveParticipant[] }> = ({ participants }) => (
  <section aria-live="polite" aria-label={tr("Учасники кімнати", "Room participants")}>
    <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold">{tr("Учасники кімнати", "Room participants")}</h2><span className="rounded-full bg-bg-hover px-2 py-1 text-xs font-semibold text-text-secondary">{participants.length}</span></div>
    {participants.length ? <ul className="space-y-2">{participants.map((participant) => <li key={participant.identity} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary-strong dark:text-primary-soft">{participant.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{participant.name}{participant.isLocal ? ` · ${tr("ви", "you")}` : ""}</span>
      <span className="size-2 shrink-0 rounded-full bg-primary" aria-label={tr("У кімнаті", "In room")} />
    </li>)}</ul> : <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-text-secondary">{tr("Підключаємо учасників кімнати…", "Loading room participants…")}</div>}
  </section>
);
const StatusLine: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => <div className="flex items-center gap-2 text-sm font-semibold text-text-muted dark:text-text-secondary">{icon}{text}</div>;
const StatusCard: React.FC<{ tone?: "default" | "warn" | "danger"; title: string; text: string; action?: React.ReactNode }> = ({ tone = "default", title, text, action }) => <div className={`rounded-2xl p-5 ${tone === "danger" ? "bg-bg-hover text-accent-error dark:bg-accent-error/10 dark:text-accent-error" : tone === "warn" ? "bg-bg-hover text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn" : "bg-bg-hover text-text-muted dark:bg-white/[.045] dark:text-text-secondary"}`}><div className="font-bold">{title}</div><p className="mt-2 text-sm leading-6">{text}</p>{action}</div>;
const ConnectionOverlay: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; action?: React.ReactNode }> = ({ icon, title, subtitle, action }) => <div className="absolute inset-0 grid place-items-center bg-bg-code/80 px-6 backdrop-blur-sm"><div className="max-w-md rounded-3xl border border-white/10 bg-bg-code p-6 text-center text-text-primary shadow-2xl">{<div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/8">{icon}</div>}<h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 break-words text-xs leading-5 text-text-secondary">{subtitle}</p>{action && <div className="mt-4">{action}</div>}</div></div>;

export const LiveClassroomPage: React.FC<{ user?: LiveClassroomUser }> = ({ user }) => isInterfacePreview() ? <LiveClassroomPreview /> : <LiveClassroomRuntime user={user} />;

export default LiveClassroomPage;
