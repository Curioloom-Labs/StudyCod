import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ArrowLeft } from "lucide-react";
import { getClasses } from "../lib/api/edu";
import { api } from "../lib/api/client";
import { tr } from "../i18n";
export const CreateTopicPage: React.FC = () => {
  const {
    i18n
  } = useTranslation();
  const {
    classId
  } = useParams<{
    classId: string;
  }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<"JAVA" | "PYTHON">("JAVA");
  const safeServerMessage = (value: unknown) => {
    const msg = typeof value === "string" ? value : String(value ?? "");
    if (i18n.language === "en" && /[А-Яа-яІіЇїЄєҐґ]/.test(msg)) return "";
    return msg;
  };
  useEffect(() => {
    const loadClassInfo = async () => {
      if (!classId) return;
      try {
        const classes = await getClasses();
        const classData = classes.find(c => c.id === parseInt(classId, 10));
        if (classData && (classData.language === "JAVA" || classData.language === "PYTHON")) {
          setLanguage(classData.language);
        }
      } catch (error) {
        console.error("Failed to load class info:", error);
      }
    };
    loadClassInfo();
  }, [classId]);
  const handleSubmit = async () => {
    if (!classId || !title.trim()) {
      alert(tr("Заповніть назву теми", "Enter a topic title"));
      return;
    }
    try {
      const res = await api.post("/topics", {
        title,
        description: description.trim() || null,
        language,
        classId: parseInt(classId, 10)
      });
      void res.data.topic;
      navigate(`/edu/classes/${classId}`);
    } catch (error: any) {
      console.error("Failed to create topic:", error);
      const raw = safeServerMessage(error.response?.data?.message ?? error.message);
      alert(raw || tr("Не вдалося створити тему", "Failed to create topic"));
    }
  };
  return <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <h1 className="text-2xl font-mono text-text-primary">{tr("Створити тему", "Create topic")}</h1>
        </div>

        <Card className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-mono text-text-secondary mb-2">
              {tr("Назва теми *", "Topic title *")}
            </label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary" placeholder={tr("Наприклад: Масиви та цикли", "Example: Arrays and loops")} />
          </div>

          <div>
            <label className="block text-sm font-mono text-text-secondary mb-2">
              {tr("Опис теми (необов'язково)", "Topic description (optional)")}
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[100px]" placeholder={tr("Короткий опис теми...", "Short topic description...")} />
          </div>

          <div>
            <label className="block text-sm font-mono text-text-secondary mb-2">
              {tr("Мова програмування", "Programming language")}
            </label>
            <div className="flex gap-2">
              <Button variant={language === "JAVA" ? "primary" : "ghost"} onClick={() => setLanguage("JAVA")} className="flex-1">
                Java
              </Button>
              <Button variant={language === "PYTHON" ? "primary" : "ghost"} onClick={() => setLanguage("PYTHON")} className="flex-1">
                Python
              </Button>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={handleSubmit}>{tr("Створити тему", "Create topic")}</Button>
          </div>
        </Card>
      </div>
    </div>;
};