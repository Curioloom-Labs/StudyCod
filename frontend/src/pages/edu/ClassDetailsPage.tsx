import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { PageHero, type PageHeroStat } from "../../components/ui/PageHero";
import { AuroraList, AuroraRow } from "../../components/ui/AuroraList";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { Modal } from "../../components/ui/Modal";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import {
  getStudents,
  getLessons,
  getTopics,
  addStudents,
  exportStudents,
  importStudents,
  getClassAnnouncements,
  createClassAnnouncement,
  updateClassAnnouncement,
  deleteClassAnnouncement,
  getClass,
  updateClassGradingSystem,
  getClassCohortAnalytics,
  getTeacherCopilotRecommendations,
  getClassHintsQuality,
  getTeacherDigest,
  getRiskInterventionPlan,
  applyRiskInterventionPlan,
  type Student,
  type Lesson,
  type Topic,
  type StudentCredentials,
  type ClassAnnouncementDto,
  type ClassDetails,
  type CohortAnalyticsResponse,
  type TeacherCopilotResponse,
  type HintsQualityResponse,
  type TeacherDigestResponse,
  type RiskInterventionPlanResponse,
} from "../../lib/api/edu";
import { Users, BookOpen, Plus, Download, Upload, ArrowLeft, FileText, Settings, MessageSquare, Gauge, Video, BarChart3, Sparkles, Zap } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { tr } from "../../i18n";
import { MarkdownView } from "../../components/MarkdownView";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { ClassJoinCodeButton } from "../../components/ClassJoinCodeButton";
import { CourseUpdatesBanner } from "../../components/CourseUpdatesBanner";
import { DEFAULT_GRADING_SYSTEM, GRADING_SYSTEMS, gradingSystemLabel, normalizeGradingSystem, type ClassGradingSystem } from "../../lib/gradingSystems";

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

export const ClassDetailsPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const isAurora = useUIMode().mode === "aurora";
  const {
    classId
  } = useParams<{
    classId: string;
  }>();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddStudents, setShowAddStudents] = useState(false);
  const [newStudents, setNewStudents] = useState([{
    firstName: "",
    lastName: "",
    middleName: "",
    email: ""
  }]);
  const [credentials, setCredentials] = useState<StudentCredentials[]>([]);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [classInfo, setClassInfo] = useState<ClassDetails | null>(null);
  const [selectedGradingSystem, setSelectedGradingSystem] = useState<ClassGradingSystem>(DEFAULT_GRADING_SYSTEM);
  const [savingGradingSystem, setSavingGradingSystem] = useState(false);
  const [announcements, setAnnouncements] = useState<ClassAnnouncementDto[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementPinned, setAnnouncementPinned] = useState(false);
  const [cohortAnalytics, setCohortAnalytics] = useState<CohortAnalyticsResponse | null>(null);
  const [teacherCopilot, setTeacherCopilot] = useState<TeacherCopilotResponse | null>(null);
  const [hintsQuality, setHintsQuality] = useState<HintsQualityResponse | null>(null);
  const [teacherDigest, setTeacherDigest] = useState<TeacherDigestResponse | null>(null);
  const [riskInterventionPlan, setRiskInterventionPlan] = useState<RiskInterventionPlanResponse | null>(null);
  const [applyingRiskIntervention, setApplyingRiskIntervention] = useState(false);
  useEffect(() => {
    if (classId) {
      loadData();
    }
  }, [classId]);
  const loadData = async () => {
    if (!classId) return;
    try {
      const parsedClassId = parseInt(classId, 10);
      const language = isEn ? "en" : "uk";
      const [studentsData, lessonsData, topicsData, announcementsData, classData] = await Promise.all([
        getStudents(parsedClassId),
        getLessons(parsedClassId),
        getTopics(parsedClassId),
        getClassAnnouncements(parsedClassId),
        getClass(parsedClassId)
      ]);

      const [analyticsResult, copilotResult, hintsResult, digestResult, riskPlanResult] = await Promise.allSettled([
        getClassCohortAnalytics(parsedClassId, language),
        getTeacherCopilotRecommendations(parsedClassId, language),
        getClassHintsQuality(parsedClassId, {
          responseLanguage: language
        }),
        getTeacherDigest(parsedClassId, {
          responseLanguage: language
        }),
        getRiskInterventionPlan(parsedClassId, {
          responseLanguage: language
        })
      ]);

      setStudents(studentsData || []);
      setLessons(lessonsData || []);
      setTopics(topicsData || []);
      setAnnouncements(announcementsData.announcements || []);
      setClassInfo(classData);
      setSelectedGradingSystem(normalizeGradingSystem(classData.gradingSystem));
      setCohortAnalytics(analyticsResult.status === "fulfilled" ? analyticsResult.value : null);
      setTeacherCopilot(copilotResult.status === "fulfilled" ? copilotResult.value : null);
      setHintsQuality(hintsResult.status === "fulfilled" ? hintsResult.value : null);
      setTeacherDigest(digestResult.status === "fulfilled" ? digestResult.value : null);
      setRiskInterventionPlan(riskPlanResult.status === "fulfilled" ? riskPlanResult.value : null);
    } catch (error: unknown) {
      console.error("Failed to load data:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, t('failedToLoadData')) });
      setStudents([]);
      setLessons([]);
      setTopics([]);
      setAnnouncements([]);
      setClassInfo(null);
      setCohortAnalytics(null);
      setTeacherCopilot(null);
      setHintsQuality(null);
      setTeacherDigest(null);
      setRiskInterventionPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRiskIntervention = async () => {
    if (!classId || applyingRiskIntervention) return;
    setApplyingRiskIntervention(true);
    try {
      const parsedClassId = parseInt(classId, 10);
      const applied = await applyRiskInterventionPlan(parsedClassId, {
        dryRun: false
      });
      setRiskInterventionPlan(applied);
      showToast({
        type: "success",
        message: applied.updatedTasks > 0
          ? tr("План підтримки застосовано", "Support plan applied")
          : tr("Немає задач для застосування", "No tasks to apply")
      });
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to apply risk intervention:", error);
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(error, tr("Не вдалося застосувати план підтримки", "Failed to apply support plan"))
      });
    } finally {
      setApplyingRiskIntervention(false);
    }
  };
  const handleSaveGradingSystem = async () => {
    if (!classId) return;
    setSavingGradingSystem(true);
    try {
      const updated = await updateClassGradingSystem(parseInt(classId, 10), selectedGradingSystem);
      setClassInfo(updated);
      setSelectedGradingSystem(normalizeGradingSystem(updated.gradingSystem));
      showToast({ type: "success", message: tr("Систему оцінювання оновлено", "Grading system updated") });
    } catch (error: unknown) {
      console.error("Failed to update grading system:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося оновити систему оцінювання", "Failed to update grading system")) });
    } finally {
      setSavingGradingSystem(false);
    }
  };
  const openCreateAnnouncement = () => {
    setEditingAnnouncementId(null);
    setAnnouncementTitle("");
    setAnnouncementContent("");
    setAnnouncementPinned(false);
    setShowAnnouncementModal(true);
  };
  const openEditAnnouncement = (a: ClassAnnouncementDto) => {
    setEditingAnnouncementId(a.id);
    setAnnouncementTitle(a.title || "");
    setAnnouncementContent(a.content);
    setAnnouncementPinned(!!a.pinned);
    setShowAnnouncementModal(true);
  };
  const saveAnnouncement = async () => {
    if (!classId) return;
    if (!announcementContent.trim()) {
      showToast({ type: "error", message: tr("Введіть текст оголошення", "Enter announcement text") });
      return;
    }
    try {
      if (editingAnnouncementId) {
        await updateClassAnnouncement(parseInt(classId, 10), editingAnnouncementId, {
          title: announcementTitle.trim() ? announcementTitle.trim() : null,
          content: announcementContent,
          pinned: announcementPinned
        });
      } else {
        await createClassAnnouncement(parseInt(classId, 10), {
          title: announcementTitle.trim() ? announcementTitle.trim() : null,
          content: announcementContent,
          pinned: announcementPinned
        });
      }
      setShowAnnouncementModal(false);
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to save announcement:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося зберегти оголошення", "Failed to save announcement")) });
    }
  };
  const removeAnnouncement = async (id: number) => {
    if (!classId) return;
    if (!confirm(tr("Видалити оголошення?", "Delete announcement?"))) return;
    try {
      await deleteClassAnnouncement(parseInt(classId, 10), id);
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to delete announcement:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося видалити оголошення", "Failed to delete announcement")) });
    }
  };
  const handleAddStudentRow = () => {
    setNewStudents([...newStudents, {
      firstName: "",
      lastName: "",
      middleName: "",
      email: ""
    }]);
  };
  const handleRemoveStudentRow = (index: number) => {
    setNewStudents(newStudents.filter((_, i) => i !== index));
  };
  const handleStudentChange = (index: number, field: string, value: string) => {
    const updated = [...newStudents];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setNewStudents(updated);
  };
  const handleSubmitStudents = async () => {
    if (!classId) return;
    const validStudents = newStudents.filter(s => s.firstName.trim() && s.lastName.trim() && s.email.trim());
    if (validStudents.length === 0) {
      showToast({ type: "error", message: t('addAtLeastOne') });
      return;
    }
    try {
      const result = await addStudents(parseInt(classId, 10), validStudents);
      setCredentials(result.credentials);
      setShowCredentials(true);
      setNewStudents([{
        firstName: "",
        lastName: "",
        middleName: "",
        email: ""
      }]);
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to add students:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, t('failedToAddStudents')) });
    }
  };
  const handleExport = async () => {
    if (!classId) return;
    try {
      const withPasswords = confirm(tr("Експортувати CSV з НОВИМИ паролями? Це скине паролі всім учням і покаже їх у файлі.", "Export CSV with NEW passwords? This will reset passwords for all students and include them in the file."));
      const blob = await exportStudents(parseInt(classId, 10), withPasswords);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `students_${classId}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export:", error);
      showToast({ type: "error", message: tr("Не вдалося експортувати", "Failed to export") });
    }
  };
  const handleImport = async () => {
    if (!classId || !importFile) {
      showToast({ type: "error", message: t('selectCSV') });
      return;
    }
    try {
      const text = await importFile.text();
      const result = await importStudents(parseInt(classId, 10), text);
      setCredentials(result.credentials);
      setShowCredentials(true);
      setShowImport(false);
      setImportFile(null);
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to import:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, t('failedToImport')) });
    }
  };

  const copilotPriorityBadgeClass = (priority: "high" | "medium" | "low"): string => {
    if (priority === "high") return "text-accent-error border-accent-error/40 bg-accent-error/10";
    if (priority === "medium") return "text-accent-warning border-accent-warning/40 bg-accent-warning/10";
    return "text-accent-success border-accent-success/40 bg-accent-success/10";
  };

  const copilotPriorityLabel = (priority: "high" | "medium" | "low"): string => {
    if (priority === "high") return tr("Високий", "High");
    if (priority === "medium") return tr("Середній", "Medium");
    return tr("Низький", "Low");
  };

  if (loading) {
    return <PageSkeleton variant="default" />;
  }
  return <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// class"
        eyebrowAurora={tr("Клас", "Class")}
        title={classInfo?.name || t('classDetails')}
        subtitle={tr("Учні, теми, оголошення та аналітика класу — усе в одному місці.", "Students, topics, announcements and analytics — all in one place.")}
        maxWidth="7xl"
        actions={<>
            <Button variant="ghost" onClick={() => navigate("/edu")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('toHome')}
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}/live`)}>
              <Video className="w-4 h-4 mr-2" />
              {tr("Живий урок", "Live lesson")}
            </Button>
            <Button onClick={() => navigate(`/edu/classes/${classId}/teacher-os`)}>
              <Gauge className="w-4 h-4 mr-2" />
              Teacher OS
            </Button>
          </>}
        stats={[
          { value: <CountUp value={students.length} />, label: t('students') },
          { value: <CountUp value={topics.length} />, label: t('topic') },
          { value: <CountUp value={lessons.length} />, label: tr("Уроки", "Lessons") },
          ...(cohortAnalytics ? [{
            value: <CountUp value={cohortAnalytics.overview.riskStudentsCount} />,
            label: tr("Учні ризику", "At-risk"),
            tone: (cohortAnalytics.overview.riskStudentsCount > 0 ? "warn" : "default") as PageHeroStat["tone"]
          }] : [])
        ]}
      />

      <div className="px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-8">
        {classId ? <CourseUpdatesBanner classId={classId} /> : null}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-primary" />
                {tr("Система оцінювання", "Grading system")}
              </h2>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-text-muted">
                {tr("Оберіть шкалу для цього класу. Можна змінювати будь-коли.", "Choose the scale for this class. You can change it anytime.")}
              </div>
              <select value={selectedGradingSystem} onChange={e => setSelectedGradingSystem(normalizeGradingSystem(e.target.value))} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary transition-fast">
                {GRADING_SYSTEMS.map(system => <option key={system} value={system}>
                    {gradingSystemLabel(system, !!isEn)}
                  </option>)}
              </select>
              <div className="text-[11px] text-text-secondary">
                {tr("Поточна:", "Current:")} {gradingSystemLabel(normalizeGradingSystem(classInfo?.gradingSystem || selectedGradingSystem), !!isEn)}
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveGradingSystem} disabled={savingGradingSystem}>
                  {savingGradingSystem ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                {tr("Аналітика класу", "Class analytics")}
              </h2>
              <Button variant="ghost" className="text-xs" onClick={loadData}>
                {tr("Оновити", "Refresh")}
              </Button>
            </div>

            {!cohortAnalytics ? <div className="text-sm text-text-secondary">
                {tr("Аналітика поки недоступна", "Analytics are not available yet")}
              </div> : <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-border bg-bg-base p-2.5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted">{tr("Сер. бал", "Avg score")}</div>
                    <div className="text-lg font-mono text-text-primary tabular-nums">{Math.round(cohortAnalytics.overview.avgScore)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-bg-base p-2.5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted">{tr("Completion", "Completion")}</div>
                    <div className="text-lg font-mono text-text-primary tabular-nums">{Math.round(cohortAnalytics.overview.completionRate * 100)}%</div>
                  </div>
                  <div className="rounded-lg border border-border bg-bg-base p-2.5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted">{tr("Pass rate", "Pass rate")}</div>
                    <div className="text-lg font-mono text-text-primary tabular-nums">{Math.round(cohortAnalytics.overview.passRate * 100)}%</div>
                  </div>
                  <div className="rounded-lg border border-border bg-bg-base p-2.5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted">{tr("Учні ризику", "At-risk")}</div>
                    <div className="text-lg font-mono text-accent-warning tabular-nums">{cohortAnalytics.overview.riskStudentsCount}</div>
                  </div>
                </div>

                {cohortAnalytics.commonErrorKinds.length > 0 && <div>
                    <div className="text-xs text-text-secondary mb-2">{tr("Часті помилки", "Frequent errors")}</div>
                    <div className="flex flex-wrap gap-1">
                      {cohortAnalytics.commonErrorKinds.slice(0, 6).map(item => <span key={item.kind} className="text-[10px] font-mono px-2 py-1 rounded-full border border-border text-text-muted">
                          {item.kind} · {item.count}
                        </span>)}
                    </div>
                  </div>}

                {cohortAnalytics.riskStudents.length > 0 && <div>
                    <div className="text-xs text-text-secondary mb-2">{tr("Кого підтримати в першу чергу", "Students to support first")}</div>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {cohortAnalytics.riskStudents.slice(0, 5).map(studentItem => <div key={studentItem.studentId} className="rounded-lg p-2.5 border border-border bg-bg-base">
                          <div className="text-xs font-mono text-text-primary">{studentItem.studentName}</div>
                          <div className="text-[11px] text-text-muted">
                            {tr("Сер. бал", "Avg score")}: {Math.round(studentItem.avgScore)} · {tr("Completion", "Completion")}: {Math.round(studentItem.completionRate * 100)}%
                          </div>
                        </div>)}
                    </div>
                  </div>}

                {cohortAnalytics.topics.length > 0 && <div>
                    <div className="text-xs text-text-secondary mb-2">{tr("Слабкі теми", "Weak topics")}</div>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {cohortAnalytics.topics
                    .filter(topic => topic.avgScore < 65 || topic.passRate < 0.6)
                    .slice(0, 4)
                    .map(topic => <div key={topic.topicId} className="rounded-lg p-2.5 border border-border bg-bg-base flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-mono text-text-primary">{topic.title}</div>
                              <div className="text-[11px] text-text-muted">
                                {tr("Сер. бал", "Avg")}: {Math.round(topic.avgScore)} · {tr("Pass", "Pass")}: {Math.round(topic.passRate * 100)}%
                              </div>
                            </div>
                            <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/topics/${topic.topicId}`)}>
                              {tr("Відкрити", "Open")}
                            </Button>
                          </div>)}
                    </div>
                  </div>}
              </div>}
          </div>

          <div className="rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {tr("Teacher Copilot", "Teacher Copilot")}
              </h2>
            </div>

            {!teacherCopilot || teacherCopilot.suggestions.length === 0 ? <div className="text-sm text-text-secondary">
                {tr("Поради поки недоступні", "Recommendations are not available yet")}
              </div> : <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {teacherCopilot.suggestions.map(item => <div key={item.id} className="rounded-lg p-3 border border-border bg-bg-base">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-sm font-mono text-text-primary">{item.title}</div>
                      <span className={`text-[10px] font-mono px-2 py-1 rounded-full border ${copilotPriorityBadgeClass(item.priority)}`}>
                        {copilotPriorityLabel(item.priority)}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary mb-2">{item.rationale}</div>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-text-muted">
                      {item.actions.map((action, idx) => <li key={`${item.id}-action-${idx}`}>{action}</li>)}
                    </ul>
                    {item.relatedTopicId && <div className="mt-2">
                        <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/topics/${item.relatedTopicId}`)}>
                          {tr("Перейти до теми", "Go to topic")}
                        </Button>
                      </div>}
                  </div>)}
              </div>}
          </div>

          <div className="rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                {tr("Інсайти та втручання", "Insights & interventions")}
              </h2>
            </div>

            <div className="space-y-4">
              {!teacherDigest ? <div className="text-sm text-text-secondary">
                  {tr("Дайджест поки недоступний", "Digest is not available yet")}
                </div> : <div className="rounded-lg p-3 border border-border bg-bg-base space-y-3">
                  <div className="text-xs text-text-secondary">{tr("Щотижневий дайджест", "Weekly digest")}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Активні апеляції", "Active appeals")}</div>
                      <div className="text-sm font-mono text-text-primary tabular-nums">{teacherDigest.appeals.active}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Прострочені", "Overdue")}</div>
                      <div className="text-sm font-mono text-accent-error tabular-nums">{teacherDigest.appeals.overdueActive}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Ескаловані", "Escalated")}</div>
                      <div className="text-sm font-mono text-accent-warning tabular-nums">{teacherDigest.appeals.escalatedActive}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Сер. час (год)", "Avg resolution (h)")}</div>
                      <div className="text-sm font-mono text-text-primary tabular-nums">{Math.round(teacherDigest.appeals.avgResolutionHours)}</div>
                    </div>
                  </div>
                </div>}

              {!hintsQuality ? <div className="text-sm text-text-secondary">
                  {tr("Якість підказок поки недоступна", "Hint quality is not available yet")}
                </div> : <div className="rounded-lg p-3 border border-border bg-bg-base space-y-3">
                  <div className="text-xs text-text-secondary">{tr("Якість підказок", "Hints quality")}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Відгуків", "Feedback")}</div>
                      <div className="text-sm font-mono text-text-primary tabular-nums">{hintsQuality.totalFeedback}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Позитивні", "Positive")}</div>
                      <div className="text-sm font-mono text-accent-success tabular-nums">{Math.round(hintsQuality.positiveRate)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Скор корисності", "Helpfulness")}</div>
                      <div className="text-sm font-mono text-text-primary tabular-nums">{Math.round(hintsQuality.helpfulnessScore)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-muted">{tr("Період", "Window")}</div>
                      <div className="text-sm font-mono text-text-primary tabular-nums">{hintsQuality.windowDays}d</div>
                    </div>
                  </div>
                  {hintsQuality.byVariant.length > 0 && <div className="flex flex-wrap gap-2">
                      {hintsQuality.byVariant.map(item => <span key={item.variant} className="text-[11px] font-mono px-2 py-1 rounded-full border border-border text-text-muted">
                          Variant {item.variant}: {item.count} · {Math.round(item.positiveRate)}%
                        </span>)}
                    </div>}
                </div>}

              <div className="rounded-lg p-3 border border-border bg-bg-base space-y-3">
                <div className="text-xs text-text-secondary">{tr("План втручання для учнів ризику", "Intervention plan for at-risk students")}</div>

                {!riskInterventionPlan ? <div className="text-sm text-text-secondary">
                    {tr("План поки недоступний", "Plan is not available yet")}
                  </div> : <>
                    <div className="text-[11px] text-text-muted">
                      {tr("Учнів у фокусі", "Students targeted")}: {riskInterventionPlan.studentsTargeted.length} · {tr("Задач", "Tasks")}: {riskInterventionPlan.tasksSelected.length}
                    </div>
                    {riskInterventionPlan.studentsTargeted.length > 0 && <div className="max-h-24 overflow-y-auto space-y-1">
                        {riskInterventionPlan.studentsTargeted.slice(0, 6).map(item => <div key={item.studentId} className="text-xs text-text-secondary">
                            • {item.studentName}
                          </div>)}
                      </div>}
                    {riskInterventionPlan.tasksSelected.length > 0 && <div className="max-h-28 overflow-y-auto space-y-1">
                        {riskInterventionPlan.tasksSelected.map(task => <div key={task.taskId} className="text-xs text-text-secondary">
                            • {task.topicTitle}: {task.title}
                          </div>)}
                      </div>}
                    <div className="flex justify-end">
                      <Button onClick={handleApplyRiskIntervention} disabled={applyingRiskIntervention || riskInterventionPlan.tasksSelected.length === 0 || riskInterventionPlan.studentsTargeted.length === 0}>
                        {applyingRiskIntervention
                          ? tr("Застосовую...", "Applying...")
                          : tr("Застосувати план", "Apply plan")}
                      </Button>
                    </div>
                  </>}
              </div>
            </div>
          </div>
        </div>

        {/* Students */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary" />
              {t('studentsCountLabel')}
              <span className="text-text-muted/70">· {students.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={handleExport} className="text-xs">
                <Download className="w-4 h-4 mr-1" />
                {t('export')}
              </Button>
              <Button variant="ghost" onClick={() => setShowImport(true)} className="text-xs">
                <Upload className="w-4 h-4 mr-1" />
                {t('import')}
              </Button>
              <Button onClick={() => setShowAddStudents(true)} className="text-xs">
                <Plus className="w-4 h-4 mr-1" />
                {t('add')}
              </Button>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <p className="text-text-secondary mb-4">{t('noStudents')}</p>
              <Button onClick={() => setShowAddStudents(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('add')}
              </Button>
            </div>
          ) : isAurora ? (
            <AuroraList>
              {students.map(student => (
                <AuroraRow
                  key={student.id}
                  title={`${student.lastName} ${student.firstName} ${student.middleName || ""}`.trim()}
                  meta={`${student.email} · @${student.generatedUsername}`}
                />
              ))}
            </AuroraList>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {students.map(student => <motion.div key={student.id} variants={fadeUpItem} className="rounded-xl p-4 border border-border bg-bg-surface transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                  <div className="text-sm font-mono text-text-primary">
                    {student.lastName} {student.firstName} {student.middleName || ""}
                  </div>
                  <div className="text-xs text-text-secondary mt-1 truncate">{student.email}</div>
                  <div className="text-xs text-text-muted font-mono">@{student.generatedUsername}</div>
                </motion.div>)}
            </motion.div>
          )}
        </section>

        {/* Announcements */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              {tr("Оголошення", "Announcements")}
              {announcements.length > 0 && <span className="text-text-muted/70">· {announcements.length}</span>}
            </h2>
            <Button onClick={openCreateAnnouncement} className="text-xs">
              <Plus className="w-4 h-4 mr-1" />
              {t("add")}
            </Button>
          </div>

          {announcements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-6 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-text-secondary">{tr("Поки немає оголошень", "No announcements yet")}</p>
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 md:grid-cols-2">
              {announcements.map(a => <motion.div key={a.id} variants={fadeUpItem} className="rounded-xl p-5 border border-border bg-bg-surface transition-fast hover:border-primary/40">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-text-primary">
                        {a.pinned && <span className="text-primary mr-1" aria-label="pinned">·</span>}{a.title || tr("Оголошення", "Announcement")}
                      </div>
                      <div className="text-[10px] text-text-muted mt-1">
                        {a.author?.name || tr("Вчитель", "Teacher")} • {new Date(a.createdAt).toLocaleString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button variant="ghost" className="text-xs" onClick={() => openEditAnnouncement(a)}>
                        {t("edit")}
                      </Button>
                      <Button variant="ghost" className="text-xs" onClick={() => removeAnnouncement(a.id)}>
                        {t("delete")}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-text-secondary">
                    <MarkdownView content={a.content} />
                  </div>
                </motion.div>)}
            </motion.div>
          )}
        </section>

        {/* Topics */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              {t('topicsCountLabel')}
              <span className="text-text-muted/70">· {topics.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}/gradebook`)} className="text-xs">
                <FileText className="w-4 h-4 mr-1" />
                {t('gradebook')}
              </Button>
              <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}/gradebook-config`)} className="text-xs">
                <FileText className="w-4 h-4 mr-1" />
                {tr("Зважений журнал", "Weighted gradebook")}
              </Button>
              {classId ? <ClassJoinCodeButton classId={classId} /> : null}
              <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}/appeals`)} className="text-xs">
                <MessageSquare className="w-4 h-4 mr-1" />
                {tr("Апеляції", "Appeals")}
              </Button>
              <Button onClick={() => navigate(`/edu/classes/${classId}/topics/new`)} className="text-xs">
                <Plus className="w-4 h-4 mr-1" />
                {t('createTopic')}
              </Button>
            </div>
          </div>

          {topics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <p className="text-text-secondary mb-4">{t('noTopics')}</p>
              <Button onClick={() => navigate(`/edu/classes/${classId}/topics/new`)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('createTopic')}
              </Button>
            </div>
          ) : isAurora ? (
            <AuroraList>
              {topics.map(topic => {
                const practiceCount = (topic.tasks || []).filter((taskItem) => (taskItem as { type?: unknown } | null | undefined)?.type === "PRACTICE").length;
                const controlWorksCount = (topic.controlWorks || []).length;
                const totalCount = practiceCount + controlWorksCount;
                const lang = topic.language === "JAVA" ? "Java" : topic.language === "PYTHON" ? "Python" : "C++";
                const metaParts = [lang];
                if (totalCount > 0) metaParts.push(`${t('tasksCount')}: ${totalCount}`);
                if (topic.description) metaParts.push(topic.description);
                return (
                  <AuroraRow
                    key={topic.id}
                    title={topic.title}
                    meta={metaParts.join(" · ")}
                    onClick={() => navigate(`/edu/topics/${topic.id}`)}
                  />
                );
              })}
            </AuroraList>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topics.map(topic => <motion.button type="button" key={topic.id} variants={fadeUpItem} className="group w-full p-5 text-left rounded-xl border border-border bg-bg-surface transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]" onClick={() => navigate(`/edu/topics/${topic.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-mono text-text-primary min-w-0 truncate group-hover:text-primary transition-fast">{topic.title}</div>
                    <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted px-2 py-0.5 rounded-full border border-border shrink-0">
                      {topic.language === "JAVA" ? "Java" : topic.language === "PYTHON" ? "Python" : "C++"}
                    </span>
                  </div>
                  {topic.description && <div className="text-xs text-text-secondary mt-2 line-clamp-2">
                      {topic.description}
                    </div>}
                  {(() => {
                const practiceCount = (topic.tasks || []).filter((taskItem) => (taskItem as { type?: unknown } | null | undefined)?.type === "PRACTICE").length;
                const controlWorksCount = (topic.controlWorks || []).length;
                const totalCount = practiceCount + controlWorksCount;
                if (totalCount <= 0) return null;
                return <div className="text-xs text-text-muted font-mono mt-3 tabular-nums">
                        {t('tasksCount')}: {totalCount}
                      </div>;
              })()}
                </motion.button>)}
            </motion.div>
          )}
        </section>
      </div>

      {}
      {showAnnouncementModal && <Modal open={showAnnouncementModal} onClose={() => setShowAnnouncementModal(false)} title={editingAnnouncementId ? tr("Редагувати оголошення", "Edit announcement") : tr("Нове оголошення", "New announcement")} showCloseButton={false}>
          <div className="p-4 sm:p-6 max-w-2xl">
            <div className="mb-3">
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Заголовок (необовʼязково)", "Title (optional)")}</label>
              <input value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Напр: Зміна дедлайну / Важливо", "e.g. Deadline change / Important")} />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Текст", "Text")} *</label>
              <textarea value={announcementContent} onChange={e => setAnnouncementContent(e.target.value)} rows={6} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Підтримується Markdown", "Markdown supported")} />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary mb-4">
              <input type="checkbox" checked={announcementPinned} onChange={e => setAnnouncementPinned(e.target.checked)} />
              {tr("Закріпити (показувати зверху)", "Pin (show at top)")}
            </label>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowAnnouncementModal(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={saveAnnouncement}>
                {t('save')}
              </Button>
            </div>
          </div>
        </Modal>}

      {}
      {showAddStudents && <Modal open={showAddStudents} onClose={() => setShowAddStudents(false)} title={tr("Додати учнів", "Add students")} showCloseButton={false}>
          <div className="p-4 sm:p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-mono text-text-primary mb-4">{t('addStudents')}</h2>
            <div className="space-y-3">
              {newStudents.map((student, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <input type="text" placeholder={t('lastName')} value={student.lastName} onChange={e => handleStudentChange(index, "lastName", e.target.value)} className="sm:col-span-3 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  <input type="text" placeholder={t('firstName')} value={student.firstName} onChange={e => handleStudentChange(index, "firstName", e.target.value)} className="sm:col-span-3 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  <input type="text" placeholder={t("middleName")} value={student.middleName} onChange={e => handleStudentChange(index, "middleName", e.target.value)} className="sm:col-span-3 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  <input type="email" placeholder="Email" value={student.email} onChange={e => handleStudentChange(index, "email", e.target.value)} className="sm:col-span-2 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  {newStudents.length > 1 && <button onClick={() => handleRemoveStudentRow(index)} className="sm:col-span-1 px-2 py-1 border border-accent-error text-accent-error hover:bg-accent-error hover:text-bg-base transition-fast text-sm h-10">
                      ×
                    </button>}
                </div>)}
              <Button variant="ghost" onClick={handleAddStudentRow} className="w-full text-xs">
                <Plus className="w-4 h-4 mr-1" />
                {tr("Додати рядок", "Add row")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={() => setShowAddStudents(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={handleSubmitStudents}>{tr("Додати учнів", "Add students")}</Button>
            </div>
          </div>
        </Modal>}

      {}
      {showImport && <Modal open={showImport} onClose={() => {
      setShowImport(false);
      setImportFile(null);
    }} title={tr("Імпорт учнів з CSV", "Import students from CSV")} showCloseButton={false}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("CSV файл", "CSV file")}
              </label>
              <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files?.[0] || null)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
              <p className="text-xs text-text-muted mt-2">
                {tr("Формат: Ім'я,Прізвище,По-батькові,Email,Username,Password", "Format: FirstName,LastName,MiddleName,Email,Username,Password")}
                <br />
                <span className="text-text-secondary">
                  {tr("Username та Password опціональні - якщо не вказані, система згенерує їх автоматично", "Username and Password are optional — if omitted, the system will generate them automatically")}
                </span>
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => {
            setShowImport(false);
            setImportFile(null);
          }}>
                {t("cancel")}
              </Button>
              <Button onClick={handleImport} disabled={!importFile}>
                {tr("Імпортувати", "Import")}
              </Button>
            </div>
          </div>
        </Modal>}

      {}
      {showCredentials && <Modal open={showCredentials} onClose={() => setShowCredentials(false)} title={tr("Облікові дані учнів (збережіть!)", "Student credentials (save!)")} showCloseButton={false}>
          <div className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <div className="space-y-2 mb-4">
              {credentials.map((cred, index) => <div key={index} className="p-3 border border-border bg-bg-surface font-mono text-sm">
                  <div className="text-text-primary">
                    {cred.lastName} {cred.firstName} {cred.middleName || ""}
                  </div>
                  <div className="text-text-secondary mt-1">
                    Email: {cred.email}
                  </div>
                  <div className="text-text-secondary">
                    Username: <span className="text-primary">{cred.username}</span>
                  </div>
                  <div className="text-text-secondary">
                    Password: <span className="text-primary">{cred.password}</span>
                  </div>
                </div>)}
            </div>
            <div className="flex gap-2 justify-end">
              <Button onClick={() => {
            const csvHeader = tr("Прізвище,Ім'я,По-батькові,Email,Username,Password\n", "LastName,FirstName,MiddleName,Email,Username,Password\n");
            const csvRows = credentials.map(cred => `"${cred.lastName}","${cred.firstName}","${cred.middleName || ""}","${cred.email}","${cred.username}","${cred.password}"`).join("\n");
            const csvContent = csvHeader + csvRows;
            const blob = new Blob([csvContent], {
              type: "text/csv;charset=utf-8;"
            });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `students_credentials_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}>
                {tr("Експортувати CSV", "Export CSV")}
              </Button>
              <Button onClick={() => setShowCredentials(false)}>{t("close")}</Button>
            </div>
          </div>
        </Modal>}
    </div>;
};
export default ClassDetailsPage;
