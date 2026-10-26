import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarDays, Check, Code2, MessageSquare, Mic, Pause, Play, Plus, Save, Send, Video, WifiOff } from "lucide-react";
import { TalentWorkspaceShell } from "../../components/layout/TalentWorkspaceShell";
import { cancelTalentInterview, cancelTalentInterviewExecution, controlTalentInterview, downloadTalentInterviewCalendar, endTalentInterview, executeTalentInterview, getTalentInterview, getTalentInterviewState, joinTalentInterviewCall, phaseTalentInterview, releaseTalentInterviewFeedback, respondTalentInterview, saveTalentInterviewDraft, saveTalentInterviewNote, sendTalentInterviewMessage, startTalentInterview, submitTalentInterviewQuiz, type InterviewDetails, type InterviewExecution, type InterviewMessage, type InterviewNote } from "../../lib/api/talentInterviews";
import { withdrawCandidateCompanyAssessment } from "../../lib/api/projectCompanies";
import type { GrowthFile } from "../../lib/api/growthProjects";
import { TalentEvidenceFiles } from "./TalentEvidence";
import "./talentInterview.css";

const InterviewCall = React.lazy(() => import("./TalentInterviewCall"));
const signature = (files: GrowthFile[]) => JSON.stringify(files);
function lowResources() { const nav = navigator as Navigator & { deviceMemory?: number }; return window.matchMedia("(max-width: 700px)").matches || (nav.deviceMemory ?? 4) <= 4 || nav.hardwareConcurrency <= 4; }
const errorText = (error: any, en: boolean) => {
  const code = error?.response?.data?.code ?? error?.response?.data?.message;
  const labels: Record<string, [string, string]> = {
    DRAFT_REVISION_CONFLICT: ["Сервер має іншу редакцію. Твій локальний код збережено; обери, яку копію відкрити.", "The server has a different revision. Your local code is preserved; choose which copy to open."],
    INTERVIEW_EDITOR_REQUIRED: ["Керування редактором зараз в іншого учасника.", "Another participant currently controls the editor."],
    ACTIVE_EXECUTION_EXISTS: ["Одна перевірка вже очікує або виконується. Дочекайся її результату.", "A check is queued or running. Wait for its result."],
    PROJECT_EXECUTION_RATE_LIMIT: ["Новий запуск доступний через кілька секунд.", "A new execution will be available in a few seconds."],
    PROJECT_EXECUTION_QUEUE_FULL: ["Спільна черга заповнена. Код збережено; повтори запуск пізніше.", "The shared queue is full. Your code is saved; retry later."],
    INTERVIEW_MEDIA_UNAVAILABLE: ["Медіасервіс не налаштований або недоступний. Код, тести й чат залишаються доступними.", "Media is not configured or unavailable. Code, tests and chat remain available."],
    INTERVIEW_NOT_FOUND: ["Сесію не знайдено або доступ відкликано.", "The session was not found or access was revoked."],
    SAVED_FEEDBACK_REQUIRED: ["Спочатку збережи відгук із поясненням щонайменше 12 символів.", "Save feedback with at least 12 characters first."],
    NOTE_REVISION_CONFLICT: ["Нотатки змінено в іншій вкладці. Скопіюй свій текст і онови сесію.", "Your notes changed in another tab. Copy your text and reload the session."],
  };
  return labels[String(code)]?.[en ? 1 : 0] ?? (en ? "Could not complete the action. Your editor contents are preserved." : "Не вдалося виконати дію. Вміст редактора збережено.");
};

export const TalentInterviewRoom: React.FC = () => {
  const navigate = useNavigate(); const { interviewId = "" } = useParams(); const { i18n } = useTranslation(); const en = i18n.language.startsWith("en");
  const [details, setDetails] = React.useState<InterviewDetails | null>(null);
  const [files, setFiles] = React.useState<GrowthFile[]>([]); const [filePath, setFilePath] = React.useState("");
  const [tab, setTab] = React.useState("preparation"); const [sideTab, setSideTab] = React.useState("chat");
  const [messages, setMessages] = React.useState<InterviewMessage[]>([]); const [message, setMessage] = React.useState("");
  const [note, setNote] = React.useState<InterviewNote>({ revision: 0, privateText: "", scores: [], feedback: "", practice: "" });
  const [quizAnswers, setQuizAnswers] = React.useState<Record<string, number>>({});
  const [execution, setExecution] = React.useState<InterviewExecution | null>(null); const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState(""); const [notice, setNotice] = React.useState("");
  const [saveState, setSaveState] = React.useState("saved"); const [online, setOnline] = React.useState(true);
  const [consent, setConsent] = React.useState(false); const [newPath, setNewPath] = React.useState("");
  const [recovery, setRecovery] = React.useState<GrowthFile[] | null>(null); const [conflict, setConflict] = React.useState<{ files: GrowthFile[]; revision: number } | null>(null);
  const [audioOnly, setAudioOnly] = React.useState(lowResources); const [mic, setMic] = React.useState(true); const [camera, setCamera] = React.useState(false);
  const [deviceStatus, setDeviceStatus] = React.useState(""); const [deviceError, setDeviceError] = React.useState("");
  const [connection, setConnection] = React.useState<{ token: string; url: string; identity: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = React.useState(false); const [confirmExit, setConfirmExit] = React.useState(false);
  const saved = React.useRef(""); const filesRef = React.useRef(files); filesRef.current = files;
  const revision = React.useRef(0); const saving = React.useRef(false); const savedAt = React.useRef(0); const chatCursor = React.useRef("0");
  const detailsRef = React.useRef(details); detailsRef.current = details;
  const activeId = React.useRef(interviewId); activeId.current = interviewId;
  const noteSaved = React.useRef(""); const noteLoadedFor = React.useRef(""); const preview = React.useRef<MediaStream | null>(null); const previewEpoch = React.useRef(0); const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const session = details?.interview;
  const activeFile = files.find(file => file.path === filePath) ?? files[0];
  const dirty = signature(files) !== saved.current;
  const noteDirty = JSON.stringify({ ...note, revision: 0, releasedAt: null }) !== noteSaved.current;
  const phaseLabels: Record<string, string> = { INTRO: en ? "Introduction" : "Знайомство", DISCUSSION: en ? "Discussion" : "Обговорення", CODE: en ? "Code" : "Код", REVIEW: en ? "Review" : "Підсумок", PAUSE: en ? "Thinking break" : "Пауза на обдумування" };
  const recoveryKey = (userId: number) => `studycod:interview-recovery:${userId}:${interviewId}`;
  const stopPreview = React.useCallback(() => { previewEpoch.current++; preview.current?.getTracks().forEach(track => track.stop()); preview.current = null; if (videoRef.current) videoRef.current.srcObject = null; }, []);

  const refresh = React.useCallback(async (initial = false) => {
    const data = await getTalentInterview(interviewId);
    if (activeId.current !== interviewId) return;
    setDetails(data);
    if (initial || signature(filesRef.current) === saved.current) {
      const nextFiles = data.interview.files ?? [];
      setFiles(nextFiles); filesRef.current = nextFiles; revision.current = data.interview.revision; saved.current = signature(nextFiles); setSaveState("saved");
    }
    setExecution(data.executions[0] ?? null);
    if (noteLoadedFor.current !== interviewId) {
      const nextNote = data.ownNote ?? { revision: 0, privateText: "", scores: data.interview.kit.rubric.map(() => null), feedback: "", practice: "" };
      setNote(nextNote); noteSaved.current = JSON.stringify({ ...nextNote, revision: 0, releasedAt: null }); noteLoadedFor.current = interviewId;
      if (data.quizResult?.answers) setQuizAnswers(data.quizResult.answers);
      try {
        const copy = JSON.parse(localStorage.getItem(recoveryKey(data.interview.userId)) ?? "null");
        if (Array.isArray(copy?.files) && copy.files.length <= 16 && copy.files.length > 0 && copy.files.every((file: any) => typeof file?.path === "string" && typeof file?.content === "string" && file.content.length <= 65536) && signature(copy.files) !== signature(data.interview.files ?? []) && data.interview.status === "LIVE") setRecovery(copy.files);
      } catch { /* optional local recovery */ }
    }
    if (initial && data.interview.status === "LIVE") setTab(data.interview.kit.kind === "HR" ? "conversation" : "code");
  }, [interviewId]);
  React.useEffect(() => {
    let active = true;
    void refresh(true).catch(err => { if (active) setError(errorText(err, en)); });
    return () => { active = false; stopPreview(); };
  }, [refresh, stopPreview]);

  React.useEffect(() => {
    if (!session) return;
    let disposed = false; let timer = 0; let polling = false;
    const poll = async () => {
      if (disposed || polling) return;
      if (document.visibilityState === "hidden") { timer = window.setTimeout(poll, 10000); return; }
      polling = true;
      try {
        const result = await getTalentInterviewState(interviewId, filesRef.current.length ? revision.current : 0, chatCursor.current);
        if (disposed) return;
        setOnline(true);
        const current = detailsRef.current?.interview;
        const state = result.interview;
        if (state.files && (state.revision !== revision.current || !filesRef.current.length)) {
          if (signature(filesRef.current) !== saved.current) setConflict({ files: state.files, revision: state.revision! });
          else { setFiles(state.files); filesRef.current = state.files; saved.current = signature(state.files); revision.current = state.revision!; setSaveState("saved"); }
        }
        setDetails(old => old ? { ...old, interview: { ...old.interview, ...state } } : old);
        if (state.status && state.status !== "LIVE") setConnection(null);
        if (current?.status === "LIVE" && state.status === "COMPLETED") void refresh();
        if (result.messages.length) {
          chatCursor.current = String(result.messages.at(-1)!.id);
          setMessages(old => [...new Map([...old, ...result.messages].map(item => [String(item.id), item])).values()].slice(-100));
        }
        if (result.execution) setExecution(result.execution);
      } catch (err: any) {
        setOnline(false);
        if ([403, 404].includes(err?.response?.status)) { setConnection(null); setError(errorText(err, en)); disposed = true; }
      } finally {
        polling = false;
        if (!disposed) timer = window.setTimeout(poll, detailsRef.current?.interview.status === "LIVE" ? 2000 : 5000);
      }
    };
    const visible = () => { if (document.visibilityState === "visible") { window.clearTimeout(timer); void poll(); } };
    void poll(); document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [session?.id, interviewId, en, refresh]);

  React.useEffect(() => {
    if (!session?.canEdit || !files.length || !dirty) return;
    const timer = window.setTimeout(() => { try { localStorage.setItem(recoveryKey(session.userId), JSON.stringify({ files, revision: revision.current, savedAt: Date.now() })); } catch { /* optional emergency copy */ } }, 500);
    return () => window.clearTimeout(timer);
  }, [files, session?.canEdit, session?.userId, dirty]);

  const saveDraft = React.useCallback(async () => {
    const current = detailsRef.current?.interview;
    if (!current?.canEdit || signature(filesRef.current) === saved.current) return revision.current;
    if (saving.current) throw new Error("SAVE_IN_PROGRESS");
    saving.current = true; setSaveState("saving"); const copy = filesRef.current;
    try {
      const result = await saveTalentInterviewDraft(interviewId, copy, revision.current);
      revision.current = result.revision; saved.current = signature(copy); savedAt.current = Date.now(); setSaveState("saved");
      if (signature(filesRef.current) === signature(copy)) { try { localStorage.removeItem(recoveryKey(current.userId)); } catch { /* optional recovery */ } }
      setDetails(old => old ? { ...old, interview: { ...old.interview, revision: result.revision } } : old);
      return result.revision;
    } catch (err) { setSaveState("error"); throw err; }
    finally { saving.current = false; }
  }, [interviewId]);
  React.useEffect(() => {
    if (!session?.canEdit || !dirty || conflict) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => { void saveDraft().catch(err => setError(errorText(err, en))); }, Math.max(2000, 3000 - (Date.now() - savedAt.current)));
    return () => window.clearTimeout(timer);
  }, [files, session?.canEdit, dirty, conflict, saveDraft, en]);

  React.useEffect(() => {
    if (!session || (!dirty && !noteDirty)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [Boolean(session), dirty, noteDirty]);
  const action = async (operation: () => Promise<unknown>, success?: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); if (success) setNotice(success); }
    catch (err) { setError(errorText(err, en)); }
    finally { setBusy(false); }
  };
  const updateFile = (content: string) => setFiles(old => old.map(file => file.path === activeFile?.path ? { ...file, content } : file));
  const indent = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.shiftKey || event.currentTarget.readOnly) return;
    event.preventDefault(); const area = event.currentTarget; area.setRangeText("    ", area.selectionStart, area.selectionEnd, "end"); updateFile(area.value);
  };
  const runCode = (kind: "RUN" | "CHECK") => action(async () => {
    await saveDraft(); const result = await executeTalentInterview(interviewId, kind, input, revision.current, crypto.randomUUID());
    setExecution({ id: result.jobId, state: result.state, kind, revision: revision.current });
  });
  const checkDevices = async () => {
    stopPreview(); setDeviceError(""); setDeviceStatus("");
    const epoch = previewEpoch.current;
    if (!mic && (!camera || audioOnly)) { setDeviceStatus(en ? "You will join without a camera or microphone." : "Ти приєднаєшся без камери й мікрофона."); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("HTTPS_REQUIRED");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: mic, video: camera && !audioOnly ? { width: 640, height: 360, frameRate: 15 } : false });
      if (epoch !== previewEpoch.current) { stream.getTracks().forEach(track => track.stop()); return; }
      preview.current = stream; if (videoRef.current) videoRef.current.srcObject = stream;
      setDeviceStatus(en ? "Selected devices are available. They will be requested again when joining." : "Обрані пристрої доступні. Вони підключаться до дзвінка після входу.");
    } catch { if (epoch === previewEpoch.current) setDeviceError(en ? "Devices are unavailable or permission was denied. Check browser permissions, or join without devices." : "Пристрої недоступні або дозвіл відхилено. Перевір дозволи браузера чи приєднайся без пристроїв."); }
  };
  const joinCall = () => action(async () => { stopPreview(); setConnection(await joinTalentInterviewCall(interviewId)); });
  const saveNotes = () => action(async () => {
    const result = await saveTalentInterviewNote(interviewId, note); const next = { ...note, revision: result.revision };
    setNote(next); noteSaved.current = JSON.stringify({ ...next, revision: 0, releasedAt: null });
  }, en ? "Private notes saved." : "Приватні нотатки збережено.");
  const phaseChange = (phase: string) => action(async () => { await phaseTalentInterview(interviewId, phase); setDetails(old => old ? { ...old, interview: { ...old.interview, phase } } : old); });

  const context = <><div className="talent-context"><span className="talent-context__avatar">{session?.companyName.slice(0, 1) ?? "T"}</span><div><span className="talent-eyebrow">{session?.companyName ?? "StudyCod Talent"}</span><strong className="interview-context-title">{session?.title ?? (en ? "Interview" : "Співбесіда")}</strong></div></div><Link className="talent-text-button" to={session?.role === "CANDIDATE" ? "/companies" : `/companies?company=${session?.companyId ?? ""}&view=interviews`}><ArrowLeft size={15}/>{en ? "Interviews" : "Співбесіди"}</Link></>;
  const navigation = <nav className="talent-nav" aria-label={en ? "Interview workspace" : "Розділи співбесіди"}>{[["preparation", en ? "Preparation" : "Підготовка"], ["conversation", en ? "Conversation" : "Розмова"], ["code", en ? "Shared code" : "Спільний код"], ["tests", en ? "Tests" : "Тести"], ["summary", en ? "Summary & feedback" : "Підсумок і відгук"]].map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value)}>{label}</button>)}</nav>;
  return <TalentWorkspaceShell context={context} navigation={navigation}><main id="main-content" className="talent-main interview-main">
    {error && <div role="alert" className="interview-alert">{error}</div>}{notice && <div role="status" className="interview-notice">{notice}</div>}
    {!online && <div className="interview-alert"><WifiOff size={16}/>{en ? "Connection lost. Your local edits are preserved." : "З’єднання втрачено. Локальні зміни збережено."}</div>}
    {!session ? !error && <div className="talent-loading"><span className="talent-skeleton talent-skeleton--title"/><span className="talent-skeleton talent-skeleton--row"/></div> : <>
      <header className="interview-session-heading"><div><span className={`interview-state is-${session.status.toLowerCase()}`}>{session.status === "LIVE" ? (en ? "Live interview" : "Співбесіда наживо") : session.status === "COMPLETED" ? (en ? "Completed" : "Завершено") : session.status === "CANCELLED" ? (en ? "Cancelled" : "Скасовано") : (en ? "Scheduled interview" : "Запланована співбесіда")}</span><h1>{session.role === "CANDIDATE" ? session.title : session.candidateName}</h1><p>{new Intl.DateTimeFormat(en ? "en-GB" : "uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.scheduledAt))} · {session.durationMinutes} {en ? "min planned" : "хв заплановано"} · {session.participants.map(person => person.username).join(", ")}</p></div><div className="interview-heading-actions"><button type="button" className="talent-button" onClick={() => void action(() => downloadTalentInterviewCalendar(interviewId))}><CalendarDays size={15}/>{en ? "Calendar" : "У календар"}</button>{session.canHost && session.status === "SCHEDULED" && <button type="button" className="talent-button talent-button--primary" disabled={busy || !session.consented} onClick={() => void action(async () => { await startTalentInterview(interviewId); await refresh(); setTab(session.kit.kind === "HR" ? "conversation" : "code"); })}><Play size={15}/>{session.consented ? (en ? "Start interview" : "Почати співбесіду") : (en ? "Awaiting consent" : "Очікуємо згоду")}</button>}{session.canHost && session.status === "LIVE" && <button type="button" className="talent-button" onClick={() => setConfirmEnd(true)}>{en ? "Finish interview" : "Завершити співбесіду"}</button>}</div></header>
      {session.status === "LIVE" && <div className="interview-phases"><span>{en ? "Current step" : "Поточний етап"}</span>{session.canHost ? Object.entries(phaseLabels).map(([value, label]) => <button key={value} type="button" aria-pressed={session.phase === value} onClick={() => void phaseChange(value)}>{value === "PAUSE" && <Pause size={13}/>} {label}</button>) : <strong>{phaseLabels[session.phase]}</strong>}{session.role === "CANDIDATE" && <button className="ml-auto" type="button" onClick={() => void action(() => sendTalentInterviewMessage(interviewId, en ? "I would like a short thinking break." : "Мені потрібна коротка пауза на обдумування.", crypto.randomUUID()))}>{en ? "Ask for a pause" : "Попросити паузу"}</button>}</div>}
      {(session.canHost && session.status === "SCHEDULED" || session.role === "CANDIDATE" && session.consented) && <div className="mb-4"><button type="button" className="talent-text-button" onClick={() => setConfirmExit(true)}>{session.role === "CANDIDATE" ? (en ? "Withdraw participation and access" : "Відкликати участь і доступ") : (en ? "Cancel scheduled interview" : "Скасувати заплановану співбесіду")}</button>{confirmExit && <div className="interview-alert mt-3"><p>{session.role === "CANDIDATE" ? (en ? "This will close the company’s access to this assessment and its interviews." : "Це закриє компанії доступ до цього оцінювання та пов’язаних співбесід.") : (en ? "Cancel this scheduled meeting and notify the candidate?" : "Скасувати цю зустріч і сповістити кандидата?")}</p><button type="button" className="talent-button" disabled={busy} onClick={() => void action(async () => { if (session.role === "CANDIDATE") { await withdrawCandidateCompanyAssessment(session.assessmentId); setConnection(null); navigate("/companies"); } else { await cancelTalentInterview(interviewId); await refresh(); } setConfirmExit(false); })}>{en ? "Confirm" : "Підтвердити"}</button><button type="button" className="talent-text-button" onClick={() => setConfirmExit(false)}>{en ? "Keep interview" : "Залишити співбесіду"}</button></div>}</div>}
      {confirmEnd && <div className="interview-alert interview-end-confirm"><p>{en ? "Finish and freeze the saved working copy? Make sure the person editing has saved their latest changes." : "Завершити зустріч і зафіксувати збережену робочу копію? Переконайся, що учасник, який редагує, зберіг останні зміни."}</p><button type="button" className="talent-button talent-button--primary" disabled={busy} onClick={() => void action(async () => { await saveDraft(); await endTalentInterview(interviewId, revision.current); setConnection(null); setConfirmEnd(false); await refresh(); setTab("summary"); })}>{en ? "Finish and save" : "Завершити й зберегти"}</button><button type="button" className="talent-text-button" onClick={() => setConfirmEnd(false)}>{en ? "Keep working" : "Продовжити"}</button></div>}
      <div className="interview-layout"><div className="interview-workspace">
        {tab === "preparation" && <section className="talent-panel"><span className="talent-step-label">{en ? "Before the conversation" : "До початку розмови"}</span><h2>{en ? "A clear plan for both sides" : "Зрозумілий план для обох сторін"}</h2><ol className="interview-agenda">{session.kit.agenda.map((item, index) => <li key={index}><span>0{index + 1}</span>{item}</li>)}</ol><h3>{en ? "What we will look at" : "На що звертатимемо увагу"}</h3><ul className="interview-criteria">{session.kit.rubric.map(item => <li key={item}><Check size={14}/>{item}</li>)}</ul><div className="interview-rules"><strong>{en ? "Agreed conditions" : "Умови роботи"}</strong><p>{en ? "Documentation is allowed. Built-in AI is unavailable for the session; outside help cannot be verified by the platform. Camera use is optional. No recording. Planned duration is context, not a typing-speed score." : "Документацією користуватися можна. Вбудований AI у сесії недоступний; платформа не може перевірити зовнішню допомогу. Камера — за вибором. Запису немає. Запланована тривалість є контекстом, а не оцінкою швидкості друку."}</p></div>{session.role === "CANDIDATE" && !session.consented && session.status === "SCHEDULED" && <div className="interview-consent"><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>{en ? "I agree to participate and share this interview’s code, test results and chat with the assigned team. My other learning work stays private." : "Я погоджуюся взяти участь і передати призначеній команді код цієї співбесіди, результати тестів та чат. Інші навчальні роботи залишаються приватними."}</label><div><button type="button" disabled={!consent || busy} className="talent-button talent-button--primary" onClick={() => void action(async () => { await respondTalentInterview(interviewId, "ACCEPT"); await refresh(); }, en ? "Invitation accepted." : "Запрошення прийнято.")}>{en ? "Accept invitation" : "Прийняти запрошення"}</button><button type="button" disabled={busy} className="talent-button" onClick={() => void action(async () => { await respondTalentInterview(interviewId, "DECLINE"); navigate("/companies"); })}>{en ? "Decline" : "Відхилити"}</button></div></div>}</section>}
        {tab === "conversation" && <section className="talent-panel"><span className="talent-step-label">{en ? "Interview guide" : "План розмови"}</span><h2>{en ? "Discuss experience with examples" : "Обговоріть досвід на прикладах"}</h2><p className="talent-scope-note mt-3">{session.kit.prompt}</p><div className="interview-questions">{session.kit.questions.map((question, index) => <article key={index}><span>0{index + 1}</span><h3>{question}</h3>{session.role !== "CANDIDATE" && session.consented && ["SCHEDULED", "LIVE"].includes(session.status) && <button type="button" className="talent-text-button" onClick={() => void action(() => sendTalentInterviewMessage(interviewId, question, crypto.randomUUID()))}><Send size={13}/>{en ? "Send to shared chat" : "Надіслати у спільний чат"}</button>}</article>)}</div></section>}
        {tab === "code" && <section className="talent-panel interview-code-panel"><div className="talent-section-heading"><div><span className="talent-step-label">{session.runtime} · {session.sourceVersionId ? (en ? "Copy of a selected project version" : "Копія обраної версії проєкту") : (en ? "Interview exercise" : "Завдання співбесіди")}</span><h2>{session.kit.kind === "HR" ? (en ? "Shared scratchpad" : "Спільна чернетка") : session.kit.title}</h2></div></div><details className="interview-task-prompt" open><summary>{en ? "Requirements and public examples" : "Умова та публічні приклади"}</summary><p>{session.kit.prompt}</p>{session.kit.examples.map((example, index) => <div className="interview-example" key={index}><pre>{example.input}</pre><pre>{example.output}</pre></div>)}</details>
          {!session.files && !files.length ? <div className="talent-empty"><Code2 size={25}/><h3>{en ? "The code workspace opens when the interview starts" : "Код відкриється після початку співбесіди"}</h3></div> : <>
            {recovery && <div className="interview-alert"><p>{en ? "A local recovery copy differs from the server." : "Локальна аварійна копія відрізняється від серверної."}</p><button type="button" className="talent-button" onClick={() => { setFiles(recovery); setRecovery(null); }}>{en ? "Restore local copy" : "Відновити локальну копію"}</button><button type="button" className="talent-text-button" onClick={() => setRecovery(null)}>{en ? "Keep server copy" : "Залишити серверну"}</button></div>}
            {conflict && <div className="interview-alert"><p>{en ? "The shared copy changed. Copy any local edits you need before loading the server version." : "Спільна копія змінилася. Скопіюй потрібні локальні зміни перед завантаженням серверної версії."}</p><button type="button" className="talent-button" onClick={() => { setFiles(conflict.files); filesRef.current = conflict.files; saved.current = signature(conflict.files); revision.current = conflict.revision; setConflict(null); setSaveState("saved"); }}>{en ? "Load shared version" : "Завантажити спільну версію"}</button></div>}
            <div className="interview-editor-owner"><span>{en ? "Editing now" : "Зараз редагує"}: <strong>{session.participants.find(person => person.id === session.editorUserId)?.username ?? session.candidateName}</strong></span>{session.canHost && session.status === "LIVE" && <label>{en ? "Hand over control" : "Передати керування"}<select aria-label={en ? "Editor control" : "Керування редактором"} value={session.editorUserId} onChange={event => { const targetId = Number(event.target.value); void action(async () => { await saveDraft(); await controlTalentInterview(interviewId, targetId, revision.current); await refresh(); }); }}>{session.participants.filter(person => ["OWNER", "ENGINEER", "CANDIDATE"].includes(person.role)).map(person => <option key={person.id} value={person.id}>{person.username}</option>)}</select></label>}</div>
            <div className="talent-code-files">{files.map(file => <button type="button" key={file.path} aria-pressed={activeFile?.path === file.path} onClick={() => setFilePath(file.path)}>{file.path}</button>)}</div>{activeFile && <textarea aria-label={en ? "Shared interview code" : "Спільний код співбесіди"} className="interview-code-editor" value={activeFile.content} onChange={event => updateFile(event.target.value)} onKeyDown={indent} readOnly={!session.canEdit || Boolean(conflict)} spellCheck={false}/>}
            {session.canEdit && files.length < 16 && <form className="interview-add-file" onSubmit={event => { event.preventDefault(); if (!/^[A-Za-z0-9_.\-/]+$/.test(newPath) || newPath.startsWith("/") || newPath.split("/").some(part => !part || part === "." || part === "..") || files.some(file => file.path === newPath)) { setError(en ? "Use a unique relative filename without parent directories." : "Вкажи унікальний відносний шлях без переходу до батьківських папок."); return; } setFiles(old => [...old, { path: newPath, content: "" }]); setFilePath(newPath); setNewPath(""); }}><input value={newPath} onChange={event => setNewPath(event.target.value)} aria-label={en ? "New file path" : "Шлях нового файла"} placeholder={en ? "module.py" : "module.py"} maxLength={180}/><button type="submit" className="talent-text-button"><Plus size={14}/>{en ? "Add file" : "Додати файл"}</button></form>}
            <div className="interview-code-actions"><button type="button" className="talent-button" disabled={busy || !session.canEdit || !dirty || saving.current} onClick={() => void action(saveDraft)}><Save size={15}/>{en ? "Save" : "Зберегти"}</button><span role="status">{saveState === "saving" ? (en ? "Saving…" : "Зберігається…") : dirty ? (en ? "Local changes" : "Є локальні зміни") : saveState === "error" ? (en ? "Not saved on server" : "Не збережено на сервері") : (en ? "Saved revision" : "Збережена редакція") + ` #${revision.current}`}</span><button type="button" className="talent-button talent-button--primary" disabled={busy || !session.canRun || (!session.canEdit && dirty) || Boolean(conflict) || ["QUEUED", "RUNNING"].includes(execution?.state ?? "")} onClick={() => void runCode("RUN")}><Play size={15}/>{en ? "Run" : "Запустити"}</button><button type="button" className="talent-button" disabled={busy || !session.canRun || (!session.canEdit && dirty) || !session.kit.testCount || Boolean(conflict) || ["QUEUED", "RUNNING"].includes(execution?.state ?? "")} onClick={() => void runCode("CHECK")}>{en ? "Check tests" : "Перевірити тести"}</button></div>
            <label className="talent-form-label mt-4">{en ? "Standard input for Run" : "Ввід для запуску"}<textarea className="talent-field interview-stdin" rows={3} value={input} onChange={event => setInput(event.target.value)} maxLength={8192}/></label>
            {execution && <div className="interview-execution" role="status"><strong>{execution.state === "QUEUED" ? (en ? "Queued on the shared Judge" : "У спільній черзі Judge") : execution.state === "RUNNING" ? (en ? "Running…" : "Виконується…") : execution.state === "FAILED" ? (en ? "Execution infrastructure failed; retry is available" : "Збій виконання; можна повторити") : execution.state === "CANCELLED" ? (en ? "Execution cancelled" : "Виконання скасовано") : execution.kind === "RUN" ? (en ? "Run saved" : "Запуск збережено") : (en ? "Test result saved" : "Перевірку збережено")}</strong><small>{en ? "Revision" : "Редакція"} #{execution.revision}{execution.revision !== revision.current && ` · ${en ? "Historical code" : "Інший код"}`}</small>{execution.result && <>{execution.kind === "CHECK" ? <p>{execution.result.testsPassed}/{execution.result.testsTotal} {en ? "required tests passed" : "обов’язкових тестів пройдено"}</p> : <pre>{execution.result.stdout || (en ? "No output" : "Немає виводу")}</pre>}{(execution.result.compileDiagnostics || execution.result.stderr) && <pre>{execution.result.compileDiagnostics || execution.result.stderr}</pre>}</>}{["QUEUED", "RUNNING"].includes(execution.state) && <button type="button" className="talent-text-button" onClick={() => void action(() => cancelTalentInterviewExecution(interviewId, execution.id))}>{en ? "Cancel execution" : "Скасувати виконання"}</button>}</div>}
          </>}
        </section>}
        {tab === "tests" && <section className="talent-panel"><span className="talent-step-label">{en ? "Separate evidence" : "Окреме свідчення"}</span><h2>{en ? "Short knowledge check" : "Коротка перевірка знань"}</h2><p className="talent-scope-note mt-3">{en ? "These questions complement the coding discussion. They do not produce an overall hiring score." : "Ці запитання доповнюють розмову про код. Вони не утворюють загального балу для найму."}</p>{!session.kit.quiz.length ? <div className="talent-empty"><h3>{en ? "This kit has no multiple-choice test" : "У цьому комплекті немає тесту з варіантами"}</h3><p>{en ? "Use the interview guide and practical task." : "Використайте план розмови та практичну задачу."}</p></div> : <form className="interview-quiz" onSubmit={event => { event.preventDefault(); void action(async () => { const result = await submitTalentInterviewQuiz(interviewId, quizAnswers); setDetails(old => old ? { ...old, quizResult: { ...result.result, answers: quizAnswers } } : old); }); }}>{session.kit.quiz.map((question, index) => <fieldset key={question.id}><legend>{index + 1}. {question.text}</legend>{question.options.map((option, optionIndex) => <label key={optionIndex}><input type="radio" name={question.id} checked={quizAnswers[question.id] === optionIndex} onChange={() => setQuizAnswers(old => ({ ...old, [question.id]: optionIndex }))} disabled={session.role !== "CANDIDATE" || Boolean(details.quizResult) || !session.consented || !["SCHEDULED", "LIVE"].includes(session.status)}/>{option}</label>)}</fieldset>)}{details.quizResult ? <p className="interview-notice">{en ? "Saved result" : "Збережений результат"}: {details.quizResult.correct}/{details.quizResult.total}</p> : session.role === "CANDIDATE" && <button className="talent-button talent-button--primary" disabled={busy || !session.consented || session.kit.quiz.some(question => quizAnswers[question.id] === undefined)} type="submit">{en ? "Submit answers" : "Подати відповіді"}</button>}</form>}</section>}
        {tab === "summary" && <section className="talent-panel"><span className="talent-step-label">{en ? "After the conversation" : "Після розмови"}</span><h2>{en ? "Saved work & next steps" : "Збережена робота й наступні кроки"}</h2><p className="talent-scope-note mt-3">{session.status === "COMPLETED" ? (en ? "The final code is frozen. Feedback appears here when an interviewer explicitly shares it." : "Підсумковий код зафіксовано. Відгук з’явиться тут після явної публікації інтерв’юером.") : (en ? "This summary becomes final when the host finishes the interview." : "Цей підсумок стане остаточним після завершення співбесіди ведучим.")}</p>{details.feedback.map((feedback, index) => <article className="interview-feedback" key={index}><strong>{feedback.reviewer}</strong><p>{feedback.text}</p>{feedback.practice && <><h3>{en ? "What to practise next" : "Що потренувати далі"}</h3><p>{feedback.practice}</p><Link className="talent-text-button" to="/projects">{en ? "Open learning projects" : "До навчальних проєктів"}</Link></>}</article>)}{!details.feedback.length && <p className="interview-empty-note">{en ? "No shared feedback yet." : "Оприлюднених відгуків поки немає."}</p>}<button className="talent-text-button" type="button" onClick={() => void action(() => refresh())}>{en ? "Refresh summary" : "Оновити підсумок"}</button>{session.status === "COMPLETED" && (session.files?.length ?? 0) > 0 && <TalentEvidenceFiles files={session.files!}/>}</section>}
      </div><aside className="interview-sidebar">
        <section className="talent-panel interview-media-panel"><div className="talent-section-heading"><h2>{en ? "In-platform call" : "Дзвінок у StudyCod"}</h2><Video size={18}/></div>{connection ? <React.Suspense fallback={<p>{en ? "Connecting call…" : "Підключається дзвінок…"}</p>}><InterviewCall token={connection.token} url={connection.url} audio={mic} video={camera} audioOnly={audioOnly} en={en} onLeft={() => setConnection(null)} onError={setDeviceError}/></React.Suspense> : <><div className="interview-device-options"><label><input type="checkbox" checked={audioOnly} onChange={event => { stopPreview(); setAudioOnly(event.target.checked); }}/>{en ? "Audio only · lower data use" : "Лише аудіо · менше трафіку"}</label><label><input type="checkbox" checked={mic} onChange={event => { stopPreview(); setMic(event.target.checked); }}/><Mic size={14}/>{en ? "Microphone" : "Мікрофон"}</label>{!audioOnly && <label><input type="checkbox" checked={camera} onChange={event => { stopPreview(); setCamera(event.target.checked); }}/><Video size={14}/>{en ? "Camera" : "Камера"}</label>}</div><video ref={videoRef} autoPlay muted playsInline className={!camera || audioOnly ? "hidden" : "interview-device-preview"}/><button type="button" className="talent-button w-full" onClick={() => void checkDevices()}>{en ? "Check selected devices" : "Перевірити обрані пристрої"}</button>{deviceStatus && <p className="talent-form-hint">{deviceStatus}</p>}<button type="button" className="talent-button talent-button--primary w-full mt-3" disabled={busy || session.status !== "LIVE" || !session.consented || !session.mediaEnabled} onClick={() => void joinCall()}>{session.status !== "LIVE" ? (en ? "Call opens when interview starts" : "Дзвінок відкриється після початку") : (en ? "Join call" : "Приєднатися до дзвінка")}</button>{!session.mediaEnabled && <p className="talent-form-hint">{en ? "Media is not configured on this installation. Shared code, tests and chat work independently." : "Медіасервіс у цій інсталяції не налаштований. Спільний код, тести й чат працюють окремо."}</p>}</>}{deviceError && <p className="interview-device-error" role="alert">{deviceError}</p>}</section>
        <section className="talent-panel interview-collaboration"><nav aria-label={en ? "Interview communication" : "Спілкування під час співбесіди"}><button type="button" aria-pressed={sideTab === "chat"} onClick={() => setSideTab("chat")}><MessageSquare size={14}/>{en ? "Shared chat" : "Спільний чат"}</button>{session.role !== "CANDIDATE" && <button type="button" aria-pressed={sideTab === "notes"} onClick={() => setSideTab("notes")}>{en ? "My private notes" : "Мої приватні нотатки"}</button>}</nav>
          {sideTab === "chat" ? <><div className="interview-chat-log" role="log" aria-live="polite">{messages.length ? messages.map(item => <article key={String(item.id)}><strong>{item.username}</strong><p>{item.message_text}</p></article>) : <p className="interview-empty-note">{en ? "Questions, clarifications and links for everyone in the interview." : "Запитання, уточнення й посилання для всіх учасників співбесіди."}</p>}</div><form className="interview-chat-form" onSubmit={event => { event.preventDefault(); const copy = message; void action(async () => { await sendTalentInterviewMessage(interviewId, copy, crypto.randomUUID()); setMessage(""); }); }}><textarea aria-label={en ? "Message to interview participants" : "Повідомлення учасникам співбесіди"} value={message} maxLength={2000} onChange={event => setMessage(event.target.value)} rows={2} placeholder={en ? "Shared message…" : "Спільне повідомлення…"}/><button type="submit" className="talent-icon-button" disabled={busy || !session.consented || !message.trim() || !["SCHEDULED", "LIVE"].includes(session.status)} aria-label={en ? "Send message" : "Надіслати повідомлення"}><Send size={17}/></button></form></> : <div className="interview-notes"><p className="talent-form-hint">{en ? "Only you can read this note and rubric. Shared feedback is published separately." : "Лише ти бачиш ці нотатки й критерії. Спільний відгук публікується окремо."}</p><label className="talent-form-label mt-3">{en ? "Observations and examples" : "Спостереження й приклади"}<textarea rows={5} className="talent-field" value={note.privateText} maxLength={8000} onChange={event => setNote(old => ({ ...old, privateText: event.target.value }))}/></label>{session.kit.rubric.map((criterion, index) => <label key={criterion} className="interview-rubric-row"><span>{criterion}</span><select value={note.scores[index] ?? ""} onChange={event => setNote(old => ({ ...old, scores: old.scores.map((score, current) => current === index ? event.target.value === "" ? null : Number(event.target.value) : score) }))}><option value="">—</option>{[0, 1, 2, 3].map(score => <option value={score} key={score}>{score}</option>)}</select></label>)}<p className="talent-form-hint">{en ? "0: not demonstrated · 1: with guidance · 2: independent · 3: explains tradeoffs and edge cases. Leave unobserved criteria empty." : "0: не продемонстровано · 1: із допомогою · 2: самостійно · 3: пояснює компроміси й крайові випадки. Неспостережені критерії залишай порожніми."}</p><label className="talent-form-label mt-4">{en ? "Feedback to share with candidate" : "Відгук для кандидата"}<textarea rows={3} className="talent-field" value={note.feedback} maxLength={4000} onChange={event => setNote(old => ({ ...old, feedback: event.target.value }))}/></label><label className="talent-form-label mt-3">{en ? "What to practise next" : "Що потренувати далі"}<textarea rows={2} className="talent-field" value={note.practice} maxLength={2000} onChange={event => setNote(old => ({ ...old, practice: event.target.value }))}/></label><button type="button" className="talent-button w-full mt-3" disabled={busy || !noteDirty} onClick={() => void saveNotes()}><Save size={14}/>{en ? "Save privately" : "Зберегти приватно"}</button><button type="button" className="talent-button talent-button--primary w-full mt-2" disabled={busy || noteDirty || session.status !== "COMPLETED" || note.feedback.trim().length < 12 || Boolean(note.releasedAt)} onClick={() => void action(async () => { await releaseTalentInterviewFeedback(interviewId, note.revision); setNote(old => ({ ...old, releasedAt: new Date().toISOString() })); await refresh(); }, en ? "Feedback shared with the candidate." : "Відгук передано кандидату.")}>{note.releasedAt ? (en ? "Feedback shared" : "Відгук оприлюднено") : (en ? "Share feedback after interview" : "Оприлюднити після співбесіди")}</button></div>}
        </section>
      </aside></div>
    </>}
  </main></TalentWorkspaceShell>;
};
