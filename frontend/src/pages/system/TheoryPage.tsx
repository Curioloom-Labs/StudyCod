import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronRight, Search } from "lucide-react";
import type { User } from "../../types";
import { tr } from "../../i18n";
import { getTheoryTopic, getTheoryTopics, type TheoryTopic } from "../../lib/api/theory";
import { MarkdownView } from "../../components/MarkdownView";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";

interface TheoryPageProps {
  user: User;
}

export const TheoryPage: React.FC<TheoryPageProps> = ({ user }) => {
  const { i18n } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [selected, setSelected] = useState<TheoryTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [topicSearch, setTopicSearch] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [detailRetryToken, setDetailRetryToken] = useState(0);
  const runtime = user.activeRuntime || "PYTHON";
  const courseLabel = runtime === "JAVA" ? "Java" : runtime === "CPP" ? "C++" : "Python";
  const filteredTopics = topics.filter((topic) => {
    const query = topicSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return `${topic.title} ${topic.id}`.toLocaleLowerCase().includes(query);
  });
  const selectedIndex = selected ? topics.findIndex((topic) => topic.id === selected.id) : -1;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await getTheoryTopics(runtime);
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
  }, [runtime, i18n.language, reloadToken]);

  useEffect(() => {
    if (!selected?.theory || selected.theory.content !== null) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void getTheoryTopic(runtime, selected.id)
      .then(detail => {
        if (cancelled || !detail) return;
        setTopics(current => current.map(topic => topic.id === detail.id ? detail : topic));
        setSelected(current => current?.id === detail.id ? detail : current);
      })
      .catch(() => {
        if (!cancelled) setDetailError(tr("Не вдалося завантажити тему. Спробуйте ще раз.", "Failed to load this topic. Please try again."));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [runtime, i18n.language, selected?.id, selected?.theory?.content, detailRetryToken]);

  const retryTopic = () => {
    setDetailRetryToken((value) => value + 1);
  };

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
            <PageEyebrow label="theory" />
          </div>
          <div className="mt-1 text-sm font-semibold tracking-tight text-text-primary">
            {tr("Курс:", "Course:")} {courseLabel}
          </div>
          <label htmlFor="theory-topic-search" className="sr-only">{tr("Пошук теми", "Search topics")}</label>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input id="theory-topic-search" name="topicSearch" type="search" autoComplete="off" value={topicSearch} onChange={(event) => setTopicSearch(event.target.value)} placeholder={tr("Знайти тему…", "Search topics…")} className="h-10 w-full rounded-lg border border-border bg-bg-base pl-9 pr-3 text-sm text-text-primary outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15" />
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
            <div role="alert" aria-live="assertive" className="m-2 rounded-lg border border-accent-error/50 bg-accent-error/10 px-3 py-3 text-xs font-mono text-accent-error">
              <div>{loadError}</div>
              <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="mt-2 rounded-md border border-accent-error/40 px-2.5 py-1.5 font-semibold hover:bg-accent-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-error/50">{tr("Спробувати ще", "Try again")}</button>
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
          {!loading && !loadError && topics.length > 0 && filteredTopics.length === 0 && (
            <div className="px-4 py-8 text-center text-xs font-mono text-text-secondary">{tr("Тем не знайдено", "No matching topics")}</div>
          )}
          <motion.div
            variants={prefersReducedMotion ? undefined : staggerContainer}
            initial={prefersReducedMotion ? undefined : "initial"}
            animate={prefersReducedMotion ? undefined : "animate"}
          >
            {filteredTopics.map(topic => (
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
              <nav aria-label={tr("Навігація по теорії", "Theory breadcrumb")} className="mb-2 text-[11px] font-mono text-text-muted">
                <span>{tr("Теорія", "Theory")}</span><span className="px-1.5">/</span><span>{courseLabel}</span><span className="px-1.5">/</span><span className="text-text-secondary">{selected.theory?.title || selected.title}</span>
              </nav>
              <PageEyebrow label={courseLabel} />
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
              ) : detailLoading ? (
                <div className="py-12 text-center text-sm font-mono text-text-secondary">
                  {tr("Завантаження теорії…", "Loading theory…")}
                </div>
              ) : detailError ? (
                <div role="alert" aria-live="assertive" className="flex flex-col items-center gap-3 py-12 text-center">
                  <BookOpen className="size-5 text-accent-error" aria-hidden="true" />
                  <div className="text-sm font-mono text-accent-error">{detailError}</div>
                  <button type="button" onClick={retryTopic} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{tr("Спробувати ще", "Try again")}</button>
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
              {topics.length > 1 && selectedIndex >= 0 ? (
                <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  <button type="button" disabled={selectedIndex === 0} onClick={() => setSelected(topics[selectedIndex - 1])} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40">← {tr("Попередня", "Previous")}</button>
                  <span className="text-[11px] font-mono text-text-muted">{selectedIndex + 1} / {topics.length}</span>
                  <button type="button" disabled={selectedIndex === topics.length - 1} onClick={() => setSelected(topics[selectedIndex + 1])} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40">{tr("Наступна", "Next")} →</button>
                </div>
              ) : null}
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
