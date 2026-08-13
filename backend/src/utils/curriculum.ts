import crypto from "crypto";
import fs from "fs";
import path from "path";
import YAML from "yaml";

export type CurriculumRuntime = "JAVA" | "PYTHON" | "CPP";
export type CurriculumLevel = "FOUNDATION" | "SPECIALIZATION" | "ADVANCED";

export type CurriculumCourseDefinition = {
  key: string;
  title: string;
  description?: string;
  runtime: CurriculumRuntime;
  level: CurriculumLevel;
  isBase?: boolean;
  prerequisites?: string[];
  source: string;
};

export type CurriculumMiniProject = {
  key: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  skills: string[];
  template: string;
  checkSpec?: { kind: "flask" | "fastapi" | "computer-vision"; module?: string; probePaths?: string[]; files?: string[] };
  milestones: Array<{ id: string; title: string; description: string }>;
  acceptanceCriteria: string[];
};

export type CurriculumManifest = {
  version: number;
  courses: CurriculumCourseDefinition[];
  projectsSource?: string;
};

export type CurriculumTopic = {
  key: string;
  title: string;
  description: string;
  content: string;
  sourcePath: string;
  sourceHash: string;
};

function repoRoot(): string {
  const candidates = [process.env.REPO_ROOT, process.env.STUDYCOD_REPO_ROOT, process.cwd(), path.resolve(__dirname, "../../.."), path.resolve(__dirname, "../../../.."), path.resolve(__dirname, "../../../../../")] 
    .filter(Boolean)
    .map((value) => path.resolve(String(value)));
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "curriculum", "catalog.yml"))) || process.cwd();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function slug(value: string): string {
  const transliteration: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya",
  };
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split("")
    .map((char) => Object.prototype.hasOwnProperty.call(transliteration, char) ? transliteration[char] : char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "topic";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`CURRICULUM_INVALID: ${message}`);
}

export function loadCurriculumManifest(root = repoRoot()): { manifest: CurriculumManifest; hash: string } {
  const filePath = path.join(root, "curriculum", "catalog.yml");
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(raw) as Partial<CurriculumManifest>;
  assert(Number.isInteger(parsed.version) && Number(parsed.version) > 0, "catalog version must be a positive integer");
  assert(Array.isArray(parsed.courses) && parsed.courses.length > 0, "catalog must contain courses");

  const keys = new Set<string>();
  const courses = parsed.courses.map((course, index) => {
    assert(course && typeof course === "object", `course #${index + 1} is not an object`);
    assert(typeof course.key === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.key), `invalid course key at #${index + 1}`);
    assert(!keys.has(course.key), `duplicate course key ${course.key}`);
    keys.add(course.key);
    assert(typeof course.title === "string" && course.title.trim(), `${course.key}: title is required`);
    assert(["JAVA", "PYTHON", "CPP"].includes(course.runtime as string), `${course.key}: invalid runtime`);
    assert(["FOUNDATION", "SPECIALIZATION", "ADVANCED"].includes(course.level as string), `${course.key}: invalid level`);
    assert(typeof course.source === "string" && course.source.startsWith("theories/"), `${course.key}: source must be under theories/`);
    const prerequisites = Array.isArray(course.prerequisites) ? course.prerequisites.map(String) : [];
    assert(!prerequisites.includes(course.key), `${course.key}: cannot depend on itself`);
    return { ...course, prerequisites } as CurriculumCourseDefinition;
  });
  for (const course of courses) for (const prerequisite of course.prerequisites || []) assert(keys.has(prerequisite), `${course.key}: unknown prerequisite ${prerequisite}`);
  const projectsSource = parsed.projectsSource == null ? undefined : String(parsed.projectsSource);
  if (projectsSource != null) assert(projectsSource.startsWith("curriculum/"), "projectsSource must be under curriculum/");
  return { manifest: { version: Number(parsed.version), courses, projectsSource }, hash: sha256(raw) };
}

export function loadCurriculumMiniProjects(courseKey: string, root = repoRoot()): CurriculumMiniProject[] {
  const { manifest } = loadCurriculumManifest(root);
  if (!manifest.projectsSource) return [];
  const relative = path.normalize(manifest.projectsSource);
  assert(!relative.startsWith("..") && !path.isAbsolute(relative), "unsafe projectsSource path");
  const filePath = path.join(root, relative);
  assert(fs.existsSync(filePath), `projects source file not found: ${manifest.projectsSource}`);
  const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as any;
  const source = Array.isArray(parsed?.courses?.[courseKey]) ? parsed.courses[courseKey] : [];
  const keys = new Set<string>();
  return source.map((project: any, index: number) => {
    const key = String(project?.key || "").trim();
    assert(key && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key), `${courseKey}: invalid mini-project key at #${index + 1}`);
    assert(!keys.has(key), `${courseKey}: duplicate mini-project key ${key}`);
    const title = String(project?.title || "").trim();
    const description = String(project?.description || "").trim();
    assert(title && description, `${courseKey}/${key}: mini-project title and description are required`);
    const estimatedMinutes = Number(project?.estimatedMinutes);
    assert(Number.isFinite(estimatedMinutes) && estimatedMinutes > 0, `${courseKey}/${key}: estimatedMinutes must be positive`);
    const skills = Array.isArray(project?.skills) ? project.skills.map(String).filter(Boolean) : [];
    const milestones = Array.isArray(project?.milestones) ? project.milestones.map((milestone: any) => ({
      id: String(milestone?.id || "").trim(),
      title: String(milestone?.title || "").trim(),
      description: String(milestone?.description || "").trim(),
    })) : [];
    assert(skills.length >= 2 && milestones.length >= 1, `${courseKey}/${key}: mini-project needs skills and milestones`);
    assert(milestones.every((milestone: any) => milestone.id && milestone.title && milestone.description), `${courseKey}/${key}: invalid milestone`);
    const acceptanceCriteria = Array.isArray(project?.acceptanceCriteria) ? project.acceptanceCriteria.map(String).filter(Boolean) : [];
    assert(acceptanceCriteria.length >= 1, `${courseKey}/${key}: acceptanceCriteria is required`);
    keys.add(key);
    const checkSpec = project?.checkSpec && typeof project.checkSpec === "object" ? {
      kind: String(project.checkSpec.kind || "") as "flask" | "fastapi" | "computer-vision",
      ...(project.checkSpec.module ? { module: String(project.checkSpec.module) } : {}),
      ...(Array.isArray(project.checkSpec.probePaths) ? { probePaths: project.checkSpec.probePaths.map(String) } : {}),
      ...(Array.isArray(project.checkSpec.files) ? { files: project.checkSpec.files.map(String) } : {}),
    } : undefined;
    return { key, title, description, estimatedMinutes, skills, template: String(project?.template || ""), milestones, acceptanceCriteria, ...(checkSpec ? { checkSpec } : {}) } satisfies CurriculumMiniProject;
  });
}

export function loadCurriculumTopics(course: CurriculumCourseDefinition, root = repoRoot()): CurriculumTopic[] {
  const relative = path.normalize(course.source);
  assert(!relative.startsWith("..") && !path.isAbsolute(relative), `${course.key}: unsafe source path`);
  const filePath = path.join(root, relative);
  assert(fs.existsSync(filePath), `${course.key}: source file not found: ${course.source}`);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(raw) as any;
  assert(Array.isArray(parsed?.topics) && parsed.topics.length > 0, `${course.key}: source has no topics`);
  const keys = new Set<string>();
  return parsed.topics.map((topic: any, index: number) => {
    const theory = typeof topic?.theory === "string" ? topic.theory : topic?.theory?.content;
    const title = String(topic?.title || "").trim();
    const key = String(topic?.key || slug(title));
    assert(title, `${course.key}: topic #${index + 1} has no title`);
    assert(key && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key), `${course.key}: invalid topic key at #${index + 1}: ${JSON.stringify(key)}`);
    assert(!keys.has(key), `${course.key}: duplicate topic key ${key}`);
    assert(typeof theory === "string" && theory.trim().length >= 1400, `${course.key}/${key}: theory is too short`);
    const content = theory.trim();
    assert(!/^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im.test(content),
      `${course.key}/${key}: template lesson sections are not allowed`);
    const hasIntuition = /###\s+(Інтуїтивне пояснення|Інтуїтивна модель)/i.test(content);
    const hasExecution = /###\s+(Що відбувається під час виконання|Як це працює)/i.test(content);
    const hasExample = /###\s+Мінімальний приклад коду/i.test(content) && /(```|~~~)/.test(content);
    const hasExplanation = /###\s+(Пояснення кожного рядка прикладу|Пояснення фрагмента|Пояснення)/i.test(content);
    const hasMistakes = /###\s+Типові помилки/i.test(content);
    const hasPractice = /###\s+На практиці/i.test(content);
    const hasSummary = /###\s+Підсумок/i.test(content);
    assert(hasIntuition && hasExecution && hasExample && hasExplanation && hasMistakes && hasPractice && hasSummary,
      `${course.key}/${key}: theory must contain intuition, execution, code, explanation, mistakes, practice and summary sections`);
    assert(/exercise_focus:/i.test(content), `${course.key}/${key}: exercise_focus metadata is required`);
    const interactiveBlocks = [...content.matchAll(/```interactive\s*\n([\s\S]*?)\n```/gi)];
    assert(interactiveBlocks.length > 0, `${course.key}/${key}: at least one interactive block is required`);
    for (const block of interactiveBlocks) {
      let spec: any;
      try {
        spec = JSON.parse(block[1]);
      } catch {
        throw new Error(`CURRICULUM_INVALID: ${course.key}/${key}: interactive block contains invalid JSON`);
      }
      assert(["prediction", "spot-the-bug", "trace", "memory", "dispatch", "quiz"].includes(spec?.type), `${course.key}/${key}: unsupported interactive block type`);
    }
    if (["flask", "fastapi", "computer-vision"].includes(course.key)) {
      assert(content.length >= 2800, `${course.key}/${key}: specialised theory is too short`);
      assert((content.match(/^### /gm) || []).length >= 10, `${course.key}/${key}: specialised theory needs a complete lesson structure`);
      assert(content.includes("### На практиці"), `${course.key}/${key}: theory must connect the concept to practice`);
      assert(content.includes('"type":"prediction"'), `${course.key}/${key}: specialised theory needs a prediction check`);
    }
    keys.add(key);
    return {
      key,
      title,
      description: String(topic?.description || "").trim(),
      content,
      sourcePath: course.source,
      sourceHash: sha256(JSON.stringify(topic)),
    } satisfies CurriculumTopic;
  });
}

export function validateCurriculum(root = repoRoot()): { manifest: CurriculumManifest; manifestHash: string; topics: Record<string, CurriculumTopic[]> } {
  const { manifest, hash: manifestHash } = loadCurriculumManifest(root);
  const topics: Record<string, CurriculumTopic[]> = {};
  for (const course of manifest.courses) topics[course.key] = loadCurriculumTopics(course, root);
  for (const course of manifest.courses) loadCurriculumMiniProjects(course.key, root);
  return { manifest, manifestHash, topics };
}

export { repoRoot };
