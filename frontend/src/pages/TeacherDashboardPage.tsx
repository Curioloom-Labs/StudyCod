import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { getClasses, createClass, type Class, getPendingReviews, updateGrade, type PendingReview } from "../lib/api/edu";
import { Plus, Users, BookOpen, FileText, CheckCircle, Clock } from "lucide-react";
import { CodeEditor } from "../components/CodeEditor";
export const TeacherDashboardPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassLanguage, setNewClassLanguage] = useState<"JAVA" | "PYTHON" | "CPP">("JAVA");
  const [showPendingReviews, setShowPendingReviews] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [reviewGrade, setReviewGrade] = useState<number>(1);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewing, setReviewing] = useState(false);
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
      const newClass = await createClass(newClassName, newClassLanguage);
      setClasses([...classes, newClass]);
      setShowCreateClass(false);
      setNewClassName("");
      setNewClassLanguage("JAVA");
    } catch (error) {
      console.error("Failed to create class:", error);
      alert(t('failedToCreateClass'));
    }
  };
  const handleReviewGrade = async () => {
    if (!selectedReview) return;
    if (reviewGrade < 1 || reviewGrade > 12) {
      alert(t('gradeMustBe'));
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
      alert(t('gradeSetSuccessfully'));
    } catch (error: any) {
      console.error("Failed to review grade:", error);
      alert(error.response?.data?.message || t('failedToSetGrade'));
    } finally {
      setReviewing(false);
    }
  };
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t('loading')}
      </div>;
  }
  return <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-mono text-text-primary">{t('myClasses')}</h1>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate("/edu/library")}>
              <BookOpen className="w-4 h-4 mr-2" />
              {tr("Бібліотека завдань", "Task library")}
            </Button>
            {pendingReviews.length > 0 && <Button variant="ghost" onClick={() => setShowPendingReviews(true)} className="relative">
                <Clock className="w-4 h-4 mr-2" />
                {t('reviewTasks')}
                <span className="ml-2 px-2 py-0.5 bg-primary text-text-primary text-xs rounded-full">
                  {pendingReviews.length}
                </span>
              </Button>}
          <Button onClick={() => setShowCreateClass(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('createClass')}
          </Button>
          </div>
        </div>

        {classes.length === 0 ? <Card className="p-8 text-center">
            <p className="text-text-secondary mb-4">{t('noClassesYet')}</p>
            <Button onClick={() => setShowCreateClass(true)}>{t('createFirstClass')}</Button>
          </Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map(cls => <Card key={cls.id} className="p-4 hover:bg-bg-hover transition-fast cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-mono text-text-primary">{cls.name}</h3>
                  <span className="text-xs text-text-muted px-2 py-1 border border-border">
                    {cls.language}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-text-secondary">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{cls.studentsCount} {t('students')}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="ghost" className="flex-1 text-xs" onClick={() => {
              navigate(`/edu/classes/${cls.id}`);
            }}>
                    {t('open')}
                  </Button>
                </div>
              </Card>)}
          </div>}
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
              <select value={newClassLanguage} onChange={e => setNewClassLanguage(e.target.value as "JAVA" | "PYTHON" | "CPP")} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary">
                <option value="JAVA">Java</option>
                <option value="PYTHON">Python</option>
                <option value="CPP">C++</option>
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
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-text-secondary">{tr("Немає завдань для перевірки", "No tasks to review")}</p>
              </div> : selectedReview ? <div className="space-y-4">
                <div className="flex items-center justify-between">
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
                  <input type="number" min="1" max="12" value={reviewGrade} onChange={e => setReviewGrade(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" />
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
                {pendingReviews.map(review => <Card key={review.gradeId} className="p-4 hover:bg-bg-hover transition-fast cursor-pointer" onClick={() => setSelectedReview(review)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
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