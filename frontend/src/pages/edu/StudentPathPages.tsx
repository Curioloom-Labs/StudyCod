import { eduLessonPath, eduLessonKey } from "../../lib/eduNavigation";
import React from "react";
import "./eduWorkspace.css";
import { useNavigate as useRouterNavigate, type NavigateOptions, type To } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, CircleDot, ClipboardList, Compass, FileDown, KeyRound, Lock, Megaphone, Play, Radio, RefreshCw, Sparkles, Target } from "lucide-react";
import { api } from "../../lib/api/client";
import { getMyAnnouncements, getMyStudentInfo, getStudentLessons, type Lesson } from "../../lib/api/edu";
import { getActiveLiveSession, type LiveSession } from "../../lib/api/liveClassroom";
import { withDevPreview } from "../../lib/devPreview";
import { downloadProgressReport, getConceptsDue, getDailyChallenge, getMySkillTree, type DailyChallenge, type SkillTree } from "../../lib/api/learning";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
type NavigateTarget = To | number;

const useNavigate = () => {
  const navigate = useRouterNavigate();
  return React.useCallback((to: NavigateTarget, options?: NavigateOptions) => {
    if (typeof to === "string" && to.startsWith("/edu/lessons/") && preview() && !to.includes("preview=")) {
      to += `${to.includes("?") ? "&" : "?"}preview=true`;
    }
    return typeof to === "number" ? navigate(to) : navigate(to, options);
  }, [navigate]);
};
const lessonSample: Lesson[] = [
  { id: 41, type: "LESSON", title: "Цикли: від ідеї до коду", tasksCount: 1, createdAt: "", hasTheory: true },
  { id: 102, type: "CONTROL", title: "Контрольна: межі циклів", tasksCount: 3, createdAt: "", parentTopicId: 41, timeLimitMinutes: 40 },
  { id: 103, type: "TOPIC", title: "Функції без магії", tasksCount: 4, createdAt: "", hasTheory: true },
];
const skillSample: SkillTree = { nextNodeId: 2, edges: [], nodes: [{ id: 1, title: "Змінні", order: 1, status: "mastered", masteryPct: 1, prerequisites: [], isNext: false }, { id: 2, title: "Умови", order: 2, status: "in_progress", masteryPct: .54, prerequisites: [1], isNext: true }, { id: 3, title: "Цикли", order: 3, status: "available", masteryPct: 0, prerequisites: [2], isNext: false }, { id: 4, title: "Функції", order: 4, status: "locked", masteryPct: 0, prerequisites: [3], isNext: false }] };
const container = "edu-workspace student-lessons-page mx-auto max-w-[1260px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12";
const errorBox = (message: string) => <div className="mb-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm font-medium text-accent-error dark:text-accent-error">{message}</div>;
const lessonCompletion = (lesson: Lesson) => {
  const tasks = lesson.tasks || [];
  if (!tasks.length) return lesson.tasksCount ? tr(`${lesson.tasksCount} задач`, `${lesson.tasksCount} tasks`) : tr("Без практики", "No practice");
  const completed = tasks.filter((task) => task.progressCompleted || task.grade?.isCompleted).length;
  return tr(`${completed}/${tasks.length} виконано`, `${completed}/${tasks.length} completed`);
};

export const StudentLessonsWorkspace: React.FC = () => {
  useTranslation();
  const navigate = useNavigate();
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [classId, setClassId] = React.useState<number | null>(null);
  const [className, setClassName] = React.useState("");
  const [liveSession, setLiveSession] = React.useState<LiveSession | null>(null);
  const [announcements, setAnnouncements] = React.useState<Array<{ id: number; title?: string | null; content: string; pinned?: boolean; createdAt: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [readAnnouncements, setReadAnnouncements] = React.useState<number[]>(() => {
    try { const saved = localStorage.getItem("studycod.edu.read-announcements"); return saved ? JSON.parse(saved) as number[] : []; }
    catch { return []; }
  });
  const markAnnouncementRead = (id: number) => setReadAnnouncements((current) => {
    const next = current.includes(id) ? current : [...current, id];
    try { localStorage.setItem("studycod.edu.read-announcements", JSON.stringify(next)); } catch { /* reading the announcement must work without storage access */ }
    return next;
  });
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [info, lessonList] = await Promise.all([getMyStudentInfo(), getStudentLessons()]);
      setClassId(info.student.class.id);
      setClassName(info.student.class.name);
      setLessons(lessonList);
      try {
        const news = await getMyAnnouncements();
        setAnnouncements(news.announcements || []);
      } catch {
        // Announcements are optional; a temporary failure must not hide lessons.
        setAnnouncements([]);
      }
    } catch (caught) {
      if (preview()) {
        setClassId(31);
        setClassName("9-Б · Python");
        setLessons(lessonSample);
        setAnnouncements([{ id: 1, title: "Темп на цей тиждень", content: "У четвер — коротка контрольна. Не відкладай задачі до вечора.", pinned: true, createdAt: new Date().toISOString() }]);
      } else setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити уроки.", "Could not load lessons.")));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    const refresh = async () => {
      if (preview()) {
        setLiveSession({ id: -31, classId, lessonId: 41, title: "Практика: цикл і його межа", status: "ACTIVE", roomName: "preview-class-31", createdAt: null, endedAt: null });
        return;
      }
      try {
        const { session } = await getActiveLiveSession(classId);
        if (!cancelled) setLiveSession(session);
      } catch {
        // The normal lesson list remains usable when live status is temporarily unavailable.
      }
    };
    void refresh();
    if (preview()) return () => { cancelled = true; };
    const id = window.setInterval(() => { void refresh(); }, 8000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [classId]);
  if (loading) return <div className={container}><div className="h-[580px] animate-pulse rounded-[30px] bg-bg-hover dark:bg-white/[.05]" /></div>;
  const topics = lessons.filter((lesson) => lesson.type === "TOPIC" || lesson.type === "LESSON"); const controls = lessons.filter((lesson) => lesson.type === "CONTROL");
  const nextTopic = topics.find((topic) => {
    const topicTasks = topic.tasks || [];
    return !topicTasks.length || topicTasks.some((task) => !task.progressCompleted && !task.grade?.isCompleted);
  }) || topics[0] || null;
  const trackedTasks = topics.flatMap((topic) => topic.tasks || []);
  const completedTrackedTasks = trackedTasks.filter((task) => task.progressCompleted || task.grade?.isCompleted).length;
  const plannedTaskCount = topics.reduce((total, topic) => total + (topic.tasksCount || topic.tasks?.length || 0), 0);
  const liveLesson = liveSession?.lessonId == null ? null : lessons.find((lesson) => lesson.id === liveSession.lessonId);
  const livePath = classId ? withDevPreview(`/edu/classes/${classId}/live`) : null;
  return <div className={`${container} edu-lessons-page`}>
    <header className="edu-student-page-heading">
      <div><p>{tr("Навчальний простір", "Learning workspace")}</p><h1>{tr("Мої уроки", "My lessons")}</h1><span>{tr("Матеріали, практика й ваш наступний крок у навчанні.", "Materials, practice, and your next step in learning.")}</span></div>
      {className && <span className="edu-student-page-heading__class"><BookOpen className="size-4" aria-hidden="true" />{className}</span>}
    </header>
    <section className="edu-lessons-hero edu-lessons-hero--path" aria-label={tr("Продовжити навчання", "Continue learning")}>
      <div className="edu-lessons-hero__main">
        <p className="edu-lessons-kicker"><Play className="size-3.5" aria-hidden="true" />{tr("Наступний урок", "Next lesson")}</p>
        <h2>{nextTopic?.title || tr("Навчання починається тут", "Your learning starts here")}</h2>
        <p className="edu-lessons-intro">{nextTopic ? tr("Опрацюй матеріал і переходь до практичних задач. Усе зібрано в одному уроці.", "Review the material, then move on to practice. Everything is in one lesson.") : tr("Коли викладач опублікує тему, вона з’явиться у маршруті класу.", "When your teacher publishes a topic, it will appear in your class pathway.")}</p>
        <div className="edu-lessons-hero__actions">
          {nextTopic && <button type="button" onClick={() => navigate(eduLessonPath(nextTopic))} className="edu-lessons-hero__continue"><Play className="size-4 fill-current" />{tr("Відкрити урок", "Open lesson")}<ArrowRight className="size-4" /></button>}
          <button type="button" onClick={() => navigate("/edu/journal")} className="edu-lessons-journal"><CircleDot className="size-4" />{tr("Журнал", "Journal")}<ArrowRight className="size-4" /></button>
        </div>
      </div>
      <aside className="edu-lessons-hero__route" aria-label={tr("Склад маршруту класу", "Class pathway overview")}>
        <p>{tr("Маршрут класу", "Class pathway")}</p>
        <div className="edu-lessons-hero__route-stats"><strong>{topics.length}</strong><span>{tr("тем", "topics")}</span><i aria-hidden="true" /><strong>{plannedTaskCount}</strong><span>{tr("задач", "tasks")}</span></div>
        {trackedTasks.length > 0 ? <div className="edu-lessons-hero__route-progress"><span><span style={{ width: `${Math.round(completedTrackedTasks / trackedTasks.length * 100)}%` }} /></span><small>{completedTrackedTasks} / {trackedTasks.length} {tr("виконано", "completed")}</small></div> : <small className="edu-lessons-hero__route-note">{tr("Практика та контрольні за темами", "Practice and assessments by topic")}</small>}
        {controls.length > 0 && <div className="edu-lessons-hero__assessment"><ClipboardList className="size-4" /><span>{controls.length} {tr("контрольних робіт", "assessments")}</span></div>}
      </aside>
    </section>
    {error && <div className="mb-5 flex flex-wrap items-start gap-3">{errorBox(error)}<button type="button" onClick={() => void load()} className="-mt-1 rounded-xl border border-accent-error px-3 py-2 text-xs font-bold text-accent-error"><RefreshCw className="mr-1 inline size-3" />{tr("Повторити", "Retry")}</button></div>}

    {liveSession && livePath && <section className="edu-live-invite" aria-label={tr("Активний онлайн-урок", "Active live lesson")}>
      <div className="edu-live-invite__mark"><Radio className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="edu-live-invite__eyebrow"><span className="edu-live-invite__dot" />{preview() ? tr("ДЕМО · онлайн-урок", "DEMO · live lesson") : tr("Урок триває зараз", "Lesson in progress now")}</div>
        <h2>{liveSession.title || liveLesson?.title || tr("Зустріч із класом", "Classroom session")}</h2>
        <p>{liveLesson?.title ? `${tr("Тема", "Topic")}: ${liveLesson.title}` : tr("Викладач відкрив кімнату класу. Можна приєднатися в будь-який момент.", "Your teacher opened the class room. Join whenever you are ready.")}</p>
      </div>
      <button type="button" onClick={() => navigate(livePath)} className="edu-live-invite__action"><Play className="size-4 fill-current" />{tr("Увійти в урок", "Join lesson")}<ArrowRight className="size-4" /></button>
    </section>}

    <div className="edu-lessons-layout">
      <section className="edu-curriculum" aria-labelledby="edu-curriculum-title">
        <div className="edu-section-heading"><div><p>{tr("Маршрут класу", "Class pathway")}</p><h2 id="edu-curriculum-title">{tr("Теми й практика", "Topics and practice")}</h2></div><span>{topics.length} {tr("тем", "topics")}</span></div>
        <div className="edu-curriculum__list">
          {topics.map((topic, index) => {
            const related = controls.filter((item) => item.parentTopicId === topic.id && (item.source || "legacy") === (topic.source || "legacy"));
            return <article key={eduLessonKey(topic)} className="edu-topic-row">
              <button type="button" onClick={() => navigate(eduLessonPath(topic))} className="edu-topic-row__main">
                <span className="edu-topic-row__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="edu-topic-row__copy"><strong>{topic.title}</strong><span>{topic.tasksCount} {tr("задач для практики", "practice problems")}{topic.hasTheory ? ` · ${tr("теорія", "theory")}` : ""}</span></span>
                <span className="edu-topic-row__completion">{lessonCompletion(topic)}</span><ArrowRight className="size-4 shrink-0" />
              </button>
              {related.map((control) => <button type="button" key={eduLessonKey(control)} onClick={() => navigate(eduLessonPath(control))} className="edu-topic-row__assessment"><ClipboardList className="size-4" /><span>{control.title}</span><span>{control.courseAttempt?.status === "COMPLETED" ? control.courseReport?.pendingReview ? tr("На перевірці", "Under review") : tr("Завершено", "Completed") : control.courseAttempt?.status === "IN_PROGRESS" ? tr("Розпочато", "In progress") : tr("Контрольна", "Assessment")}</span><ArrowRight className="size-4" /></button>)}
            </article>;
          })}
          {controls.filter((control) => !topics.some((topic) => topic.id === control.parentTopicId && (topic.source || "legacy") === (control.source || "legacy"))).map((control) => <button type="button" key={eduLessonKey(control)} onClick={() => navigate(eduLessonPath(control))} className="edu-topic-row edu-topic-row__standalone"><span className="edu-topic-row__number"><ClipboardList className="size-4" /></span><span className="edu-topic-row__copy"><strong>{control.title}</strong><span>{control.courseAttempt?.status === "COMPLETED" ? control.courseReport?.pendingReview ? tr("Здано · очікує перевірки", "Submitted · awaiting review") : tr("Завершено", "Completed") : control.courseAttempt?.status === "IN_PROGRESS" ? tr("Розпочато", "In progress") : tr("Контрольна робота", "Assessment")}</span></span><ArrowRight className="size-4" /></button>)}
          {!lessons.length && <div className="edu-curriculum__empty"><BookOpen className="size-5" /><strong>{tr("Тут з’являться уроки класу", "Your class lessons will appear here")}</strong><span>{tr("Коли викладач опублікує тему або практику, вона буде додана до маршруту.", "When your teacher publishes a topic or practice, it will be added to this pathway.")}</span></div>}
        </div>
      </section>

      <aside className="edu-lessons-aside">
        {!liveSession && <section className="edu-next-lesson edu-classroom-card">
          <div className="edu-next-lesson__icon"><Radio className="size-4" /></div>
          <p className="edu-next-lesson__eyebrow">{tr("Кімната класу", "Classroom")}</p>
          <h2>{tr("Онлайн-урок з’явиться тут", "Your live lesson will appear here")}</h2>
          <p>{tr("Коли викладач почне зустріч, кнопка входу з’явиться на цій сторінці.", "When your teacher starts a session, the join button will appear on this page.")}</p>
          {livePath && <button type="button" onClick={() => navigate(livePath)}>{tr("Відкрити кімнату", "Open classroom")}<ArrowRight className="size-4" /></button>}
        </section>}
        <section className="edu-lessons-help">
          <div className="edu-lessons-help__icon"><BookOpen className="size-4" /></div>
          <div><h2>{tr("Як рухатися далі", "What to do next")}</h2><p>{tr("Обери тему з маршруту. Якщо застрягнеш, повернися до пояснення або запитай викладача на онлайн-уроці.", "Choose a topic from the pathway. If you get stuck, revisit the explanation or ask your teacher during a live lesson.")}</p></div>
        </section>
        {announcements.length > 0 && <section className="edu-announcements edu-announcements--sidebar" aria-label={tr("Оголошення класу", "Class announcements")}>
          {announcements.slice(0, 3).map((note) => {
            const isRead = readAnnouncements.includes(note.id);
            return <article key={note.id} className={`edu-announcement ${note.pinned ? "edu-announcement--pinned" : ""} ${isRead ? "is-read" : ""}`}>
              <div className="edu-announcement__meta"><Megaphone className="size-4" />{note.pinned ? tr("Від викладача · важливо", "From teacher · important") : tr("Оголошення", "Announcement")}{!isRead && <span>{tr("Нове", "New")}</span>}</div>
              <h2>{note.title || tr("Повідомлення класу", "Class update")}</h2>
              <p>{note.content}</p>
              <button type="button" onClick={() => markAnnouncementRead(note.id)} disabled={isRead}>{isRead ? tr("Прочитано", "Read") : tr("Позначити як прочитане", "Mark as read")}</button>
            </article>;
          })}
        </section>}
      </aside>
    </div>
  </div>;
};

export const JoinClassWorkspace: React.FC = () => {
  useTranslation();
  const navigate = useNavigate(); const [code, setCode] = React.useState(""); const [username, setUsername] = React.useState(""); const [password, setPassword] = React.useState(""); const [mode, setMode] = React.useState<"join" | "claim">("join"); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  const friendlyError = (caught: unknown, fallback: string) => {
    const message = getErrorMessageFromUnknown(caught, fallback).trim();
    if (message === "INVALID_CODE") return tr("Код класу недійсний або вже вимкнений.", "This class code is invalid or has been disabled.");
    if (message === "INVALID_STUDENT_CREDENTIALS") return tr("Неправильний логін або пароль учня.", "The student username or password is incorrect.");
    if (message === "STUDENT_ALREADY_ENROLLED") return tr("Цей учнівський профіль уже додано до класу.", "This student profile has already joined the class.");
    return message;
  };
  const changeMode = (next: "join" | "claim") => { setMode(next); setError(null); };
  const go = () => { try { localStorage.removeItem("studycod.userSnapshot"); } catch {} window.location.href = "/edu/journal"; };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { if (mode === "join") { if (!code.trim()) throw new Error(tr("Введи код класу.", "Enter the class code.")); await api.post("/edu/classes/join", { code: code.trim().toUpperCase() }); } else { if (!username.trim() || !password) throw new Error(tr("Введи логін і пароль учня.", "Enter the student username and password.")); await api.post("/edu/students/claim", { username: username.trim(), password }); } go(); } catch (caught) { setError(friendlyError(caught, caught instanceof Error ? caught.message : tr("Не вдалося приєднатися.", "Could not join the class."))); } finally { setBusy(false); } };
 return <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1080px] items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-10"><section className="rounded-[30px] bg-bg-surface p-7 text-text-primary sm:p-9"><KeyRound className="h-7 w-7 text-primary-soft" /><p className="mt-8 text-xs font-bold uppercase tracking-[.15em] text-text-primary">StudyCod EDU</p><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em]">{tr("Вхід у свій клас", "Join your class")}</h1><p className="mt-5 text-base leading-7 text-text-primary">{tr("Код від викладача додає тебе до класу. Якщо в тебе вже був учнівський логін — просто прив’яжи його.", "A code from your teacher adds you to the class. If you already have a student login, link it here.")}</p><div className="mt-9 space-y-3 text-sm text-text-primary"><p><CheckCircle2 className="mr-2 inline h-4 w-4 text-primary-soft" />{tr("Уроки та журнал у одному місці", "Lessons and your journal in one place")}</p><p><CheckCircle2 className="mr-2 inline h-4 w-4 text-primary-soft" />{tr("Без нового облікового запису", "No new account needed")}</p></div></section><section><button type="button" onClick={() => navigate(-1)} className="mb-6 text-sm font-bold text-text-muted hover:text-text-primary dark:text-text-secondary dark:hover:text-white">← {tr("Назад", "Back")}</button><div className="flex gap-2 rounded-xl bg-bg-hover p-1 dark:bg-white/[.06]"><button type="button" onClick={() => changeMode("join")} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${mode === "join" ? "bg-white text-text-primary shadow-sm dark:bg-bg-hover" : "text-text-muted dark:text-text-secondary"}`}>{tr("Є код класу", "I have a class code")}</button><button type="button" onClick={() => changeMode("claim")} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${mode === "claim" ? "bg-white text-text-primary shadow-sm dark:bg-bg-hover" : "text-text-muted dark:text-text-secondary"}`}>{tr("Маю учнівський логін", "I have a student login")}</button></div><form onSubmit={submit} className="mt-7"><h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em]">{mode === "join" ? tr("Введи код", "Enter the code") : tr("Прив’яжи профіль", "Link your account")}</h2><p className="mt-2 text-base leading-7 text-text-muted dark:text-text-secondary">{mode === "join" ? tr("Викладач надсилає його разом із запрошенням.", "Your teacher will send it with the invitation.") : tr("Використай дані, які видав викладач.", "Use the credentials provided by your teacher.")}</p>{mode === "join" ? <input required aria-label={tr("Код класу", "Class code")} value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(null); }} className="mt-7 w-full rounded-2xl border border-border/12 bg-white px-4 py-4 text-center text-2xl font-bold tracking-[.22em] uppercase outline-none ring-primary/25 focus:ring-4 dark:border-white/10 dark:bg-bg-code" placeholder="ABC123" maxLength={16} /> : <div className="mt-7 space-y-3"><input required aria-label={tr("Логін учня", "Student username")} value={username} onChange={(event) => { setUsername(event.target.value); setError(null); }} className="w-full rounded-xl border border-border/12 bg-white px-4 py-3 outline-none ring-primary/25 focus:ring-4 dark:border-white/10 dark:bg-bg-code" placeholder={tr("Логін учня", "Student username")} /><input type="password" required aria-label={tr("Пароль учня", "Student password")} value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} className="w-full rounded-xl border border-border/12 bg-white px-4 py-3 outline-none ring-primary/25 focus:ring-4 dark:border-white/10 dark:bg-bg-code" placeholder={tr("Пароль", "Password")} /></div>}{error && <div className="mt-4" role="alert">{errorBox(error)}</div>}<button type="submit" disabled={busy || (mode === "join" ? !code.trim() : !username.trim() || !password)} className="mt-6 w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-55">{busy ? tr("З’єднуємо…", "Connecting…") : mode === "join" ? tr("Приєднатися до класу", "Join class") : tr("Прив’язати профіль", "Link account")}</button></form></section></div>;
};

export const LearningProgressWorkspace: React.FC = () => {
  useTranslation();
  const navigate = useNavigate(); const [tree, setTree] = React.useState<SkillTree | null>(null); const [daily, setDaily] = React.useState<DailyChallenge | null>(null); const [due, setDue] = React.useState(0); const [error, setError] = React.useState<string | null>(null); const [downloading, setDownloading] = React.useState(false);
  React.useEffect(() => { (async () => { try { const [skill, challenge, concepts] = await Promise.all([getMySkillTree(), getDailyChallenge(), getConceptsDue()]); setTree(skill); setDaily(challenge); setDue(concepts.total); } catch (caught) { if (preview()) { setTree(skillSample); setDaily({ available: true, task: { id: 1, title: "Знайди найчастіший символ", difficulty: "MEDIUM", problemCode: null, slug: "frequency", section: null } }); setDue(2); } else setError(getErrorMessageFromUnknown(caught, tr("Не вдалося отримати прогрес.", "Could not load your progress."))); } })(); }, []);
  const download = async () => { setDownloading(true); try { const blob = await downloadProgressReport(); const url = URL.createObjectURL(blob); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (caught) { setError(getErrorMessageFromUnknown(caught, tr("PDF-звіт поки недоступний.", "The PDF report is unavailable right now."))); } finally { setDownloading(false); } };
  const nodes = tree?.nodes || []; const mastered = nodes.filter((node) => node.status === "mastered").length; const average = nodes.length ? Math.round(nodes.reduce((sum, node) => sum + node.masteryPct, 0) / nodes.length * 100) : 0;
   return <div className={container}><header className="mb-9 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{tr("Особистий маршрут", "Your learning path")}</p><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{tr("Твоє навчання", "Your learning progress")}</h1><p className="mt-3 text-base leading-7 text-text-muted dark:text-text-secondary">{tr("Це не рейтинг. Тут видно, що вже вдалося і що варто спробувати далі.", "This is not a leaderboard. See what you have mastered and what to try next.")}</p></div><button type="button" disabled={downloading} onClick={() => void download()} className="rounded-xl border border-border/12 px-4 py-3 text-sm font-bold text-text-primary hover:bg-bg-hover dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.06]"><FileDown className="mr-2 inline h-4 w-4" />{downloading ? tr("Готуємо…", "Preparing…") : tr("Звіт PDF", "PDF report")}</button></header>{error && errorBox(error)}<div className="grid gap-4 md:grid-cols-3"><div className="rounded-[25px] bg-primary p-6 text-primary-foreground"><Compass className="h-5 w-5 text-primary-soft" /><p className="mt-8 text-4xl font-bold tracking-[-.05em]">{average}%</p><p className="mt-1 text-sm font-medium text-text-secondary">{tr("Середнє опанування", "Average mastery")}</p></div><div className="rounded-[25px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface"><CheckCircle2 className="h-5 w-5 text-primary-strong dark:text-primary-soft" /><p className="mt-8 text-4xl font-bold tracking-[-.05em]">{mastered}</p><p className="mt-1 text-sm font-medium text-text-muted dark:text-text-secondary">{tr("Опанованих тем", "Topics mastered")}</p></div><div className="rounded-[25px] border border-border/10 bg-bg-hover p-6 dark:border-white/[.09] dark:bg-[var(--surface-warning)]"><Target className="h-5 w-5 text-accent-warn dark:text-accent-warn" /><p className="mt-8 text-4xl font-bold tracking-[-.05em]">{due}</p><p className="mt-1 text-sm font-medium text-text-muted dark:text-text-secondary">{tr("Тем на повторення", "Topics to review")}</p></div></div><div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-[28px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface"><p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">{tr("Карта тем", "Topic map")}</p><div className="mt-5 space-y-3">{nodes.map((node) => <div key={node.id} className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-xl ${node.status === "mastered" ? "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : node.status === "in_progress" ? "bg-bg-hover text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn" : "bg-bg-hover text-text-muted dark:bg-white/[.06] dark:text-text-secondary"}`}>{node.status === "mastered" ? <CheckCircle2 className="h-4 w-4" /> : node.status === "locked" ? <Lock className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{node.title}</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg-hover dark:bg-white/[.08]"><span className="block h-full bg-primary" style={{ width: `${Math.round(node.masteryPct * 100)}%` }} /></span></span><span className="text-xs font-bold text-text-muted dark:text-text-secondary">{Math.round(node.masteryPct * 100)}%</span></div>)}{!nodes.length && <p className="text-sm text-text-muted dark:text-text-secondary">{tr("Перші теми з’являться, коли почнеться навчальний маршрут.", "Your first topics will appear when your learning path begins.")}</p>}</div></section><section className="rounded-[28px] bg-bg-hover p-6 dark:bg-[var(--surface-warning)]"><Sparkles className="h-5 w-5 text-accent-warn dark:text-accent-warn" /><p className="mt-6 text-xs font-bold uppercase tracking-[.14em] text-accent-warn dark:text-accent-warn">{tr("Задача дня", "Problem of the day")}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">{daily?.available && daily.task ? daily.task.title : tr("Сьогодні без задачі", "No problem today")}</h2><p className="mt-3 text-sm leading-6 text-accent-warn dark:text-accent-warn">{daily?.available ? tr("Невелика практика, щоб не втрачати контакт із кодом.", "A little practice to keep your coding skills sharp.") : tr("Повернися завтра — добірка оновлюється.", "Come back tomorrow for a fresh selection.")}</p>{daily?.available && daily.task && <button type="button" onClick={() => navigate(`/library/solve/${daily.task?.slug || daily.task?.id}`)} className="mt-7 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground dark:bg-primary dark:text-primary-foreground">{tr("Взяти задачу", "Try this problem")} <ArrowRight className="ml-2 inline h-4 w-4" /></button>}</section></div></div>;
};
