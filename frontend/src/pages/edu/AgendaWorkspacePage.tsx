import React from "react";
import { withDevPreview } from "../../lib/devPreview";
import "./eduWorkspace.css";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3 } from "lucide-react";
import { getAgenda, type AgendaItemDto } from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const pad = (value: number) => String(value).padStart(2, "0");
const key = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const addDays = (date: Date, count: number) => { const next = new Date(date); next.setDate(date.getDate() + count); return next; };
const isToday = (date: Date) => key(date) === key(new Date());
const formatDate = (value: string, options: Intl.DateTimeFormatOptions, en: boolean) => new Intl.DateTimeFormat(en ? "en-US" : "uk-UA", options).format(new Date(value));
const sampleAgenda = (en: boolean): AgendaItemDto[] => [
  { id: 501, kind: "TASK", title: en ? "Frequency count dictionary" : "Словник для підрахунку частот", deadline: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), deadlineMs: Date.now() + 2 * 60 * 60_000, bucket: "today", classId: 1, className: en ? "Grade 9 · Python" : "9-Б · Python", lessonId: 81 },
  { id: 502, kind: "CONTROL", title: en ? "Quiz: conditions and loops" : "Контрольна: умови та цикли", deadline: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(), deadlineMs: Date.now() + 2 * 24 * 60 * 60_000, bucket: "soon", classId: 1, className: en ? "Grade 9 · Python" : "9-Б · Python", topicId: 22 },
  { id: 503, kind: "TASK", title: en ? "String methods" : "Методи рядків", deadline: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(), deadlineMs: Date.now() + 5 * 24 * 60 * 60_000, bucket: "soon", classId: 2, className: en ? "Grade 10 · C++" : "10-А · C++", lessonId: 90 },
  { id: 504, kind: "TASK", title: en ? "Array and average" : "Масив і середнє значення", deadline: new Date(Date.now() - 24 * 60 * 60_000).toISOString(), deadlineMs: Date.now() - 24 * 60 * 60_000, bucket: "overdue", classId: 1, className: en ? "Grade 9 · Python" : "9-Б · Python", lessonId: 78 },
];

export const AgendaWorkspacePage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language?.toLowerCase().startsWith("en") ?? false;
  const copy = (uk: string, english: string) => en ? english : uk;
  const locale = en ? "en-US" : "uk-UA";
  const navigate = useNavigate();
  const [items, setItems] = React.useState<AgendaItemDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [chosen, setChosen] = React.useState(key(new Date()));

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getAgenda();
        if (alive) setItems(response.items || []);
      } catch (caught) {
        if (!alive) return;
        if (preview()) setItems(sampleAgenda(en));
        else setError(getErrorMessageFromUnknown(caught, copy("Не вдалося завантажити календар.", "Could not load the calendar.")));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [en]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, AgendaItemDto[]>();
    items.forEach((item) => {
      const itemKey = key(new Date(item.deadline));
      map.set(itemKey, [...(map.get(itemKey) || []), item]);
    });
    return map;
  }, [items]);
  const cells = React.useMemo(() => {
    const offset = (cursor.getDay() + 6) % 7;
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [cursor]);
  const selected = grouped.get(chosen) || [];
  const overdue = items.filter((item) => item.bucket === "overdue");
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(cursor);
  const shortDays = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
  const open = (item: AgendaItemDto) => item.kind === "CONTROL"
    ? navigate(withDevPreview(`/edu/lessons/${item.id}?type=CONTROL`))
    : item.lessonId ? navigate(withDevPreview(`/edu/lessons/${item.lessonId}?type=LESSON`)) : item.topicId ? navigate(withDevPreview(`/edu/lessons/${item.topicId}?type=TOPIC`)) : undefined;

  if (loading) return <div className="edu-workspace mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10"><div className="h-[620px] animate-pulse rounded-[30px] bg-bg-hover dark:bg-white/[.05]" role="status" aria-label={copy("Завантаження календаря", "Loading calendar")} /></div>;

  return (
    <div className="edu-workspace edu-calendar-page mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">EDU / {copy("ритм навчання", "learning schedule")}</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] text-text-primary dark:text-text-primary sm:text-5xl">{copy("Календар, який не тисне", "A calendar that keeps things simple")}</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary">{copy("Дедлайни видно заздалегідь — без таблиць, які треба розшифровувати.", "See deadlines ahead of time without having to decipher a spreadsheet.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setChosen(key(now)); }} className="rounded-xl border border-border/12 px-4 py-2.5 text-sm font-bold text-text-primary hover:bg-bg-hover dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.06]">{copy("Сьогодні", "Today")}</button>
          <button type="button" aria-label={copy("Попередній місяць", "Previous month")} onClick={() => setCursor((old) => new Date(old.getFullYear(), old.getMonth() - 1, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-border/12 text-text-muted hover:bg-bg-hover dark:border-white/10 dark:text-text-secondary dark:hover:bg-white/[.06]"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label={copy("Наступний місяць", "Next month")} onClick={() => setCursor((old) => new Date(old.getFullYear(), old.getMonth() + 1, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-border/12 text-text-muted hover:bg-bg-hover dark:border-white/10 dark:text-text-secondary dark:hover:bg-white/[.06]"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      {error && <div className="mb-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm font-medium text-accent-error dark:text-accent-error">{error}</div>}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,.65fr)]">
        <section className="edu-calendar__month min-w-0 rounded-[28px] border border-border/10 bg-white p-4 shadow-[0_16px_45px_rgba(28,44,32,.05)] dark:border-white/[.09] dark:bg-bg-surface dark:shadow-none sm:p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2"><h2 className="font-[family-name:var(--font-display)] text-2xl font-bold capitalize tracking-[-.04em]">{month}</h2><span className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{items.length} {copy("подій", "events")}</span></div>
          <div className="edu-calendar__grid grid grid-cols-7 gap-1.5 sm:gap-2">
            {shortDays.map((day) => <span key={day} className="edu-calendar__weekday py-1 text-center text-[11px] font-bold uppercase tracking-[.1em] text-text-muted">{day}</span>)}
            {cells.map((cell) => {
              const cellKey = key(cell);
              const events = grouped.get(cellKey) || [];
              const inMonth = cell.getMonth() === cursor.getMonth();
              const selectedDay = cellKey === chosen;
              return <button type="button" key={cellKey} aria-label={`${new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(cell)}, ${events.length} ${copy("подій", "events")}`} aria-pressed={selectedDay} onClick={() => setChosen(cellKey)} className={`edu-calendar__day min-h-[76px] min-w-0 rounded-xl border p-2 text-left transition sm:min-h-[104px] ${selectedDay ? "border-primary-strong bg-bg-hover shadow-[inset_0_0_0_1px_rgba(22,131,77,.16)] dark:border-primary/50 dark:bg-primary/[.07]" : inMonth ? "border-border/8 hover:border-primary-strong/35 hover:bg-bg-hover dark:border-white/[.07] dark:hover:bg-white/[.04]" : "border-transparent opacity-40"}`}>
                <span className={`text-xs font-bold ${isToday(cell) ? "text-primary-strong dark:text-primary-soft" : "text-text-muted dark:text-text-secondary"}`}>{cell.getDate()}</span>
                <div className="mt-1.5 space-y-1">{events.slice(0, 2).map((item) => <span key={`${item.kind}-${item.lessonId ?? item.topicId}-${item.id}`} className={`block truncate rounded-md px-1.5 py-1 text-[10px] font-bold ${item.kind === "CONTROL" ? "bg-bg-hover text-accent-warn dark:bg-accent-warn/15 dark:text-accent-warn" : "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft"}`}>{item.title}</span>)}{events.length > 2 && <span className="block text-[10px] font-bold text-text-muted">+{events.length - 2}</span>}</div>
              </button>;
            })}
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-[28px] border border-border/10 bg-bg-hover p-5 dark:border-white/[.09] dark:bg-bg-code">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-soft"><CalendarDays className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-[.13em] text-text-muted dark:text-text-secondary">{copy("Обраний день", "Selected day")}</p><h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-.03em]">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", weekday: "long" }).format(new Date(`${chosen}T12:00:00`))}</h2></div></div>
            <div className="mt-5 space-y-2">{selected.length ? selected.map((item) => <button type="button" key={`${item.kind}-${item.lessonId ?? item.topicId}-${item.id}`} onClick={() => open(item)} className="group flex w-full items-start gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition edu-hover-lift dark:bg-white/[.05] dark:shadow-none"><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${item.kind === "CONTROL" ? "bg-bg-hover text-accent-warn dark:bg-accent-warn/15 dark:text-accent-warn" : "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft"}`}>{item.kind === "CONTROL" ? <ClipboardList className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.title}</span><span className="mt-1 block text-xs font-medium text-text-muted dark:text-text-secondary">{item.className} · {formatDate(item.deadline, { hour: "2-digit", minute: "2-digit" }, en)}</span></span><ArrowRight className="mt-2 h-4 w-4 text-text-secondary transition " /></button>) : <p className="rounded-2xl border border-dashed border-border/12 px-4 py-8 text-center text-sm leading-6 text-text-muted dark:border-white/10 dark:text-text-secondary">{copy("На цей день нічого не заплановано.", "Nothing is scheduled for this day.")}</p>}</div>
          </section>
          {overdue.length > 0 && <button type="button" onClick={() => { const first = new Date(overdue[0].deadline); setCursor(new Date(first.getFullYear(), first.getMonth(), 1)); setChosen(key(first)); }} className="flex w-full items-center gap-3 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] p-4 text-left text-accent-error transition hover:bg-accent-error/[.12] dark:text-accent-error"><AlertTriangle className="h-5 w-5 shrink-0" /><span><span className="block text-sm font-bold">{copy("Є прострочені роботи", "Overdue work")}</span><span className="block text-xs font-medium opacity-80">{copy(`Відкрити першу з ${overdue.length}`, `Open the first of ${overdue.length}`)}</span></span></button>}
          <section className="rounded-2xl border border-border/10 p-4 dark:border-white/[.09]"><div className="flex items-center gap-2 text-sm font-bold"><Clock3 className="h-4 w-4 text-accent-warn" />{copy("Найближче", "Coming up")}</div><div className="mt-3 space-y-2">{items.filter((item) => item.bucket === "today" || item.bucket === "soon").slice(0, 3).map((item) => <div key={`${item.kind}-${item.lessonId ?? item.topicId}-${item.id}`} className="flex justify-between gap-3 text-sm"><span className="truncate text-text-muted dark:text-text-secondary">{item.title}</span><span className="shrink-0 font-bold text-text-primary dark:text-text-primary">{formatDate(item.deadline, { day: "numeric", month: "short" }, en)}</span></div>)}</div></section>
        </aside>
      </div>
    </div>
  );
};
