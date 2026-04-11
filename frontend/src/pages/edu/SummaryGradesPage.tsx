import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { getStudents, getSummaryGrades, createSummaryGrade, updateSummaryGrade, deleteSummaryGrade, getTaskGrades, getTopics, type Student, type SummaryGradeGroup, type Topic } from "../../lib/api/edu";
import { ArrowLeft, Plus, FileText, Trash2 } from "lucide-react";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
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
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {tr("Завантаження...", "Loading...")}
      </div>;
  }
  return <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
            <h1 className="text-2xl font-mono text-text-primary">{tr("Проміжні оцінки", "Intermediate grades")}</h1>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {tr("Створити", "Create")}
          </Button>
        </div>

        {summaryGrades.length === 0 ? <Card className="p-8 text-center">
            <p className="text-text-secondary">{tr("Поки немає проміжних оцінок", "No intermediate grades yet")}</p>
          </Card> : <div className="space-y-6">
            {summaryGrades.map((group, index) => <Card key={index} className="p-4">
                <h2 className="text-lg font-mono text-text-primary mb-4">{group.name}</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {group.grades.map(g => {
              const isEditing = editingGrade?.studentId === g.studentId && editingGrade?.id === g.id;
              return <div key={g.studentId} className="p-2 border border-border bg-bg-surface text-sm relative group">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-text-secondary text-xs line-clamp-1 flex-1">
                            {g.studentName}
                          </div>
                          <button onClick={e => {
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
                          </div> : <button type="button" className="text-lg font-mono text-primary hover:bg-bg-hover px-1 rounded" onClick={() => {
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
              </Card>)}
          </div>}
      </div>

      {}
      {showCreate && <Modal open={showCreate} onClose={() => setShowCreate(false)} title={tr("Створити проміжну оцінку", "Create intermediate grade")} showCloseButton={false}>
          <div className="p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
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
                  {students.map(student => <div key={student.id} className="flex items-center gap-3 p-2 border border-border">
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
              <div className="flex gap-2 justify-end">
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
