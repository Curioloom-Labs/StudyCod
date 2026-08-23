import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { ArrowLeft } from "lucide-react";
import { getClasses } from "../../lib/api/edu";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
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
  const [language, setLanguage] = useState<"JAVA" | "PYTHON" | "CPP">("JAVA");
  const safeServerMessage = (value: unknown) => {
    const msg = typeof value === "string" ? value : String(value ?? "");
    if (typeof i18n.language === "string" && i18n.language.startsWith("en") && /[А-Яа-яІіЇїЄєҐґ]/.test(msg)) return "";
    return msg;
  };
  useEffect(() => {
    const loadClassInfo = async () => {
      if (!classId) return;
      try {
        const classes = await getClasses();
        const classData = classes.find(c => c.id === parseInt(classId, 10));
        if (classData && (classData.language === "JAVA" || classData.language === "PYTHON" || classData.language === "CPP")) {
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
      showToast({ type: "error", message: tr("Заповніть назву теми", "Enter a topic title") });
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
    } catch (error: unknown) {
      console.error("Failed to create topic:", error);
      const raw = safeServerMessage(getErrorMessageFromUnknown(error, ""));
      showToast({ type: "error", message: raw || tr("Не вдалося створити тему", "Failed to create topic") });
    }
  };
  return <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrow="// new topic"
        title={tr("Створити тему", "Create topic")}
        subtitle={tr("Тема обʼєднує практичні завдання та контрольні роботи для класу.", "A topic groups practice tasks and control works for the class.")}
        maxWidth="3xl"
        actions={
          <Button variant="ghost" className="text-xs" onClick={() => navigate(`/edu/classes/${classId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
        }
      />

      <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto">
        <div className="rounded-xl border border-border bg-bg-surface p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">
              {tr("Деталі теми", "Topic details")}
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Назва теми *", "Topic title *")}
                </label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary transition-fast" placeholder={tr("Наприклад: Масиви та цикли", "Example: Arrays and loops")} />
              </div>

              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Опис теми (необов'язково)", "Topic description (optional)")}
                </label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[100px] transition-fast" placeholder={tr("Короткий опис теми...", "Short topic description...")} />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">
              {tr("Мова програмування", "Programming language")}
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant={language === "JAVA" ? "primary" : "ghost"} onClick={() => setLanguage("JAVA")} className="flex-1">
                Java
              </Button>
              <Button variant={language === "PYTHON" ? "primary" : "ghost"} onClick={() => setLanguage("PYTHON")} className="flex-1">
                Python
              </Button>
              <Button variant={language === "CPP" ? "primary" : "ghost"} onClick={() => setLanguage("CPP")} className="flex-1">
                C++
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end border-t border-border pt-6">
            <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={handleSubmit}>{tr("Створити тему", "Create topic")}</Button>
          </div>
        </div>
      </div>
    </div>;
};
