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
import { PremiumProgress } from "./PremiumPersonalExperience";

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
  const isDesignPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

  const [grades, setGrades] = useState<Grade[]>(() => isDesignPreview ? PREVIEW_GRADES : []);
  const [loading, setLoading] = useState(true);
  const [retryingTopicId, setRetryingTopicId] = useState<number | null>(null);

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

  return <PremiumProgress
    stats={stats}
    topics={topicHeatmap}
    recent={recentGrades}
    onRetry={handleRetryTopic}
  />;
};
