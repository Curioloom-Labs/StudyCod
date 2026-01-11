import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { getStudents, getLessons, getTopics, addStudents, exportStudents, importStudents, getClassAnnouncements, createClassAnnouncement, updateClassAnnouncement, deleteClassAnnouncement, type Student, type Lesson, type Topic, type StudentCredentials, type ClassAnnouncementDto } from "../lib/api/edu";
import { Users, BookOpen, Plus, Download, Upload, ArrowLeft, FileText } from "lucide-react";
import { MarkdownView } from "../components/MarkdownView";
export const ClassDetailsPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
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
  const [announcements, setAnnouncements] = useState<ClassAnnouncementDto[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementPinned, setAnnouncementPinned] = useState(false);
  useEffect(() => {
    if (classId) {
      loadData();
    }
  }, [classId]);
  const loadData = async () => {
    if (!classId) return;
    try {
      const [studentsData, lessonsData, topicsData, announcementsData] = await Promise.all([getStudents(parseInt(classId, 10)), getLessons(parseInt(classId, 10)), getTopics(parseInt(classId, 10)), getClassAnnouncements(parseInt(classId, 10))]);
      setStudents(studentsData || []);
      setLessons(lessonsData || []);
      setTopics(topicsData || []);
      setAnnouncements(announcementsData.announcements || []);
    } catch (error: any) {
      console.error("Failed to load data:", error);
      alert(error.response?.data?.message || t('failedToLoadData'));
      setStudents([]);
      setLessons([]);
      setTopics([]);
      setAnnouncements([]);
    } finally {
      setLoading(false);
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
      alert(tr("Введіть текст оголошення", "Enter announcement text"));
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
    } catch (error: any) {
      console.error("Failed to save announcement:", error);
      alert(error.response?.data?.message || tr("Не вдалося зберегти оголошення", "Failed to save announcement"));
    }
  };
  const removeAnnouncement = async (id: number) => {
    if (!classId) return;
    if (!confirm(tr("Видалити оголошення?", "Delete announcement?"))) return;
    try {
      await deleteClassAnnouncement(parseInt(classId, 10), id);
      await loadData();
    } catch (error: any) {
      console.error("Failed to delete announcement:", error);
      alert(error.response?.data?.message || tr("Не вдалося видалити оголошення", "Failed to delete announcement"));
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
      alert(t('addAtLeastOne'));
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
    } catch (error: any) {
      console.error("Failed to add students:", error);
      alert(error.response?.data?.message || t('failedToAddStudents'));
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
      alert(tr("Не вдалося експортувати", "Failed to export"));
    }
  };
  const handleImport = async () => {
    if (!classId || !importFile) {
      alert(t('selectCSV'));
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
    } catch (error: any) {
      console.error("Failed to import:", error);
      alert(error.response?.data?.message || t('failedToImport'));
    }
  };
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t('loading')}
      </div>;
  }
  return <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate("/edu")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('toHome')}
          </Button>
          <h1 className="text-2xl font-mono text-text-primary">{t('classDetails')}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-mono text-text-primary flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t('studentsCountLabel')} ({students.length})
              </h2>
              <div className="flex gap-2">
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

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {students.length === 0 ? <p className="text-text-secondary text-sm">{t('noStudents')}</p> : students.map(student => <div key={student.id} className="p-2 border border-border hover:bg-bg-hover transition-fast">
                    <div className="text-sm font-mono text-text-primary">
                      {student.lastName} {student.firstName} {student.middleName || ""}
                    </div>
                    <div className="text-xs text-text-secondary">{student.email}</div>
                    <div className="text-xs text-text-muted">@{student.generatedUsername}</div>
                  </div>)}
            </div>
          </Card>

          {}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-mono text-text-primary flex items-center gap-2">
                🗒️ {tr("Оголошення", "Announcements")}
              </h2>
              <div className="flex gap-2">
                <Button onClick={openCreateAnnouncement} className="text-xs">
                  <Plus className="w-4 h-4 mr-1" />
                  {t("add")}
                </Button>
              </div>
            </div>

            {announcements.length === 0 ? <p className="text-text-secondary text-sm">{tr("Поки немає оголошень", "No announcements yet")}</p> : <div className="space-y-3 max-h-96 overflow-y-auto">
                {announcements.map(a => <div key={a.id} className="p-3 border border-border bg-bg-surface">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-mono text-text-primary">
                          {a.pinned ? "📌 " : ""}{a.title || tr("Оголошення", "Announcement")}
                        </div>
                        <div className="text-[10px] text-text-muted mt-1">
                          {a.author?.name || tr("Вчитель", "Teacher")} • {new Date(a.createdAt).toLocaleString(i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA")}
                        </div>
                      </div>
                      <div className="flex gap-2">
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
                  </div>)}
              </div>}
          </Card>

          {}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-mono text-text-primary flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                {t('topicsCountLabel')} ({topics.length})
              </h2>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}/gradebook`)} className="text-xs">
                  <FileText className="w-4 h-4 mr-1" />
                  {t('gradebook')}
                </Button>
                {}
                <Button onClick={() => navigate(`/edu/classes/${classId}/topics/new`)} className="text-xs">
                  <Plus className="w-4 h-4 mr-1" />
                  {t('createTopic')}
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {topics.length === 0 ? <p className="text-text-secondary text-sm">{t('noTopics')}</p> : topics.map(topic => <div key={topic.id} className="p-2 border border-border hover:bg-bg-hover transition-fast cursor-pointer" onClick={() => navigate(`/edu/topics/${topic.id}`)}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-mono text-text-primary">{topic.title}</div>
                      <span className="text-xs text-text-muted px-2 py-1 border border-border">
                        {topic.language === "JAVA" ? "Java" : "Python"}
                      </span>
                    </div>
                    {topic.description && <div className="text-xs text-text-secondary mt-1 line-clamp-2">
                        {topic.description}
                      </div>}
                    {(() => {
                const practiceCount = (topic.tasks || []).filter((t: any) => t?.type === "PRACTICE").length;
                const controlWorksCount = (topic.controlWorks || []).length;
                const totalCount = practiceCount + controlWorksCount;
                if (totalCount <= 0) return null;
                return <div className="text-xs text-text-secondary mt-1">
                          {t('tasksCount')}: {totalCount}
                        </div>;
              })()}
                  </div>)}
            </div>
          </Card>
        </div>
      </div>

      {}
      {showAnnouncementModal && <Modal open={showAnnouncementModal} onClose={() => setShowAnnouncementModal(false)} title={editingAnnouncementId ? tr("Редагувати оголошення", "Edit announcement") : tr("Нове оголошення", "New announcement")} showCloseButton={false}>
          <div className="p-6 max-w-2xl">
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
          <div className="p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-mono text-text-primary mb-4">{t('addStudents')}</h2>
            <div className="space-y-3">
              {newStudents.map((student, index) => <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <input type="text" placeholder={t('lastName')} value={student.lastName} onChange={e => handleStudentChange(index, "lastName", e.target.value)} className="col-span-3 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  <input type="text" placeholder={t('firstName')} value={student.firstName} onChange={e => handleStudentChange(index, "firstName", e.target.value)} className="col-span-3 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  <input type="text" placeholder={t("middleName")} value={student.middleName} onChange={e => handleStudentChange(index, "middleName", e.target.value)} className="col-span-3 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  <input type="email" placeholder="Email" value={student.email} onChange={e => handleStudentChange(index, "email", e.target.value)} className="col-span-2 px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary" />
                  {newStudents.length > 1 && <button onClick={() => handleRemoveStudentRow(index)} className="col-span-1 px-2 py-1 border border-accent-error text-accent-error hover:bg-accent-error hover:text-bg-base transition-fast text-sm">
                      ×
                    </button>}
                </div>)}
              <Button variant="ghost" onClick={handleAddStudentRow} className="w-full text-xs">
                <Plus className="w-4 h-4 mr-1" />
                {tr("Додати рядок", "Add row")}
              </Button>
            </div>
            <div className="flex gap-2 justify-end mt-4">
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