import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Compass, Target, ArrowRight, Repeat, FileDown, Trophy, Layers3, Gauge, CheckCircle2, Circle, Lock, CircleDot } from "lucide-react";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { Skeleton } from "../../components/ui/Skeleton";
import { showToast } from "../../lib/toast";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";
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

const STATUS_META: Record<SkillNode["status"], { icon: React.ComponentType<{ className?: string }>; label: string; tone: string }> = {
  mastered: { icon: CheckCircle2, label: tr("Опановано", "Mastered"), tone: "text-accent-success" },
  in_progress: { icon: CircleDot, label: tr("У процесі", "In progress"), tone: "text-accent-warn" },
  available: { icon: Circle, label: tr("Доступно", "Available"), tone: "text-text-secondary" },
  locked: { icon: Lock, label: tr("Замкнено", "Locked"), tone: "text-text-muted" },
  closed: { icon: Lock, label: tr("Закрито", "Closed"), tone: "text-accent-error" },
};

const StatTile: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl border border-border bg-bg-surface px-4 py-3.5 min-h-[80px]">
    <div className="flex items-center justify-between gap-3">
      <div className="text-[11px] font-mono uppercase tracking-[0.04em] text-text-secondary truncate">{label}</div>
      <Icon className="w-4 h-4 text-primary shrink-0" />
    </div>
    <div className="mt-2 text-2xl font-mono font-semibold text-text-primary truncate">{value}</div>
  </div>
);

export const MyLearningPage: React.FC = () => {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const isAurora = useUIMode().mode === "aurora";
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
    <div className="px-4 md:px-8 pt-8 pb-6 max-w-6xl mx-auto space-y-8">
      {/* Hero */}
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
      >
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {tr("Назад", "Back")}
        </Button>

        {isAurora ? (
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted">{tr("Навчання", "Learning")}</span>
        ) : (
          <span className="font-mono text-xs text-primary/70">{tr("// моє навчання", "// my learning")}</span>
        )}

        <div className={`flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between ${isAurora ? "mt-3" : "mt-2"}`}>
          <div>
            <div className="flex items-center gap-2">
              <Compass className={`text-primary ${isAurora ? "w-6 h-6" : "w-5 h-5"}`} />
              <h1 className={isAurora ? "text-2xl md:text-3xl font-semibold tracking-[-0.01em] text-text-primary" : "text-2xl md:text-3xl font-semibold tracking-tight text-text-primary"}>{tr("Моє навчання", "My Learning")}</h1>
            </div>
            <p className="mt-1.5 text-sm text-text-secondary max-w-xl">
              {tr("Твій прогрес по темах, задача дня й що варто повторити.", "Your topic progress, the daily challenge, and what to review.")}
            </p>
          </div>
          <Button variant="secondary" onClick={downloadReport} disabled={downloading}>
            <FileDown className="w-4 h-4 mr-2" />
            {downloading ? tr("Генерую…", "Generating…") : tr("PDF-звіт", "PDF report")}
          </Button>
        </div>

        {/* Overall mastery */}
        <div className="mt-5 rounded-xl border border-border bg-bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Загальне опанування", "Overall mastery")}</span>
            <span className="font-mono text-2xl font-semibold text-primary">{stats.avg}%</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-bg-hover overflow-hidden">
            <motion.div
              className="h-full bg-primary origin-left rounded-full"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: stats.avg / 100 }}
              transition={prefersReducedMotion ? { duration: 0.01 } : { duration: 0.6, ease: easeOutQuint }}
            />
          </div>
        </div>
      </motion.div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      {/* Stat tiles */}
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? undefined : "initial"}
        animate={prefersReducedMotion ? undefined : "animate"}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
          <StatTile icon={Layers3} label={tr("Усього тем", "Topics")} value={String(stats.total)} />
        </motion.div>
        <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
          <StatTile icon={CheckCircle2} label={tr("Опановано", "Mastered")} value={String(stats.mastered)} />
        </motion.div>
        <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
          <StatTile icon={Target} label={tr("У процесі", "In progress")} value={String(stats.inProgress)} />
        </motion.div>
        <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
          <StatTile icon={Gauge} label={tr("Середній рівень", "Avg mastery")} value={`${stats.avg}%`} />
        </motion.div>
      </motion.div>

      {/* Daily challenge */}
      <div className="rounded-xl border border-border bg-bg-surface p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Задача дня", "Challenge of the day")}</span>
        </div>
        {daily?.available && daily.task ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-lg font-semibold text-text-primary">{daily.task.title}</div>
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

      {/* Next recommended */}
      {nextNode && (
        <motion.button
          onClick={() => navigate("/learn")}
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: easeOutQuint }}
          className="group w-full text-left rounded-xl border border-primary/40 bg-primary/5 p-5 hover:bg-primary/10 hover:-translate-y-0.5 transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-mono uppercase tracking-[0.06em] text-primary mb-1.5 flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 transition-fast group-hover:translate-x-0.5" />
                {tr("Рекомендуємо далі", "Recommended next")}
              </div>
              <div className="text-lg font-semibold text-text-primary truncate">{nextNode.title}</div>
            </div>
            <div className="text-2xl font-mono font-semibold text-primary shrink-0">{Math.round(nextNode.masteryPct * 100)}%</div>
          </div>
        </motion.button>
      )}

      {/* Skill map */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-primary" />
          <span className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Мапа тем", "Skill map")}</span>
        </div>

        {!tree ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : tree.nodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 px-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Layers3 className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm text-text-secondary max-w-sm">{tr("Тем поки немає.", "No topics yet.")}</div>
          </div>
        ) : (
          <motion.div
            variants={prefersReducedMotion ? undefined : staggerContainer}
            initial={prefersReducedMotion ? undefined : "initial"}
            animate={prefersReducedMotion ? undefined : "animate"}
            className="space-y-0"
          >
            {tree.nodes.map((n, idx) => {
              const meta = STATUS_META[n.status];
              const StatusIcon = meta.icon;
              const pct = Math.round(n.masteryPct * 100);
              const isLast = idx === tree.nodes.length - 1;
              const completed = n.status === "mastered";
              return (
                <motion.div
                  key={n.id}
                  variants={prefersReducedMotion ? undefined : fadeUpItem}
                  className="relative pl-10 pb-6 last:pb-0"
                >
                  {!isLast && (
                    <span
                      className={`absolute left-[15px] top-7 bottom-0 w-px ${completed ? "bg-primary" : "bg-border"}`}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`absolute left-0 top-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full border ${
                      n.status === "locked"
                        ? "border-border bg-bg-surface"
                        : completed
                          ? "border-primary bg-primary/10"
                          : "border-primary/40 bg-bg-surface"
                    }`}
                  >
                    <StatusIcon className={`w-4 h-4 ${meta.tone}`} />
                  </span>

                  <div
                    className={`rounded-xl border p-4 transition-fast ${
                      n.isNext ? "border-primary/40 bg-primary/5" : "border-border bg-bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold truncate ${n.status === "locked" ? "text-text-muted" : "text-text-primary"}`}>{n.title}</span>
                          <span className={`text-[10px] font-mono uppercase tracking-wide shrink-0 ${meta.tone}`}>{meta.label}</span>
                          {n.isNext && (
                            <span className="text-[10px] font-mono uppercase tracking-wide text-primary border border-primary/40 rounded-md px-1.5 py-0.5 shrink-0">
                              {tr("наступне", "next")}
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 h-1.5 rounded-full bg-bg-hover overflow-hidden">
                          <motion.div
                            className="h-full bg-primary origin-left rounded-full"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: pct / 100 }}
                            transition={prefersReducedMotion ? { duration: 0.01 } : { duration: 0.6, ease: easeOutQuint, delay: 0.05 * idx }}
                          />
                        </div>
                      </div>
                      <div className={`font-mono text-base font-semibold shrink-0 ${meta.tone}`}>{pct}%</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Concepts due */}
      {due.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <Repeat className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("До повторення", "Due for review")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {due.map((d) => (
              <span key={d.conceptKey} className="text-sm font-mono text-text-primary border border-border bg-bg-base rounded-lg px-3 py-1.5">
                {d.conceptKey}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyLearningPage;
