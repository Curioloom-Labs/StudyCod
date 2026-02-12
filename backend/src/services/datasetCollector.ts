import { AppDataSource } from '../data-source';
import { Task } from '../entities/Task';
import { Grade } from '../entities/Grade';
import { logger } from '../utils/logger';
const taskRepo = () => AppDataSource.getRepository(Task);
const gradeRepo = () => AppDataSource.getRepository(Grade);
export interface TrainingExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}
export interface DatasetStats {
  totalTasks: number;
  highQualityTasks: number;
  mediumQualityTasks: number;
  byLanguage: {
    JAVA: number;
    PYTHON: number;
  };
  byDifficulty: {
    easy: number;
    medium: number;
    hard: number;
  };
}
function extractTrainingExample(task: Task): TrainingExample | null {
  try {
    const desc = task.description || task.descriptionMarkdown || '';
    if (!desc || !task.template) {
      return null;
    }
    const topicTitle = task.topic?.title || 'Unknown Topic';
    const langName = task.lang === 'JAVA' ? 'Java' : 'Python';
    const difus = task.difus || 0;
    const theoryMatch = desc.match(/^(.*?)(?:\n\n###\s*Практик|$)/s);
    const theoryMarkdown = theoryMatch ? theoryMatch[1].trim() : '';
    const practicalMatch = desc.match(/###\s*Практик[ае]\s*\n\n(.*?)(?:\n\n\*\*Формат|$)/s);
    const practicalTask = practicalMatch ? practicalMatch[1].trim() : '';
    const inputFormatMatch = desc.match(/\*\*Формат вхідних даних:\*\*\s*\n(.*?)(?:\n\n\*\*Формат вихідних|$)/s);
    const inputFormat = inputFormatMatch ? inputFormatMatch[1].trim() : 'Немає вхідних даних';
    const outputFormatMatch = desc.match(/\*\*Формат вихідних даних:\*\*\s*\n(.*?)(?:\n\n\*\*Обмеження|$)/s);
    const outputFormat = outputFormatMatch ? outputFormatMatch[1].trim() : '';
    const constraintsMatch = desc.match(/\*\*Обмеження:\*\*\s*\n(.*?)(?:\n\n\*\*Приклади|$)/s);
    const constraints = constraintsMatch ? constraintsMatch[1].trim() : '';
    const examplesMatch = desc.match(/\*\*Приклади:\*\*\s*\n(.*?)$/s);
    const examplesText = examplesMatch ? examplesMatch[1] : '';
    const examples: Array<{
      input: string;
      output: string;
      explanation: string;
    }> = [];
    const exampleMatches = examplesText.matchAll(/Приклад\s+\d+:\s*\nВхід:\s*(.*?)\s*\nВихід:\s*(.*?)\s*\nПояснення:\s*(.*?)(?=\nПриклад|$)/gs);
    for (const match of exampleMatches) {
      examples.push({
        input: match[1].trim(),
        output: match[2].trim(),
        explanation: match[3].trim()
      });
    }
    if (!practicalTask) {
      return null;
    }
    const difficultyPrompt = difus < 0.2 ? "Рівень: ПОЧАТКОВИЙ (Дуже легко)" : difus < 0.6 ? "Рівень: СЕРЕДНІЙ" : "Рівень: СКЛАДНИЙ";
    const taskType = task.type === 'CONTROL' ? 'КОНТРОЛЬНА РОБОТА' : task.numInTopic === 1 ? 'ВСТУПНЕ завдання' : 'Практичне завдання';
    const systemPrompt = `Ти досвідчений викладач програмування. Створюй якісні практичні завдання для студентів.

ВИМОГИ:
1. Завдання має бути РОЗРАХОВАНЕ НА КОНСОЛЬНУ ПРОГРАМУ (не графіка, не файли, не сторонні бібліотеки)
2. Завдання має бути ПЕРЕВІРЮВАНИМ: чіткий INPUT/OUTPUT, обмеження, приклади
3. Теорія має бути ДЕТАЛЬНОЮ з прикладами коду
4. Практичне завдання має бути КОНКРЕТНИМ, не абстрактним
5. Код-шаблон має бути ВАЛІДНИМ ${langName} кодом

ВІДПОВІДАЙ ТІЛЬКИ ВАЛІДНИМ JSON БЕЗ БУДЬ-ЯКИХ ПОЯСНЕНЬ НАВКОЛО.`;
    const userPrompt = `${taskType} для теми "${topicTitle}".

${difficultyPrompt}

Мова програмування: ${langName}

Теорія з теми (для контексту):
${theoryMarkdown.slice(0, 3000)}

ЗАВДАННЯ:
Створи повне завдання (теорія + практика) у форматі JSON.`;
    const expectedResponse = {
      title: task.title,
      topic: topicTitle,
      difficulty: Math.max(1, Math.min(5, Math.round(difus * 5 || 1))),
      theoryMarkdown: theoryMarkdown,
      practicalTask: practicalTask,
      inputFormat: inputFormat,
      outputFormat: outputFormat,
      constraints: constraints,
      examples: examples.length > 0 ? examples : [{
        input: 'N/A',
        output: 'N/A',
        explanation: 'Приклад не надано'
      }],
      codeTemplate: task.template
    };
    return {
      messages: [{
        role: 'system',
        content: systemPrompt
      }, {
        role: 'user',
        content: userPrompt
      }, {
        role: 'assistant',
        content: JSON.stringify(expectedResponse, null, 2)
      }]
    };
  } catch (err: any) {
    logger.warn('[dataset] extract failed', { message: err?.message });
    return null;
  }
}
export async function collectTrainingDataset(options: {
  minGrade?: number;
  minTasks?: number;
  languages?: ('JAVA' | 'PYTHON')[];
} = {}): Promise<{
  examples: TrainingExample[];
  stats: DatasetStats;
}> {
  const {
    minGrade = 6,
    minTasks = 10,
    languages = ['JAVA', 'PYTHON']
  } = options;
  const tasks = await taskRepo().find({
    where: languages.map(lang => ({
      lang
    })) as any,
    relations: ['topic', 'grades'],
    order: {
      createdAt: 'DESC'
    } as any
  });
  const stats: DatasetStats = {
    totalTasks: tasks.length,
    highQualityTasks: 0,
    mediumQualityTasks: 0,
    byLanguage: {
      JAVA: 0,
      PYTHON: 0
    },
    byDifficulty: {
      easy: 0,
      medium: 0,
      hard: 0
    }
  };
  const examples: TrainingExample[] = [];
  const tasksByLang: {
    [key: string]: TrainingExample[];
  } = {
    JAVA: [],
    PYTHON: []
  };
  for (const task of tasks) {
    const grades = task.grades || [];
    const bestGrade = grades.length > 0 ? Math.max(...grades.map(g => g.total || 0).filter(g => g > 0)) : 0;
    if (bestGrade < minGrade) {
      continue;
    }
    stats.byLanguage[task.lang]++;
    if (task.difus === 0) stats.byDifficulty.easy++;else if (task.difus === 0.5) stats.byDifficulty.medium++;else stats.byDifficulty.hard++;
    if (bestGrade >= 9) stats.highQualityTasks++;else if (bestGrade >= 6) stats.mediumQualityTasks++;
    const example = extractTrainingExample(task);
    if (example && tasksByLang[task.lang].length < 100) {
      tasksByLang[task.lang].push(example);
    }
  }
  for (const lang of languages) {
    if (tasksByLang[lang].length < minTasks) {
      logger.warn('[dataset] low volume', { lang, count: tasksByLang[lang].length, minTasks });
    }
    examples.push(...tasksByLang[lang]);
  }
  return {
    examples,
    stats
  };
}
export function exportToJSONL(examples: TrainingExample[]): string {
  return examples.map(ex => JSON.stringify(ex)).join('\n');
}
export function exportToHuggingFaceFormat(examples: TrainingExample[]): any[] {
  return examples.map(ex => ({
    instruction: ex.messages.find(m => m.role === 'user')?.content || '',
    input: '',
    output: ex.messages.find(m => m.role === 'assistant')?.content || '',
    system: ex.messages.find(m => m.role === 'system')?.content || ''
  }));
}