import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { Modal } from "../../components/ui/Modal";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getStudents, getSummaryGrades, createSummaryGrade, updateSummaryGrade, deleteSummaryGrade, getTopics, type Student, type SummaryGradeGroup, type Topic } from "../../lib/api/edu";
import { ArrowLeft, Plus, FileText, Trash2 } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

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

export const SummaryGradesPage: React.FC = () => {
  useTranslation();
  const {
    classId
  } = useParams<{
    classId: string;
  }>();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [summaryGrades, setSummaryGrades] = useState<SummaryGradeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [gradeName, setGradeName] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [studentGrades, setStudentGrades] = useState<Record<number, number>>({});
  const [editingGrade, setEditingGrade] = useState<{
    id: number;
    studentId: number;
    currentGrade: number;
  } | null>(null);
  useEffect(() => {
    if (classId) {
      loadData();
    }
  }, [classId]);
  const loadData = async () => {
    if (!classId) return;
    try {
      const [studentsData, summaryData, topicsData] = await Promise.all([getStudents(parseInt(classId, 10)), getSummaryGrades(parseInt(classId, 10)), getTopics(parseInt(classId, 10))]);
      setStudents(studentsData);
      setSummaryGrades(summaryData);
      setTopics(topicsData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };
  const handleCreateSummary = async () => {
    if (!classId || !gradeName.trim()) {
      showToast({ type: "error", message: tr("Введіть назву оцінки", "Enter a grade name") });
      return;
    }
    if (!selectedTopicId) {
      showToast({ type: "error", message: tr("Виберіть тему", "Choose a topic") });
      return;
    }
    const grades = Object.entries(studentGrades).filter(([_, grade]) => grade > 0).map(([studentId, grade]) => ({
      studentId: parseInt(studentId, 10),
      grade: grade
    }));
    try {
      await createSummaryGrade(parseInt(classId, 10), {
        name: gradeName,
        topicId: selectedTopicId,
        studentGrades: grades.length > 0 ? grades : undefined
      });
      setShowCreate(false);
      setGradeName("");
      setSelectedTopicId(null);
      setStudentGrades({});
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to create summary grade:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося створити оцінку", "Failed to create grade")) });
    }
  };
  const handleUpdateGrade = async (summaryGradeId: number, newGrade: number) => {
    if (!classId) return;
    try {
      await updateSummaryGrade(parseInt(classId, 10), summaryGradeId, newGrade);
      setEditingGrade(null);
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to update grade:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося оновити оцінку", "Failed to update grade")) });
    }
  };
  const handleDeleteGrade = async (summaryGradeId: number, studentName: string) => {
    if (!classId) return;
    if (!confirm(tr(`Видалити оцінку для ${studentName}?`, `Delete grade for ${studentName}?`))) {
      return;
    }
    try {
      await deleteSummaryGrade(parseInt(classId, 10), summaryGradeId);
      await loadData();
    } catch (error: unknown) {
      console.error("Failed to delete grade:", error);
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося видалити оцінку", "Failed to delete grade")) });
    }
  };
  if (loading) {
    return <PageSkeleton variant="table" />;
  }
  const totalGrades = summaryGrades.reduce((s, g) => s + g.grades.length, 0);
  return <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// summary grades"
        eyebrowAurora={tr("Підсумок", "Summary")}
        title={tr("Проміжні оцінки", "Intermediate grades")}
        subtitle={tr("Тематичні та проміжні оцінки за темами класу.", "Thematic and intermediate grades grouped by class topics.")}
        actions={<>
            <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/classes/${classId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {tr("Створити", "Create")}
            </Button>
          </>}
        stats={[
          { value: <CountUp value={summaryGrades.length} />, label: tr("Колонки", "Columns") },
          { value: <CountUp value={students.length} />, label: tr("Учні", "Students") },
          { value: <CountUp value={totalGrades} />, label: tr("Оцінки", "Grades") }
        ]}
      />

      <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto">
        {summaryGrades.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <p className="text-text-secondary mb-4">{tr("Поки немає проміжних оцінок", "No intermediate grades yet")}</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {tr("Створити", "Create")}
            </Button>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
            {summaryGrades.map((group, index) => <motion.div key={index} variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5">
                <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  {group.name}
                  <span className="text-text-muted/70">· {group.grades.length}</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {group.grades.map(g => {
              const isEditing = editingGrade?.studentId === g.studentId && editingGrade?.id === g.id;
              return <div key={g.studentId} className="rounded-lg p-3 border border-border bg-bg-base text-sm relative group transition-fast hover:border-primary/40">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-text-secondary text-xs line-clamp-1 flex-1">
                            {g.studentName}
                          </div>
                          <button type="button" onClick={e => {
                    e.stopPropagation();
                    handleDeleteGrade(g.id, g.studentName);
                  }} className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-error hover:opacity-85 p-1" title={tr("Видалити оцінку", "Delete grade")}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        {isEditing ? <div className="flex items-center gap-1">
                                <input type="number" min="1" max="100" step="0.1" defaultValue={editingGrade?.currentGrade || g.grade} onBlur={e => {
                    const newGrade = parseFloat(e.target.value);
                              if (!isNaN(newGrade) && newGrade >= 1 && newGrade <= 100) {
                      handleUpdateGrade(g.id, newGrade);
                    }
                    setEditingGrade(null);
                  }} onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    } else if (e.key === "Escape") {
                      setEditingGrade(null);
                    }
                  }} autoFocus className="w-16 px-2 py-1 bg-bg-base border border-primary text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                          </div> : <button type="button" className="text-lg font-mono text-primary tabular-nums hover:bg-bg-hover px-1 rounded transition-fast" onClick={() => {
                  setEditingGrade({
                    id: g.id,
                    studentId: g.studentId,
                    currentGrade: g.grade
                  });
                }} title={tr("Натисніть для редагування", "Click to edit")}>
                            {g.grade}
                          </button>}
                      </div>;
            })}
                </div>
              </motion.div>)}
          </motion.div>
        )}
      </div>

      {}
      {showCreate && <Modal open={showCreate} onClose={() => setShowCreate(false)} title={tr("Створити проміжну оцінку", "Create intermediate grade")} showCloseButton={false}>
          <div className="p-4 sm:p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-mono text-text-primary mb-4">{tr("Створити проміжну оцінку", "Create intermediate grade")}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Назва оцінки *", "Grade name *")}
                </label>
                <input type="text" value={gradeName} onChange={e => setGradeName(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: Тематична 1, Проміжна", "Example: Thematic 1, Intermediate")} />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Тема *", "Topic *")}
                </label>
                <select value={selectedTopicId || ""} onChange={e => setSelectedTopicId(e.target.value ? parseInt(e.target.value, 10) : null)} required className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary">
                  <option value="">{tr("Виберіть тему", "Choose a topic")}</option>
                  {topics.map(topic => <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Оцінки учнів", "Student grades")}
                </label>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {students.map(student => <div key={student.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 border border-border">
                      <div className="flex-1 text-sm font-mono text-text-primary">
                        {student.lastName} {student.firstName} {student.middleName || ""}
                      </div>
                      <input type="number" min="1" max="100" step="0.1" value={studentGrades[student.id] || ""} onChange={e => {
                  const value = e.target.value;
                  if (value === "") {
                    const newGrades = {
                      ...studentGrades
                    };
                    delete newGrades[student.id];
                    setStudentGrades(newGrades);
                  } else {
                    setStudentGrades({
                      ...studentGrades,
                      [student.id]: parseFloat(value) || 0
                    });
                  }
                }} className="w-20 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" placeholder={tr("Авто", "Auto")} />
                    </div>)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  {tr("Скасувати", "Cancel")}
                </Button>
                <Button onClick={handleCreateSummary} disabled={!gradeName.trim() || !selectedTopicId}>
                  {tr("Створити", "Create")}
                </Button>
              </div>
            </div>
          </div>
        </Modal>}
    </div>;
};
