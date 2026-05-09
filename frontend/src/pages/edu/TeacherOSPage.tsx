import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Gauge,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  applyRiskInterventionPlan,
  getTeacherOSSnapshot,
  type CohortTopicInsight,
  type GradeAppealItem,
  type TeacherCopilotSuggestion,
  type TeacherOSAlert,
  type TeacherOSSnapshotResponse,
} from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

type RiskPlanDraft = {
  limitStudents: number;
  maxTasksPerStudent: number;
  deadlineDays: number;
  topicId: number;
};

const DEFAULT_PLAN_DRAFT: RiskPlanDraft = {
  limitStudents: 6,
  maxTasksPerStudent: 2,
  deadlineDays: 7,
  topicId: 0,
};

const clampInt = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
};

const parseIntSafe = (raw: string, fallback: number): number => {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const TeacherOSPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();

  const isEn = i18n.language?.toLowerCase().startsWith("en") ?? false;
  const tr = (uk: string, en: string) => (isEn ? en : uk);

  const classIdNum = Number.parseInt(String(classId || ""), 10);

  const [snapshot, setSnapshot] = useState<TeacherOSSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recalculatingPlan, setRecalculatingPlan] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [planDraft, setPlanDraft] = useState<RiskPlanDraft>(DEFAULT_PLAN_DRAFT);

  const buildRiskOptions = (): {
    limitStudents: number;
    maxTasksPerStudent: number;
    deadlineDays: number;
    topicId?: number;
  } => {
    const limitStudents = clampInt(planDraft.limitStudents, 1, 30);
    const maxTasksPerStudent = clampInt(planDraft.maxTasksPerStudent, 1, 5);
    const deadlineDays = clampInt(planDraft.deadlineDays, 0, 30);
    const topicId = clampInt(planDraft.topicId, 0, 1_000_000_000);
    return {
      limitStudents,
      maxTasksPerStudent,
      deadlineDays,
      ...(topicId > 0 ? { topicId } : {}),
    };
  };

  const loadSnapshot = async (mode: "initial" | "refresh" | "recalculate" = "initial") => {
    if (!Number.isFinite(classIdNum) || classIdNum <= 0) {
      setLoading(false);
      return;
    }

    if (mode === "initial") {
      setLoading(true);
    } else if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setRecalculatingPlan(true);
    }

    try {
      const data = await getTeacherOSSnapshot(classIdNum, {
        responseLanguage: isEn ? "en" : "uk",
        days: 14,
        ...buildRiskOptions(),
      });
      setSnapshot(data);
    } catch (error: unknown) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити Teacher OS", "Failed to load Teacher OS")),
      });
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else if (mode === "refresh") {
        setRefreshing(false);
      } else {
        setRecalculatingPlan(false);
      }
    }
  };

  useEffect(() => {
    void loadSnapshot("initial");
    // We intentionally reload only on class/language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIdNum, isEn]);

  const healthScore = useMemo(() => {
    if (!snapshot?.analytics) return null;

    const analytics = snapshot.analytics;
    const digest = snapshot.digest;
    const hints = snapshot.hints;

    let score = 10;
    score += analytics.overview.avgScore * 0.35;
    score += analytics.overview.completionRate * 100 * 0.25;
    score += analytics.overview.passRate * 100 * 0.25;
    score -= analytics.overview.riskStudentsCount * 2.5;

    if (digest) {
      score -= digest.appeals.overdueActive * 8;
      score -= digest.appeals.escalatedActive * 12;
    }

    if (hints && hints.totalFeedback > 0) {
      score += Math.max(-15, Math.min(15, hints.helpfulnessScore * 0.2));
    }

    return clampInt(Math.round(score), 0, 100);
  }, [snapshot]);

  const healthTone = useMemo(() => {
    if (healthScore == null) return "neutral" as const;
    if (healthScore < 45) return "critical" as const;
    if (healthScore < 70) return "warning" as const;
    return "stable" as const;
  }, [healthScore]);

  const healthToneClass =
    healthTone === "critical"
      ? "text-accent-error"
      : healthTone === "warning"
        ? "text-accent-warning"
        : healthTone === "stable"
          ? "text-accent-success"
          : "text-text-secondary";

  const sortedTopics = useMemo(() => {
    const topics = snapshot?.analytics?.topics || [];
    return [...topics].sort((a, b) => {
      const riskA = (100 - a.avgScore) + (1 - a.passRate) * 60 + (1 - a.completionRate) * 40 + a.weakTasks.length * 4;
      const riskB = (100 - b.avgScore) + (1 - b.passRate) * 60 + (1 - b.completionRate) * 40 + b.weakTasks.length * 4;
      return riskB - riskA;
    });
  }, [snapshot?.analytics?.topics]);

  const onApplyPlan = async () => {
    if (!Number.isFinite(classIdNum) || classIdNum <= 0) return;
    setApplyingPlan(true);
    try {
      const applied = await applyRiskInterventionPlan(classIdNum, {
        dryRun: false,
        ...buildRiskOptions(),
      });

      showToast({
        type: "success",
        message:
          applied.updatedTasks > 0
            ? tr("План втручання застосовано", "Intervention plan applied")
            : tr("Немає задач для застосування", "No tasks to apply"),
      });

      await loadSnapshot("refresh");
    } catch (error: unknown) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(error, tr("Не вдалося застосувати план", "Failed to apply intervention plan")),
      });
    } finally {
      setApplyingPlan(false);
    }
  };

  const alertClass = (alert: TeacherOSAlert): string => {
    if (alert.severity === "critical") {
      return "border-accent-error/40 bg-accent-error/10 text-accent-error";
    }
    if (alert.severity === "warning") {
      return "border-accent-warning/40 bg-accent-warning/10 text-accent-warning";
    }
    return "border-primary/40 bg-primary/10 text-primary";
  };

  const renderAlertIcon = (alert: TeacherOSAlert) => {
    if (alert.severity === "critical") return <ShieldAlert className="w-4 h-4" />;
    if (alert.severity === "warning") return <AlertTriangle className="w-4 h-4" />;
    return <Sparkles className="w-4 h-4" />;
  };

  const renderAppealSla = (appeal: GradeAppealItem): { label: string; className: string } => {
    if (appeal.isEscalated || appeal.escalationLevel === "ESCALATED") {
      return {
        label: tr("Ескалація", "Escalated"),
        className: "border-accent-error text-accent-error",
      };
    }
    if (appeal.slaState === "OVERDUE") {
      return {
        label: tr("Прострочено", "Overdue"),
        className: "border-accent-error text-accent-error",
      };
    }
    if (appeal.slaState === "AT_RISK") {
      return {
        label: tr("Ризик", "At risk"),
        className: "border-accent-warning text-accent-warning",
      };
    }
    return {
      label: tr("В нормі", "On track"),
      className: "border-accent-success text-accent-success",
    };
  };

  const renderTopicRisk = (topic: CohortTopicInsight): number => {
    const raw = (100 - topic.avgScore) + (1 - topic.passRate) * 55 + (1 - topic.completionRate) * 35 + topic.weakTasks.length * 4;
    return clampInt(Math.round(raw), 0, 100);
  };

  const renderCopilotPriorityClass = (priority: TeacherCopilotSuggestion["priority"]): string => {
    if (priority === "high") return "text-accent-error border-accent-error/40 bg-accent-error/10";
    if (priority === "medium") return "text-accent-warning border-accent-warning/40 bg-accent-warning/10";
    return "text-accent-success border-accent-success/40 bg-accent-success/10";
  };

  if (!Number.isFinite(classIdNum) || classIdNum <= 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Некоректний classId", "Invalid classId")}
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Завантаження Teacher OS...", "Loading Teacher OS...")}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classIdNum}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("До класу", "Back to class")}
            </Button>
            <h1 className="text-2xl font-mono text-text-primary">
              Teacher OS{snapshot?.className ? ` • ${snapshot.className}` : ""}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void loadSnapshot("refresh")} disabled={refreshing || recalculatingPlan || applyingPlan}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              {tr("Оновити", "Refresh")}
            </Button>
            <Button variant="ghost" onClick={() => void loadSnapshot("recalculate")} disabled={refreshing || recalculatingPlan || applyingPlan}>
              <Target className="w-4 h-4 mr-2" />
              {recalculatingPlan ? tr("Перерахунок...", "Recomputing...") : tr("Перерахувати план", "Recompute plan")}
            </Button>
            <Button onClick={onApplyPlan} disabled={refreshing || recalculatingPlan || applyingPlan || !snapshot?.riskPlan || snapshot.riskPlan.tasksSelected.length === 0 || snapshot.riskPlan.studentsTargeted.length === 0}>
              {applyingPlan ? tr("Застосовую...", "Applying...") : tr("Застосувати план", "Apply plan")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <Card className="p-3 col-span-2">
            <div className="text-[11px] text-text-muted">{tr("Індекс здоров'я класу", "Class health index")}</div>
            <div className={`text-2xl font-mono mt-1 ${healthToneClass}`}>{healthScore ?? "—"}</div>
          </Card>

          <Card className="p-3">
            <div className="text-[11px] text-text-muted">{tr("Сер. бал", "Avg score")}</div>
            <div className="text-xl font-mono text-text-primary">{snapshot?.analytics ? Math.round(snapshot.analytics.overview.avgScore) : "—"}</div>
          </Card>

          <Card className="p-3">
            <div className="text-[11px] text-text-muted">Completion</div>
            <div className="text-xl font-mono text-text-primary">{snapshot?.analytics ? `${Math.round(snapshot.analytics.overview.completionRate * 100)}%` : "—"}</div>
          </Card>

          <Card className="p-3">
            <div className="text-[11px] text-text-muted">Pass rate</div>
            <div className="text-xl font-mono text-text-primary">{snapshot?.analytics ? `${Math.round(snapshot.analytics.overview.passRate * 100)}%` : "—"}</div>
          </Card>

          <Card className="p-3">
            <div className="text-[11px] text-text-muted">{tr("Активні апеляції", "Active appeals")}</div>
            <div className="text-xl font-mono text-accent-warning">{snapshot?.digest?.appeals.active ?? snapshot?.activeAppeals.length ?? "—"}</div>
          </Card>
        </div>

        <Card className="p-4">
          <div className="text-sm font-mono text-text-primary mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            {tr("Операційні сигнали", "Operational signals")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {(snapshot?.alerts || []).map(alert => (
              <div key={alert.id} className={`p-3 border ${alertClass(alert)}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-mono">
                    {renderAlertIcon(alert)}
                    <span>{alert.title}</span>
                  </div>
                  {alert.metric ? <span className="text-xs font-mono">{alert.metric}</span> : null}
                </div>
                <div className="text-xs opacity-90">{alert.description}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-mono text-text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  {tr("Місії Teacher Copilot", "Teacher Copilot missions")}
                </div>
                <span className="text-[11px] text-text-muted">{snapshot?.copilot?.generatedBy || "rule-based"}</span>
              </div>

              {!snapshot?.copilot || snapshot.copilot.suggestions.length === 0 ? (
                <div className="text-sm text-text-secondary">{tr("Поради поки недоступні", "Recommendations are not available yet")}</div>
              ) : (
                <div className="space-y-2">
                  {snapshot.copilot.suggestions.slice(0, 6).map(suggestion => (
                    <div key={suggestion.id} className="p-3 border border-border bg-bg-surface">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-mono text-text-primary">{suggestion.title}</div>
                          <div className="text-xs text-text-secondary mt-1">{suggestion.rationale}</div>
                        </div>
                        <span className={`text-[10px] px-2 py-1 border ${renderCopilotPriorityClass(suggestion.priority)}`}>
                          {suggestion.priority.toUpperCase()}
                        </span>
                      </div>

                      <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-text-muted">
                        {suggestion.actions.map((action, idx) => (
                          <li key={`${suggestion.id}-${idx}`}>{action}</li>
                        ))}
                      </ul>

                      {suggestion.relatedTopicId ? (
                        <div className="mt-2">
                          <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/topics/${suggestion.relatedTopicId}`)}>
                            <BookOpen className="w-3 h-3 mr-1" />
                            {tr("Відкрити тему", "Open topic")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-mono text-text-primary flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  {tr("Теплова карта тем", "Topic heatmap")}
                </div>
                <span className="text-[11px] text-text-muted">
                  {tr("Сортування за ризиком", "Sorted by risk")}
                </span>
              </div>

              {sortedTopics.length === 0 ? (
                <div className="text-sm text-text-secondary">{tr("Немає даних по темах", "No topic data available")}</div>
              ) : (
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {sortedTopics.slice(0, 10).map(topic => {
                    const risk = renderTopicRisk(topic);
                    return (
                      <div key={topic.topicId} className="border border-border bg-bg-surface p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-mono text-text-primary">{topic.title}</div>
                            <div className="text-[11px] text-text-muted mt-1">
                              {tr("Сер. бал", "Avg score")}: {Math.round(topic.avgScore)} · Pass: {Math.round(topic.passRate * 100)}% · Completion: {Math.round(topic.completionRate * 100)}%
                            </div>
                          </div>
                          <span className={`text-[11px] px-2 py-1 border ${risk >= 65 ? "text-accent-error border-accent-error/40" : risk >= 40 ? "text-accent-warning border-accent-warning/40" : "text-accent-success border-accent-success/40"}`}>
                            RISK {risk}
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 w-full bg-bg-base border border-border overflow-hidden">
                          <div className={`h-full ${risk >= 65 ? "bg-accent-error" : risk >= 40 ? "bg-accent-warning" : "bg-accent-success"}`} style={{ width: `${risk}%` }} />
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-text-muted">{tr("Слабких задач", "Weak tasks")}: {topic.weakTasks.length}</span>
                          <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/topics/${topic.topicId}`)}>
                            {tr("Перейти", "Open")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-mono text-text-primary flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {tr("Черга апеляцій", "Appeals queue")}
                </div>
                <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/classes/${classIdNum}/appeals`)}>
                  {tr("Відкрити центр апеляцій", "Open appeals center")}
                </Button>
              </div>

              {(!snapshot?.activeAppeals || snapshot.activeAppeals.length === 0) ? (
                <div className="text-sm text-text-secondary">{tr("Немає активних апеляцій", "No active appeals")}</div>
              ) : (
                <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
                  {snapshot.activeAppeals.map(appeal => {
                    const sla = renderAppealSla(appeal);
                    return (
                      <div key={appeal.id} className="p-3 border border-border bg-bg-surface">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-mono text-text-primary">#{appeal.id} • {appeal.studentName}</div>
                            <div className="text-xs text-text-secondary mt-1">{appeal.targetTitle}</div>
                          </div>
                          <span className={`text-[10px] px-2 py-1 border ${sla.className}`}>{sla.label}</span>
                        </div>
                        <div className="text-xs text-text-muted mt-2 line-clamp-2">{appeal.reasonText}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <div className="text-sm font-mono text-text-primary flex items-center gap-2 mb-3">
                <CalendarClock className="w-4 h-4" />
                {tr("Orchestrator: план підтримки", "Orchestrator: support plan")}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">{tr("Учнів у фокусі", "Students targeted")}</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={planDraft.limitStudents}
                    onChange={e => setPlanDraft(prev => ({ ...prev, limitStudents: parseIntSafe(e.target.value, prev.limitStudents) }))}
                    className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">{tr("Задач на учня", "Tasks per student")}</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={planDraft.maxTasksPerStudent}
                    onChange={e => setPlanDraft(prev => ({ ...prev, maxTasksPerStudent: parseIntSafe(e.target.value, prev.maxTasksPerStudent) }))}
                    className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">{tr("Дедлайн, днів", "Deadline, days")}</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={planDraft.deadlineDays}
                    onChange={e => setPlanDraft(prev => ({ ...prev, deadlineDays: parseIntSafe(e.target.value, prev.deadlineDays) }))}
                    className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">{tr("Фокус-тема (необов'язково)", "Focus topic (optional)")}</label>
                  <select
                    value={planDraft.topicId}
                    onChange={e => setPlanDraft(prev => ({ ...prev, topicId: parseIntSafe(e.target.value, 0) }))}
                    className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                  >
                    <option value={0}>{tr("Усі теми", "All topics")}</option>
                    {(snapshot?.analytics?.topics || []).map(topic => (
                      <option key={topic.topicId} value={topic.topicId}>{topic.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 p-2 border border-border bg-bg-surface text-xs text-text-muted">
                {tr("Попередній перегляд", "Preview")}: {snapshot?.riskPlan?.studentsTargeted.length || 0} {tr("учнів", "students")}, {snapshot?.riskPlan?.tasksSelected.length || 0} {tr("задач", "tasks")}
              </div>

              {(snapshot?.riskPlan?.studentsTargeted?.length || 0) > 0 ? (
                <div className="mt-2 max-h-24 overflow-y-auto text-xs text-text-secondary space-y-1">
                  {snapshot?.riskPlan?.studentsTargeted.slice(0, 8).map(student => (
                    <div key={student.studentId}>• {student.studentName}</div>
                  ))}
                </div>
              ) : null}

              {(snapshot?.riskPlan?.tasksSelected?.length || 0) > 0 ? (
                <div className="mt-2 max-h-28 overflow-y-auto text-xs text-text-secondary space-y-1">
                  {snapshot?.riskPlan?.tasksSelected.map(task => (
                    <div key={task.taskId}>• {task.topicTitle}: {task.title}</div>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card className="p-4">
              <div className="text-sm font-mono text-text-primary flex items-center gap-2 mb-3">
                <Users className="w-4 h-4" />
                {tr("Risk radar", "Risk radar")}
              </div>

              {(!snapshot?.analytics?.riskStudents || snapshot.analytics.riskStudents.length === 0) ? (
                <div className="text-sm text-text-secondary">{tr("Ризиків не знайдено", "No risk students detected")}</div>
              ) : (
                <div className="space-y-2 max-h-[18rem] overflow-y-auto pr-1">
                  {snapshot.analytics.riskStudents.slice(0, 10).map(student => {
                    const riskIndex = clampInt(
                      Math.round((100 - student.avgScore) * 0.5 + (1 - student.completionRate) * 100 * 0.5 + student.weakTasks * 3),
                      0,
                      100
                    );
                    return (
                      <div key={student.studentId} className="p-3 border border-border bg-bg-surface">
                        <div className="text-xs font-mono text-text-primary">{student.studentName}</div>
                        <div className="text-[11px] text-text-muted mt-1">
                          {tr("Сер. бал", "Avg score")}: {Math.round(student.avgScore)} · Completion: {Math.round(student.completionRate * 100)}%
                        </div>
                        <div className="mt-2 h-1.5 w-full bg-bg-base border border-border overflow-hidden">
                          <div className={`h-full ${riskIndex >= 70 ? "bg-accent-error" : riskIndex >= 40 ? "bg-accent-warning" : "bg-accent-success"}`} style={{ width: `${riskIndex}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="text-sm font-mono text-text-primary flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4" />
                {tr("Якість підказок та дайджест", "Hints quality and digest")}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-text-muted">{tr("Відгуків", "Feedback")}</div>
                  <div className="text-sm font-mono text-text-primary">{snapshot?.hints?.totalFeedback ?? "—"}</div>
                </div>
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-text-muted">{tr("Helpful score", "Helpful score")}</div>
                  <div className="text-sm font-mono text-text-primary">{snapshot?.hints ? Math.round(snapshot.hints.helpfulnessScore) : "—"}</div>
                </div>
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-text-muted">{tr("Нові апеляції", "New appeals")}</div>
                  <div className="text-sm font-mono text-text-primary">{snapshot?.digest?.appeals.newInWindow ?? "—"}</div>
                </div>
                <div className="border border-border bg-bg-surface p-2">
                  <div className="text-text-muted">{tr("Сер. час (год)", "Avg resolution (h)")}</div>
                  <div className="text-sm font-mono text-text-primary">{snapshot?.digest ? Math.round(snapshot.digest.appeals.avgResolutionHours) : "—"}</div>
                </div>
              </div>

              {snapshot?.hints?.byVariant?.length ? (
                <div className="flex flex-wrap gap-2">
                  {snapshot.hints.byVariant.map(item => (
                    <span key={item.variant} className="text-[11px] px-2 py-1 border border-border text-text-muted">
                      Variant {item.variant}: {item.count} · {Math.round(item.positiveRate)}%
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherOSPage;
