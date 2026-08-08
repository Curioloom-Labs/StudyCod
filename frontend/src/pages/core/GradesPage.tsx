import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { listGrades } from "../../lib/api/grades";
import { resetTopic } from "../../lib/api/tasks";
import type { Grade } from "../../types";
import { tr } from "../../i18n";
import { PremiumProgress } from "./PremiumPersonalExperience";

interface HeatTopicItem {
  key: string;
  topicId: number | null;
  topicTitle: string;
  average: number;
  attempts: number;
  trend: number;
  lastAt: string;
}

const PREVIEW_GRADES: Grade[] = [
  { id: -101, total: 92, workScore: 92, optimizationScore: 0, integrityScore: 100, aiFeedback: null, createdAt: "2026-07-09T10:00:00.000Z", task: { id: -11, title: "Функції з характером", descriptionMarkdown: "", starterCode: "", userCode: "", status: "GRADED", lessonInTopic: 2, repeatAttempt: 0, kind: "TOPIC", createdAt: "2026-07-09T10:00:00.000Z", topic: { id: 101, title: "Функції", orderIndex: 2, isIntro: false } } },
  { id: -102, total: 78, workScore: 78, optimizationScore: 0, integrityScore: 100, aiFeedback: null, createdAt: "2026-07-08T10:00:00.000Z", task: { id: -12, title: "Словник контактів", descriptionMarkdown: "", starterCode: "", userCode: "", status: "GRADED", lessonInTopic: 3, repeatAttempt: 0, kind: "TOPIC", createdAt: "2026-07-08T10:00:00.000Z", topic: { id: 102, title: "Колекції", orderIndex: 3, isIntro: false } } },
  { id: -103, total: 58, workScore: 58, optimizationScore: 0, integrityScore: 100, aiFeedback: null, createdAt: "2026-07-07T10:00:00.000Z", task: { id: -13, title: "Текстовий лічильник", descriptionMarkdown: "", starterCode: "", userCode: "", status: "GRADED", lessonInTopic: 2, repeatAttempt: 0, kind: "TOPIC", createdAt: "2026-07-07T10:00:00.000Z", topic: { id: 103, title: "Рядки", orderIndex: 4, isIntro: false } } },
  { id: -104, total: 85, workScore: 85, optimizationScore: 0, integrityScore: 100, aiFeedback: null, createdAt: "2026-07-06T10:00:00.000Z", task: { id: -14, title: "Фільтр даних", descriptionMarkdown: "", starterCode: "", userCode: "", status: "GRADED", lessonInTopic: 4, repeatAttempt: 0, kind: "TOPIC", createdAt: "2026-07-06T10:00:00.000Z", topic: { id: 102, title: "Колекції", orderIndex: 3, isIntro: false } } },
];

interface Props {
  onNavigate?: (page: "home" | "tasks") => void;
}

export const GradesPage: React.FC<Props> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isDesignPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

  const [grades, setGrades] = useState<Grade[]>(() => isDesignPreview ? PREVIEW_GRADES : []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listGrades()
      .then((data) => setGrades(Array.isArray(data) ? data : []))
      .catch(() => setGrades(isDesignPreview ? PREVIEW_GRADES : []))
      .finally(() => setLoading(false));
  }, [isDesignPreview]);

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


  const recentGrades = useMemo(() => {
    return [...validGrades]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }, [validGrades]);


  const topicHeatmap = useMemo(() => {
    const byTopic = new Map<string, { topicId: number | null; topicTitle: string; rows: Grade[] }>();

    for (const grade of validGrades) {
      const topicId = grade.task?.topic?.id ?? null;
      const topicTitle = grade.task?.topic?.title ?? tr("Без теми", "No topic");
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


  const handleRetryTopic = async (topicId: number | null) => {
    if (topicId === null) return;
    try {
      await resetTopic(topicId);
      if (onNavigate) onNavigate("tasks");
      else navigate("/");
    } catch (err) {
      console.error("Failed to reset topic:", err);
    } finally {
    }
  };

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  return <PremiumProgress
    stats={stats}
    topics={topicHeatmap}
    recent={recentGrades}
    onRetry={handleRetryTopic}
  />;
};
