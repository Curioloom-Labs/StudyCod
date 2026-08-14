import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { listGrades } from "../../lib/api/grades";
import { getLearningCatalog, type CatalogCourse } from "../../lib/api/learningCatalog";
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
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDesignPreview) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getLearningCatalog()
      .then(async (catalog) => {
        if (cancelled) return;
        setCourses(Array.isArray(catalog) ? catalog : []);
        const ordered = (Array.isArray(catalog) ? catalog : []).map((course) => ({
          course,
          enrollment: course.variants
            .map((variant) => variant.enrollment)
            .filter(Boolean)
            .sort((left, right) => {
              const rank = (status: string) => status === "IN_PROGRESS" ? 0 : status === "COMPLETED" ? 1 : 2;
              return rank(left!.status) - rank(right!.status);
            })[0] ?? null,
        }));
        const current = ordered.find((entry) => entry.enrollment?.status === "IN_PROGRESS")
          ?? ordered.find((entry) => entry.enrollment?.status === "COMPLETED")
          ?? ordered.find((entry) => entry.enrollment);
        const courseId = current?.course.id ?? null;
        setSelectedCourseId(courseId);
        if (courseId == null) {
          setGrades([]);
          return;
        }
        const data = await listGrades(courseId);
        if (!cancelled) setGrades(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setCourses([]);
          setGrades([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isDesignPreview]);

  const selectCourse = async (value: string) => {
    const courseId = Number(value);
    if (!Number.isInteger(courseId) || courseId <= 0 || courseId === selectedCourseId) return;
    setSelectedCourseId(courseId);
    setLoading(true);
    try {
      const data = await listGrades(courseId);
      setGrades(Array.isArray(data) ? data : []);
    } catch {
      setGrades([]);
    } finally {
      setLoading(false);
    }
  };

  const courseOptions = useMemo(() => courses
    .map((course) => ({
      id: course.id,
      title: course.title,
      hasEnrollment: course.variants.some((variant) => Boolean(variant.enrollment)),
    }))
    .filter((course) => course.hasEnrollment), [courses]);

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

  return <div>
    {!isDesignPreview && <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-surface px-4 py-3 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Журнал курсу", "Course journal")}</p>
          <p className="mt-1 text-sm text-text-secondary">{tr("Тут показані оцінки лише обраного курсу.", "Only grades from the selected course are shown here.")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-text-primary">
          <span className="sr-only">{tr("Обрати курс", "Choose course")}</span>
          <select value={selectedCourseId ?? ""} onChange={(event) => void selectCourse(event.target.value)} className="max-w-[min(80vw,22rem)] rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-semibold text-text-primary outline-none focus:border-primary">
            {courseOptions.length === 0 && <option value="">{tr("Курси недоступні", "No courses available")}</option>}
            {courseOptions.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        </label>
      </div>
    </div>}
    {loading ? <PageSkeleton variant="table" /> : <PremiumProgress
      stats={stats}
      topics={topicHeatmap}
      recent={recentGrades}
      onRetry={handleRetryTopic}
    />}
  </div>;
};
