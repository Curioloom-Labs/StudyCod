import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { listGrades } from "../lib/api/grades";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { Grade } from "../types";
import { resetTopic } from "../lib/api/tasks";
import { tr } from "../i18n";
interface TopicWithAverage {
  topicId: number | null;
  topicTitle: string;
  average: number;
  gradeCount: number;
}
interface Props {
  onNavigate?: (page: "home" | "tasks") => void;
}
export const GradesPage: React.FC<Props> = ({
  onNavigate
}) => {
  const {
    i18n
  } = useTranslation();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listGrades().then(setGrades).catch(() => undefined).finally(() => setLoading(false));
  }, []);
  const [showAllGrades, setShowAllGrades] = useState(false);
  const topicsWithLowAverage = useMemo(() => {
    const topicMap = new Map<number | null, {
      title: string;
      grades: number[];
    }>();
    grades.forEach(grade => {
      if (grade.total === null || grade.total === undefined) return;
      const topicId = grade.task.topic?.id ?? null;
      const topicTitle = grade.task.topic?.title ?? grade.task.title;
      if (!topicMap.has(topicId)) {
        topicMap.set(topicId, {
          title: topicTitle,
          grades: []
        });
      }
      topicMap.get(topicId)!.grades.push(grade.total);
    });
    const result: TopicWithAverage[] = [];
    topicMap.forEach((data, topicId) => {
      const average = data.grades.reduce((sum, g) => sum + g, 0) / data.grades.length;
      if (average < 6) {
        result.push({
          topicId,
          topicTitle: data.title,
          average: Number(average.toFixed(2)),
          gradeCount: data.grades.length
        });
      }
    });
    return result.sort((a, b) => a.average - b.average);
  }, [grades]);
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Завантаження...", "Loading...")}
      </div>;
  }
  const handleRetryTopic = async (topicId: number | null) => {
    if (topicId === null) return;
    try {
      await resetTopic(topicId);
      if (onNavigate) {
        onNavigate("tasks");
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      console.error("Failed to reset topic:", err);
    }
  };
  return <div className="h-full flex flex-col bg-bg-base">
      {}
      <div className="border-b border-border bg-bg-surface p-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-mono text-text-primary">
          {showAllGrades ? tr("Всі оцінки", "All grades") : tr("Теми для повторення", "Topics to review")}
        </h1>
        <button onClick={() => setShowAllGrades(!showAllGrades)} className="text-xs font-mono text-text-secondary hover:text-text-primary transition-fast px-3 py-1 border border-border hover:bg-bg-hover">
          {showAllGrades ? tr("Показати тільки проблемні", "Show only problematic") : tr("Показати всі оцінки", "Show all grades")}
        </button>
      </div>

      {}
      <div className="flex-1 overflow-y-auto p-6">
        {showAllGrades ? <div className="max-w-4xl mx-auto">
            <div className="space-y-2">
              {grades.length === 0 ? <div className="text-center text-text-muted font-mono py-8">
                  {tr("Немає оцінок", "No grades yet")}
                </div> : grades.map(grade => <Card key={grade.id} className="p-4 border">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-mono text-text-primary mb-1">
                          {grade.task.title}
                        </div>
                        {grade.task.topic && <div className="text-xs font-mono text-text-muted mb-1">
                            {grade.task.topic.title}
                          </div>}
                        <div className="text-xs font-mono text-text-secondary">
                          {new Date(grade.createdAt).toLocaleDateString(i18n.language === "uk" ? "uk-UA" : "en-US", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-mono font-semibold ${grade.total >= 10 ? "text-accent-success font-bold" : grade.total >= 7 ? "text-accent-warn font-semibold" : grade.total >= 4 ? "text-yellow-500 font-semibold" : "text-accent-error font-semibold"}`}>
                          {grade.total}
                        </div>
                        <div className="text-xs font-mono text-text-muted">
                          {grade.workScore}/{grade.optimizationScore}/{grade.integrityScore}
                        </div>
                      </div>
                    </div>
                  </Card>)}
            </div>
          </div> : topicsWithLowAverage.length === 0 ? <div className="h-full flex items-center justify-center text-text-muted font-mono">
            <div className="text-lg">{tr("Всі теми завершено", "All topics completed")}</div>
          </div> : <div className="max-w-2xl mx-auto">
            <Card className="p-6 border">
              <div className="mb-4">
                <h2 className="text-lg font-mono text-text-primary mb-1">
                  {topicsWithLowAverage[0].topicTitle}
                </h2>
                <div className="text-xs font-mono text-text-muted">
                  {tr("Середня оцінка:", "Average grade:")}{" "}
                  <span className="text-accent-error">{topicsWithLowAverage[0].average}</span> / 12
                </div>
              </div>
              <Button variant="primary" onClick={() => handleRetryTopic(topicsWithLowAverage[0].topicId)} className="w-full">
                {tr("Перепройти тему", "Retry topic")}
              </Button>
            </Card>
          </div>}
      </div>
    </div>;
};