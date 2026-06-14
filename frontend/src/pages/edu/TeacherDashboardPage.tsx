import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getClasses, createClass, type Class, getPendingReviews, updateGrade, type PendingReview } from "../../lib/api/edu";
import { Plus, Users, BookOpen, FileText, CheckCircle, Clock, MessageSquare, Gauge, ArrowRight, AlertCircle } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { CodeEditor } from "../../components/CodeEditor";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { DEFAULT_GRADING_SYSTEM, GRADING_SYSTEMS, gradingSystemLabel, normalizeGradingSystem, type ClassGradingSystem } from "../../lib/gradingSystems";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { AuroraList } from "../../components/ui/AuroraList";

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
  const [loading, setLoading] = useState(true);
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
  const parseClassLanguage = (value: string): "JAVA" | "PYTHON" | "CPP" | null => {
    if (value === "JAVA" || value === "PYTHON" || value === "CPP") return value;
    return null;
  };
  const parseClassGradingSystem = (value: string): ClassGradingSystem => normalizeGradingSystem(value);
  useEffect(() => {
    loadClasses();
    loadPendingReviews();
  }, []);
  const loadPendingReviews = async () => {
    try {
      const data = await getPendingReviews();
      setPendingReviews(data.pendingReviews);
    } catch (error) {
      console.error("Failed to load pending reviews:", error);
    }
  };
  const loadClasses = async () => {
    try {
      const data = await getClasses();
      setClasses(data);
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
  const handleReviewGrade = async () => {
    if (!selectedReview) return;
    if (reviewGrade < 0 || reviewGrade > 100) {
      showToast({ type: "error", message: t('gradeMustBe') });
      return;
    }
    setReviewing(true);
    try {
      await updateGrade(selectedReview.gradeId, {
        total: reviewGrade,
        feedback: reviewFeedback || undefined
      });
      await loadPendingReviews();
      setSelectedReview(null);
      setReviewGrade(1);
      setReviewFeedback("");
      showToast({ type: "success", message: t('gradeSetSuccessfully') });
    } catch (error: unknown) {
      console.error("Failed to review grade:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, t('failedToSetGrade')) });
    } finally {
      setReviewing(false);
    }
  };
  if (loading) {
    return <PageSkeleton variant="cards" />;
  }
  const totalStudents = classes.reduce((s, c) => s + (c.studentsCount || 0), 0);

  return <div className="min-h-full bg-bg-base">
      {/* Hero */}
      <div className={`px-4 md:px-8 max-w-6xl mx-auto ${isAurora ? "pt-10 md:pt-16 pb-8" : "pt-8 pb-6"}`}>
        {isAurora ? (
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted">{tr("Викладання", "Teaching")}</span>
        ) : (
          <span className="font-mono text-xs text-primary/70">// command center</span>
        )}
        <div className={`flex flex-col lg:flex-row lg:items-end justify-between gap-4 ${isAurora ? "mt-3" : "mt-2"}`}>
          <div className="min-w-0">
            <h1 className={isAurora ? "text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.05] text-text-primary" : "text-2xl md:text-3xl font-semibold tracking-tight text-text-primary"}>{t('myClasses')}</h1>
            <p className={isAurora ? "mt-3 text-sm md:text-base text-text-secondary" : "mt-1.5 text-sm text-text-secondary"}>
              {tr("Ваші класи, учні та черга перевірок — усе в одному місці.", "Your classes, students and review queue — all in one place.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="ghost" onClick={() => navigate("/edu/library")}>
              <BookOpen className="w-4 h-4 mr-2" />
              {tr("Бібліотека завдань", "Task library")}
            </Button>
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
          </div>
        </div>

        {/* Inline key stats */}
        <div className={`flex flex-wrap items-baseline ${isAurora ? "mt-8 gap-x-12 gap-y-4" : "mt-5 gap-x-8 gap-y-3"}`}>
          <div className={isAurora ? "flex flex-col gap-1" : "flex items-baseline gap-2"}>
            <span className={isAurora ? "text-5xl font-semibold tracking-[-0.02em] text-text-primary tabular-nums order-2" : "font-mono text-2xl md:text-3xl text-text-primary tabular-nums"}><CountUp value={classes.length} /></span>
            <span className={isAurora ? "text-[11px] text-text-muted uppercase tracking-[0.12em] font-mono order-1" : "text-xs text-text-muted uppercase tracking-[0.08em] font-mono"}>{t('myClasses')}</span>
          </div>
          <div className={isAurora ? "flex flex-col gap-1" : "flex items-baseline gap-2"}>
            <span className={isAurora ? "text-5xl font-semibold tracking-[-0.02em] text-text-primary tabular-nums order-2" : "font-mono text-2xl md:text-3xl text-text-primary tabular-nums"}><CountUp value={totalStudents} /></span>
            <span className={isAurora ? "text-[11px] text-text-muted uppercase tracking-[0.12em] font-mono order-1" : "text-xs text-text-muted uppercase tracking-[0.08em] font-mono"}>{t('students')}</span>
          </div>
          <div className={isAurora ? "flex flex-col gap-1" : "flex items-baseline gap-2"}>
            <span className={`tabular-nums ${isAurora ? "text-5xl font-semibold tracking-[-0.02em] order-2" : "font-mono text-2xl md:text-3xl"} ${pendingReviews.length > 0 ? "text-accent-error" : "text-text-primary"}`}><CountUp value={pendingReviews.length} /></span>
            <span className={isAurora ? "text-[11px] text-text-muted uppercase tracking-[0.12em] font-mono order-1" : "text-xs text-text-muted uppercase tracking-[0.08em] font-mono"}>{tr("На перевірку", "Pending")}</span>
          </div>
        </div>
      </div>

      {!isAurora ? <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" /> : null}

      <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-8">
        {/* Pending review queue (prioritized) */}
        {pendingReviews.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
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
                    <button type="button" title={tr("Апеляції", "Appeals")} aria-label={tr("Апеляції", "Appeals")} onClick={() => navigate(`/edu/classes/${cls.id}/appeals`)} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-bg-surface hover:text-text-primary transition-fast">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button type="button" title="Teacher OS" aria-label="Teacher OS" onClick={() => navigate(`/edu/classes/${cls.id}/teacher-os`)} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-bg-surface hover:text-text-primary transition-fast">
                      <Gauge className="w-4 h-4" />
                    </button>
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
                    <Button variant="ghost" className="flex-1 text-xs" onClick={e => { e.stopPropagation(); navigate(`/edu/classes/${cls.id}/appeals`); }}>
                      <MessageSquare className="w-3 h-3 mr-1" />
                      {tr("Апеляції", "Appeals")}
                    </Button>
                    <Button variant="ghost" className="flex-1 text-xs" onClick={e => { e.stopPropagation(); navigate(`/edu/classes/${cls.id}/teacher-os`); }}>
                      <Gauge className="w-3 h-3 mr-1" />
                      Teacher OS
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
                </div>

                <div>
                  <label className="block text-sm font-mono text-text-secondary mb-2">
                    {t('gradeLabel')}
                  </label>
                  <input type="number" min="1" max="100" value={reviewGrade} onChange={e => setReviewGrade(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
                </div>

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
    </div>;
};
