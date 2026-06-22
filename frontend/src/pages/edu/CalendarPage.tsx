import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, AlertTriangle, Clock, ChevronRight, FileCode, FileText } from "lucide-react";
import { PageHero } from "../../components/ui/PageHero";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { getAgenda, type AgendaItemDto, type AgendaBucket } from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const BUCKET_ORDER: AgendaBucket[] = ["overdue", "today", "soon", "later"];

export const CalendarPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const locale = i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA";
  const navigate = useNavigate();
  const [items, setItems] = useState<AgendaItemDto[]>([]);
  const [loading, setLoading] = useState(true);

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

  const grouped = useMemo(() => {
    const g: Record<AgendaBucket, AgendaItemDto[]> = { overdue: [], today: [], soon: [], later: [] };
    for (const it of items) g[it.bucket].push(it);
    return g;
  }, [items]);

  const bucketMeta: Record<AgendaBucket, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
    overdue: { label: tr("Прострочено", "Overdue"), tone: "text-accent-error", icon: AlertTriangle },
    today: { label: tr("Сьогодні", "Today"), tone: "text-primary", icon: Clock },
    soon: { label: tr("Найближчі 7 днів", "Next 7 days"), tone: "text-accent-warning", icon: CalendarDays },
    later: { label: tr("Пізніше", "Later"), tone: "text-text-muted", icon: CalendarDays }
  };

  const openItem = (it: AgendaItemDto) => {
    if (it.kind === "CONTROL") navigate(`/edu/control-works/${it.id}`);
    else if (it.lessonId) navigate(`/edu/lessons/${it.lessonId}`);
  };

  if (loading) return <PageSkeleton variant="default" />;

  return (
    <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// calendar"
        eyebrowAurora={tr("Календар", "Calendar")}
        title={tr("Календар", "Calendar")}
        subtitle={tr("Усі дедлайни ваших завдань і контрольних в одному місці.", "All your task and control-work deadlines in one place.")}
        maxWidth="4xl"
      />

      <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto space-y-8">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <CalendarDays className="w-6 h-6 text-primary" />
            </div>
            <p className="text-text-secondary">{tr("Немає дедлайнів попереду", "No upcoming deadlines")}</p>
          </div>
        ) : (
          BUCKET_ORDER.filter(b => grouped[b].length > 0).map(b => {
            const meta = bucketMeta[b];
            const Icon = meta.icon;
            return (
              <section key={b}>
                <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 mb-3">
                  <Icon className={`w-3.5 h-3.5 ${meta.tone}`} />
                  {meta.label}
                  <span className="text-text-muted/70">· {grouped[b].length}</span>
                </h2>
                <div className="space-y-2">
                  {grouped[b].map(it => {
                    const KindIcon = it.kind === "CONTROL" ? FileText : FileCode;
                    const when = new Date(it.deadline).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
                    return (
                      <button
                        key={`${it.kind}-${it.id}`}
                        type="button"
                        onClick={() => openItem(it)}
                        className="w-full text-left rounded-xl border border-border bg-bg-surface p-4 flex items-center justify-between gap-3 transition-fast hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <KindIcon className={`w-4 h-4 shrink-0 ${b === "overdue" ? "text-accent-error" : "text-text-muted"}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-mono text-text-primary truncate">{it.title}</div>
                            <div className="text-xs text-text-secondary mt-0.5 truncate">
                              {it.className}
                              {it.kind === "CONTROL" ? ` · ${tr("Контрольна", "Control work")}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-mono tabular-nums ${b === "overdue" ? "text-accent-error" : "text-text-secondary"}`}>{when}</span>
                          <ChevronRight className="w-4 h-4 text-text-muted" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
};
