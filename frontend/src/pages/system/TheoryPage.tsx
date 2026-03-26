import React, { useEffect, useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import type { User } from "../../types";
import { tr } from "../../i18n";
import { getTheoryTopics, type TheoryTopic } from "../../lib/api/theory";
import { MarkdownView } from "../../components/MarkdownView";
interface TheoryPageProps {
  user: User;
}
export const TheoryPage: React.FC<TheoryPageProps> = ({
  user
}) => {
  const [topics, setTopics] = useState<TheoryTopic[]>([]);
  const [selected, setSelected] = useState<TheoryTopic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user.course]);

  return <div className="flex flex-col md:flex-row gap-6 p-6">
      <div className="md:w-1/3 bg-bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
        <div className="p-4 bg-bg-code border-b border-border">
          <h2 className="font-bold text-text-primary flex items-center gap-2 font-mono">
            <BookOpen size={20} className="text-primary" />
            {tr('Курс:', 'Course:')} {user.course === 'JAVA' ? 'Java' : 'Python'}
          </h2>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {loading && <div className="p-3 text-sm font-mono text-text-secondary">{tr("Завантаження…", "Loading…")}</div>}
          {!loading && topics.map(topic => <button key={topic.id} onClick={() => setSelected(topic)} className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all ${selected?.id === topic.id ? 'bg-bg-hover text-text-primary border border-primary' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-transparent'}`}>
              <span className="truncate text-sm font-medium font-mono">
                {topic.title}
              </span>
              <ChevronRight size={16} className={`opacity-50 ${selected?.id === topic.id ? 'text-primary' : ''}`} />
            </button>)}
          {!loading && topics.length === 0 && <div className="p-3 text-sm font-mono text-text-secondary">{tr("Немає теорії для цього курсу", "No theory available for this course")}</div>}
        </div>
      </div>

      <div className="md:w-2/3 bg-bg-surface rounded-xl border border-border p-6">
        {selected ? <div>
            <h1 className="text-2xl font-bold text-text-primary mb-4 font-mono">
              {selected.theory?.title || selected.title}
            </h1>
            {selected.theory?.content ? <div className="text-text-secondary leading-relaxed">
                <MarkdownView content={selected.theory.content} />
              </div> : <div className="text-sm font-mono text-text-secondary">{tr("Для цієї теми теорія ще не додана.", "No theory has been added for this topic yet.")}</div>}
          </div> : <div className="py-16 flex flex-col items-center justify-center text-text-muted">
            <BookOpen size={64} className="mb-4 opacity-20 text-text-muted" />
            <p>{tr('Оберіть тему зі списку, щоб розпочати навчання', 'Choose a topic from the list to start learning')}</p>
          </div>}
      </div>
    </div>;
};