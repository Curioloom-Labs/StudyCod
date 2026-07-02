import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { animate, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Clock3, RefreshCcw, TrendingUp, TrendingDown, Minus, Target, Flame } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { listGrades } from "../../lib/api/grades";
import { resetTopic } from "../../lib/api/tasks";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import type { Grade } from "../../types";
import { tr } from "../../i18n";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";

const CountUp: React.FC<{ value: number; decimals?: number; className?: string }> = ({ value, decimals = 0, className }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = value.toFixed(decimals);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = v.toFixed(decimals);
      },
    });
    return () => controls.stop();
  }, [value, decimals, reduce]);
  return <span ref={ref} className={className}>{value.toFixed(decimals)}</span>;
};

const ScoreBar: React.FC<{ value: number; tone: string }> = ({ value, tone }) => {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
      <motion.div
        className={`h-full rounded-full origin-left ${tone}`}
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: pct / 100 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: easeOutQuint }}
        style={{ width: "100%", transformOrigin: "left" }}
      />
    </div>
  );
};

interface TopicWithAverage {
  topicId: number | null;
  topicTitle: string;
  average: number;
  gradeCount: number;
  lastAt: string;
}

interface HeatTopicItem {
  key: string;
  topicId: number | null;
  topicTitle: string;
  average: number;
  attempts: number;
  trend: number;
  lastAt: string;
}

interface Props {
  onNavigate?: (page: "home" | "tasks") => void;
}

function gradeTone(value: number): string {
  if (value >= 85) return "text-accent-success";
  if (value >= 65) return "text-accent-warn";
  if (value >= 40) return "text-accent-warning";
  return "text-accent-error";
}

function gradeHeatTone(value: number): string {
  if (value >= 85) return "bg-accent-success/25 border-accent-success/40";
  if (value >= 65) return "bg-accent-warn/20 border-accent-warn/35";
  if (value >= 40) return "bg-accent-warning/15 border-accent-warning/35";
  return "bg-accent-error/20 border-accent-error/40";
}

function gradeFillTone(value: number): string {
  if (value >= 85) return "bg-accent-success";
  if (value >= 65) return "bg-accent-warn";
  if (value >= 40) return "bg-accent-warning";
  return "bg-accent-error";
}

export const GradesPage: React.FC<Props> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const locale = i18n.language === "uk" ? "uk-UA" : "en-US";

  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingTopicId, setRetryingTopicId] = useState<number | null>(null);

  useEffect(() => {
    listGrades()
      .then((data) => setGrades(Array.isArray(data) ? data : []))
      .catch(() => setGrades([]))
      .finally(() => setLoading(false));
  }, []);

  const validGrades = useMemo(() => grades.filter((g) => Number.isFinite(Number(g.total))), [grades]);

  const stats = useMemo(() => {
    const count = validGrades.length;
    const avg = count > 0 ? Number((validGrades.reduce((s, g) => s + Number(g.total), 0) / count).toFixed(2)) : 0;
    const passed = validGrades.filter((g) => Number(g.total) >= 50).length;
    const excellent = validGrades.filter((g) => Number(g.total) >= 85).length;
    const chrono = [...validGrades].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const half = Math.max(1, Math.floor(chrono.length / 2));
    const firstHalf = chrono.slice(0, half).map((g) => Number(g.total));
    const lastHalf = chrono.slice(-half).map((g) => Number(g.total));
    const firstAvg = firstHalf.length ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length : avg;
    const lastAvg = lastHalf.length ? lastHalf.reduce((s, v) => s + v, 0) / lastHalf.length : avg;
    const trend = count > 1 ? Number((lastAvg - firstAvg).toFixed(1)) : 0;
    return { count, avg, passed, excellent, trend };
  }, [validGrades]);

  const topicsWithLowAverage = useMemo(() => {
    const topicMap = new Map<number | null, { title: string; grades: number[]; lastAt: string }>();

    for (const grade of validGrades) {
      const total = Number(grade.total);
      if (!Number.isFinite(total)) continue;
      const topicId = grade.task.topic?.id ?? null;
      const topicTitle = grade.task.topic?.title ?? grade.task.title;
      const createdAt = String(grade.createdAt ?? "");

      if (!topicMap.has(topicId)) {
        topicMap.set(topicId, { title: topicTitle, grades: [], lastAt: createdAt });
      }

      const row = topicMap.get(topicId)!;
      row.grades.push(total);
      if (createdAt && (!row.lastAt || createdAt > row.lastAt)) row.lastAt = createdAt;
    }

    const result: TopicWithAverage[] = [];
    topicMap.forEach((data, topicId) => {
      const average = data.grades.reduce((sum, g) => sum + g, 0) / data.grades.length;
      if (average < 50) {
        result.push({
          topicId,
          topicTitle: data.title,
          average: Number(average.toFixed(2)),
          gradeCount: data.grades.length,
          lastAt: data.lastAt,
        });
      }
    });

    return result.sort((a, b) => a.average - b.average || String(b.lastAt).localeCompare(String(a.lastAt)));
  }, [validGrades]);

  const recentGrades = useMemo(() => {
    return [...validGrades]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }, [validGrades]);

  const recentGradesByTopic = useMemo(() => {
    const byTopic = new Map<string, { topicTitle: string; rows: Grade[] }>();
    for (const grade of recentGrades) {
      const topicId = grade.task.topic?.id ?? null;
      const topicTitle = grade.task.topic?.title ?? tr("Без теми", "No topic");
      const key = topicId != null ? `topic:${topicId}` : `topic-title:${topicTitle.toLowerCase()}`;
      if (!byTopic.has(key)) byTopic.set(key, { topicTitle, rows: [] });
      byTopic.get(key)!.rows.push(grade);
    }

    return Array.from(byTopic.entries())
      .map(([key, section]) => {
        const rows = [...section.rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const avg = rows.length
          ? Number((rows.reduce((sum, g) => sum + Number(g.total), 0) / rows.length).toFixed(2))
          : 0;
        return { key, topicTitle: section.topicTitle, rows, avg };
      })
      .sort((a, b) => {
        const ta = a.rows.length ? new Date(a.rows[0].createdAt).getTime() : 0;
        const tb = b.rows.length ? new Date(b.rows[0].createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [recentGrades, i18n.language]);

  const topicHeatmap = useMemo(() => {
    const byTopic = new Map<string, { topicId: number | null; topicTitle: string; rows: Grade[] }>();

    for (const grade of validGrades) {
      const topicId = grade.task.topic?.id ?? null;
      const topicTitle = grade.task.topic?.title ?? tr("Без теми", "No topic");
      const key = topicId != null ? `topic:${topicId}` : `topic-title:${topicTitle.toLowerCase()}`;
      if (!byTopic.has(key)) byTopic.set(key, { topicId, topicTitle, rows: [] });
      byTopic.get(key)!.rows.push(grade);
    }

    const out: HeatTopicItem[] = [];
    for (const [key, group] of byTopic.entries()) {
      const rows = [...group.rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const totals = rows.map((r) => Number(r.total)).filter((v) => Number.isFinite(v));
      const avg = totals.length ? totals.reduce((s, v) => s + v, 0) / totals.length : 0;
      const half = Math.max(1, Math.floor(totals.length / 2));
      const prev = totals.slice(0, half);
      const last = totals.slice(-half);
      const prevAvg = prev.length ? prev.reduce((s, v) => s + v, 0) / prev.length : avg;
      const lastAvg = last.length ? last.reduce((s, v) => s + v, 0) / last.length : avg;
      const trend = Number((lastAvg - prevAvg).toFixed(2));

      out.push({
        key,
        topicId: group.topicId,
        topicTitle: group.topicTitle,
        average: Number(avg.toFixed(2)),
        attempts: totals.length,
        trend,
        lastAt: rows.length ? String(rows[rows.length - 1].createdAt ?? "") : "",
      });
    }

    return out.sort((a, b) => {
      const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
      const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
      return tb - ta;
    });
  }, [validGrades, i18n.language]);

  const focusQuest = useMemo(() => {
    const target = 65;
    // Only topics genuinely below the target belong in the quest. Picking the
    // "weakest" unconditionally surfaced already-mastered topics (e.g. average
    // 100) with a lower target, which read as "study worse to reach 65".
    const picked = [...topicHeatmap]
      .filter((t) => t.average < target)
      .sort((a, b) => a.average - b.average)
      .slice(0, 3);

    return picked.map((topic) => {
      const gap = Math.max(0, target - topic.average);
      const sessions = Math.max(1, Math.min(4, Math.ceil(gap / 10)));
      return {
        ...topic,
        target,
        sessions,
      };
    });
  }, [topicHeatmap]);

  const handleRetryTopic = async (topicId: number | null) => {
    if (topicId === null) return;
    setRetryingTopicId(topicId);
    try {
      await resetTopic(topicId);
      if (onNavigate) onNavigate("tasks");
      else navigate("/");
    } catch (err) {
      console.error("Failed to reset topic:", err);
    } finally {
      setRetryingTopicId(null);
    }
  };

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  const trendTone = stats.trend > 0 ? "text-accent-success" : stats.trend < 0 ? "text-accent-error" : "text-text-muted";

  return (
    <div className="h-full flex flex-col bg-bg-base overflow-y-auto">
      <PageHero
        eyebrowClassic="// grades"
        eyebrowAurora={tr("Успішність", "Performance")}
        title={tr("Журнал успішності", "Progress journal")}
        subtitle={tr("Твій прогрес, слабкі теми та квест на покращення — в одному місці.", "Your progress, weak topics and an improvement quest — all in one place.")}
        maxWidth="6xl"
        stats={[
          { value: <span className={gradeTone(stats.avg)}><CountUp value={stats.avg} decimals={1} /></span>, label: tr("середній", "avg") },
          { value: <CountUp value={stats.count} />, label: tr("оцінок", "grades") },
          { value: <span className={trendTone}>{stats.trend > 0 ? `+${stats.trend}` : stats.trend}</span>, label: tr("тренд", "trend") }
        ]}
      />

      <div className="px-4 md:px-8 pb-12 max-w-6xl mx-auto w-full space-y-8">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5">
            <div className="text-xs font-mono text-text-secondary">{tr("Оцінок", "Grades")}</div>
            <div className="mt-2 text-2xl font-mono font-semibold text-text-primary"><CountUp value={stats.count} /></div>
          </motion.div>
          <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5">
            <div className="text-xs font-mono text-text-secondary">{tr("Середній бал", "Average")}</div>
            <div className={`mt-2 text-2xl font-mono font-semibold ${gradeTone(stats.avg)}`}><CountUp value={stats.avg} decimals={1} /></div>
            <div className="mt-2.5"><ScoreBar value={stats.avg} tone={gradeFillTone(stats.avg)} /></div>
          </motion.div>
          <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5">
            <div className="flex items-center gap-1.5 text-xs font-mono text-text-secondary">
              <Target className="w-3.5 h-3.5 text-accent-success" />
              {tr("Успішно (≥50)", "Passed (≥50)")}
            </div>
            <div className="mt-2 text-2xl font-mono font-semibold text-accent-success"><CountUp value={stats.passed} /></div>
          </motion.div>
          <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5">
            <div className="flex items-center gap-1.5 text-xs font-mono text-text-secondary">
              <Flame className="w-3.5 h-3.5 text-primary" />
              {tr("Відмінно (≥85)", "Excellent (≥85)")}
            </div>
            <div className="mt-2 text-2xl font-mono font-semibold text-primary"><CountUp value={stats.excellent} /></div>
          </motion.div>
        </motion.div>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-mono uppercase tracking-[0.08em] text-text-muted">
            <AlertTriangle className="w-4 h-4 text-accent-warn" />
            {tr("Теми, які варто повторити", "Topics worth retrying")}
          </div>

          {topicsWithLowAverage.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface px-4 py-10 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div className="text-sm font-medium text-text-primary">{tr("Критичних тем не знайдено", "No critical topics found")}</div>
              <div className="text-xs text-text-secondary mt-1">
                {tr("Нижче доступний повний журнал оцінок.", "Full grade journal is available below.")}
              </div>
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.15 }} className="space-y-3">
              {topicsWithLowAverage.map((topic) => (
                <motion.div
                  key={`${topic.topicId ?? "single"}-${topic.topicTitle}`}
                  variants={fadeUpItem}
                  className="rounded-xl border border-border bg-bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-mono text-text-primary">{topic.topicTitle}</div>
                    <div className="text-xs text-text-secondary mt-1.5 flex items-center gap-2">
                      <Clock3 className="w-3.5 h-3.5" />
                      {tr("Спроб", "Attempts")}: {topic.gradeCount} · {tr("Середній", "Average")}: <span className={gradeTone(topic.average)}>{topic.average}</span>
                    </div>
                    <div className="mt-2.5 max-w-md"><ScoreBar value={topic.average} tone={gradeFillTone(topic.average)} /></div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => handleRetryTopic(topic.topicId)}
                    disabled={topic.topicId === null || retryingTopicId === topic.topicId}
                  >
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    {retryingTopicId === topic.topicId ? tr("Запуск...", "Starting...") : tr("Перепройти тему", "Retry topic")}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        <section className="space-y-4">
          <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Topic heatmap", "Topic heatmap")}</div>

          {topicHeatmap.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface text-center text-text-muted font-mono py-10">{tr("Ще немає даних для heatmap", "No data yet for heatmap")}</div>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.1 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topicHeatmap.map((topic) => {
                const Trend = topic.trend > 0 ? TrendingUp : topic.trend < 0 ? TrendingDown : Minus;
                return (
                  <motion.div
                    key={topic.key}
                    variants={fadeUpItem}
                    className={`rounded-xl border p-4 transition-fast hover:-translate-y-0.5 ${gradeHeatTone(topic.average)}`}
                  >
                    <div className="text-xs font-mono text-text-primary truncate">{topic.topicTitle}</div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className={`text-xl font-mono font-semibold ${gradeTone(topic.average)}`}>{topic.average}</span>
                      <span className="text-[11px] text-text-secondary">{tr("Спроб", "Attempts")}: {topic.attempts}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-[11px] font-mono">
                      <Trend className={`w-3.5 h-3.5 ${topic.trend > 0 ? "text-accent-success" : topic.trend < 0 ? "text-accent-error" : "text-text-muted"}`} />
                      <span className={topic.trend > 0 ? "text-accent-success" : topic.trend < 0 ? "text-accent-error" : "text-text-secondary"}>{topic.trend >= 0 ? `+${topic.trend}` : topic.trend}</span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </section>

        <section className="space-y-4">
          <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Focus Quest (3 теми)", "Focus Quest (3 topics)")}</div>
          <p className="text-xs text-text-secondary -mt-1">
            {tr(
              "Замість адаптивного retry-плану: короткий квест на 3 найслабші теми з ціллю вийти до ≥65.",
              "Instead of an adaptive retry plan: a short quest for your 3 weakest topics with a target to reach ≥65."
            )}
          </p>

          {focusQuest.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface text-center text-text-muted font-mono py-10">{tr("Квест поки не потрібен", "No quest needed right now")}</div>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.15 }} className="space-y-3">
              {focusQuest.map((topic) => (
                <motion.div
                  key={`quest-${topic.key}`}
                  variants={fadeUpItem}
                  className="rounded-xl border border-primary/30 bg-bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary shrink-0" />
                      <div className="text-sm font-mono text-text-primary truncate">{topic.topicTitle}</div>
                    </div>
                    <div className="text-xs text-text-secondary mt-1.5">
                      {tr("Поточний", "Current")}: <span className={gradeTone(topic.average)}>{topic.average}</span> → {tr("ціль", "target")}: {topic.target} · {tr("сесій", "sessions")}: ~{topic.sessions}
                    </div>
                    <div className="mt-2.5 max-w-md"><ScoreBar value={(topic.average / topic.target) * 100} tone="bg-primary" /></div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => handleRetryTopic(topic.topicId)}
                    disabled={topic.topicId === null || retryingTopicId === topic.topicId}
                  >
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    {retryingTopicId === topic.topicId ? tr("Запуск...", "Starting...") : tr("Старт теми", "Start topic")}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        <section className="space-y-4">
          <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Останні оцінки (згруповано за темами)", "Recent grades (grouped by topic)")}</div>

          {recentGrades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface text-center text-text-muted font-mono py-12">{tr("Немає оцінок", "No grades yet")}</div>
          ) : (
            <div className="space-y-4">
              {recentGradesByTopic.map((section) => (
                <div key={section.key} className="rounded-xl border border-border bg-bg-surface overflow-hidden">
                  <div className="px-4 py-3 bg-bg-hover/60 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-mono text-text-primary">{section.topicTitle}</div>
                    <div className="text-[11px] text-text-secondary">
                      {tr("Спроб", "Attempts")}: {section.rows.length} · {tr("Середній", "Average")}: <span className={gradeTone(section.avg)}>{section.avg}</span>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="min-w-[620px] md:min-w-[760px] w-full text-xs sm:text-sm font-mono">
                      <caption className="sr-only">
                        {tr("Спроби по темі та їхні оцінки", "Attempts by topic and their grades")}
                      </caption>
                      <thead className="bg-bg-surface/80">
                        <tr>
                          <th className="p-2.5 border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-text-muted">{tr("Дата", "Date")}</th>
                          <th className="p-2.5 border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-text-muted">{tr("Завдання", "Task")}</th>
                          <th className="p-2.5 border-b border-border text-center text-[11px] uppercase tracking-[0.06em] text-text-muted">{tr("Підсумок", "Total")}</th>
                          <th className="hidden md:table-cell p-2.5 border-b border-border text-center text-[11px] uppercase tracking-[0.06em] text-text-muted">W/O/I</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((grade) => (
                          <tr key={grade.id} className="odd:bg-bg-base even:bg-bg-surface/70 hover:bg-bg-hover transition-fast">
                            <td className="p-2.5 border-b border-border text-text-secondary">
                              {new Date(grade.createdAt).toLocaleString(locale, {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="p-2.5 border-b border-border text-text-primary">{grade.task.title}</td>
                            <td className={`p-2.5 border-b border-border text-center font-semibold ${gradeTone(Number(grade.total))}`}>
                              {grade.total}
                            </td>
                            <td className="hidden md:table-cell p-2.5 border-b border-border text-center text-text-secondary">
                              {grade.workScore}/{grade.optimizationScore}/{grade.integrityScore}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
