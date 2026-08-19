import {
  loadCurriculumManifest,
  loadCurriculumMiniProjects,
  loadCurriculumTopics,
  repoRoot,
  type CurriculumCourseDefinition,
  type CurriculumLocale,
  type CurriculumMiniProject,
  type CurriculumTopic,
} from "../utils/curriculum";

export type { CurriculumLocale } from "../utils/curriculum";

type LocalizedCurriculum = {
  courses: Map<string, CurriculumCourseDefinition>;
  topics: Map<string, CurriculumTopic>;
  projects: Map<string, CurriculumMiniProject>;
};

const cache = new Map<CurriculumLocale, LocalizedCurriculum>();

function localeLabel(locale: CurriculumLocale, uk: string, en: string): string {
  return locale === "en" ? en : uk;
}

function splitObjectives(description: string): string[] {
  return description.split(".").map((part) => part.trim()).filter(Boolean);
}

function starterCode(runtime: CurriculumCourseDefinition["runtime"], locale: CurriculumLocale): string {
  const comment = localeLabel(locale, "Напишіть розв’язання тут", "Write your solution here");
  if (runtime === "JAVA") return `public class Main {\n    public static void main(String[] args) {\n        // ${comment}\n    }\n}`;
  if (runtime === "CPP") return `#include <iostream>\n\nint main() {\n    // ${comment}\n    return 0;\n}`;
  return `# ${comment}\n`;
}

function withoutLegacyDocumentation(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !/README(?:\.md)?/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function projectMarkdown(project: CurriculumMiniProject, locale: CurriculumLocale): string {
  return [
    `## ${project.title}`,
    "",
    project.description,
    "",
    `**${localeLabel(locale, "Орієнтовний час", "Estimated time")}:** ${project.estimatedMinutes} ${localeLabel(locale, "хвилин", "minutes")}`,
    "",
    `**${localeLabel(locale, "Навички", "Skills")}:** ${project.skills.join(", ")}`,
    "",
    `### ${localeLabel(locale, "Стартова структура", "Starter structure")}`,
    "```text",
    withoutLegacyDocumentation(project.template),
    "```",
    "",
    `### ${localeLabel(locale, "Етапи", "Milestones")}`,
    ...project.milestones.map((milestone, index) => `${index + 1}. **${milestone.title}** — ${milestone.description}`),
    "",
    `### ${localeLabel(locale, "Критерії готовності", "Acceptance criteria")}`,
    ...project.acceptanceCriteria.filter((criterion) => !/README/i.test(criterion)).map((criterion) => `- ${criterion}`),
  ].join("\n");
}

function sanitizeProjectContent(content: Record<string, unknown>): Record<string, unknown> {
  if (content.project !== true) return content;
  const projectSpec = content.projectSpec && typeof content.projectSpec === "object"
    ? { ...(content.projectSpec as Record<string, unknown>) }
    : null;
  if (projectSpec) {
    if (typeof projectSpec.template === "string") projectSpec.template = withoutLegacyDocumentation(projectSpec.template);
    if (Array.isArray(projectSpec.acceptanceCriteria)) {
      projectSpec.acceptanceCriteria = projectSpec.acceptanceCriteria.filter((criterion) => typeof criterion === "string" && !/README/i.test(criterion));
    }
  }
  return {
    ...content,
    ...(typeof content.markdown === "string" ? { markdown: withoutLegacyDocumentation(content.markdown) } : {}),
    ...(projectSpec ? { projectSpec } : {}),
  };
}

function finalAssessment(locale: CurriculumLocale) {
  return {
    title: localeLabel(locale, "Фінальна робота курсу", "Final course work"),
    markdown: [
      `## ${localeLabel(locale, "Фінальна робота", "Final work")}`,
      "",
      localeLabel(
        locale,
        "Збери в одну завершену роботу навички цього курсу. Опиши рішення, покажи ключові сценарії та зафіксуй відомі обмеження.",
        "Bring the skills from this course together in one finished project. Describe the solution, show the key scenarios, and record known limitations.",
      ),
      "",
      localeLabel(
        locale,
        "Ця робота є фінальною перевіркою курсу: після подання вона відкриває завершення курсу.",
        "This is the course's final assessment: submitting it unlocks course completion.",
      ),
    ].join("\n"),
  };
}

export function normalizeCurriculumLocale(value: unknown): CurriculumLocale {
  return String(value ?? "").toLowerCase().startsWith("en") ? "en" : "uk";
}

export function getLocalizedCurriculum(locale: CurriculumLocale): LocalizedCurriculum {
  const cached = cache.get(locale);
  if (cached) return cached;

  const root = repoRoot();
  const { manifest } = loadCurriculumManifest(root, locale);
  const courses = new Map(manifest.courses.map((course) => [course.key, course]));
  const topics = new Map<string, CurriculumTopic>();
  const projects = new Map<string, CurriculumMiniProject>();
  for (const course of manifest.courses) {
    const localizedTopics = loadCurriculumTopics(course, root, locale);
    if (locale === "en") {
      // Course item IDs were created from the Ukrainian curriculum keys. The
      // English copies may have slugs derived from translated titles, so pair
      // both catalogs by the stable authoring order and expose the Ukrainian
      // key as the canonical lookup key used by persisted course items.
      const ukCourse = loadCurriculumManifest(root, "uk").manifest.courses.find((candidate) => candidate.key === course.key);
      const ukTopics = ukCourse ? loadCurriculumTopics(ukCourse, root, "uk") : [];
      for (const [index, topic] of localizedTopics.entries()) {
        const canonical = ukTopics[index];
        topics.set(`${course.key}.${canonical?.key ?? topic.key}`, topic);
        topics.set(`${course.key}.${topic.key}`, topic);
      }
    } else {
      for (const topic of localizedTopics) topics.set(`${course.key}.${topic.key}`, topic);
    }
    for (const project of loadCurriculumMiniProjects(course.key, root, locale)) projects.set(`${course.key}.${project.key}`, project);
  }
  const value = { courses, topics, projects };
  cache.set(locale, value);
  return value;
}

export function localizedCourseMetadata(courseKey: string | null | undefined, locale: CurriculumLocale) {
  if (!courseKey) return null;
  return getLocalizedCurriculum(locale).courses.get(courseKey) ?? null;
}

export function localizedPrerequisiteTitle(courseKey: string | null | undefined, locale: CurriculumLocale, fallback: string): string {
  return localizedCourseMetadata(courseKey, locale)?.title ?? fallback;
}

/**
 * Overlay the authored locale onto the DB item while preserving its numeric ID
 * and progress relationship. Progress therefore remains shared by languages.
 */
export function localizeCourseItem<T extends { contentKey?: string | null; title: string; content?: Record<string, unknown> | null }>(item: T, locale: CurriculumLocale): T {
  const baseContent = sanitizeProjectContent(item.content ?? {});
  if (locale === "uk" || !item.contentKey) return { ...item, content: baseContent };
  const contentKey = String(item.contentKey);
  const courseKey = contentKey.split(".")[0] || "";
  const curriculum = getLocalizedCurriculum(locale);
  const topicMatch = contentKey.match(/^([a-z0-9-]+)\.([a-z0-9-]+)\.(theory|practice|practice-(\d+))$/);
  if (topicMatch) {
    const topic = curriculum.topics.get(`${topicMatch[1]}.${topicMatch[2]}`);
    if (!topic) return item;
     const content = { ...baseContent };
    if (topicMatch[3] === "theory") {
      content.markdown = topic.content;
      content.objectives = splitObjectives(topic.description);
      return { ...item, title: topic.title, content };
    }
    const sequence = Number(topicMatch[4] || 1);
    const exercise = { ...((content.exercise as Record<string, unknown> | undefined) ?? {}) };
    exercise.prompt = topic.exerciseFocus;
    exercise.starterCode = starterCode(curriculum.courses.get(courseKey)?.runtime ?? "PYTHON", locale);
    content.exercise = exercise;
    const total = Number(exercise.total || content.total || 1);
    const title = topicMatch[3] === "practice"
      ? `Practice: ${topic.title}`
      : `Practice ${sequence}/${total}: ${topic.title}`;
    return { ...item, title, content };
  }

  const projectMatch = contentKey.match(/^([a-z0-9-]+)\.project\.([a-z0-9-]+)$/);
  if (projectMatch) {
    const project = curriculum.projects.get(`${projectMatch[1]}.${projectMatch[2]}`);
    if (!project) return item;
     const content = { ...baseContent };
    content.markdown = projectMarkdown(project, locale);
    content.projectSpec = {
      ...(content.projectSpec as Record<string, unknown> | undefined),
      estimatedMinutes: project.estimatedMinutes,
      skills: project.skills,
      requiredTopicKeys: project.requiredTopicKeys,
      milestones: project.milestones,
      acceptanceCriteria: project.acceptanceCriteria,
       template: withoutLegacyDocumentation(project.template),
      ...(project.checkSpec ? { checkSpec: project.checkSpec } : {}),
    };
    return { ...item, title: `Mini-project: ${project.title}`, content };
  }

  if (contentKey === `${courseKey}.final-assessment`) {
    const final = finalAssessment(locale);
    const content = {
      ...(item.content ?? {}),
      markdown: final.markdown,
      projectSpec: {
        ...((item.content ?? {}).projectSpec as Record<string, unknown> | undefined),
        skills: localeLabel(locale, "інтеграція, документація, перевірка", "integration, documentation, verification").split(", "),
        milestones: [
          {
            id: "scope",
            title: localeLabel(locale, "Сформулювати задачу", "Define the task"),
            description: localeLabel(locale, "Опиши задачу, користувача та очікуваний результат.", "Describe the task, the user, and the expected outcome."),
          },
          {
            id: "implementation",
            title: localeLabel(locale, "Реалізувати рішення", "Implement the solution"),
            description: localeLabel(locale, "Покажи основну реалізацію та ключові технічні рішення.", "Show the main implementation and key technical decisions."),
          },
          {
            id: "verification",
            title: localeLabel(locale, "Перевірити результат", "Verify the result"),
            description: localeLabel(locale, "Додай приклади перевірки, тестування або демонстрації.", "Add examples of verification, testing, or demonstration."),
          },
        ],
        acceptanceCriteria: [
          localeLabel(locale, "Усі етапи виконані", "All milestones are complete"),
          localeLabel(locale, "Є короткі нотатки реалізації", "Short implementation notes are included"),
           localeLabel(locale, "Є короткі нотатки про запуск і обмеження", "Short setup and limitation notes are included"),
        ],
        template: localeLabel(locale, "# Фінальна робота\n\n## Рішення\n\n## Перевірка\n", "# Final work\n\n## Solution\n\n## Verification\n"),
      },
    };
    return { ...item, title: final.title, content };
  }

  return item;
}

export function localizedModuleTitle(contentKey: string | null | undefined, locale: CurriculumLocale, fallback: string): string {
  if (locale === "uk") return fallback;
  if (String(contentKey || "").endsWith(".projects")) return "Projects and final work";
  if (String(contentKey || "").endsWith(".main")) return "Course roadmap";
  return fallback;
}
