import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { MarkdownView } from "../components/MarkdownView";
import { getMyStudentInfo, getStudentLessons, getMyAnnouncements, type Lesson, type ClassAnnouncementDto } from "../lib/api/edu";
import { BookOpen, Clock, FileText } from "lucide-react";
export const StudentLessonsPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [classInfo, setClassInfo] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<ClassAnnouncementDto[]>([]);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  useEffect(() => {
    loadLessons();
  }, []);
  const loadLessons = async () => {
    try {
      const studentInfo = await getMyStudentInfo();
      setClassInfo(studentInfo.student.class);
      const [data, ann] = await Promise.all([getStudentLessons(), getMyAnnouncements()]);
      setLessons(data);
      setAnnouncements(ann.announcements || []);
    } catch (error) {
      console.error("Failed to load lessons:", error);
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t("loading")}
      </div>;
  }
  return <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-mono text-text-primary mb-6">
          {t("lessons")} {classInfo?.name && `• ${classInfo.name}`}
        </h1>

        {}
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-mono text-text-primary">{tr("Оголошення", "Announcements")}</div>
            <Button variant="ghost" onClick={() => setShowAllAnnouncements(true)} disabled={announcements.length === 0}>
              {tr("Показати всі", "Show all")}
            </Button>
          </div>
          {announcements.length === 0 ? <div className="text-sm text-text-secondary">{tr("Поки немає оголошень", "No announcements yet")}</div> : <div className="space-y-3">
              {announcements.slice(0, 3).map(a => <div key={a.id} className="p-3 border border-border bg-bg-surface">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-sm font-mono text-text-primary line-clamp-1">
                      {a.pinned ? "📌 " : ""}{a.title || tr("Оголошення", "Announcement")}
                    </div>
                    <div className="text-xs text-text-muted whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary">
                    <MarkdownView content={a.content} />
                  </div>
                  <div className="mt-2 text-[10px] text-text-muted">
                    {a.author?.name || tr("Вчитель", "Teacher")}
                  </div>
                </div>)}
            </div>}
        </Card>

        {lessons.length === 0 ? <Card className="p-8 text-center">
            <p className="text-text-secondary">{tr("Поки немає уроків", "No lessons yet")}</p>
          </Card> : <div className="space-y-3">
            {(() => {
          const topics = lessons.filter(l => l.type === "TOPIC");
          const controls = lessons.filter(l => l.type === "CONTROL");
          const controlsByTopic = new Map<number, typeof controls>();
          const orphanControls: typeof controls = [];
          for (const cw of controls) {
            if (cw.parentTopicId) {
              const arr = controlsByTopic.get(cw.parentTopicId) || [];
              arr.push(cw);
              controlsByTopic.set(cw.parentTopicId, arr);
            } else {
              orphanControls.push(cw);
            }
          }
          return <>
                  {topics.map(topic => {
              const topicControls = controlsByTopic.get(topic.id) || [];
              const uniqueKey = `${topic.type}-${topic.id}`;
              return <Card key={uniqueKey} className="p-4 hover:bg-bg-hover transition-fast">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <BookOpen className="w-4 h-4 text-text-secondary" />
                              <h3 className="text-lg font-mono text-text-primary">{topic.title}</h3>
                              <span className="text-xs text-text-muted px-2 py-1 border border-border">{t("topic")}</span>
                            </div>
                            <div className="text-xs text-text-muted">
                              {tr("Практичних", "Practice")}: {topic.tasksCount}
                              {topicControls.length > 0 ? ` • ${tr("Контрольних", "Control works")}: ${topicControls.length}` : ""}
                            </div>

                            {topicControls.length > 0 && <div className="mt-3 space-y-2">
                                {topicControls.map(cw => <div key={`CONTROL-${cw.id}`} className="p-3 border border-border bg-bg-surface/60">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-text-muted px-2 py-1 border border-border">
                                            {tr("Контрольна", "Control work")}
                                          </span>
                                          <div className="text-sm font-mono text-text-primary">{cw.title}</div>
                                        </div>
                                        {cw.timeLimitMinutes && <div className="flex items-center gap-1 text-xs text-text-secondary mt-2">
                                            <Clock className="w-3 h-3" />
                                            <span>{tr("Обмеження", "Limit")}: {cw.timeLimitMinutes} {t("min")}</span>
                                          </div>}
                                        <div className="text-xs text-text-muted mt-1">
                                          {tr("Завдань", "Tasks")}: {cw.tasksCount}
                                        </div>
                                      </div>
                                      <Button variant="ghost" onClick={() => {
                            window.location.href = `/edu/lessons/${cw.id}?type=CONTROL`;
                          }}>
                                        <FileText className="w-4 h-4 mr-2" />
                                        {t("open")}
                                      </Button>
                                    </div>
                                  </div>)}
                              </div>}
                          </div>

                          <Button variant="ghost" onClick={() => {
                    window.location.href = `/edu/lessons/${topic.id}?type=TOPIC`;
                  }}>
                            <FileText className="w-4 h-4 mr-2" />
                            {t("open")}
                          </Button>
                        </div>
                      </Card>;
            })}

                  {orphanControls.length > 0 && <Card className="p-4">
                      <div className="text-sm font-mono text-text-primary mb-2">
                        {tr("Контрольні (без теми)", "Control works (no topic)")}
                      </div>
                      <div className="space-y-2">
                        {orphanControls.map(cw => <div key={`CONTROL-${cw.id}`} className="p-3 border border-border bg-bg-surface/60">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="text-sm font-mono text-text-primary">{cw.title}</div>
                                <div className="text-xs text-text-muted mt-1">{tr("Завдань", "Tasks")}: {cw.tasksCount}</div>
                              </div>
                              <Button variant="ghost" onClick={() => {
                      window.location.href = `/edu/lessons/${cw.id}?type=CONTROL`;
                    }}>
                                <FileText className="w-4 h-4 mr-2" />
                                {t("open")}
                              </Button>
                            </div>
                          </div>)}
                      </div>
                    </Card>}
                </>;
        })()}
          </div>}
      </div>

      {showAllAnnouncements && <Modal open={showAllAnnouncements} onClose={() => setShowAllAnnouncements(false)} title={tr("Оголошення", "Announcements")}>
          <div className="p-6 max-h-[80vh] overflow-y-auto space-y-3">
            {announcements.length === 0 ? <div className="text-sm text-text-secondary">{tr("Поки немає оголошень", "No announcements yet")}</div> : announcements.map(a => <div key={a.id} className="p-3 border border-border bg-bg-surface">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-sm font-mono text-text-primary">
                      {a.pinned ? "📌 " : ""}{a.title || tr("Оголошення", "Announcement")}
                    </div>
                    <div className="text-xs text-text-muted whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary">
                    <MarkdownView content={a.content} />
                  </div>
                  <div className="mt-2 text-[10px] text-text-muted">
                    {a.author?.name || tr("Вчитель", "Teacher")}
                  </div>
                </div>)}
          </div>
        </Modal>}
    </div>;
};