import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, Clock3, RefreshCcw } from "lucide-react";
import { listGrades } from "../../lib/api/grades";
import { resetTopic } from "../../lib/api/tasks";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import type { Grade } from "../../types";
import { tr } from "../../i18n";

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
    return { count, avg, passed, excellent };
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
    const sortedByWeakness = [...topicHeatmap].sort((a, b) => a.average - b.average);
    const weakest = sortedByWeakness.filter((t) => t.average < 65).slice(0, 3);
    const picked = weakest.length > 0 ? weakest : sortedByWeakness.slice(0, Math.min(3, sortedByWeakness.length));

    return picked.map((topic) => {
      const target = 65;
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
    return (
      <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Завантаження журналу...", "Loading journal...")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-base">
      <div className="border-b border-border bg-bg-surface p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-lg font-mono text-text-primary">
          <BarChart3 className="w-4 h-4 text-primary" />
          {tr("Журнал успішності", "Progress journal")}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary">{tr("Оцінок", "Grades")}</div>
              <div className="mt-1 text-2xl font-mono text-text-primary">{stats.count}</div>
            </Card>
            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary">{tr("Середній бал", "Average")}</div>
              <div className={`mt-1 text-2xl font-mono ${gradeTone(stats.avg)}`}>{stats.avg}</div>
            </Card>
            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary">{tr("Успішно (≥50)", "Passed (≥50)")}</div>
              <div className="mt-1 text-2xl font-mono text-accent-success">{stats.passed}</div>
            </Card>
            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary">{tr("Відмінно (≥85)", "Excellent (≥85)")}</div>
              <div className="mt-1 text-2xl font-mono text-primary">{stats.excellent}</div>
            </Card>
          </div>

          <Card className="p-4 border border-border/70 bg-bg-surface/80">
            <div className="flex items-center gap-2 text-sm font-mono text-text-primary mb-3">
              <AlertTriangle className="w-4 h-4 text-accent-warn" />
              {tr("Теми, які варто повторити", "Topics worth retrying")}
            </div>

            {topicsWithLowAverage.length === 0 ? (
              <div className="rounded-xl border border-border bg-bg-base/70 px-4 py-6 text-center">
                <div className="text-sm text-text-primary">{tr("Критичних тем не знайдено 🎉", "No critical topics found 🎉")}</div>
                <div className="text-xs text-text-secondary mt-1">
                  {tr("Нижче доступний повний журнал оцінок.", "Full grade journal is available below.")}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {topicsWithLowAverage.map((topic) => (
                  <div key={`${topic.topicId ?? "single"}-${topic.topicTitle}`} className="rounded-xl border border-border bg-bg-base/70 p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div>
                      <div className="text-sm font-mono text-text-primary">{topic.topicTitle}</div>
                      <div className="text-xs text-text-secondary mt-1 flex items-center gap-2">
                        <Clock3 className="w-3.5 h-3.5" />
                        {tr("Спроб", "Attempts")}: {topic.gradeCount} · {tr("Середній", "Average")}: <span className={gradeTone(topic.average)}>{topic.average}</span>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => handleRetryTopic(topic.topicId)}
                      disabled={topic.topicId === null || retryingTopicId === topic.topicId}
                    >
                      <RefreshCcw className="w-4 h-4 mr-2" />
                      {retryingTopicId === topic.topicId ? tr("Запуск...", "Starting...") : tr("Перепройти тему", "Retry topic")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 border border-border/70 bg-bg-surface/80">
            <div className="text-sm font-mono text-text-primary mb-3">{tr("Topic heatmap", "Topic heatmap")}</div>

            {topicHeatmap.length === 0 ? (
              <div className="text-center text-text-muted font-mono py-6">{tr("Ще немає даних для heatmap", "No data yet for heatmap")}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {topicHeatmap.map((topic) => (
                  <div key={topic.key} className={`rounded-xl border p-3 ${gradeHeatTone(topic.average)}`}>
                    <div className="text-xs font-mono text-text-primary truncate">{topic.topicTitle}</div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      {tr("Середній", "Average")}: <span className={gradeTone(topic.average)}>{topic.average}</span> · {tr("Спроб", "Attempts")}: {topic.attempts}
                    </div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      {tr("Тренд", "Trend")}: <span className={topic.trend > 0 ? "text-accent-success" : topic.trend < 0 ? "text-accent-error" : "text-text-secondary"}>{topic.trend >= 0 ? `+${topic.trend}` : topic.trend}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 border border-border/70 bg-bg-surface/80">
            <div className="text-sm font-mono text-text-primary mb-2">{tr("Focus Quest (3 теми)", "Focus Quest (3 topics)")}</div>
            <div className="text-xs text-text-secondary mb-3">
              {tr(
                "Замість адаптивного retry-плану: короткий квест на 3 найслабші теми з ціллю вийти до ≥65.",
                "Instead of an adaptive retry plan: a short quest for your 3 weakest topics with a target to reach ≥65."
              )}
            </div>

            {focusQuest.length === 0 ? (
              <div className="text-center text-text-muted font-mono py-6">{tr("Квест поки не потрібен 🙂", "No quest needed right now 🙂")}</div>
            ) : (
              <div className="space-y-2">
                {focusQuest.map((topic) => (
                  <div key={`quest-${topic.key}`} className="rounded-xl border border-border bg-bg-base/70 p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div>
                      <div className="text-sm font-mono text-text-primary">{topic.topicTitle}</div>
                      <div className="text-xs text-text-secondary mt-1">
                        {tr("Поточний", "Current")}: <span className={gradeTone(topic.average)}>{topic.average}</span> → {tr("ціль", "target")}: {topic.target} · {tr("сесій", "sessions")}: ~{topic.sessions}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => handleRetryTopic(topic.topicId)}
                      disabled={topic.topicId === null || retryingTopicId === topic.topicId}
                    >
                      <RefreshCcw className="w-4 h-4 mr-2" />
                      {retryingTopicId === topic.topicId ? tr("Запуск...", "Starting...") : tr("Старт теми", "Start topic")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 border border-border/70 bg-bg-surface/80 overflow-hidden">
            <div className="text-sm font-mono text-text-primary mb-3">{tr("Останні оцінки (згруповано за темами)", "Recent grades (grouped by topic)")}</div>

            {recentGrades.length === 0 ? (
              <div className="text-center text-text-muted font-mono py-8">{tr("Немає оцінок", "No grades yet")}</div>
            ) : (
              <div className="space-y-3">
                {recentGradesByTopic.map((section) => (
                  <div key={section.key} className="border border-border/70 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-bg-hover/70 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                            <th className="p-2 border-b border-border text-left">{tr("Дата", "Date")}</th>
                            <th className="p-2 border-b border-border text-left">{tr("Завдання", "Task")}</th>
                            <th className="p-2 border-b border-border text-center">{tr("Підсумок", "Total")}</th>
                            <th className="hidden md:table-cell p-2 border-b border-border text-center">W/O/I</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((grade) => (
                            <tr key={grade.id} className="odd:bg-bg-base even:bg-bg-surface/70">
                              <td className="p-2 border-b border-border text-text-secondary">
                                {new Date(grade.createdAt).toLocaleString(locale, {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="p-2 border-b border-border text-text-primary">{grade.task.title}</td>
                              <td className={`p-2 border-b border-border text-center font-semibold ${gradeTone(Number(grade.total))}`}>
                                {grade.total}
                              </td>
                              <td className="hidden md:table-cell p-2 border-b border-border text-center text-text-secondary">
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
          </Card>
        </div>
      </div>
    </div>
  );
};
