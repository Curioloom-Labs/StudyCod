import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, AlertTriangle, ChevronLeft, ChevronRight, FileCode, FileText } from "lucide-react";
import { PageHero } from "../../components/ui/PageHero";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { SectionHeading } from "../../components/ui/SectionHeading";
import { getAgenda, type AgendaItemDto, type AgendaBucket } from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const isToday = (d: Date) => {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
// A known Monday — used to render locale-correct, Monday-first weekday labels.
const KNOWN_MONDAY = new Date(2024, 0, 1);

// Subtle chip tone per agenda bucket (terminal palette, unchanged colours).
const BUCKET_CHIP: Record<AgendaBucket, string> = {
  overdue: "border-accent-error/40 text-accent-error bg-accent-error/10",
  today: "border-primary/40 text-primary bg-primary/10",
  soon: "border-accent-warning/40 text-accent-warning bg-accent-warning/10",
  later: "border-border text-text-secondary bg-bg-hover"
};

export const CalendarPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const locale = i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA";
  const navigate = useNavigate();
  const [items, setItems] = useState<AgendaItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState(() => dayKey(new Date()));

  useEffect(() => {
    (async () => {
      try {
        const data = await getAgenda();
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити календар", "Failed to load calendar")) });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsByDay = useMemo(() => {
    const m = new Map<string, AgendaItemDto[]>();
    for (const it of items) {
      const key = dayKey(new Date(it.deadline));
      const arr = m.get(key);
      if (arr) arr.push(it);
      else m.set(key, [it]);
    }
    for (const arr of m.values()) arr.sort((a, b) => +new Date(a.deadline) - +new Date(b.deadline));
    return m;
  }, [items]);

  const overdue = useMemo(
    () => items.filter(i => i.bucket === "overdue").sort((a, b) => +new Date(a.deadline) - +new Date(b.deadline)),
    [items]
  );

  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(cursor),
    [locale, cursor]
  );
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(KNOWN_MONDAY, i)));
  }, [locale]);

  const cells = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
    const start = new Date(y, m, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const selectedItems = useMemo(() => itemsByDay.get(selectedKey) ?? [], [itemsByDay, selectedKey]);
  const selectedDateLabel = useMemo(() => {
    const [y, m, d] = selectedKey.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
  }, [selectedKey, locale]);

  const goPrev = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNext = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelectedKey(dayKey(n));
  };
  const jumpOverdue = () => {
    if (!overdue.length) return;
    const d = new Date(overdue[0].deadline);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedKey(dayKey(d));
  };

  const openItem = (it: AgendaItemDto) => {
    if (it.kind === "CONTROL") navigate(`/edu/lessons/${it.id}?type=CONTROL`);
    else if (it.lessonId) navigate(`/edu/lessons/${it.lessonId}`);
  };

  if (loading) return <PageSkeleton variant="default" />;

  const navBtn = "h-9 w-9 inline-flex items-center justify-center rounded-[var(--ui-button-radius)] border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

  return (
    <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// calendar"
        eyebrowAurora={tr("Календар", "Calendar")}
        title={tr("Календар", "Calendar")}
        subtitle={tr("Усі дедлайни ваших завдань і контрольних в одному місці.", "All your task and control-work deadlines in one place.")}
        maxWidth="4xl"
      />

      <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-8 md:px-8">
        {overdue.length > 0 && (
          <button
            type="button"
            onClick={jumpOverdue}
            className="w-full flex items-center gap-2 rounded-[var(--ui-card-radius)] border border-accent-error/40 bg-accent-error/10 px-4 py-2.5 text-left transition-fast hover:border-accent-error/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-error/40"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-accent-error" />
            <span className="text-sm font-mono text-accent-error">
              {tr("Прострочено", "Overdue")} · {overdue.length}
            </span>
            <span className="ml-auto text-xs font-mono text-accent-error/80">{tr("перейти →", "jump →")}</span>
          </button>
        )}

        {/* Month navigation */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-mono text-lg text-text-primary capitalize">{monthTitle}</h2>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label={tr("Попередній місяць", "Previous month")} onClick={goPrev} className={navBtn}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="h-9 px-3 inline-flex items-center rounded-[var(--ui-button-radius)] border border-border text-xs font-mono text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {tr("Сьогодні", "Today")}
            </button>
            <button type="button" aria-label={tr("Наступний місяць", "Next month")} onClick={goNext} className={navBtn}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[var(--ui-card-radius)] border border-border bg-bg-surface/35 p-2">
          <div className="min-w-[760px]">
            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-2 lg:gap-3">
              {weekdays.map((w, i) => (
                <div key={i} className="text-[11px] font-mono uppercase tracking-[0.06em] text-text-muted text-center py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Month grid */}
            <div className="mt-2 grid grid-cols-7 gap-2 lg:gap-3">
              {cells.map((date, i) => {
                const key = dayKey(date);
                const dayItems = itemsByDay.get(key) ?? [];
                const inMonth = date.getMonth() === cursor.getMonth();
                const today = isToday(date);
                const selected = key === selectedKey;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={[
                      "min-h-[118px] rounded-xl border p-2 text-left flex flex-col gap-1.5 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:min-h-[138px] lg:p-3",
                      inMonth ? "bg-bg-surface" : "bg-bg-surface/30",
                      today
                        ? "border-primary/60 ring-1 ring-primary/30"
                        : selected
                        ? "border-primary/50"
                        : "border-border hover:border-primary/30"
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "text-xs font-mono tabular-nums",
                        today ? "text-primary font-semibold" : inMonth ? "text-text-secondary" : "text-text-muted/60"
                      ].join(" ")}
                    >
                      {date.getDate()}
                    </span>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayItems.slice(0, 3).map(it => {
                        const KindIcon = it.kind === "CONTROL" ? FileText : FileCode;
                        return (
                          <div
                            key={`${it.kind}-${it.id}`}
                            title={it.title}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-mono border ${BUCKET_CHIP[it.bucket]}`}
                          >
                            <KindIcon className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{it.title}</span>
                          </div>
                        );
                      })}
                      {dayItems.length > 3 && (
                        <span className="text-[10px] font-mono text-text-muted pl-1">+{dayItems.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected day detail */}
        <section className="pt-2">
          <SectionHeading icon={CalendarDays} count={selectedItems.length} className="mb-3 capitalize">
            {selectedDateLabel}
          </SectionHeading>
          {selectedItems.length === 0 ? (
            <div className="rounded-[var(--ui-card-radius)] border border-dashed border-border bg-bg-surface/40 px-4 py-6 text-center text-sm text-text-muted">
              {tr("Немає дедлайнів цього дня", "No deadlines on this day")}
            </div>
          ) : (
            <div className="space-y-2">
              {selectedItems.map(it => {
                const KindIcon = it.kind === "CONTROL" ? FileText : FileCode;
                const when = new Date(it.deadline).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" });
                const isOverdue = it.bucket === "overdue";
                return (
                  <button
                    key={`${it.kind}-${it.id}`}
                    type="button"
                    onClick={() => openItem(it)}
                    className="w-full text-left rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-4 flex items-center justify-between gap-3 transition-fast hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <KindIcon className={`w-4 h-4 shrink-0 ${isOverdue ? "text-accent-error" : "text-text-muted"}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-mono text-text-primary truncate">{it.title}</div>
                        <div className="text-xs text-text-secondary mt-0.5 truncate">
                          {it.className}
                          {it.kind === "CONTROL" ? ` · ${tr("Контрольна", "Control work")}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-mono tabular-nums ${isOverdue ? "text-accent-error" : "text-text-secondary"}`}>{when}</span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
