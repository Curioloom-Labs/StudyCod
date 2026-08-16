import crypto from "crypto";
import { AppDataSource } from "../data-source";
import { Course } from "../entities/Course";
import { CourseDependency } from "../entities/CourseDependency";
import { CourseItem } from "../entities/CourseItem";
import { CourseModule } from "../entities/CourseModule";
import { CourseVariant } from "../entities/CourseVariant";
import { loadCurriculumMiniProjects, loadCurriculumTopics, validateCurriculum, type CurriculumCourseDefinition, type CurriculumMiniProject, type CurriculumTopic } from "../utils/curriculum";

export type CurriculumSyncReport = {
  dryRun: boolean;
  theoryOnly: boolean;
  manifestHash: string;
  coursesCreated: number;
  coursesUpdated: number;
  modulesCreated: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsArchived: number;
  variantsCreated: number;
  dependenciesCreated: number;
  dependenciesRemoved: number;
};

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function courseHash(course: CurriculumCourseDefinition, topics: CurriculumTopic[]): string {
  return hash({ course, topics: topics.map((topic) => ({ key: topic.key, sourceHash: topic.sourceHash })) });
}

function extractExerciseFocus(markdown: string): string | null {
  const match = markdown.match(/exercise_focus:\s*([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

function starterCode(runtime: CurriculumCourseDefinition["runtime"]): string {
  if (runtime === "JAVA") return "public class Main {\n    public static void main(String[] args) {\n        // Напишіть розв’язання тут\n    }\n}";
  if (runtime === "CPP") return "#include <iostream>\n\nint main() {\n    // Напишіть розв’язання тут\n    return 0;\n}";
  return "# Напишіть розв’язання тут\n";
}

function isIntroTopic(topic: CurriculumTopic): boolean {
  return topic.key.startsWith("vstup-") || /вступ/i.test(topic.title);
}

function practiceCount(topic: CurriculumTopic): number {
  return isIntroTopic(topic) ? 1 : 3;
}

function exerciseDefinition(course: CurriculumCourseDefinition, topic: CurriculumTopic, theoryKey: string, sequence: number, total: number) {
  return {
    version: 1,
    generation: "deterministic-v1",
    exerciseKey: `${course.key}.${topic.key}.practice-${sequence}`,
    sequence,
    total,
    generatedAfterTheory: true,
    theoryItemKey: theoryKey,
    prompt: topic.exerciseFocus || extractExerciseFocus(topic.content) || `Виконайте коротку практичну вправу за темою «${topic.title}». Продемонструйте результат у коді та перевірте його на власному прикладі.`,
    starterCode: starterCode(course.runtime),
    runtime: course.runtime,
    evaluation: { mode: "MANUAL_OR_RUNTIME", solutionNotStoredInClient: true },
  };
}

function topicItems(course: CurriculumCourseDefinition, topic: CurriculumTopic, theoryId?: number) {
  const theoryKey = `${course.key}.${topic.key}.theory`;
  const practiceKey = `${course.key}.${topic.key}.practice`;
  const totalPractices = practiceCount(topic);
  return {
    theory: {
      contentKey: theoryKey,
      title: topic.title,
      order: 0,
      sourceHash: topic.sourceHash,
      sourcePath: topic.sourcePath,
      content: {
        markdown: topic.content,
        objectives: topic.description ? topic.description.split(".").map((part) => part.trim()).filter(Boolean) : [],
        required: true,
        learningContract: "theory-before-practice",
        sourceKey: theoryKey,
      },
    },
    practice: {
      contentKey: practiceKey,
      title: `Практика: ${topic.title}`,
      order: 1,
      sourceHash: topic.sourceHash,
      sourcePath: topic.sourcePath,
      content: {
        generated: true,
        exercisePolicy: "generate-after-reading",
        runtime: course.runtime,
        theoryItemKey: theoryKey,
        ...(theoryId ? { theoryItemId: theoryId } : {}),
        required: true,
        generatedAfterTheory: true,
        exercise: exerciseDefinition(course, topic, theoryKey, 1, totalPractices),
      },
    },
    practices: Array.from({ length: totalPractices }, (_, index) => {
      const sequence = index + 1;
      return {
        contentKey: `${course.key}.${topic.key}.practice-${sequence}`,
        legacyContentKeys: sequence === 1 ? [practiceKey] : [],
        title: `Практика ${sequence}/${totalPractices}: ${topic.title}`,
        order: sequence,
        sourceHash: topic.sourceHash,
        sourcePath: topic.sourcePath,
        content: {
          generated: true,
          exercisePolicy: "generate-after-reading",
          runtime: course.runtime,
          theoryItemKey: theoryKey,
          ...(theoryId ? { theoryItemId: theoryId } : {}),
          required: true,
          generatedAfterTheory: true,
          exercise: exerciseDefinition(course, topic, theoryKey, sequence, totalPractices),
        },
      };
    }),
  };
}

function miniProjectItem(course: CurriculumCourseDefinition, project: CurriculumMiniProject, order: number) {
  const projectKey = `${course.key}.project.${project.key}`;
  const markdown = [
    `## ${project.title}`,
    "",
    project.description,
    "",
    `**Орієнтовний час:** ${project.estimatedMinutes} хвилин`,
    "",
    `**Навички:** ${project.skills.join(", ")}`,
    "",
    "### Стартова структура",
    "```text",
    project.template,
    "```",
    "",
    "### Milestones",
    ...project.milestones.map((milestone, index) => `${index + 1}. **${milestone.title}** — ${milestone.description}`),
    "",
    "### Критерії готовності",
    ...project.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
    "Це інтеграційний мініпроєкт. Спочатку спроєктуйте контракт, потім реалізовуйте milestone послідовно й залиште короткий README з рішеннями та відомими обмеженнями.",
  ].join("\n");
  return {
    contentKey: projectKey,
    title: `Мініпроєкт: ${project.title}`,
    order,
    sourceHash: hash(project),
    sourcePath: "curriculum/mini_projects.yml",
    content: {
      project: true,
      projectKey,
      markdown,
      generated: false,
      required: true,
      projectSpec: {
        version: 1,
        kind: "MINI_PROJECT",
        estimatedMinutes: project.estimatedMinutes,
        skills: project.skills,
        milestones: project.milestones,
        acceptanceCriteria: project.acceptanceCriteria,
        template: project.template,
        ...(project.checkSpec ? { checkSpec: project.checkSpec } : {}),
      },
    },
  };
}

function finalAssessmentItem(course: CurriculumCourseDefinition, order: number) {
  const projectKey = `${course.key}.final-assessment`;
  return {
    contentKey: projectKey,
    title: "Фінальна робота курсу",
    order,
    sourceHash: hash({ course: course.key, version: 1 }),
    sourcePath: "curriculum/final-assessment",
    content: {
      project: true,
      finalAssessment: true,
      projectKey,
      markdown: [
        "## Фінальна робота",
        "",
        "Збери в одну завершену роботу навички цього курсу. Опиши рішення, покажи ключові сценарії та зафіксуй відомі обмеження.",
        "",
        "Ця робота є фінальною перевіркою курсу: після подання вона відкриває завершення курсу.",
      ].join("\\n"),
      generated: false,
      required: true,
      projectSpec: {
        version: 1,
        kind: "FINAL_ASSESSMENT",
        estimatedMinutes: 120,
        skills: ["integration", "documentation", "verification"],
        milestones: [
          { id: "scope", title: "Сформулювати задачу", description: "Опиши задачу, користувача та очікуваний результат." },
          { id: "implementation", title: "Реалізувати рішення", description: "Покажи основну реалізацію та ключові технічні рішення." },
          { id: "verification", title: "Перевірити результат", description: "Додай приклади перевірки, тестування або демонстрації." },
        ],
        acceptanceCriteria: ["Усі етапи виконані", "Є короткі нотатки реалізації", "README пояснює запуск і обмеження"],
        template: "# Фінальна робота\\n\\n## Рішення\\n\\n## Перевірка\\n",
      },
    },
  };
}

async function saveCourseItem(itemRepo: ReturnType<typeof AppDataSource.getRepository<CourseItem>>, module: CourseModule, input: any, report: CurriculumSyncReport, dryRun: boolean, preserveExisting = false): Promise<CourseItem> {
  let item = await itemRepo.findOne({ where: { module: { id: module.id }, contentKey: input.contentKey } });
  if (!item && input.legacyContentKeys?.length) {
    for (const legacyContentKey of input.legacyContentKeys) {
      item = await itemRepo.findOne({ where: { module: { id: module.id }, contentKey: legacyContentKey } });
      if (item) break;
    }
  }
  const created = !item;
  // Theory is the authored source, but generated practice is a learner-facing
  // artifact that must remain stable when theory is edited. Preserve an
  // existing practice byte-for-byte; only a new topic gets newly generated
  // practice items. This lets us add lessons without rewriting old attempts.
  if (item && preserveExisting) return item;
  if (!item) item = itemRepo.create({ module: { id: module.id } as any, contentKey: input.contentKey });
  item.contentKey = input.contentKey;
  const changed = created || item.sourceHash !== input.sourceHash || item.title !== input.title || JSON.stringify(item.content) !== JSON.stringify(input.content);
  item.kind = input.kind;
  item.title = input.title;
  item.order = input.order;
  item.sourceHash = input.sourceHash;
  item.sourcePath = input.sourcePath;
  item.contentVersion = created ? 1 : changed ? (item.contentVersion || 1) + 1 : item.contentVersion || 1;
  item.isActive = true;
  item.content = input.content;
  if (created) report.itemsCreated += 1;
  else if (changed) report.itemsUpdated += 1;
  if (dryRun) return item;
  return itemRepo.save(item);
}

export async function syncCurriculum(options: { dryRun?: boolean; theoryOnly?: boolean } = {}): Promise<CurriculumSyncReport> {
  const dryRun = options.dryRun === true;
  const theoryOnly = options.theoryOnly === true;
  const { manifest, manifestHash, topics } = validateCurriculum();
  const report: CurriculumSyncReport = { dryRun, theoryOnly, manifestHash, coursesCreated: 0, coursesUpdated: 0, modulesCreated: 0, itemsCreated: 0, itemsUpdated: 0, itemsArchived: 0, variantsCreated: 0, dependenciesCreated: 0, dependenciesRemoved: 0 };
  if (dryRun) return report;

  await AppDataSource.transaction(async (manager) => {
    const txCourseRepo = manager.getRepository(Course);
    const txModuleRepo = manager.getRepository(CourseModule);
    const txItemRepo = manager.getRepository(CourseItem);
    const txVariantRepo = manager.getRepository(CourseVariant);
    const txDependencyRepo = manager.getRepository(CourseDependency);
    const courses = new Map<string, Course>();

    for (const definition of manifest.courses) {
      const courseTopics = topics[definition.key] || loadCurriculumTopics(definition);
      const sourceHash = courseHash(definition, courseTopics);
      let course = await txCourseRepo.findOne({ where: { catalogKey: definition.key } });
      const created = !course;
      if (!course) course = txCourseRepo.create({ catalogKey: definition.key, organization: null });
      const changed = created || course.sourceHash !== sourceHash || course.title !== definition.title || course.description !== (definition.description || null);
      course.title = definition.title;
      course.description = definition.description || null;
      course.level = definition.level;
      course.isBase = definition.isBase === true;
      course.status = "PUBLISHED";
      course.sourceHash = sourceHash;
      course.contentVersion = manifest.version;
      course.lastSyncedAt = new Date();
      course = await txCourseRepo.save(course);
      courses.set(definition.key, course);
      if (created) report.coursesCreated += 1;
      else if (changed) report.coursesUpdated += 1;

      let variant = await txVariantRepo.findOne({ where: { course: { id: course.id }, runtime: definition.runtime } });
      if (!variant) {
        variant = txVariantRepo.create({ course: { id: course.id } as any, runtime: definition.runtime, title: definition.runtime === "CPP" ? "C++" : definition.runtime === "JAVA" ? "Java" : "Python", status: "PUBLISHED" });
        await txVariantRepo.save(variant);
        report.variantsCreated += 1;
      } else if (variant.status !== "PUBLISHED") {
        variant.status = "PUBLISHED";
        await txVariantRepo.save(variant);
      }

      const legacyMain = await txModuleRepo.findOne({ where: { course: { id: course.id }, contentKey: `${definition.key}.main` } });
      const desiredKeys = new Set<string>();
      const topicModuleIds = new Set<number>();
      for (const topic of courseTopics) {
        const topicModuleKey = `${definition.key}.topic.${topic.key}`;
        let module = await txModuleRepo.findOne({ where: { course: { id: course.id }, contentKey: topicModuleKey } });
        const wasCreated = !module;
        if (!module) {
          module = txModuleRepo.create({ course: { id: course.id } as any, contentKey: topicModuleKey, title: topic.title, order: courseTopics.indexOf(topic), sourceHash: topic.sourceHash });
          report.modulesCreated += 1;
        } else {
          module.title = topic.title;
          module.order = courseTopics.indexOf(topic);
          module.sourceHash = topic.sourceHash;
        }
        module = await txModuleRepo.save(module);
        topicModuleIds.add(module.id);
        // Move legacy flat items into their native topic module once. This
        // keeps existing progress rows valid because progress references item id.
        if (wasCreated && legacyMain) {
          const legacyItems = await txItemRepo.find({ where: { module: { id: legacyMain.id } } });
          for (const legacyItem of legacyItems) {
            if (legacyItem.contentKey?.startsWith(`${definition.key}.${topic.key}.`)) {
              legacyItem.module = module;
              await txItemRepo.save(legacyItem);
            }
          }
        }
        const pair = topicItems(definition, topic);
        const theory = await saveCourseItem(txItemRepo, module, { ...pair.theory, kind: "THEORY", order: 0 }, report, false);
        desiredKeys.add(pair.theory.contentKey);
        if (!theoryOnly) {
          const practices = topicItems(definition, topic, theory.id).practices;
          for (const practice of practices) {
            await saveCourseItem(txItemRepo, module, { ...practice, kind: "CODE_TASK", order: practice.order }, report, false, true);
            desiredKeys.add(practice.contentKey);
          }
        }
      }
      const projectsModuleKey = `${definition.key}.projects`;
      let projectsModule = await txModuleRepo.findOne({ where: { course: { id: course.id }, contentKey: projectsModuleKey } });
      if (!projectsModule) {
        projectsModule = txModuleRepo.create({ course: { id: course.id } as any, contentKey: projectsModuleKey, title: "Проєкти та фінальна робота", order: courseTopics.length, sourceHash });
        report.modulesCreated += 1;
      } else {
        projectsModule.title = "Проєкти та фінальна робота";
        projectsModule.order = courseTopics.length;
        projectsModule.sourceHash = sourceHash;
      }
      projectsModule = await txModuleRepo.save(projectsModule);
      const miniProjects = loadCurriculumMiniProjects(definition.key);
      for (const [projectIndex, project] of miniProjects.entries()) {
        const item = miniProjectItem(definition, project, projectIndex);
        await saveCourseItem(txItemRepo, projectsModule, { ...item, kind: "MANUAL" }, report, false);
        desiredKeys.add(item.contentKey);
      }
      const finalItem = finalAssessmentItem(definition, miniProjects.length);
      await saveCourseItem(txItemRepo, projectsModule, { ...finalItem, kind: "MANUAL" }, report, false);
      desiredKeys.add(finalItem.contentKey);
      const allCourseModules = await txModuleRepo.find({ where: { course: { id: course.id } } });
      for (const staleModule of allCourseModules) {
        if (topicModuleIds.has(staleModule.id) || staleModule.id === projectsModule.id) continue;
        if (staleModule.id === legacyMain?.id) {
          staleModule.title = "Архівні елементи";
          staleModule.order = courseTopics.length + 1;
          await txModuleRepo.save(staleModule);
        }
        const existingItems = await txItemRepo.find({ where: { module: { id: staleModule.id } } });
        for (const item of existingItems) {
          if (item.kind === "CODE_TASK") continue;
          if (item.isActive !== false) {
            item.isActive = false;
            item.content = { ...(item.content || {}), required: false, archivedBySync: true };
            await txItemRepo.save(item);
            report.itemsArchived += 1;
          }
        }
      }
      for (const moduleId of [...topicModuleIds, projectsModule.id]) {
        const existingItems = await txItemRepo.find({ where: { module: { id: moduleId } } });
      for (const item of existingItems) {
        if (theoryOnly) {
          // Theory-only releases may retire stale authored theory, but they
          // must never rewrite or archive generated practice items.
          if (item.kind === "THEORY" && (!item.contentKey || !desiredKeys.has(item.contentKey)) && item.isActive !== false) {
            item.isActive = false;
            item.content = { ...(item.content || {}), required: false, archivedByTheorySync: true };
            await txItemRepo.save(item);
            report.itemsArchived += 1;
          }
          continue;
        }
        if ((!item.contentKey || !desiredKeys.has(item.contentKey)) && item.isActive !== false) {
          // Generated practice is a learner-facing artifact. Keep it active
          // even when an authored topic is renamed or removed; changing the
          // theory source must never silently remove an existing CODE_TASK.
          if (item.kind === "CODE_TASK") continue;
          item.isActive = false;
          item.content = { ...(item.content || {}), required: false, archivedBySync: true };
          await txItemRepo.save(item);
          report.itemsArchived += 1;
        }
      }
      }
    }

    for (const definition of manifest.courses) {
      const course = courses.get(definition.key)!;
      const desiredPrerequisiteIds = new Set((definition.prerequisites || []).map((key) => courses.get(key)!.id));
      for (const prerequisiteKey of definition.prerequisites || []) {
        const prerequisite = courses.get(prerequisiteKey);
        if (!prerequisite) throw new Error(`CURRICULUM_INVALID: missing course ${prerequisiteKey}`);
        const existing = await txDependencyRepo.findOne({ where: { course: { id: course.id }, prerequisiteCourse: { id: prerequisite.id } } });
        if (!existing) {
          await txDependencyRepo.save(txDependencyRepo.create({ course: { id: course.id } as any, prerequisiteCourse: { id: prerequisite.id } as any, requiredCompletionPercent: 100 }));
          report.dependenciesCreated += 1;
        }
      }
      const existingDependencies = await txDependencyRepo.find({ where: { course: { id: course.id } } });
      for (const dependency of existingDependencies) {
        if (!desiredPrerequisiteIds.has(dependency.prerequisiteCourseId)) {
          await txDependencyRepo.remove(dependency);
          report.dependenciesRemoved += 1;
        }
      }
    }
  });
  return report;
}
