import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BarChart3, Clock3, RefreshCcw } from "lucide-react";
import { listGrades } from "../lib/api/grades";
import { resetTopic } from "../lib/api/tasks";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { Grade } from "../types";
import { tr } from "../i18n";

interface TopicWithAverage {
  topicId: number | null;
  topicTitle: string;
  average: number;
  gradeCount: number;
  lastAt: string;
}

interface Props {
  onNavigate?: (page: "home" | "tasks") => void;
}

function gradeTone(value: number): string {
  if (value >= 10) return "text-accent-success";
  if (value >= 7) return "text-accent-warn";
  if (value >= 4) return "text-yellow-500";
  return "text-accent-error";
}

export const GradesPage: React.FC<Props> = ({ onNavigate }) => {
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
    const passed = validGrades.filter((g) => Number(g.total) >= 6).length;
    const excellent = validGrades.filter((g) => Number(g.total) >= 10).length;
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
      if (average < 6) {
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

  const handleRetryTopic = async (topicId: number | null) => {
    if (topicId === null) return;
    setRetryingTopicId(topicId);
    try {
      await resetTopic(topicId);
      if (onNavigate) onNavigate("tasks");
      else window.location.href = "/";
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
      <div className="border-b border-border bg-bg-surface p-4 flex items-center justify-between gap-3 flex-shrink-0">
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
              <div className="text-xs text-text-secondary">{tr("Успішно (≥6)", "Passed (≥6)")}</div>
              <div className="mt-1 text-2xl font-mono text-accent-success">{stats.passed}</div>
            </Card>
            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary">{tr("Відмінно (≥10)", "Excellent (≥10)")}</div>
              <div className="mt-1 text-2xl font-mono text-primary">{stats.excellent}</div>
            </Card>
          </div>

          <Card className="p-4 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
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
                  <div key={`${topic.topicId ?? "single"}-${topic.topicTitle}`} className="rounded-xl border border-border bg-bg-base/70 p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
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

          <Card className="p-4 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base overflow-hidden">
            <div className="text-sm font-mono text-text-primary mb-3">{tr("Останні оцінки", "Recent grades")}</div>

            {recentGrades.length === 0 ? (
              <div className="text-center text-text-muted font-mono py-8">{tr("Немає оцінок", "No grades yet")}</div>
            ) : (
              <div className="overflow-auto border border-border/70 rounded-xl">
                <table className="min-w-[920px] w-full text-sm font-mono">
                  <thead className="bg-bg-hover">
                    <tr>
                      <th className="p-2 border-b border-border text-left">{tr("Дата", "Date")}</th>
                      <th className="p-2 border-b border-border text-left">{tr("Тема", "Topic")}</th>
                      <th className="p-2 border-b border-border text-left">{tr("Завдання", "Task")}</th>
                      <th className="p-2 border-b border-border text-center">{tr("Підсумок", "Total")}</th>
                      <th className="p-2 border-b border-border text-center">W/O/I</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentGrades.map((grade) => (
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
                        <td className="p-2 border-b border-border text-text-primary">{grade.task.topic?.title ?? "—"}</td>
                        <td className="p-2 border-b border-border text-text-primary">{grade.task.title}</td>
                        <td className={`p-2 border-b border-border text-center font-semibold ${gradeTone(Number(grade.total))}`}>
                          {grade.total}
                        </td>
                        <td className="p-2 border-b border-border text-center text-text-secondary">
                          {grade.workScore}/{grade.optimizationScore}/{grade.integrityScore}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
