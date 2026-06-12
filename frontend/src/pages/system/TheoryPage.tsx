import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronRight } from "lucide-react";
import type { User } from "../../types";
import { tr } from "../../i18n";
import { getTheoryTopics, type TheoryTopic } from "../../lib/api/theory";
import { MarkdownView } from "../../components/MarkdownView";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";

interface TheoryPageProps {
  user: User;
}

export const TheoryPage: React.FC<TheoryPageProps> = ({ user }) => {
  const prefersReducedMotion = useReducedMotion();
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [selected, setSelected] = useState<TheoryTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const courseLabel = user.course === "JAVA" ? "Java" : user.course === "CPP" ? "C++" : "Python";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await getTheoryTopics(user.course);
        if (cancelled) return;
        setTopics(list);
        setSelected(list[0] || null);
      } catch (error) {
        console.error("Failed to load theory topics", error);
        if (cancelled) return;
        setTopics([]);
        setSelected(null);
        setLoadError(tr("Не вдалося завантажити теорію. Спробуйте ще раз пізніше.", "Failed to load theory. Please try again later."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user.course]);

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 p-3 sm:p-4 md:p-6">
      {/* Sidebar */}
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, x: -8 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
        transition={{ duration: 0.32, ease: easeOutQuint }}
        className="md:w-1/3 rounded-xl border border-border bg-bg-surface overflow-hidden flex flex-col"
      >
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-border bg-bg-code/50">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs text-primary/70">// theory</span>
          </div>
          <div className="mt-1 text-sm font-semibold tracking-tight text-text-primary">
            {tr("Курс:", "Course:")} {courseLabel}
          </div>
        </div>

        {/* Topic list */}
        <div className="flex-1 p-2 space-y-1 overflow-y-auto">
          {loading && (
            <div className="p-3 text-sm font-mono text-text-secondary">
              {tr("Завантаження…", "Loading…")}
            </div>
          )}
          {!loading && loadError && (
            <div className="m-2 rounded-lg border border-accent-error/50 bg-accent-error/10 px-3 py-2 text-xs font-mono text-accent-error">
              {loadError}
            </div>
          )}
          {!loading && !loadError && topics.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary" />
              </div>
              <div className="text-xs font-mono text-text-secondary">
                {tr("Немає теорії для цього курсу", "No theory available for this course")}
              </div>
            </div>
          )}
          <motion.div
            variants={prefersReducedMotion ? undefined : staggerContainer}
            initial={prefersReducedMotion ? undefined : "initial"}
            animate={prefersReducedMotion ? undefined : "animate"}
          >
            {topics.map(topic => (
              <motion.button
                key={topic.id}
                variants={prefersReducedMotion ? undefined : fadeUpItem}
                onClick={() => setSelected(topic)}
                className={`w-full text-left rounded-lg px-3 py-2.5 flex justify-between items-center transition-fast border ${
                  selected?.id === topic.id
                    ? "bg-bg-hover text-text-primary border-primary/40"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border-transparent hover:border-border"
                }`}
              >
                <span className="truncate text-sm font-mono">{topic.title}</span>
                <ChevronRight
                  size={14}
                  className={`shrink-0 transition-fast ${selected?.id === topic.id ? "text-primary" : "text-text-muted"}`}
                />
              </motion.button>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Content panel */}
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: easeOutQuint, delay: 0.06 }}
        className="md:w-2/3 rounded-xl border border-border bg-bg-surface overflow-hidden"
      >
        {selected ? (
          <div>
            {/* Content header */}
            <div className="px-5 py-4 border-b border-border bg-bg-code/30">
              <span className="font-mono text-xs text-primary/70">// {courseLabel.toLowerCase()}</span>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
                {selected.theory?.title || selected.title}
              </h1>
            </div>
            <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />
            <div className="p-5 sm:p-6">
              {selected.theory?.content ? (
                <div className="text-text-secondary leading-relaxed">
                  <MarkdownView content={selected.theory.content} />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-sm font-mono text-text-secondary">
                    {tr("Для цієї теми теорія ще не додана.", "No theory has been added for this topic yet.")}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-mono text-text-secondary max-w-xs">
              {tr("Оберіть тему зі списку, щоб розпочати навчання", "Choose a topic from the list to start learning")}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};
