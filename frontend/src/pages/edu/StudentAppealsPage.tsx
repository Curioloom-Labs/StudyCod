import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { ArrowLeft, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { Button } from "../../components/ui/Button";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import {
  cancelMyGradeAppeal,
  createGradeAppeal,
  getMyGradeAppeal,
  getMyGradeAppeals,
  getMyStudentInfo,
  getStudentGrades,
  postMyGradeAppealMessage,
  type GradeAppealItem,
  type GradeAppealMessageItem,
  type GradeAppealReasonCode,
  type GradeAppealStatus,
  type GradeAppealTargetType,
  type StudentGradesResponse,
} from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

type AppealTargetOption = {
  value: string;
  targetType: GradeAppealTargetType;
  targetId: number;
  title: string;
  subtitle: string;
};

const REASON_CODES: GradeAppealReasonCode[] = [
  "CHECK_TEST_RESULTS",
  "CHECK_FEEDBACK",
  "CHECK_CALCULATION",
  "CHECK_THEMATIC",
  "OTHER",
];

const STATUS_ORDER: GradeAppealStatus[] = [
  "SUBMITTED",
  "IN_REVIEW",
  "NEEDS_INFO",
  "RESOLVED_ACCEPTED",
  "RESOLVED_PARTIAL",
  "RESOLVED_REJECTED",
  "CANCELLED",
];

export const StudentAppealsPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const isAurora = useUIMode().mode === "aurora";
  const [searchParams, setSearchParams] = useSearchParams();
  const tr = useCallback((uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk), [i18n.language]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [appeals, setAppeals] = useState<GradeAppealItem[]>([]);
  const [selectedAppealId, setSelectedAppealId] = useState<number | null>(null);
  const [selectedAppeal, setSelectedAppeal] = useState<GradeAppealItem | null>(null);
  const [messages, setMessages] = useState<GradeAppealMessageItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [targetOptions, setTargetOptions] = useState<AppealTargetOption[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTarget, setCreateTarget] = useState<string>("");
  const [createReasonCode, setCreateReasonCode] = useState<GradeAppealReasonCode>("CHECK_TEST_RESULTS");
  const [createReasonText, setCreateReasonText] = useState("");
  const [createDesiredOutcome, setCreateDesiredOutcome] = useState("");
  const [creating, setCreating] = useState(false);

  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const queryTargetType = useMemo(() => String(searchParams.get("targetType") || "").toUpperCase(), [searchParams]);
  const queryTargetId = useMemo(() => {
    const parsed = Number.parseInt(String(searchParams.get("targetId") || ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const queryOpenCreate = useMemo(() => searchParams.get("new") === "1", [searchParams]);
  const queryAppealId = useMemo(() => {
    const parsed = Number.parseInt(String(searchParams.get("appealId") || ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const selectedAppealStatusClass = useMemo(() => {
    const status = selectedAppeal?.status;
    if (!status) return "border-border text-text-muted";
    if (status === "RESOLVED_ACCEPTED") return "border-accent-success text-accent-success";
    if (status === "RESOLVED_PARTIAL") return "border-accent-warn text-accent-warn";
    if (status === "RESOLVED_REJECTED" || status === "CANCELLED") return "border-accent-error text-accent-error";
    if (status === "IN_REVIEW") return "border-primary text-primary";
    if (status === "NEEDS_INFO") return "border-accent-warning text-accent-warning";
    return "border-border text-text-secondary";
  }, [selectedAppeal?.status]);

  const formatAppealStatus = useCallback(
    (status: GradeAppealStatus): string => {
      switch (status) {
        case "SUBMITTED":
          return tr("Подано", "Submitted");
        case "IN_REVIEW":
          return tr("На розгляді", "In review");
        case "NEEDS_INFO":
          return tr("Потрібна відповідь", "Needs info");
        case "RESOLVED_ACCEPTED":
          return tr("Задоволено", "Accepted");
        case "RESOLVED_PARTIAL":
          return tr("Частково задоволено", "Partially accepted");
        case "RESOLVED_REJECTED":
          return tr("Відхилено", "Rejected");
        case "CANCELLED":
          return tr("Скасовано", "Cancelled");
        default:
          return status;
      }
    },
    [tr]
  );

  const formatReasonCode = useCallback(
    (code: GradeAppealReasonCode): string => {
      switch (code) {
        case "CHECK_TEST_RESULTS":
          return tr("Перевірка результатів тестів", "Check test results");
        case "CHECK_FEEDBACK":
          return tr("Перевірка фідбеку", "Check feedback");
        case "CHECK_CALCULATION":
          return tr("Перевірка розрахунку", "Check calculation");
        case "CHECK_THEMATIC":
          return tr("Перевірка тематичної/підсумкової", "Check thematic/summary grade");
        case "OTHER":
          return tr("Інше", "Other");
        default:
          return code;
      }
    },
    [tr]
  );

  const formatDateTime = useCallback(
    (raw: string | null | undefined): string => {
      if (!raw) return "—";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA");
    },
    [i18n.language]
  );

  const formatSlaDelta = useCallback((secondsRaw: number | null | undefined): string => {
    if (!Number.isFinite(Number(secondsRaw))) return tr("невідомо", "unknown");
    const seconds = Math.abs(Math.floor(Number(secondsRaw)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}${tr(" год", "h")} ${minutes}${tr(" хв", "m")}`;
    return `${Math.max(1, minutes)}${tr(" хв", "m")}`;
  }, [tr]);

  const getSlaBadge = useCallback((item: GradeAppealItem): { text: string; className: string } | null => {
    const state = item.slaState;
    if (!state || state === "CLOSED") return null;

    if (item.isEscalated || item.escalationLevel === "ESCALATED") {
      return {
        text: tr("Ескалація", "Escalated"),
        className: "border-accent-error text-accent-error"
      };
    }

    if (state === "OVERDUE") {
      return {
        text: tr("SLA прострочено", "SLA overdue"),
        className: "border-accent-error text-accent-error"
      };
    }

    if (state === "AT_RISK") {
      return {
        text: tr("SLA ризик", "SLA at risk"),
        className: "border-accent-warning text-accent-warning"
      };
    }

    return {
      text: tr("SLA в нормі", "SLA on track"),
      className: "border-accent-success text-accent-success"
    };
  }, [tr]);

  const getSlaHint = useCallback((item: GradeAppealItem): string | null => {
    const state = item.slaState;
    if (!state || state === "CLOSED" || item.slaRemainingSeconds == null) return null;

    const delta = formatSlaDelta(item.slaRemainingSeconds);
    if (state === "OVERDUE") {
      return tr(`Прострочено на ${delta}`, `Overdue by ${delta}`);
    }
    return tr(`До SLA: ${delta}`, `SLA due in ${delta}`);
  }, [formatSlaDelta, tr]);

  const buildTargetOptions = useCallback(
    (data: StudentGradesResponse): AppealTargetOption[] => {
      const gradeTargets: AppealTargetOption[] = (data.grades || [])
        .filter(g => Number.isFinite(Number(g.id)) && Number.isFinite(Number(g.total)))
        .map(g => {
          const title = g.task?.title || g.topicTask?.title || tr("Оцінка за завдання", "Task grade");
          const topic = g.topicTask?.topicTitle;
          return {
            value: `EDU_GRADE:${g.id}`,
            targetType: "EDU_GRADE" as const,
            targetId: g.id,
            title,
            subtitle: `${topic ? `${topic} • ` : ""}${tr("Оцінка", "Grade")}: ${g.total}/100`,
          };
        });

      const summaryTargets: AppealTargetOption[] = (data.summaryGrades || [])
        .filter(sg => Number.isFinite(Number(sg.id)) && Number.isFinite(Number(sg.grade)))
        .map(sg => {
          const title = sg.controlWorkTitle || sg.name || tr("Підсумкова оцінка", "Summary grade");
          const topic = sg.topicTitle;
          return {
            value: `SUMMARY_GRADE:${sg.id}`,
            targetType: "SUMMARY_GRADE" as const,
            targetId: sg.id,
            title,
            subtitle: `${topic ? `${topic} • ` : ""}${tr("Оцінка", "Grade")}: ${sg.grade}/100`,
          };
        });

      return [...gradeTargets, ...summaryTargets];
    },
    [tr]
  );

  const loadAppeals = useCallback(async () => {
    const list = await getMyGradeAppeals();
    const sorted = [...(list || [])].sort((a, b) => {
      const sa = STATUS_ORDER.indexOf(a.status);
      const sb = STATUS_ORDER.indexOf(b.status);
      const aPriority = sa >= 0 ? sa : 999;
      const bPriority = sb >= 0 ? sb : 999;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const at = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
      const bt = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    setAppeals(sorted);
    return sorted;
  }, []);

  const loadAppealDetail = useCallback(async (appealId: number) => {
    setLoadingDetail(true);
    try {
      const detail = await getMyGradeAppeal(appealId);
      setSelectedAppeal(detail.appeal);
      setMessages(detail.messages || []);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити апеляцію", "Failed to load appeal")) });
    } finally {
      setLoadingDetail(false);
    }
  }, [tr]);

  const loadData = useCallback(async () => {
    try {
      const me = await getMyStudentInfo();
      const studentId = me.student.id;

      const [appealsData, gradesData] = await Promise.all([loadAppeals(), getStudentGrades(studentId)]);
      const targets = buildTargetOptions(gradesData);
      setTargetOptions(targets);

      if (queryOpenCreate) {
        const fromQuery = targets.find(t => t.targetType === queryTargetType && t.targetId === queryTargetId);
        if (fromQuery) {
          setCreateTarget(fromQuery.value);
        } else if (targets.length > 0) {
          setCreateTarget(targets[0].value);
        }
        setShowCreateModal(true);
      } else if (targets.length > 0) {
        setCreateTarget(prev => prev || targets[0].value);
      }

      const initialId = queryAppealId ?? (appealsData[0]?.id ?? null);

      if (initialId) {
        setSelectedAppealId(initialId);
      } else {
        setSelectedAppealId(null);
        setSelectedAppeal(null);
        setMessages([]);
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити апеляції", "Failed to load appeals")) });
    }
  }, [buildTargetOptions, loadAppeals, queryOpenCreate, queryTargetId, queryTargetType, tr]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadData()
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!queryAppealId) return;
    if (queryAppealId === selectedAppealId) return;
    setSelectedAppealId(queryAppealId);
  }, [queryAppealId, selectedAppealId]);

  useEffect(() => {
    if (!selectedAppealId) return;
    if (queryAppealId !== selectedAppealId) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("appealId", String(selectedAppealId));
        return next;
      }, { replace: true });
    }
    void loadAppealDetail(selectedAppealId);
  }, [loadAppealDetail, queryAppealId, selectedAppealId, setSearchParams]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const latest = await loadAppeals();
      if (selectedAppealId) {
        const stillExists = latest.some(a => a.id === selectedAppealId);
        if (!stillExists) {
          setSelectedAppealId(latest[0]?.id ?? null);
        } else {
          await loadAppealDetail(selectedAppealId);
        }
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося оновити список", "Failed to refresh")) });
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateAppeal = async () => {
    const selectedTarget = targetOptions.find(t => t.value === createTarget);
    if (!selectedTarget) {
      showToast({ type: "error", message: tr("Оберіть оцінку для апеляції", "Select a grade for appeal") });
      return;
    }

    if (createReasonText.trim().length < 10) {
      showToast({ type: "error", message: tr("Опишіть проблему щонайменше у 10 символах", "Describe the issue with at least 10 characters") });
      return;
    }

    setCreating(true);
    try {
      const created = await createGradeAppeal({
        targetType: selectedTarget.targetType,
        targetId: selectedTarget.targetId,
        reasonCode: createReasonCode,
        reasonText: createReasonText.trim(),
        desiredOutcome: createDesiredOutcome.trim() || undefined,
      });

      setShowCreateModal(false);
      setCreateReasonText("");
      setCreateDesiredOutcome("");
      showToast({ type: "success", message: tr("Апеляцію створено", "Appeal created") });

      const latest = await loadAppeals();
      const createdId = created.appeal?.id;
      if (createdId && latest.some(a => a.id === createdId)) {
        setSelectedAppealId(createdId);
      } else {
        setSelectedAppealId(latest[0]?.id ?? null);
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося створити апеляцію", "Failed to create appeal")) });
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedAppeal || !selectedAppealId) return;
    if (!selectedAppeal.canStudentReply) {
      showToast({ type: "error", message: tr("Ця апеляція вже закрита", "This appeal is already closed") });
      return;
    }
    const text = messageText.trim();
    if (!text) return;

    setSendingMessage(true);
    try {
      await postMyGradeAppealMessage(selectedAppealId, text);
      setMessageText("");
      await Promise.all([loadAppeals(), loadAppealDetail(selectedAppealId)]);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося надіслати повідомлення", "Failed to send message")) });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCancelAppeal = async () => {
    if (!selectedAppeal || !selectedAppealId) return;
    if (!selectedAppeal.canStudentCancel) return;

    const confirmText = tr("Скасувати цю апеляцію?", "Cancel this appeal?");
    if (!window.confirm(confirmText)) return;

    setCancelling(true);
    try {
      await cancelMyGradeAppeal(selectedAppealId);
      showToast({ type: "success", message: tr("Апеляцію скасовано", "Appeal cancelled") });
      await Promise.all([loadAppeals(), loadAppealDetail(selectedAppealId)]);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося скасувати апеляцію", "Failed to cancel appeal")) });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <PageSkeleton variant="default" />;
  }

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.3 }}
        >
          <Button variant="ghost" onClick={() => navigate("/edu/lessons")} className="mb-3 -ml-1">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("До уроків", "Back to lessons")}
          </Button>
          <PageEyebrow label="appeals" />
          <div className="mt-2 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <MessageSquare className="w-5 h-5 text-primary shrink-0" />
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{tr("Мої апеляції", "My appeals")}</h1>
                <span className="font-mono text-2xl md:text-3xl text-text-primary tabular-nums">{appeals.length}</span>
              </div>
              <p className="mt-1.5 text-sm text-text-secondary">
                {tr("Звернення щодо перевірки оцінок та діалог із вчителем.", "Requests to review grades and the conversation with your teacher.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="ghost" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                {tr("Оновити", "Refresh")}
              </Button>
              <Button
                onClick={() => {
                  if (!createTarget && targetOptions[0]) setCreateTarget(targetOptions[0].value);
                  setShowCreateModal(true);
                }}
                disabled={targetOptions.length === 0}
              >
                <Plus className="w-4 h-4 mr-2" />
                {tr("Подати апеляцію", "Create appeal")}
              </Button>
            </div>
          </div>
        </motion.div>

        <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className={isAurora ? "lg:col-span-5 rounded-[var(--aurora-radius)] border border-border bg-bg-surface/40 overflow-hidden divide-y divide-border self-start" : "lg:col-span-5 space-y-3"}>
            {appeals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <div className="font-mono text-sm text-text-secondary">{tr("Поки немає апеляцій", "No appeals yet")}</div>
                <div className="text-xs mt-2 text-text-muted">{tr("Створіть апеляцію для перевірки оцінки", "Create an appeal to review a grade")}</div>
              </div>
            ) : (
              appeals.map(item => (
                <motion.div
                  key={item.id}
                  variants={fadeUpItem}
                  className={
                    isAurora
                      ? `group p-5 cursor-pointer transition-fast ${selectedAppealId === item.id ? "bg-primary/8 shadow-[inset_3px_0_0_0_var(--primary)]" : "hover:bg-bg-hover"}`
                      : `group rounded-xl border bg-bg-surface p-5 cursor-pointer transition-fast hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] ${selectedAppealId === item.id ? "border-primary/60" : "border-border hover:border-primary/40"}`
                  }
                  onClick={() => setSelectedAppealId(item.id)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-mono text-text-primary truncate"><span className="text-text-muted">#{item.id}</span> · {item.targetTitle}</div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-text-muted mt-1.5">{item.targetType === "SUMMARY_GRADE" ? tr("Підсумкова", "Summary") : tr("Завдання", "Task")}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-border text-text-secondary whitespace-nowrap">
                        {formatAppealStatus(item.status)}
                      </span>
                      {(() => {
                        const badge = getSlaBadge(item);
                        if (!badge) return null;
                        return <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.className}`}>{badge.text}</span>;
                      })()}
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary line-clamp-2">{item.reasonText}</div>
                  <div className="mt-3 text-[11px] text-text-muted font-mono">
                    {tr("Остання активність", "Last activity")}: {formatDateTime(item.lastMessageAt || item.createdAt)}
                  </div>
                  {getSlaHint(item) ? (
                    <div className="mt-1 text-[11px] text-text-muted font-mono">{getSlaHint(item)}</div>
                  ) : null}
                </motion.div>
              ))
            )}
          </motion.div>

          <div className="lg:col-span-7">
            {!selectedAppealId ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center text-text-secondary">
                <div className="font-mono text-sm">{tr("Оберіть апеляцію", "Select an appeal")}</div>
              </div>
            ) : loadingDetail ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center text-text-secondary font-mono text-sm">{tr("Завантаження деталей...", "Loading details...")}</div>
            ) : !selectedAppeal ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center text-text-secondary font-mono text-sm">{tr("Апеляцію не знайдено", "Appeal not found")}</div>
            ) : (
              <Card className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-mono text-text-primary"><span className="text-text-muted">#{selectedAppeal.id}</span> · {selectedAppeal.targetTitle}</h2>
                    <div className="text-xs text-text-muted mt-1 font-mono">{formatDateTime(selectedAppeal.createdAt)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${selectedAppealStatusClass}`}>{formatAppealStatus(selectedAppeal.status)}</span>
                    {(() => {
                      const badge = getSlaBadge(selectedAppeal);
                      if (!badge) return null;
                      return <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.className}`}>{badge.text}</span>;
                    })()}
                  </div>
                </div>

                {getSlaHint(selectedAppeal) ? (
                  <div className="text-xs text-text-muted font-mono">{getSlaHint(selectedAppeal)}</div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-border bg-bg-surface p-3">
                    <div className="text-text-muted mb-1 font-mono uppercase tracking-[0.06em] text-[11px]">{tr("Причина", "Reason")}</div>
                    <div className="text-text-primary font-mono">{formatReasonCode(selectedAppeal.reasonCode)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-surface p-3">
                    <div className="text-text-muted mb-1 font-mono uppercase tracking-[0.06em] text-[11px]">{tr("Оцінка", "Grade")}</div>
                    <div className="text-text-primary font-mono tabular-nums">
                      {selectedAppeal.previousGrade ?? "—"}
                      {selectedAppeal.gradeChanged && selectedAppeal.newGrade !== null ? ` → ${selectedAppeal.newGrade}` : ""}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Ваш опис", "Your description")}</div>
                  <div className="p-3 rounded-xl border border-border bg-bg-code text-sm whitespace-pre-wrap">{selectedAppeal.reasonText}</div>
                </div>

                {selectedAppeal.desiredOutcome ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">{tr("Бажаний результат", "Desired outcome")}</div>
                    <div className="p-3 rounded-xl border border-border bg-bg-code text-sm whitespace-pre-wrap">{selectedAppeal.desiredOutcome}</div>
                  </div>
                ) : null}

                {selectedAppeal.resolutionText ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-primary/80 font-mono uppercase tracking-[0.06em]">{tr("Рішення вчителя", "Teacher resolution")}</div>
                    <div className="p-3 rounded-xl border border-primary/40 bg-primary/5 text-sm whitespace-pre-wrap">{selectedAppeal.resolutionText}</div>
                  </div>
                ) : null}

                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-3 text-sm font-mono uppercase tracking-[0.08em] text-text-muted">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {tr("Діалог", "Conversation")}
                  </div>

                  <div className="max-h-[320px] overflow-y-auto rounded-xl border border-border p-3 space-y-2 bg-bg-code">
                    {messages.length === 0 ? (
                      <div className="text-xs text-text-muted font-mono">{tr("Поки немає повідомлень", "No messages yet")}</div>
                    ) : (
                      messages.map(msg => {
                        const isStudent = msg.senderType === "STUDENT";
                        const isSystem = msg.senderType === "SYSTEM";
                        return (
                          <div key={msg.id} className={`p-3 rounded-lg border text-xs ${isSystem ? "border-border bg-bg-surface/40 text-text-secondary" : isStudent ? "border-primary/40 bg-primary/5 text-text-primary" : "border-accent-warning/40 bg-accent-warning/5 text-text-primary"}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-mono">{msg.senderName || (isStudent ? tr("Учень", "Student") : isSystem ? tr("Система", "System") : tr("Вчитель", "Teacher"))}</span>
                              <span className="text-[10px] text-text-muted font-mono">{formatDateTime(msg.createdAt)}</span>
                            </div>
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedAppeal.canStudentReply ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={messageText}
                        onChange={e => setMessageText(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                        placeholder={tr("Напишіть уточнення або відповідь...", "Write a clarification or response...")}
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleSendMessage} disabled={sendingMessage || !messageText.trim()}>
                          {sendingMessage ? tr("Надсилання...", "Sending...") : tr("Надіслати", "Send")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {selectedAppeal.canStudentCancel ? (
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" onClick={handleCancelAppeal} disabled={cancelling} className="text-accent-error border border-accent-error hover:bg-bg-hover">
                      {cancelling ? tr("Скасування...", "Cancelling...") : tr("Скасувати апеляцію", "Cancel appeal")}
                    </Button>
                  </div>
                ) : null}
              </Card>
            )}
          </div>
        </div>
      </div>

      {showCreateModal ? (
        <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title={tr("Нова апеляція", "New appeal")} showCloseButton={false}>
          <div className="p-4 sm:p-6 space-y-4">
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Оцінка", "Grade")}</label>
              <select
                value={createTarget}
                onChange={e => setCreateTarget(e.target.value)}
                className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary"
              >
                {targetOptions.length === 0 ? (
                  <option value="">{tr("Немає доступних оцінок", "No available grades")}</option>
                ) : (
                  targetOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.title} — {opt.subtitle}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Тип звернення", "Reason type")}</label>
              <select
                value={createReasonCode}
                onChange={e => setCreateReasonCode(e.target.value as GradeAppealReasonCode)}
                className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary"
              >
                {REASON_CODES.map(code => (
                  <option key={code} value={code}>{formatReasonCode(code)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Що саме не так?", "What seems wrong?")} *</label>
              <textarea
                value={createReasonText}
                onChange={e => setCreateReasonText(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                placeholder={tr("Опишіть проблему детально: що перевірити, чому оцінка може бути некоректною.", "Describe the issue in detail: what to check and why the grade may be incorrect.")}
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Бажаний результат (необов'язково)", "Desired outcome (optional)")}</label>
              <textarea
                value={createDesiredOutcome}
                onChange={e => setCreateDesiredOutcome(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                placeholder={tr("Наприклад: переглянути hidden тести, пояснити критерії, повторно оцінити.", "For example: review hidden tests, explain rubric, re-evaluate score.")}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>{tr("Скасувати", "Cancel")}</Button>
              <Button onClick={handleCreateAppeal} disabled={creating || targetOptions.length === 0}>
                {creating ? tr("Створення...", "Creating...") : tr("Створити апеляцію", "Create appeal")}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

export default StudentAppealsPage;
