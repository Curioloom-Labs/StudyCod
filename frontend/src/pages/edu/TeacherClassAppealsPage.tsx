import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, MessageSquare, RefreshCw } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { Button } from "../../components/ui/Button";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import {
  getClass,
  getClassGradeAppeal,
  getClassGradeAppeals,
  postClassGradeAppealMessage,
  resolveClassGradeAppeal,
  updateClassGradeAppealStatus,
  type GradeAppealItem,
  type GradeAppealMessageItem,
  type GradeAppealStatus,
} from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

type FilterMode = "ACTIVE" | "ALL" | "RESOLVED";

const ACTIVE_STATUSES: GradeAppealStatus[] = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"];
const RESOLVED_STATUSES: GradeAppealStatus[] = ["RESOLVED_ACCEPTED", "RESOLVED_PARTIAL", "RESOLVED_REJECTED", "CANCELLED"];

export const TeacherClassAppealsPage: React.FC = () => {
  const { i18n } = useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const isAurora = useUIMode().mode === "aurora";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tr = useCallback((uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk), [i18n.language]);

  const classIdNum = Number.parseInt(String(classId || ""), 10);

  const [className, setClassName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [filterMode, setFilterMode] = useState<FilterMode>("ACTIVE");

  const [appeals, setAppeals] = useState<GradeAppealItem[]>([]);
  const [selectedAppealId, setSelectedAppealId] = useState<number | null>(null);
  const [selectedAppeal, setSelectedAppeal] = useState<GradeAppealItem | null>(null);
  const [messages, setMessages] = useState<GradeAppealMessageItem[]>([]);

  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [resolutionOutcome, setResolutionOutcome] = useState<"RESOLVED_ACCEPTED" | "RESOLVED_PARTIAL" | "RESOLVED_REJECTED">("RESOLVED_ACCEPTED");
  const [resolutionText, setResolutionText] = useState("");
  const [resolutionMessage, setResolutionMessage] = useState("");
  const [applyGradeChange, setApplyGradeChange] = useState(false);
  const [newGrade, setNewGrade] = useState<string>("");
  const [resolving, setResolving] = useState(false);

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

  const requestStatuses = useMemo(() => {
    if (filterMode === "ACTIVE") return ACTIVE_STATUSES;
    if (filterMode === "RESOLVED") return RESOLVED_STATUSES;
    return undefined;
  }, [filterMode]);

  const queryAppealId = useMemo(() => {
    const parsed = Number.parseInt(String(searchParams.get("appealId") || ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const loadAppeals = useCallback(async () => {
    if (!Number.isFinite(classIdNum) || classIdNum <= 0) return [] as GradeAppealItem[];
    const list = await getClassGradeAppeals(classIdNum, requestStatuses);
    const sorted = [...(list || [])].sort((a, b) => {
      const at = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
      const bt = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    setAppeals(sorted);
    return sorted;
  }, [classIdNum, requestStatuses]);

  const loadAppealDetail = useCallback(async (appealId: number) => {
    if (!Number.isFinite(classIdNum) || classIdNum <= 0) return;
    setLoadingDetail(true);
    try {
      const detail = await getClassGradeAppeal(classIdNum, appealId);
      setSelectedAppeal(detail.appeal);
      setMessages(detail.messages || []);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити деталі", "Failed to load details")) });
    } finally {
      setLoadingDetail(false);
    }
  }, [classIdNum, tr]);

  useEffect(() => {
    if (!Number.isFinite(classIdNum) || classIdNum <= 0) return;

    let mounted = true;
    setLoading(true);

    const run = async () => {
      try {
        const [cls, list] = await Promise.all([getClass(classIdNum), loadAppeals()]);
        if (!mounted) return;
        setClassName(cls?.name || "");

        const initialId = queryAppealId ?? (list[0]?.id ?? null);

        if (initialId) {
          setSelectedAppealId(initialId);
        } else {
          setSelectedAppealId(null);
          setSelectedAppeal(null);
          setMessages([]);
        }
      } catch (error: unknown) {
        showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити апеляції", "Failed to load appeals")) });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [classIdNum, loadAppeals, tr]);

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
      const list = await loadAppeals();
      if (selectedAppealId) {
        if (list.some(a => a.id === selectedAppealId)) {
          await loadAppealDetail(selectedAppealId);
        } else {
          setSelectedAppealId(list[0]?.id ?? null);
        }
      }
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося оновити", "Failed to refresh")) });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSetStatus = async (status: "IN_REVIEW" | "NEEDS_INFO") => {
    if (!selectedAppealId) return;
    setUpdatingStatus(true);
    try {
      await updateClassGradeAppealStatus(classIdNum, selectedAppealId, {
        status,
        message: statusMessage.trim() || undefined,
      });
      setStatusMessage("");
      showToast({ type: "success", message: tr("Статус оновлено", "Status updated") });
      await Promise.all([loadAppeals(), loadAppealDetail(selectedAppealId)]);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося оновити статус", "Failed to update status")) });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedAppealId || !selectedAppeal) return;
    if (!selectedAppeal.canTeacherReply) {
      showToast({ type: "error", message: tr("Апеляція вже закрита", "Appeal is already closed") });
      return;
    }
    const text = messageText.trim();
    if (!text) return;

    setSendingMessage(true);
    try {
      await postClassGradeAppealMessage(classIdNum, selectedAppealId, text);
      setMessageText("");
      await Promise.all([loadAppeals(), loadAppealDetail(selectedAppealId)]);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося надіслати повідомлення", "Failed to send message")) });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedAppealId || !selectedAppeal) return;
    if (!selectedAppeal.canTeacherResolve) {
      showToast({ type: "error", message: tr("Апеляція вже закрита", "Appeal is already closed") });
      return;
    }

    if (!resolutionText.trim()) {
      showToast({ type: "error", message: tr("Додайте текст рішення", "Add resolution text") });
      return;
    }

    const parsedGrade = Number.parseInt(newGrade.trim(), 10);
    if (applyGradeChange && (!Number.isFinite(parsedGrade) || parsedGrade < 0 || parsedGrade > 100)) {
      showToast({ type: "error", message: tr("Нова оцінка має бути від 0 до 100", "New grade must be from 0 to 100") });
      return;
    }

    setResolving(true);
    try {
      await resolveClassGradeAppeal(classIdNum, selectedAppealId, {
        outcome: resolutionOutcome,
        resolutionText: resolutionText.trim(),
        applyGradeChange,
        newGrade: applyGradeChange ? parsedGrade : undefined,
        message: resolutionMessage.trim() || undefined,
      });

      setResolutionText("");
      setResolutionMessage("");
      setApplyGradeChange(false);
      setNewGrade("");
      showToast({ type: "success", message: tr("Апеляцію завершено", "Appeal resolved") });
      await Promise.all([loadAppeals(), loadAppealDetail(selectedAppealId)]);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завершити апеляцію", "Failed to resolve appeal")) });
    } finally {
      setResolving(false);
    }
  };

  if (!Number.isFinite(classIdNum) || classIdNum <= 0) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">{tr("Некоректний classId", "Invalid classId")}</div>;
  }

  if (loading) {
    return <PageSkeleton variant="default" />;
  }

  const overdueCount = appeals.filter(a => a.isEscalated || a.escalationLevel === "ESCALATED" || a.slaState === "OVERDUE").length;

  return (
    <div className="min-h-full bg-bg-base">
      {/* Hero */}
      <div className="px-4 md:px-8 pt-8 pb-6 max-w-7xl mx-auto">
        <PageEyebrow label="appeals" />
        <div className="mt-2 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
              {tr("Апеляції класу", "Class appeals")}{className ? <span className="text-text-muted font-normal"> · {className}</span> : ""}
            </h1>
            <p className="mt-1.5 text-sm text-text-secondary">
              {tr("Черга апеляцій за оцінки — від пріоритетних до завершених.", "Grade appeals queue — from priority cases to resolved ones.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classIdNum}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("До класу", "Back to class")}
            </Button>
            <Button variant="ghost" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              {tr("Оновити", "Refresh")}
            </Button>
          </div>
        </div>

        {/* Inline key stats */}
        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl md:text-3xl text-text-primary tabular-nums">{appeals.length}</span>
            <span className="text-xs text-text-muted uppercase tracking-[0.08em] font-mono">{tr("У черзі", "In queue")}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-mono text-2xl md:text-3xl tabular-nums ${overdueCount > 0 ? "text-accent-error" : "text-text-primary"}`}>{overdueCount}</span>
            <span className="text-xs text-text-muted uppercase tracking-[0.08em] font-mono">{tr("Пріоритет", "Priority")}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant={filterMode === "ACTIVE" ? "primary" : "ghost"} onClick={() => setFilterMode("ACTIVE")}>{tr("Активні", "Active")}</Button>
          <Button variant={filterMode === "ALL" ? "primary" : "ghost"} onClick={() => setFilterMode("ALL")}>{tr("Усі", "All")}</Button>
          <Button variant={filterMode === "RESOLVED" ? "primary" : "ghost"} onClick={() => setFilterMode("RESOLVED")}>{tr("Завершені", "Resolved")}</Button>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      <div className="px-4 md:px-8 py-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className={isAurora ? "lg:col-span-5 rounded-[var(--aurora-radius)] border border-border bg-bg-surface/40 overflow-hidden divide-y divide-border self-start" : "lg:col-span-5 space-y-3"}>
            {appeals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <p className="font-mono text-sm text-text-secondary">{tr("Немає апеляцій", "No appeals")}</p>
              </div>
            ) : (
              appeals.map(item => {
                const priorityBadge = getSlaBadge(item);
                const isPriority = item.isEscalated || item.escalationLevel === "ESCALATED" || item.slaState === "OVERDUE";
                const isSelected = selectedAppealId === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={
                      isAurora
                        ? `w-full text-left p-4 cursor-pointer transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${isSelected ? "bg-primary/8 shadow-[inset_3px_0_0_0_var(--primary)]" : isPriority ? "bg-accent-error/5 shadow-[inset_3px_0_0_0_var(--accent-error)]" : "hover:bg-bg-hover"}`
                        : `w-full text-left rounded-xl border p-4 cursor-pointer transition-fast hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${isSelected ? "border-primary bg-primary/5 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]" : isPriority ? "border-accent-error/40 bg-accent-error/5 hover:border-accent-error/60" : "border-border bg-bg-surface hover:border-primary/40"}`
                    }
                    onClick={() => setSelectedAppealId(item.id)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="text-sm font-mono text-text-primary truncate">#{item.id} • {item.studentName}</div>
                        <div className="text-xs text-text-secondary mt-1 line-clamp-1">{item.targetTitle}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] font-mono px-2 py-1 rounded-full border border-border text-text-secondary whitespace-nowrap">{formatAppealStatus(item.status)}</span>
                        {priorityBadge ? <span className={`text-[10px] font-mono px-2 py-1 rounded-full border whitespace-nowrap ${priorityBadge.className}`}>{priorityBadge.text}</span> : null}
                      </div>
                    </div>
                    <div className="text-xs text-text-muted line-clamp-2">{item.reasonText}</div>
                    <div className="mt-2 text-[11px] text-text-muted">{formatDateTime(item.lastMessageAt || item.createdAt)}</div>
                    {getSlaHint(item) ? (
                      <div className="mt-1 text-[11px] text-text-muted">{getSlaHint(item)}</div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-7">
            {!selectedAppealId ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center text-text-secondary">{tr("Оберіть апеляцію", "Select an appeal")}</div>
            ) : loadingDetail ? (
              <div className="rounded-xl border border-border bg-bg-surface p-10 text-center text-text-secondary">{tr("Завантаження деталей...", "Loading details...")}</div>
            ) : !selectedAppeal ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center text-text-secondary">{tr("Апеляцію не знайдено", "Appeal not found")}</div>
            ) : (
              <div className="rounded-xl border border-border bg-bg-surface p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-mono text-text-primary">#{selectedAppeal.id} • {selectedAppeal.studentName}</h2>
                    <div className="text-xs text-text-muted mt-1">{selectedAppeal.targetTitle}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-1 border ${selectedAppealStatusClass}`}>{formatAppealStatus(selectedAppeal.status)}</span>
                    {(() => {
                      const badge = getSlaBadge(selectedAppeal);
                      if (!badge) return null;
                      return <span className={`text-[10px] px-2 py-1 border whitespace-nowrap ${badge.className}`}>{badge.text}</span>;
                    })()}
                  </div>
                </div>

                {getSlaHint(selectedAppeal) ? (
                  <div className="text-xs text-text-muted">{getSlaHint(selectedAppeal)}</div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-border bg-bg-base p-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted mb-1">{tr("Було", "Previous")}</div>
                    <div className="text-lg text-text-primary font-mono tabular-nums">{selectedAppeal.previousGrade ?? "—"}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-bg-base p-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted mb-1">{tr("Стало", "New")}</div>
                    <div className="text-lg text-text-primary font-mono tabular-nums">{selectedAppeal.newGrade ?? "—"}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-text-muted">{tr("Аргументація учня", "Student argument")}</div>
                  <div className="p-3 border border-border bg-bg-code text-sm whitespace-pre-wrap">{selectedAppeal.reasonText}</div>
                </div>

                {selectedAppeal.desiredOutcome ? (
                  <div className="space-y-2">
                    <div className="text-xs text-text-muted">{tr("Бажаний результат", "Desired outcome")}</div>
                    <div className="p-3 border border-border bg-bg-code text-sm whitespace-pre-wrap">{selectedAppeal.desiredOutcome}</div>
                  </div>
                ) : null}

                {selectedAppeal.resolutionText ? (
                  <div className="space-y-2">
                    <div className="text-xs text-text-muted">{tr("Підсумкове рішення", "Final resolution")}</div>
                    <div className="p-3 border border-primary/40 bg-bg-code text-sm whitespace-pre-wrap">{selectedAppeal.resolutionText}</div>
                  </div>
                ) : null}

                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-mono uppercase tracking-[0.08em] text-text-muted">
                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    {tr("Діалог", "Conversation")}
                  </div>

                  <div className="max-h-[280px] overflow-y-auto border border-border p-3 space-y-2 bg-bg-code">
                    {messages.length === 0 ? (
                      <div className="text-xs text-text-muted">{tr("Поки немає повідомлень", "No messages yet")}</div>
                    ) : (
                      messages.map(msg => {
                        const isStudent = msg.senderType === "STUDENT";
                        const isSystem = msg.senderType === "SYSTEM";
                        return (
                          <div key={msg.id} className={`p-2 border text-xs ${isSystem ? "border-border text-text-secondary" : isStudent ? "border-primary/40 text-text-primary" : "border-accent-warning/40 text-text-primary"}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-mono">{msg.senderName}</span>
                              <span className="text-[10px] text-text-muted">{formatDateTime(msg.createdAt)}</span>
                            </div>
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedAppeal.canTeacherReply ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={messageText}
                        onChange={e => setMessageText(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                        placeholder={tr("Відповідь учню...", "Reply to student...")}
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleSendMessage} disabled={sendingMessage || !messageText.trim()}>
                          {sendingMessage ? tr("Надсилання...", "Sending...") : tr("Надіслати", "Send")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {selectedAppeal.canTeacherResolve ? (
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                      {tr("Дії вчителя", "Teacher actions")}
                    </div>

                    <textarea
                      value={statusMessage}
                      onChange={e => setStatusMessage(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                      placeholder={tr("Коментар до зміни статусу (необов'язково)", "Status update comment (optional)")}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={() => handleSetStatus("IN_REVIEW")} disabled={updatingStatus}>{tr("Позначити: На розгляді", "Mark: In review")}</Button>
                      <Button variant="ghost" onClick={() => handleSetStatus("NEEDS_INFO")} disabled={updatingStatus}>{tr("Позначити: Потрібна відповідь", "Mark: Needs info")}</Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">{tr("Результат", "Outcome")}</label>
                        <select
                          value={resolutionOutcome}
                          onChange={e => setResolutionOutcome(e.target.value as "RESOLVED_ACCEPTED" | "RESOLVED_PARTIAL" | "RESOLVED_REJECTED")}
                          className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                        >
                          <option value="RESOLVED_ACCEPTED">{tr("Задоволено", "Accepted")}</option>
                          <option value="RESOLVED_PARTIAL">{tr("Частково задоволено", "Partially accepted")}</option>
                          <option value="RESOLVED_REJECTED">{tr("Відхилено", "Rejected")}</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={applyGradeChange}
                            onChange={e => setApplyGradeChange(e.target.checked)}
                            disabled={resolutionOutcome === "RESOLVED_REJECTED"}
                          />
                          {tr("Змінити оцінку", "Apply grade change")}
                        </label>
                        {applyGradeChange ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={newGrade}
                            onChange={e => setNewGrade(e.target.value)}
                            className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                            placeholder={tr("Нова оцінка (0-100)", "New grade (0-100)")}
                          />
                        ) : null}
                      </div>
                    </div>

                    <textarea
                      value={resolutionText}
                      onChange={e => setResolutionText(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                      placeholder={tr("Підсумкове обґрунтування рішення", "Final resolution explanation")}
                    />

                    <textarea
                      value={resolutionMessage}
                      onChange={e => setResolutionMessage(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
                      placeholder={tr("Додаткове повідомлення учню (необов'язково)", "Additional message to student (optional)")}
                    />

                    <div className="flex justify-end">
                      <Button onClick={handleResolve} disabled={resolving}>
                        {resolving ? tr("Збереження...", "Saving...") : tr("Завершити апеляцію", "Resolve appeal")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherClassAppealsPage;
