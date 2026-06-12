import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Compass, Target, ArrowRight, Repeat, FileDown, Trophy, Layers3, Gauge, CheckCircle2 } from "lucide-react";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { showToast } from "../../lib/toast";
import {
  getMySkillTree,
  getDailyChallenge,
  getConceptsDue,
  downloadProgressReport,
  type SkillTree,
  type SkillNode,
  type DailyChallenge,
  type ConceptDue,
} from "../../lib/api/learning";

const STATUS_META: Record<SkillNode["status"], { glyph: string; label: string; tone: string }> = {
  mastered: { glyph: "✅", label: tr("Опановано", "Mastered"), tone: "text-accent-success" },
  in_progress: { glyph: "🔶", label: tr("У процесі", "In progress"), tone: "text-accent-warn" },
  available: { glyph: "⚪", label: tr("Доступно", "Available"), tone: "text-text-secondary" },
  locked: { glyph: "🔒", label: tr("Замкнено", "Locked"), tone: "text-text-muted" },
};

const StatTile: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="border border-border bg-bg-surface px-4 py-3.5 min-h-[80px]">
    <div className="flex items-center justify-between gap-3">
      <div className="text-[11px] font-mono uppercase tracking-[0.04em] text-text-secondary truncate">{label}</div>
      <Icon className="w-4 h-4 text-primary shrink-0" />
    </div>
    <div className="mt-2 text-2xl font-mono font-semibold text-text-primary truncate">{value}</div>
  </div>
);

export const MyLearningPage: React.FC = () => {
  const navigate = useNavigate();
  const [tree, setTree] = useState<SkillTree | null>(null);
  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [due, setDue] = useState<ConceptDue[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getMySkillTree().then(setTree).catch(() => setTree({ nodes: [], edges: [], nextNodeId: null }));
    getDailyChallenge().then(setDaily).catch(() => setDaily({ available: false }));
    getConceptsDue().then((r) => setDue(r.due)).catch(() => setDue([]));
  }, []);

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const blob = await downloadProgressReport();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      const msg = e?.response?.status === 503
        ? tr("PDF-рендер недоступний на сервері.", "PDF renderer is unavailable on the server.")
        : tr("Не вдалося згенерувати звіт.", "Couldn't generate the report.");
      showToast({ type: "error", message: msg });
    } finally {
      setDownloading(false);
    }
  };

  const nextNode = tree?.nodes.find((n) => n.id === tree.nextNodeId) ?? null;

  const stats = useMemo(() => {
    const nodes = tree?.nodes ?? [];
    const total = nodes.length;
    const mastered = nodes.filter((n) => n.status === "mastered").length;
    const inProgress = nodes.filter((n) => n.status === "in_progress").length;
    const avg = total ? Math.round((nodes.reduce((s, n) => s + n.masteryPct, 0) / total) * 100) : 0;
    return { total, mastered, inProgress, avg };
  }, [tree]);

  return (
    <div className="w-full bg-bg-base px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl w-full mx-auto space-y-6">
        {/* Hero */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
            <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-mono font-medium uppercase tracking-[0.04em] text-primary">
              <Compass className="w-3.5 h-3.5" />
              {tr("Прогрес навчання", "Learning progress")}
            </div>
            <h1 className="mt-3 text-2xl md:text-3xl font-mono font-semibold text-text-primary">
              {tr("Моє навчання", "My Learning")}
            </h1>
            <p className="mt-1 text-sm font-mono text-text-secondary">
              {tr("Твій прогрес по темах, задача дня й що варто повторити.", "Your topic progress, the daily challenge, and what to review.")}
            </p>
          </div>
          <Button variant="secondary" onClick={downloadReport} disabled={downloading}>
            <FileDown className="w-4 h-4 mr-2" />
            {downloading ? tr("Генерую…", "Generating…") : tr("PDF-звіт", "PDF report")}
          </Button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile icon={Layers3} label={tr("Усього тем", "Topics")} value={String(stats.total)} />
          <StatTile icon={CheckCircle2} label={tr("Опановано", "Mastered")} value={String(stats.mastered)} />
          <StatTile icon={Target} label={tr("У процесі", "In progress")} value={String(stats.inProgress)} />
          <StatTile icon={Gauge} label={tr("Середній рівень", "Avg mastery")} value={`${stats.avg}%`} />
        </div>

        {/* Daily challenge */}
        <div className="border border-border bg-bg-surface">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono font-medium uppercase tracking-[0.04em] text-text-secondary">{tr("Задача дня", "Challenge of the day")}</span>
          </div>
          <div className="p-5">
            {daily?.available && daily.task ? (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-lg font-mono text-text-primary">{daily.task.title}</div>
                  {daily.task.difficulty && <div className="text-xs font-mono text-text-secondary mt-1">{tr("Складність", "Difficulty")}: {daily.task.difficulty}</div>}
                </div>
                <Button variant="primary" onClick={() => navigate(`/library/solve/${daily.task!.slug || daily.task!.id}`)}>
                  {tr("Розв'язати", "Solve")}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">{tr("Сьогодні немає задачі дня.", "No challenge today.")}</div>
            )}
          </div>
        </div>

        {/* Next recommended */}
        {nextNode && (
          <button
            onClick={() => navigate("/learn")}
            className="w-full text-left border border-primary/40 bg-primary/5 p-5 hover:bg-primary/10 transition-fast"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-mono uppercase tracking-[0.04em] text-primary mb-1.5 flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  {tr("Рекомендуємо далі", "Recommended next")}
                </div>
                <div className="text-lg font-mono text-text-primary truncate">{nextNode.title}</div>
              </div>
              <div className="text-2xl font-mono font-semibold text-primary shrink-0">{Math.round(nextNode.masteryPct * 100)}%</div>
            </div>
          </button>
        )}

        {/* Skill map */}
        <div className="border border-border bg-bg-surface">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono font-medium uppercase tracking-[0.04em] text-text-secondary">{tr("Мапа тем", "Skill map")}</span>
          </div>
          {!tree ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tree.nodes.length === 0 ? (
            <div className="p-5 text-sm text-text-secondary">{tr("Тем поки немає.", "No topics yet.")}</div>
          ) : (
            <div className="divide-y divide-border">
              {tree.nodes.map((n) => {
                const meta = STATUS_META[n.status];
                const pct = Math.round(n.masteryPct * 100);
                return (
                  <div key={n.id} className={`flex items-center gap-4 px-5 py-4 ${n.isNext ? "bg-primary/5" : ""}`}>
                    <span className="text-xl shrink-0" title={meta.label}>{meta.glyph}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono truncate ${n.status === "locked" ? "text-text-muted" : "text-text-primary"}`}>{n.title}</span>
                        {n.isNext && <span className="text-[10px] font-mono uppercase tracking-wide text-primary border border-primary/40 px-1.5 py-0.5 shrink-0">{tr("наступне", "next")}</span>}
                      </div>
                      <div className="mt-2 h-2 bg-bg-code rounded-full overflow-hidden">
                        <span className="block h-full bg-primary transition-fast" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="w-14 text-right shrink-0">
                      <div className={`text-base font-mono font-semibold ${meta.tone}`}>{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Concepts due */}
        {due.length > 0 && (
          <div className="border border-border bg-bg-surface">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono font-medium uppercase tracking-[0.04em] text-text-secondary">{tr("До повторення", "Due for review")}</span>
            </div>
            <div className="p-5 flex flex-wrap gap-2">
              {due.map((d) => (
                <span key={d.conceptKey} className="text-sm font-mono text-text-primary border border-border bg-bg-base px-3 py-1.5">
                  {d.conceptKey}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyLearningPage;
