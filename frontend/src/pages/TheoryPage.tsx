import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { User } from '../types';
import { tr } from '../i18n';
interface TheoryTopic {
  id: string;
  title: {
    uk: string;
    en: string;
  };
  content: {
    uk: string;
    en: string;
  };
}
const JAVA_THEORY: TheoryTopic[] = [{
  id: 'j1',
  title: {
    uk: 'Вступ до Java',
    en: 'Introduction to Java'
  },
  content: {
    uk: 'Java — це об’єктно-орієнтована мова програмування...',
    en: 'Java is an object-oriented programming language...'
  }
}, {
  id: 'j2',
  title: {
    uk: 'Змінні та типи',
    en: 'Variables and types'
  },
  content: {
    uk: 'У Java є примітивні типи (int, double) та посилальні типи (String, масиви тощо)...',
    en: 'Java has primitive types (int, double) and reference types (String, arrays, etc.)...'
  }
}, {
  id: 'j3',
  title: {
    uk: 'ООП принципи',
    en: 'OOP principles'
  },
  content: {
    uk: 'Інкапсуляція, успадкування, поліморфізм, абстракція...',
    en: 'Encapsulation, inheritance, polymorphism, abstraction...'
  }
}];
const PYTHON_THEORY: TheoryTopic[] = [{
  id: 'p1',
  title: {
    uk: 'Вступ до Python',
    en: 'Introduction to Python'
  },
  content: {
    uk: 'Python — інтерпретована мова програмування високого рівня...',
    en: 'Python is a high-level interpreted programming language...'
  }
}, {
  id: 'p2',
  title: {
    uk: 'Списки та словники',
    en: 'Lists and dictionaries'
  },
  content: {
    uk: 'List — впорядкована колекція. Dictionary — пари ключ-значення...',
    en: 'List is an ordered collection. Dictionary stores key-value pairs...'
  }
}, {
  id: 'p3',
  title: {
    uk: 'Функції',
    en: 'Functions'
  },
  content: {
    uk: 'Функції у Python визначаються ключовим словом def...',
    en: 'In Python, functions are defined using the def keyword...'
  }
}];
interface TheoryPageProps {
  user: User;
}
export const TheoryPage: React.FC<TheoryPageProps> = ({
  user
}) => {
  const {
    i18n
  } = useTranslation();
  const langKey = i18n.language === 'uk' ? 'uk' : 'en';
  const topics = useMemo(() => user.course === 'PYTHON' ? PYTHON_THEORY : JAVA_THEORY, [user.course]);
  const [selected, setSelected] = useState<TheoryTopic | null>(null);
  return <div className="flex flex-col md:flex-row gap-6 p-6">
      <div className="md:w-1/3 bg-bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
        <div className="p-4 bg-bg-code border-b border-border">
          <h2 className="font-bold text-text-primary flex items-center gap-2 font-mono">
            <BookOpen size={20} className="text-primary" />
            {tr('Курс:', 'Course:')} {user.course === 'JAVA' ? 'Java' : 'Python'}
          </h2>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {topics.map(topic => <button key={topic.id} onClick={() => setSelected(topic)} className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all ${selected?.id === topic.id ? 'bg-bg-hover text-text-primary border border-primary' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-transparent'}`}>
              <span className="truncate text-sm font-medium font-mono">
                {topic.title[langKey]}
              </span>
              <ChevronRight size={16} className={`opacity-50 ${selected?.id === topic.id ? 'text-primary' : ''}`} />
            </button>)}
        </div>
      </div>

      <div className="md:w-2/3 bg-bg-surface rounded-xl border border-border p-6">
        {selected ? <div>
            <h1 className="text-2xl font-bold text-text-primary mb-4 font-mono">
              {selected.title[langKey]}
            </h1>
            <p className="text-text-secondary leading-relaxed">
              {selected.content[langKey]}
            </p>
            <div className="mt-8 p-4 bg-bg-code rounded-lg border-l-4 border-primary">
              <h4 className="font-bold text-text-primary text-sm mb-1 font-mono">
                {tr('Примітка:', 'Note:')}
              </h4>
              <p className="text-sm text-text-secondary">
                {tr('У реальному застосунку тут підтягується повний текст лекції з бази даних / JSON.', 'In a real app, the full lecture text would be loaded from the database / JSON.')}
              </p>
            </div>
          </div> : <div className="py-16 flex flex-col items-center justify-center text-text-muted">
            <BookOpen size={64} className="mb-4 opacity-20 text-text-muted" />
            <p>{tr('Оберіть тему зі списку, щоб розпочати навчання', 'Choose a topic from the list to start learning')}</p>
          </div>}
      </div>
    </div>;
};