import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getClasses, createClass, type Class, getPendingReviews, updateGrade, gradeByRubric, aiReviewGrade, type PendingReview, type CodeReviewResult } from "../../lib/api/edu";
import { Plus, Users, CheckCircle, Clock, ArrowRight, AlertCircle, Building2, BookOpen, CalendarDays } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { CodeEditor } from "../../components/CodeEditor";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { DEFAULT_GRADING_SYSTEM, GRADING_SYSTEMS, gradingSystemLabel, normalizeGradingSystem, type ClassGradingSystem } from "../../lib/gradingSystems";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { AuroraList } from "../../components/ui/AuroraList";
import { PageHero } from "../../components/ui/PageHero";
import { CreateSchoolOnboarding } from "../../components/onboarding/CreateSchoolOnboarding";
import { api } from "../../lib/api/client";

const CountUp: React.FC<{ value: number }> = ({ value }) => {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: latest => setDisplay(Math.round(latest))
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{display}</>;
};

export const TeacherDashboardPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const ui = useUIMode();
  const isAurora = ui.mode === "aurora";
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [childrenCount, setChildrenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // null = still checking; false = teacher has no school yet → show onboarding.
  const [hasOrg, setHasOrg] = useState<boolean | null>(null);
  const [org, setOrg] = useState<{ orgId: number; name: string | null; role: string } | null>(null);
  const [orgTotals, setOrgTotals] = useState<{ classes: number; students: number; teachers: number } | null>(null);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassLanguage, setNewClassLanguage] = useState<"JAVA" | "PYTHON" | "CPP">("JAVA");
  const [newClassGradingSystem, setNewClassGradingSystem] = useState<ClassGradingSystem>(DEFAULT_GRADING_SYSTEM);
  const [showPendingReviews, setShowPendingReviews] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [reviewGrade, setReviewGrade] = useState<number>(1);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [aiReview, setAiReview] = useState<CodeReviewResult | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  useEffect(() => {
    // Reset the AI review whenever the open submission changes.
    setAiReview(null);
    setAiReviewLoading(false);
  }, [selectedReview?.gradeId]);
  const runAiReview = async () => {
    if (!selectedReview) return;
    setAiReviewLoading(true);
    try {
      const { review } = await aiReviewGrade(selectedReview.gradeId);
      setAiReview(review);
    } catch (error: unknown) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("AI-рев'ю зараз недоступне", "AI review is unavailable right now")) });
    } finally {
      setAiReviewLoading(false);
    }
  };
  const severityTone = (s: string) =>
    s === "error" ? "text-accent-error border-accent-error/40"
    : s === "warning" ? "text-accent-warning border-accent-warning/40"
    : s === "suggestion" ? "text-primary border-primary/40"
    : "text-text-secondary border-border";
  const parseClassLanguage = (value: string): "JAVA" | "PYTHON" | "CPP" | null => {
    if (value === "JAVA" || value === "PYTHON" || value === "CPP") return value;
    return null;
  };
  const parseClassGradingSystem = (value: string): ClassGradingSystem => normalizeGradingSystem(value);
  useEffect(() => {
    loadClasses();
    loadPendingReviews();
    // Parents land here too — surface a link to their children's progress.
    api.get("/edu/parent/children").then(({ data }) => setChildrenCount((data?.children ?? []).length)).catch(() => {});
    // Fail open: on error assume a school exists so we never block the dashboard.
    api.get("/edu/orgs").then(({ data }) => {
      const list: Array<{ orgId: number; name: string | null; role: string }> = data?.orgs ?? [];
      setHasOrg(list.length > 0);
      if (list.length > 0) {
        const first = list[0];
        setOrg(first);
        if (first.role === "ORG_ADMIN") {
          api.get(`/edu/orgs/${first.orgId}/overview`).then(({ data: ov }) => setOrgTotals(ov?.totals ?? null)).catch(() => {});
        }
      }
    }).catch(() => setHasOrg(true));
  }, []);
  const loadPendingReviews = async () => {
    try {
      const data = await getPendingReviews();
      setPendingReviews(Array.isArray(data?.pendingReviews) ? data.pendingReviews : []);
    } catch (error) {
      console.error("Failed to load pending reviews:", error);
    }
  };
  const loadClasses = async () => {
    try {
      const data = await getClasses();
      setClasses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load classes:", error);
    } finally {
      setLoading(false);
    }
  };
  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    try {
      const newClass = await createClass(newClassName, newClassLanguage, newClassGradingSystem);
      setClasses([...classes, newClass]);
      setShowCreateClass(false);
      setNewClassName("");
      setNewClassLanguage("JAVA");
      setNewClassGradingSystem(DEFAULT_GRADING_SYSTEM);
    } catch (error) {
      console.error("Failed to create class:", error);
      showToast({ type: "error", message: t('failedToCreateClass') });
    }
  };
  const reviewRubric = selectedReview?.task?.rubric ?? [];
  const hasRubric = reviewRubric.length > 0;
  const rubricMax = reviewRubric.reduce((s, c) => s + (Number(c.maxPoints) || 0), 0);
  const rubricRaw = reviewRubric.reduce((s, c) => s + Math.max(0, Math.min(Number(c.maxPoints) || 0, Number(rubricScores[c.id]) || 0)), 0);
  const rubricPercent = rubricMax > 0 ? Math.round((rubricRaw / rubricMax) * 100) : 0;

  const handleReviewGrade = async () => {
    if (!selectedReview) return;
    if (!hasRubric && (reviewGrade < 0 || reviewGrade > 100)) {
      showToast({ type: "error", message: t('gradeMustBe') });
      return;
    }
    setReviewing(true);
    try {
      if (hasRubric) {
        await gradeByRubric(selectedReview.gradeId, rubricScores, reviewFeedback || undefined);
      } else {
        await updateGrade(selectedReview.gradeId, {
          total: reviewGrade,
          feedback: reviewFeedback || undefined
        });
      }
      await loadPendingReviews();
      setSelectedReview(null);
      setReviewGrade(1);
      setReviewFeedback("");
      setRubricScores({});
      showToast({ type: "success", message: t('gradeSetSuccessfully') });
    } catch (error: unknown) {
      console.error("Failed to review grade:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, t('failedToSetGrade')) });
    } finally {
      setReviewing(false);
    }
  };
  if (loading || hasOrg === null) {
    return <PageSkeleton variant="cards" />;
  }
  if (hasOrg === false) {
    return <CreateSchoolOnboarding onCreated={() => { setHasOrg(true); loadClasses(); }} />;
  }
  const totalStudents = classes.reduce((s, c) => s + (c.studentsCount || 0), 0);

  return (
    <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// command center"
        eyebrowAurora={tr("Викладання", "Teaching")}
        title={t('myClasses')}
        subtitle={tr("Ваші класи, учні та черга перевірок — усе в одному місці.", "Your classes, students and review queue — all in one place.")}
        maxWidth="6xl"
        actions={<>
            {pendingReviews.length > 0 && <Button variant="ghost" onClick={() => setShowPendingReviews(true)} className="relative border-accent-error/40 text-accent-error hover:bg-accent-error/10">
                <Clock className="w-4 h-4 mr-2" />
                {t('reviewTasks')}
                <span className="ml-2 px-2 py-0.5 bg-accent-error text-bg-base text-xs rounded-full tabular-nums">
                  {pendingReviews.length}
                </span>
              </Button>}
            <Button onClick={() => setShowCreateClass(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('createClass')}
            </Button>
          </>}
        stats={[
          { value: <CountUp value={classes.length} />, label: t('myClasses') },
          { value: <CountUp value={totalStudents} />, label: t('students') },
          { value: <CountUp value={pendingReviews.length} />, label: tr("на перевірку", "pending"), tone: pendingReviews.length > 0 ? "error" : "default" }
        ]}
      />

      {childrenCount > 0 && (
        <div className="px-4 md:px-8 pt-6 max-w-6xl mx-auto">
          <button
            type="button"
            onClick={() => navigate("/edu/parent")}
            className="w-full rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-4 flex items-center gap-3 text-left transition-fast hover:border-primary/40 hover:bg-bg-hover focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-mono text-text-primary">{tr("Прогрес дітей", "Children's progress")}</div>
              <div className="text-[11px] font-mono text-text-muted">{childrenCount} {tr("дітей прив'язано", "children linked")}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      )}

      {org && (
        <div className="px-4 md:px-8 pt-6 max-w-6xl mx-auto">
          <div className="rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-mono text-text-primary truncate">{org.name || tr("Моя школа", "My school")}</div>
                <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-text-muted">
                  {org.role === "ORG_ADMIN" ? tr("Адміністратор", "Administrator") : org.role === "ASSISTANT" ? tr("Асистент", "Assistant") : tr("Викладач", "Teacher")}
                  {orgTotals ? ` · ${orgTotals.teachers} ${tr("вчителів", "teachers")}` : ""}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {org.role === "ORG_ADMIN" && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/edu/organization")}>
                  <Users className="w-3.5 h-3.5 mr-1.5" /> {tr("Учасники", "Members")}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/edu/courses")}>
                <BookOpen className="w-3.5 h-3.5 mr-1.5" /> {tr("Курси", "Courses")}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/edu/calendar")}>
                <CalendarDays className="w-3.5 h-3.5 mr-1.5" /> {tr("Календар", "Calendar")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-8">
        {/* Pending review queue (prioritized) */}
        {pendingReviews.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none">
                <AlertCircle className="w-3.5 h-3.5 text-accent-error" />
                {t('reviewTasks')}
                <span className="text-accent-error">· {pendingReviews.length}</span>
              </h2>
              <Button variant="ghost" className="text-xs" onClick={() => setShowPendingReviews(true)}>
                {tr("Відкрити чергу", "Open queue")}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
              {pendingReviews.slice(0, 4).map(review => (
                <motion.button
                  key={review.gradeId}
                  variants={fadeUpItem}
                  type="button"
                  onClick={() => { setShowPendingReviews(true); setSelectedReview(review); }}
                  className="w-full text-left rounded-xl border border-accent-error/30 bg-accent-error/5 p-4 flex items-center justify-between gap-3 transition-fast hover:-translate-y-0.5 hover:border-accent-error/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-mono text-text-primary truncate">{review.task?.title || tr("Завдання", "Task")}</div>
                    <div className="text-xs text-text-secondary mt-0.5 truncate">
                      {review.student.lastName} {review.student.firstName}
                      {review.student.middleName ? ` ${review.student.middleName}` : ""}
                      <span className="text-text-muted"> · {new Date(review.submittedAt).toLocaleDateString(isEn ? "en-US" : "uk-UA")}</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-accent-error shrink-0 flex items-center gap-1">
                    {tr("Перевірити", "Review")}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </motion.button>
              ))}
              {pendingReviews.length > 4 && (
                <button type="button" onClick={() => setShowPendingReviews(true)} className="w-full text-xs font-mono text-text-muted hover:text-text-primary py-2 transition-fast">
                  +{pendingReviews.length - 4} {tr("ще у черзі", "more in queue")}
                </button>
              )}
            </motion.div>
          </section>
        )}

        {/* Classes grid */}
        <section>
          <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">{t('myClasses')}</h2>
          {classes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <p className="text-text-secondary mb-4">{t('noClassesYet')}</p>
              <Button onClick={() => setShowCreateClass(true)}>{t('createFirstClass')}</Button>
            </div>
          ) : isAurora ? (
            <AuroraList>
              {classes.map(cls => (
                <motion.div
                  key={cls.id}
                  variants={fadeUpItem}
                  className="group flex items-center gap-4 px-5 py-4 transition-fast hover:bg-bg-hover"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/edu/classes/${cls.id}`)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none"
                  >
                    <div className="text-[15px] font-medium text-text-primary truncate group-hover:text-primary transition-fast">{cls.name}</div>
                    <div className="mt-0.5 text-[11px] font-mono text-text-muted truncate">
                      {cls.language} · {gradingSystemLabel(normalizeGradingSystem(cls.gradingSystem), !!isEn)} · {cls.studentsCount} {t('students')}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0 text-text-muted">
                    <ArrowRight className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 transition-fast" />
                  </div>
                </motion.div>
              ))}
            </AuroraList>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map(cls => (
                <motion.div
                  key={cls.id}
                  variants={fadeUpItem}
                  className="group rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] cursor-pointer"
                  onClick={() => navigate(`/edu/classes/${cls.id}`)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-lg font-mono text-text-primary min-w-0 truncate group-hover:text-primary transition-fast">{cls.name}</h3>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted px-2 py-0.5 rounded-full border border-border">
                        {cls.language}
                      </span>
                      <span className="text-[10px] text-text-muted px-2 py-0.5 rounded-full border border-border">
                        {gradingSystemLabel(normalizeGradingSystem(cls.gradingSystem), !!isEn)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-text-secondary font-mono">
                    <Users className="w-4 h-4 text-text-muted" />
                    <span className="tabular-nums">{cls.studentsCount}</span> {t('students')}
                  </div>
                  <div className="mt-4 flex gap-2 opacity-90 sm:opacity-70 sm:group-hover:opacity-100 transition-fast">
                    <Button variant="ghost" className="flex-1 text-xs" onClick={e => { e.stopPropagation(); navigate(`/edu/classes/${cls.id}`); }}>
                      {t('open')}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>
      </div>

      {showCreateClass && <Modal open={showCreateClass} onClose={() => setShowCreateClass(false)} title={t('createClass')} showCloseButton={false}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {t('className')}
              </label>
              <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={t('classNamePlaceholder')} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {t('programmingLanguage')}
              </label>
              <select value={newClassLanguage} onChange={e => {
              const language = parseClassLanguage(e.target.value);
              if (language) setNewClassLanguage(language);
            }} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary">
                <option value="JAVA">Java</option>
                <option value="PYTHON">Python</option>
                <option value="CPP">C++</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Система оцінювання", "Grading system")}
              </label>
              <select value={newClassGradingSystem} onChange={e => setNewClassGradingSystem(parseClassGradingSystem(e.target.value))} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary">
                {GRADING_SYSTEMS.map(system => <option key={system} value={system}>
                    {gradingSystemLabel(system, !!isEn)}
                  </option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="ghost" onClick={() => setShowCreateClass(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleCreateClass} disabled={!newClassName.trim()}>
                {t('create')}
              </Button>
            </div>
          </div>
        </Modal>}

      {}
      {showPendingReviews && <Modal open={showPendingReviews} onClose={() => {
      setShowPendingReviews(false);
      setSelectedReview(null);
    }} title={tr("Завдання на перевірку", "Tasks to review")}>
          <div className="max-w-6xl max-h-[80vh] overflow-y-auto">
            {pendingReviews.length === 0 ? <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-accent-success" />
                <p className="text-text-secondary">{tr("Немає завдань для перевірки", "No tasks to review")}</p>
              </div> : selectedReview ? <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-lg font-mono text-text-primary">
                    {selectedReview.task?.title || tr("Завдання", "Task")}
                  </h3>
                  <Button variant="ghost" onClick={() => {
              setSelectedReview(null);
              setReviewGrade(1);
              setReviewFeedback("");
            }}>
                    {tr("Назад до списку", "Back to list")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-text-secondary">{tr("Учень", "Student")}: </span>
                    <span className="text-sm font-mono text-text-primary">
                      {selectedReview.student.lastName} {selectedReview.student.firstName}
                      {selectedReview.student.middleName ? ` ${selectedReview.student.middleName}` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-text-secondary">{tr("Відправлено", "Submitted")}: </span>
                    <span className="text-sm text-text-secondary">
                      {new Date(selectedReview.submittedAt).toLocaleString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    {tr("Код учня", "Student code")}
                  </label>
                  <div className="border border-border">
                    <CodeEditor value={selectedReview.submittedCode || ""} onChange={() => {}} language="java" readOnly height="300px" />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-text-muted">{tr("AI-рев'ю коду — порядкові підказки.", "AI code review — line-level hints.")}</span>
                    <Button variant="ghost" className="text-xs" onClick={runAiReview} disabled={aiReviewLoading || !selectedReview.submittedCode}>
                      {aiReviewLoading ? tr("Аналіз...", "Analyzing...") : tr("AI-рев'ю", "AI review")}
                    </Button>
                  </div>
                  {aiReview && (
                    <div className="mt-2 rounded-lg border border-border bg-bg-surface p-3 space-y-2">
                      {aiReview.summary && <p className="text-sm text-text-primary">{aiReview.summary}</p>}
                      {aiReview.comments.length === 0 ? (
                        <p className="text-xs text-text-muted">{tr("Зауважень немає.", "No remarks.")}</p>
                      ) : (
                        <div className="space-y-1.5">
                          {aiReview.comments.map((c, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className={`shrink-0 font-mono px-1.5 py-0.5 rounded border ${severityTone(c.severity)}`}>
                                {c.line != null ? `L${c.line}` : c.severity}
                              </span>
                              <span className="text-text-secondary">{c.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {hasRubric ? (
                  <div>
                    <label className="block text-sm font-mono text-text-secondary mb-2">
                      {tr("Критерії оцінювання", "Rubric")}
                    </label>
                    <div className="space-y-2">
                      {reviewRubric.map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface p-2.5">
                          <span className="text-sm text-text-primary min-w-0 truncate">{c.label}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min={0}
                              max={c.maxPoints}
                              value={rubricScores[c.id] ?? 0}
                              onChange={e => {
                                const v = Math.max(0, Math.min(c.maxPoints, parseInt(e.target.value) || 0));
                                setRubricScores(s => ({ ...s, [c.id]: v }));
                              }}
                              className="w-20 px-2 py-1 bg-bg-base border border-border text-text-primary font-mono text-sm text-right focus:outline-none focus:border-primary"
                            />
                            <span className="text-xs font-mono text-text-muted tabular-nums">/ {c.maxPoints}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-right text-sm font-mono text-text-secondary tabular-nums">
                      {tr("Разом", "Total")}: <span className="text-primary">{rubricRaw}/{rubricMax}</span> · {rubricPercent}%
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-mono text-text-secondary mb-2">
                      {t('gradeLabel')}
                    </label>
                    <input type="number" min="1" max="100" value={reviewGrade} onChange={e => setReviewGrade(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    {t('commentOptional')}
                  </label>
                  <textarea value={reviewFeedback} onChange={e => setReviewFeedback(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[100px]" placeholder={tr("Введіть коментар до роботи...", "Enter feedback...")} />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => {
              setSelectedReview(null);
              setReviewGrade(1);
              setReviewFeedback("");
            }}>
                    {t('cancel')}
                  </Button>
                  <Button onClick={handleReviewGrade} disabled={reviewing}>
                    {reviewing ? tr("Збереження...", "Saving...") : tr("Виставити оцінку", "Set grade")}
                  </Button>
                </div>
              </div> : <div className="space-y-3">
                {pendingReviews.map(review => <Card key={review.gradeId} className="p-4 hover:bg-bg-hover hover:border-primary/40 transition-fast cursor-pointer" onClick={() => setSelectedReview(review)}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-mono text-text-primary mb-1">
                          {review.task?.title || tr("Завдання", "Task")}
                        </h3>
                        <div className="text-xs text-text-secondary">
                          <div>
                            {review.student.lastName} {review.student.firstName}
                            {review.student.middleName ? ` ${review.student.middleName}` : ""}
                          </div>
                          <div className="mt-1">
                            {new Date(review.submittedAt).toLocaleString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" className="text-xs">
                        {tr("Перевірити", "Review")}
                      </Button>
                    </div>
                  </Card>)}
              </div>}
          </div>
        </Modal>}
    </div>
  );
};
