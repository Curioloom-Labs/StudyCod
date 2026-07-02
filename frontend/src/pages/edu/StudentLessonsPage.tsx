import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { AuroraList, AuroraRow } from "../../components/ui/AuroraList";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { Modal } from "../../components/ui/Modal";
import { MarkdownView } from "../../components/MarkdownView";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getMyStudentInfo, getStudentLessons, getMyAnnouncements, type Lesson, type ClassAnnouncementDto } from "../../lib/api/edu";
import { BookOpen, Clock, FileText, MessageSquare, Video, ShieldCheck, Megaphone, Pin, ArrowRight } from "lucide-react";
type StudentClassInfo = {
  id: number;
  name: string;
  language: "JAVA" | "PYTHON" | "CPP";
};

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

export const StudentLessonsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const isAurora = useUIMode().mode === "aurora";
  const currentLessonsPath = `${location.pathname}${location.search}`;
  const openLesson = (id: number, type: "TOPIC" | "CONTROL") => {
    navigate(`/edu/lessons/${id}?type=${type}`, {
      state: {
        from: currentLessonsPath
      }
    });
  };
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [classInfo, setClassInfo] = useState<StudentClassInfo | null>(null);
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
    return <PageSkeleton variant="default" />;
  }

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
  const pinnedCount = announcements.filter(a => a.pinned).length;

  return <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// lessons"
        eyebrowAurora={tr("Уроки", "Lessons")}
        title={<>{t("lessons")}{classInfo?.name && <span className="text-text-muted font-normal"> · {classInfo.name}</span>}</>}
        subtitle={tr("Ваш навчальний маршрут — теми, практика та контрольні роботи.", "Your learning path — topics, practice and control works.")}
        actions={<>
            {classInfo?.id && (
              <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classInfo.id}/live`)}>
                <Video className="w-4 h-4 mr-2" />
                {tr("Живий урок", "Live lesson")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate("/edu/journal")}>
              <BookOpen className="w-4 h-4 mr-2" />
              {t("myJournal")}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/edu/appeals")}>
              <MessageSquare className="w-4 h-4 mr-2" />
              {tr("Апеляції", "Appeals")}
            </Button>
          </>}
        stats={[
          { value: <CountUp value={topics.length} />, label: t("topic") },
          { value: <CountUp value={controls.length} />, label: tr("Контрольні", "Control works") },
          { value: <CountUp value={topics.reduce((s, x) => s + (x.tasksCount || 0), 0)} />, label: tr("Практичних", "Practice") }
        ]}
      />

      <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-8">
        {/* Announcements */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none">
              <Megaphone className="w-3.5 h-3.5" />
              {tr("Оголошення", "Announcements")}
              {pinnedCount > 0 && <span className="text-primary/70">· {pinnedCount}</span>}
            </h2>
            <Button variant="ghost" className="text-xs" onClick={() => setShowAllAnnouncements(true)} disabled={announcements.length === 0}>
              {tr("Показати всі", "Show all")}
            </Button>
          </div>
          {announcements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-6 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Megaphone className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-text-secondary">{tr("Поки немає оголошень", "No announcements yet")}</p>
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 md:grid-cols-3">
              {announcements.slice(0, 3).map(a => (
                <motion.div
                  key={a.id}
                  variants={fadeUpItem}
                  className="rounded-xl border border-border bg-bg-surface p-5"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="text-sm font-mono text-text-primary line-clamp-2 flex items-start gap-1.5">
                      {a.pinned && <Pin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
                      {a.title || tr("Оголошення", "Announcement")}
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary line-clamp-4">
                    <MarkdownView content={a.content} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-text-muted font-mono">
                    <span>{a.author?.name || tr("Вчитель", "Teacher")}</span>
                    <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Learning path */}
        <section>
          <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-4">
            {tr("Навчальний маршрут", "Learning path")}
          </h2>
          {lessons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <p className="text-text-secondary">{tr("Поки немає уроків", "No lessons yet")}</p>
            </div>
          ) : isAurora ? (
            <AuroraList>
              {topics.map((topic, idx) => {
                const topicControls = controlsByTopic.get(topic.id) || [];
                return (
                  <React.Fragment key={`${topic.type}-${topic.id}`}>
                    <AuroraRow
                      leading={<span className="w-7 h-7 rounded-full border border-border bg-bg-surface flex items-center justify-center font-mono text-[11px] text-text-muted">{idx + 1}</span>}
                      title={topic.title}
                      meta={`${tr("Практичних", "Practice")}: ${topic.tasksCount}${topicControls.length ? ` · ${tr("Контрольних", "Control works")}: ${topicControls.length}` : ""}`}
                      trailing={<ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-fast" />}
                      onClick={() => openLesson(topic.id, "TOPIC")}
                    />
                    {topicControls.map(cw => (
                      <AuroraRow
                        key={`CONTROL-${cw.id}`}
                        leading={<ShieldCheck className="w-4 h-4 text-accent-warn ml-7" />}
                        title={cw.title}
                        meta={`${tr("Контрольна", "Control work")}${cw.timeLimitMinutes ? ` · ${cw.timeLimitMinutes} ${t("min")}` : ""} · ${tr("Завдань", "Tasks")}: ${cw.tasksCount}`}
                        trailing={<ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-fast" />}
                        onClick={() => openLesson(cw.id, "CONTROL")}
                      />
                    ))}
                  </React.Fragment>
                );
              })}
              {orphanControls.map(cw => (
                <AuroraRow
                  key={`ORPHAN-${cw.id}`}
                  leading={<ShieldCheck className="w-4 h-4 text-accent-warn" />}
                  title={cw.title}
                  meta={`${tr("Контрольна (без теми)", "Control work (no topic)")} · ${tr("Завдань", "Tasks")}: ${cw.tasksCount}`}
                  trailing={<ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-fast" />}
                  onClick={() => openLesson(cw.id, "CONTROL")}
                />
              ))}
            </AuroraList>
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="relative space-y-4">
              {/* Connecting spine */}
              <div className="pointer-events-none absolute left-[1.15rem] top-2 bottom-2 w-px bg-gradient-to-b from-primary/30 via-border to-transparent hidden sm:block" aria-hidden="true" />

              {topics.map((topic, idx) => {
                const topicControls = controlsByTopic.get(topic.id) || [];
                const uniqueKey = `${topic.type}-${topic.id}`;
                return (
                  <motion.div key={uniqueKey} variants={fadeUpItem} className="relative sm:pl-12">
                    {/* Node marker */}
                    <div className="hidden sm:flex absolute left-0 top-5 w-9 h-9 rounded-full border border-primary/40 bg-bg-surface items-center justify-center font-mono text-xs text-primary z-10">
                      {idx + 1}
                    </div>
                    <div className="group rounded-xl border border-border bg-bg-surface p-5 transition-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <BookOpen className="w-4 h-4 text-primary shrink-0" />
                            <h3 className="text-lg font-mono text-text-primary">{topic.title}</h3>
                            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-text-muted px-2 py-0.5 rounded-full border border-border">{t("topic")}</span>
                          </div>
                          <div className="text-xs text-text-muted font-mono">
                            {tr("Практичних", "Practice")}: {topic.tasksCount}
                            {topicControls.length > 0 ? ` · ${tr("Контрольних", "Control works")}: ${topicControls.length}` : ""}
                          </div>
                        </div>
                        <Button variant="ghost" className="shrink-0 group-hover:border-primary/40 group-hover:text-text-primary" onClick={() => openLesson(topic.id, "TOPIC")}>
                          <FileText className="w-4 h-4 mr-2" />
                          {t("open")}
                          <ArrowRight className="w-3.5 h-3.5 ml-2 transition-transform group-hover:translate-x-0.5" />
                        </Button>
                      </div>

                      {topicControls.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {topicControls.map(cw => (
                            <div key={`CONTROL-${cw.id}`} className="rounded-lg border border-accent-warn/40 bg-accent-warn/5 p-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <ShieldCheck className="w-4 h-4 text-accent-warn shrink-0" />
                                    <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-accent-warn px-2 py-0.5 rounded-full border border-accent-warn/40">
                                      {tr("Контрольна", "Control work")}
                                    </span>
                                    <div className="text-sm font-mono text-text-primary truncate">{cw.title}</div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-text-secondary font-mono">
                                    {cw.timeLimitMinutes && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {tr("Обмеження", "Limit")}: {cw.timeLimitMinutes} {t("min")}
                                      </span>
                                    )}
                                    <span className="text-text-muted">{tr("Завдань", "Tasks")}: {cw.tasksCount}</span>
                                  </div>
                                </div>
                                <Button variant="ghost" className="shrink-0" onClick={() => openLesson(cw.id, "CONTROL")}>
                                  <FileText className="w-4 h-4 mr-2" />
                                  {t("open")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {orphanControls.length > 0 && (
                <motion.div variants={fadeUpItem} className="relative sm:pl-12">
                  <div className="hidden sm:flex absolute left-0 top-5 w-9 h-9 rounded-full border border-accent-warn/40 bg-bg-surface items-center justify-center z-10">
                    <ShieldCheck className="w-4 h-4 text-accent-warn" />
                  </div>
                  <div className="rounded-xl border border-accent-warn/40 bg-bg-surface p-5">
                    <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent-warn" />
                      {tr("Контрольні (без теми)", "Control works (no topic)")}
                    </div>
                    <div className="space-y-2">
                      {orphanControls.map(cw => (
                        <div key={`CONTROL-${cw.id}`} className="rounded-lg border border-accent-warn/40 bg-accent-warn/5 p-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-mono text-text-primary truncate">{cw.title}</div>
                              <div className="text-xs text-text-muted font-mono mt-1">{tr("Завдань", "Tasks")}: {cw.tasksCount}</div>
                            </div>
                            <Button variant="ghost" className="shrink-0" onClick={() => openLesson(cw.id, "CONTROL")}>
                              <FileText className="w-4 h-4 mr-2" />
                              {t("open")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </section>
      </div>

      {showAllAnnouncements && <Modal open={showAllAnnouncements} onClose={() => setShowAllAnnouncements(false)} title={tr("Оголошення", "Announcements")}>
          <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto space-y-3">
            {announcements.length === 0 ? <div className="text-sm text-text-secondary">{tr("Поки немає оголошень", "No announcements yet")}</div> : announcements.map(a => <div key={a.id} className="p-3 border border-border bg-bg-surface rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-mono text-text-primary flex items-center gap-1.5">
                      {a.pinned && <Pin className="w-3.5 h-3.5 text-primary shrink-0" />}{a.title || tr("Оголошення", "Announcement")}
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
