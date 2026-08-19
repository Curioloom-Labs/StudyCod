import crypto from "crypto";
import fs from "fs";
import path from "path";
import YAML from "yaml";

export type CurriculumRuntime = "JAVA" | "PYTHON" | "CPP";
export type CurriculumLevel = "FOUNDATION" | "SPECIALIZATION" | "ADVANCED";
export type CurriculumLocale = "uk" | "en";

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
  inputFormat: string;
  outputFormat: string;
  estimatedMinutes: number;
  skills: string[];
  template: string;
  requiredTopicKeys: string[];
  tests: Array<{
    input: string;
    expectedOutput: string;
    points?: number;
    hidden?: boolean;
    group?: string;
  }>;
  checkSpec?: { kind: "flask" | "fastapi" | "computer-vision"; module?: string; probePaths?: string[]; files?: string[] };
  milestones: Array<{ id: string; title: string; description: string }>;
  acceptanceCriteria: string[];
};

type MiniProjectContractCase = {
  input: string;
  expectedOutput: string;
  points: number;
  hidden: boolean;
  group: string;
};

const calculatorContractCases: Array<[string, string]> = [
  ["10 + 4\nexit\n", "14"], ["9 * 3\nexit\n", "27"], ["12 / 4\nexit\n", "3"], ["7 - 9\nexit\n", "-2"], ["5 + 0\nexit\n", "5"],
  ["-3 * 4\nexit\n", "-12"], ["0 / 7\nexit\n", "0"], ["8 / 2\n10 - 3\nexit\n", "4\n7"], ["1 + 2\n3 * 4\n5 - 6\nexit\n", "3\n12\n-1"], ["10 / 0\nexit\n", "ERROR: division by zero"],
  ["2 ? 3\nexit\n", "ERROR: unknown operator"], ["  6 +  2  \nexit\n", "8"], ["100 - 100\nexit\n", "0"], ["-8 / 2\nexit\n", "-4"], ["7 * 0\nexit\n", "0"],
];

const contactContractCases: Array<[string, string]> = [
  ["ADD Alice 111\nGET Alice\nEXIT\n", "OK\nAlice 111"], ["ADD Bob 222\nADD Ana 333\nLIST\nEXIT\n", "OK\nOK\nAna 333\nBob 222"],
  ["ADD Alice 111\nUPDATE Alice 999\nGET Alice\nEXIT\n", "OK\nOK\nAlice 999"], ["ADD Alice 111\nDELETE Alice\nGET Alice\nEXIT\n", "OK\nOK\nNOT_FOUND"],
  ["GET Missing\nDELETE Missing\nEXIT\n", "NOT_FOUND\nNOT_FOUND"], ["LIST\nEXIT\n", "EMPTY"], ["ADD Alice 111\nADD Alice 222\nGET Alice\nEXIT\n", "OK\nOK\nAlice 222"],
  ["ADD A 1\nADD B 2\nDELETE A\nLIST\nEXIT\n", "OK\nOK\nOK\nB 2"], ["ADD Zero 0\nGET Zero\nEXIT\n", "OK\nZero 0"], ["ADD N 1\nUPDATE Missing 2\nGET Missing\nEXIT\n", "OK\nNOT_FOUND\nNOT_FOUND"],
  ["ADD Z 9\nADD A 1\nADD M 5\nLIST\nEXIT\n", "OK\nOK\nOK\nA 1\nM 5\nZ 9"], ["ADD A 1\nDELETE A\nDELETE A\nEXIT\n", "OK\nOK\nNOT_FOUND"],
  ["ADD Case 1\nGET case\nEXIT\n", "OK\nNOT_FOUND"], ["ADD LongName 1234567890\nGET LongName\nEXIT\n", "OK\nLongName 1234567890"], ["ADD A 1\nUPDATE A 2\nDELETE A\nLIST\nEXIT\n", "OK\nOK\nOK\nEMPTY"],
];

const logContractCases: Array<[string, string]> = [
  ["1 INFO start", "INFO=1\nWARN=0\nERROR=0\nevents=1\nmalformed=0"], ["1 INFO start\n2 WARN slow", "INFO=1\nWARN=1\nERROR=0\nevents=2\nmalformed=0"], ["1 ERROR fail", "INFO=0\nWARN=0\nERROR=1\nevents=1\nmalformed=0"], ["bad", "INFO=0\nWARN=0\nERROR=0\nevents=0\nmalformed=1"], ["1 INFO a\n2 INFO b\n3 INFO c", "INFO=3\nWARN=0\nERROR=0\nevents=3\nmalformed=0"],
  ["1 WARN a\n2 ERROR b\nbad", "INFO=0\nWARN=1\nERROR=1\nevents=2\nmalformed=1"], ["", "INFO=0\nWARN=0\nERROR=0\nevents=0\nmalformed=0"], ["1 DEBUG x", "INFO=0\nWARN=0\nERROR=0\nevents=0\nmalformed=1"], ["0 INFO zero", "INFO=1\nWARN=0\nERROR=0\nevents=1\nmalformed=0"], ["1 ERROR a\n2 ERROR b", "INFO=0\nWARN=0\nERROR=2\nevents=2\nmalformed=0"],
  ["1 WARN a\n2 WARN b\n3 WARN c", "INFO=0\nWARN=3\nERROR=0\nevents=3\nmalformed=0"], ["1 INFO a\nbad\n2 INFO b", "INFO=2\nWARN=0\nERROR=0\nevents=2\nmalformed=1"], ["1 INFO a extra", "INFO=1\nWARN=0\nERROR=0\nevents=1\nmalformed=0"], ["1 INFO a\n2 WARN b\n3 ERROR c\n4 INFO d", "INFO=2\nWARN=1\nERROR=1\nevents=4\nmalformed=0"], ["1 ERROR a\nbad\n2 ERROR b\nbad", "INFO=0\nWARN=0\nERROR=2\nevents=2\nmalformed=2"],
];

function numberedCases(profile: string, output = "OK"): Array<[string, string]> {
  return Array.from({ length: 15 }, (_, index) => [`{\"case\":${index + 1},\"profile\":\"${profile}\"}`, output]);
}

function contractCases(profile: string): Array<[string, string]> {
  if (profile === "calculator") return calculatorContractCases;
  if (profile === "contact") return contactContractCases;
  if (profile === "logs") return logContractCases;
  if (profile === "web") return [
    ["{\"method\":\"GET\",\"path\":\"/\"}", "OK"], ["{\"method\":\"GET\",\"path\":\"/health\"}", "OK"], ["{\"method\":\"GET\",\"path\":\"/ready\"}", "OK"], ["{\"method\":\"GET\",\"path\":\"/docs\"}", "OK"], ["{\"method\":\"GET\",\"path\":\"/openapi.json\"}", "OK"],
    ["{\"method\":\"GET\",\"path\":\"/api/items?page=1&limit=10\"}", "OK"], ["{\"method\":\"POST\",\"path\":\"/api/items\",\"body\":{\"name\":\"A\"}}", "OK"], ["{\"method\":\"POST\",\"path\":\"/api/items\",\"body\":{}}", "OK"], ["{\"method\":\"GET\",\"path\":\"/api/items/0\"}", "OK"], ["{\"method\":\"DELETE\",\"path\":\"/api/items/999\"}", "OK"],
    ["{\"method\":\"GET\",\"path\":\"/missing\"}", "OK"], ["{\"method\":\"OPTIONS\",\"path\":\"/\"}", "OK"], ["{\"method\":\"GET\",\"path\":\"/api/items?limit=0\"}", "OK"], ["{\"method\":\"POST\",\"path\":\"/api/items\",\"body\":{\"extra\":true}}", "OK"], ["{\"method\":\"GET\",\"path\":\"/api/items?page=2&limit=100\"}", "OK"],
  ];
  if (profile === "vision") return ["blank.png", "object.png", "noise.png", "empty.png", "sample.jpg", "low-light.png", "high-contrast.png", "blurred.png", "short.mp4", "missing.png", "", "sample.png", "unknown-mode", "threshold-0", "threshold-255"].map((value) => [`{\"fixture\":\"${value}\",\"mode\":\"scan\"}`, "OK"]);
  if (profile === "queue") return ["2\nGET\nSTOP\n", "2\nPUT a\nGET\nSTOP\n", "2\nPUT a\nPUT b\nSIZE\nSTOP\n", "2\nPUT a\nPUT b\nPUT c\nSIZE\nSTOP\n", "1\nPUT a\nGET\nGET\nSTOP\n", "0\nPUT a\nSIZE\nSTOP\n", "3\nPUT 1\nPUT 2\nGET\nGET\nGET\nSTOP\n", "2\nSIZE\nSTOP\n", "2\nPUT x\nSIZE\nGET\nSIZE\nSTOP\n", "1\nPUT a\nPUT b\nGET\nSTOP\n", "2\nPUT a\nPUT b\nGET\nPUT c\nSTOP\n", "2\nPUT a\nPUT b\nGET\nGET\nSTOP\n", "0\nGET\nSTOP\n", "3\nPUT a\nPUT a\nSIZE\nSTOP\n", "1\nPUT a\nGET\nPUT b\nSIZE\nSTOP\n"].map((input, index) => [input, ["EMPTY", "OK\nVALUE a", "OK\nOK\nSIZE=2", "OK\nOK\nFULL\nSIZE=2", "OK\nVALUE a\nEMPTY", "FULL\nSIZE=0", "OK\nOK\nVALUE 1\nVALUE 2\nEMPTY", "SIZE=0", "OK\nSIZE=1\nVALUE x\nSIZE=0", "OK\nFULL\nVALUE a", "OK\nOK\nVALUE a\nOK", "OK\nOK\nVALUE a\nVALUE b", "EMPTY", "OK\nOK\nSIZE=2", "OK\nVALUE a\nOK\nSIZE=1"][index]]);
  return numberedCases(profile);
}

function materializeContract(raw: any, locale: CurriculumLocale, key: string): { inputFormat: string; outputFormat: string; tests: MiniProjectContractCase[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const profile = String(raw.profile || "");
  const localized = raw[locale] && typeof raw[locale] === "object" ? raw[locale] : raw.uk;
  if (!profile || !localized || typeof localized !== "object") return null;
  const pairs = contractCases(profile);
  return {
    inputFormat: String(localized.inputFormat || "").trim(),
    outputFormat: String(localized.outputFormat || "").trim(),
    tests: pairs.slice(0, 15).map(([input, expectedOutput], index) => ({ input, expectedOutput, points: index < 10 ? 6 : index < 12 ? 5 : 10, hidden: index >= 12, group: index < 5 ? "basic" : index < 10 ? "edge" : "workflow" })),
  };
}

export type CurriculumManifest = {
  version: number;
  courses: CurriculumCourseDefinition[];
  projectsSource?: string;
};

export type CurriculumTopic = {
  key: string;
  title: string;
  description: string;
  exerciseFocus: string;
  content: string;
  sourcePath: string;
  sourceHash: string;
};

export type CurriculumQualityIssue = {
  severity: "error" | "warning";
  courseKey: string;
  topicKey: string;
  message: string;
};

export type CurriculumQualityReport = {
  ok: boolean;
  courses: Array<{
    courseKey: string;
    topicCount: number;
    errorCount: number;
    warningCount: number;
  }>;
  issues: CurriculumQualityIssue[];
};

/**
 * The learner-facing lesson contract shared by every specialization course.
 * Core courses are the pedagogical reference, while these headings are the
 * stable machine-checkable boundary for the newer course family.
 */
export const CORE_LESSON_HEADINGS = [
  "Інтуїтивне пояснення",
  "Що відбувається під час виконання",
  "Мінімальний приклад коду",
  "Пояснення кожного рядка прикладу",
  "Спробуй передбачити",
  "Типові помилки новачка",
  "На практиці",
  "Підсумок",
] as const;

const SPECIALIZATION_COURSE_KEYS = new Set([
  "python-extensions",
  "flask",
  "fastapi",
  "computer-vision",
  "java-advanced",
  "cpp-advanced",
]);

const FORBIDDEN_LESSON_MARKUP_RE = /(?:STUDYCOD_LEARNING_META|exercise_focus:|^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b)/im;
const PLACEHOLDER_RE = /\b(?:TODO|TBD|FIXME|lorem ipsum)\b/i;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function headingEntries(content: string): Array<{ title: string; index: number; end: number }> {
  const entries: Array<{ title: string; index: number; end: number }> = [];
  const pattern = /^###\s+([^\r\n]+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    entries.push({ title: match[1].trim(), index: match.index, end: match.index + match[0].length });
  }
  return entries;
}

function sectionText(content: string, entries: Array<{ title: string; index: number; end: number }>, entryIndex: number): string {
  const entry = entries[entryIndex];
  const next = entries[entryIndex + 1];
  return content.slice(entry.end, next ? next.index : content.length).trim();
}

function interactiveIssues(content: string, courseKey: string, topicKey: string): CurriculumQualityIssue[] {
  const issues: CurriculumQualityIssue[] = [];
  const blocks = [...content.matchAll(/```interactive\s*\n([\s\S]*?)\n```/gi)];
  for (const [index, block] of blocks.entries()) {
    let spec: any;
    try {
      spec = JSON.parse(block[1]);
    } catch {
      issues.push({ severity: "error", courseKey, topicKey, message: `interactive block #${index + 1} contains invalid JSON` });
      continue;
    }

    const prefix = `interactive block #${index + 1}`;
    if (!isRecord(spec) || typeof spec.type !== "string") {
      issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} must be an object with a type` });
      continue;
    }

    if (spec.type === "prediction") {
      if (typeof spec.question !== "string" || !spec.question.trim()) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs a question` });
      if (!Array.isArray(spec.options) || spec.options.length < 2) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs at least two options` });
      if (!Number.isInteger(spec.answer) || spec.answer < 0 || !Array.isArray(spec.options) || spec.answer >= spec.options.length) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} has an answer outside the option range` });
      if (typeof spec.explanation !== "string" || !spec.explanation.trim()) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs an explanation` });
    } else if (spec.type === "spot-the-bug") {
      if (!Array.isArray(spec.lines) || spec.lines.length < 2) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs at least two lines` });
      if (!Number.isInteger(spec.buggyLine) || spec.buggyLine < 1 || !Array.isArray(spec.lines) || spec.buggyLine > spec.lines.length) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} has an invalid buggyLine` });
      if (typeof spec.explanation !== "string" || !spec.explanation.trim()) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs an explanation` });
    } else if (spec.type === "trace") {
      if (!Array.isArray(spec.code) || !spec.code.length || !Array.isArray(spec.steps) || !spec.steps.length) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs code and trace steps` });
      if (Array.isArray(spec.code) && Array.isArray(spec.steps) && spec.steps.some((step: any) => !Number.isInteger(step?.line) || step.line < 1 || step.line > spec.code.length)) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} contains a step outside the code range` });
    } else if (spec.type === "memory") {
      if (!Array.isArray(spec.stack) && !Array.isArray(spec.heap)) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs stack or heap boxes` });
    } else if (spec.type === "dispatch") {
      if (typeof spec.call !== "string" || !spec.call.trim() || !Array.isArray(spec.cases) || !spec.cases.length) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs a call and at least one case` });
    } else if (spec.type === "quiz") {
      if (!Array.isArray(spec.questions) || !spec.questions.length) issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} needs at least one question` });
      for (const [questionIndex, question] of (spec.questions || []).entries()) {
        if (!isRecord(question) || typeof question.question !== "string" || !Array.isArray(question.options) || !Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) {
          issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} question #${questionIndex + 1} is malformed` });
        } else if (typeof question.explanation !== "string" || !question.explanation.trim()) {
          issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} question #${questionIndex + 1} needs an explanation` });
        }
      }
    } else {
      issues.push({ severity: "error", courseKey, topicKey, message: `${prefix} uses unsupported type ${JSON.stringify(spec.type)}` });
    }
  }
  return issues;
}

function topicQualityIssues(courseKey: string, topic: any, index: number): CurriculumQualityIssue[] {
  const title = String(topic?.title || "").trim();
  const topicKey = String(topic?.key || slug(title));
  const issues: CurriculumQualityIssue[] = [];
  const add = (severity: "error" | "warning", message: string) => issues.push({ severity, courseKey, topicKey, message });
  const theory = typeof topic?.theory === "string" ? topic.theory : topic?.theory?.content;
  const content = typeof theory === "string" ? theory.trim() : "";

  if (!title) add("error", `topic #${index + 1} has no title`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topicKey)) add("error", "topic key is not a stable kebab-case key");
  if (!Number.isInteger(Number(topic?.order)) || Number(topic.order) < 1) add("error", "order must be a positive integer");
  if (!String(topic?.description || "").trim()) add("warning", "description is empty");
  if (String(topic?.exerciseFocus || "").trim().length < 20) add("error", "exerciseFocus must describe a concrete practice outcome");
  if (content.length < 1400) add("error", "theory is too short");
  if (FORBIDDEN_LESSON_MARKUP_RE.test(content)) add("error", "theory contains hidden metadata or a removed template section");
  const entries = headingEntries(content);
  if (SPECIALIZATION_COURSE_KEYS.has(courseKey)) {
    const fences = content.match(/^```[^\r\n]*$/gm) || [];
    if (fences.length < 2 || fences.length % 2 !== 0) add("error", "code fences are unbalanced");
    if (!content.match(/^```(?:[a-z0-9+#.-]+)?\s*$/im)) add("error", "theory must contain a fenced code example");
    if (PLACEHOLDER_RE.test(content)) add("error", "theory contains placeholder text");
    const isDatabaseTopic = /(бд|jdbc|sql|sqlite|orm|database)/i.test(title);
    if (!isDatabaseTopic && /(cursor\.execute|PreparedStatement\s+.*SELECT\s+name\s+FROM\s+users|SELECT\s+name\s+FROM\s+users)/i.test(content)) {
      add("error", "lesson contains a database template fragment unrelated to its topic");
    }
    let previousIndex = -1;
    for (const requiredHeading of CORE_LESSON_HEADINGS) {
      const matches = entries.filter((entry) => entry.title === requiredHeading);
      if (matches.length !== 1) add("error", `required section ${JSON.stringify(requiredHeading)} must occur exactly once`);
      const current = matches[0];
      if (current && current.index <= previousIndex) add("error", `required section ${JSON.stringify(requiredHeading)} is out of order`);
      if (current) {
        const body = sectionText(content, entries, entries.indexOf(current));
        if (body.trim().length < 24 && !body.includes("```")) add("error", `section ${JSON.stringify(requiredHeading)} is empty`);
        previousIndex = current.index;
      }
    }
    if (entries.some((entry) => entry.title === "Спробуй передбачити") && entries.filter((entry) => entry.title === "Спробуй передбачити").length > 1) add("error", "prediction section is duplicated");
    if ((content.match(/```interactive\s*\n/gi) || []).length < 1) add("error", "at least one interactive block is required");
    if (content.length < 2200) add("warning", "lesson is shorter than the smallest Python Core lesson and needs manual review");
  }

  issues.push(...interactiveIssues(content, courseKey, topicKey));
  return issues;
}

export function auditCurriculum(root = repoRoot()): CurriculumQualityReport {
  const { manifest } = loadCurriculumManifest(root);
  const issues: CurriculumQualityIssue[] = [];
  const courses = manifest.courses.map((course) => {
    const relative = path.normalize(course.source);
    const filePath = path.join(root, relative);
    const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as any;
    const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
    if (SPECIALIZATION_COURSE_KEYS.has(course.key)) {
      if (String(parsed?.course || "") !== course.key) issues.push({ severity: "error", courseKey: course.key, topicKey: "_source", message: "source course metadata must match manifest" });
      if (String(parsed?.language || "") !== course.runtime) issues.push({ severity: "error", courseKey: course.key, topicKey: "_source", message: "source language metadata must match manifest" });
    }
    const seenKeys = new Set<string>();
    for (const [index, topic] of topics.entries()) {
      const topicIssues = topicQualityIssues(course.key, topic, index);
      const topicKey = String(topic?.key || slug(String(topic?.title || "").trim()));
      if (seenKeys.has(topicKey)) issues.push({ severity: "error", courseKey: course.key, topicKey, message: "duplicate topic key" });
      seenKeys.add(topicKey);
      issues.push(...topicIssues);
    }
    const courseIssues = issues.filter((issue) => issue.courseKey === course.key);
    return {
      courseKey: course.key,
      topicCount: topics.length,
      errorCount: courseIssues.filter((issue) => issue.severity === "error").length,
      warningCount: courseIssues.filter((issue) => issue.severity === "warning").length,
    };
  });
  return { ok: !issues.some((issue) => issue.severity === "error"), courses, issues };
}

function repoRoot(): string {
  const candidates = [process.env.REPO_ROOT, process.env.STUDYCOD_REPO_ROOT, process.cwd(), path.resolve(__dirname, "../../.."), path.resolve(__dirname, "../../../.."), path.resolve(__dirname, "../../../../../")] 
    .filter(Boolean)
    .map((value) => path.resolve(String(value)));
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "curriculum", "catalog.yml"))) || process.cwd();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function slug(value: string): string {
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

export function loadCurriculumManifest(root = repoRoot(), locale: CurriculumLocale = "uk"): { manifest: CurriculumManifest; hash: string } {
  const filePath = path.join(root, "curriculum", locale === "en" ? "catalog.en.yml" : "catalog.yml");
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

export function loadCurriculumMiniProjects(courseKey: string, root = repoRoot(), locale: CurriculumLocale = "uk"): CurriculumMiniProject[] {
  const { manifest } = loadCurriculumManifest(root, locale);
  if (!manifest.projectsSource) return [];
  const relative = path.normalize(manifest.projectsSource);
  assert(!relative.startsWith("..") && !path.isAbsolute(relative), "unsafe projectsSource path");
  const filePath = path.join(root, relative);
  assert(fs.existsSync(filePath), `projects source file not found: ${manifest.projectsSource}`);
  const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as any;
  const contractPath = path.join(root, "curriculum", "mini_project_contracts.yml");
  const contractCatalog = fs.existsSync(contractPath) ? YAML.parse(fs.readFileSync(contractPath, "utf8")) as any : null;
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
    const requiredTopicKeys = Array.isArray(project?.requiredTopicKeys)
      ? project.requiredTopicKeys.map(String).map((value: string) => value.trim()).filter(Boolean)
      : [];
    const contractProfile = contractCatalog?.projects?.[key];
    const contract = contractProfile ? materializeContract({ profile: contractProfile, ...(contractCatalog?.profiles?.[contractProfile] || {}) }, locale, key) : null;
    const tests = contract?.tests || (Array.isArray(project?.tests) ? project.tests.map((test: any) => ({
      input: String(test?.input ?? ""),
      expectedOutput: String(test?.expectedOutput ?? test?.output ?? ""),
      ...(test?.points != null ? { points: Number(test.points) } : {}),
      ...(test?.hidden != null ? { hidden: Boolean(test.hidden) } : {}),
      ...(test?.group ? { group: String(test.group) } : {}),
    })) : undefined);
    const inputFormat = String(contract?.inputFormat || project?.inputFormat || "").trim();
    const outputFormat = String(contract?.outputFormat || project?.outputFormat || "").trim();
    assert(inputFormat && outputFormat, `${courseKey}/${key}: inputFormat and outputFormat are required`);
    assert(tests && tests.length >= 15, `${courseKey}/${key}: at least 15 contract tests are required`);
    assert(tests.every((test: any) => test.input !== undefined && test.expectedOutput !== undefined), `${courseKey}/${key}: every contract test needs input and expectedOutput`);
    const milestones = Array.isArray(project?.milestones) ? project.milestones.map((milestone: any) => ({
      id: String(milestone?.id || "").trim(),
      title: String(milestone?.title || "").trim(),
      description: String(milestone?.description || "").trim(),
    })) : [];
    assert(skills.length >= 2 && milestones.length >= 1, `${courseKey}/${key}: mini-project needs skills and milestones`);
    assert(requiredTopicKeys.length >= 1, `${courseKey}/${key}: requiredTopicKeys is required`);
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
    return { key, title, description, inputFormat, outputFormat, estimatedMinutes, skills, template: String(project?.template || ""), requiredTopicKeys, tests, ...(checkSpec ? { checkSpec } : {}), milestones, acceptanceCriteria } satisfies CurriculumMiniProject;
  });
}

export function loadCurriculumTopics(course: CurriculumCourseDefinition, root = repoRoot(), locale: CurriculumLocale = "uk"): CurriculumTopic[] {
  const relative = path.normalize(course.source);
  assert(!relative.startsWith("..") && !path.isAbsolute(relative), `${course.key}: unsafe source path`);
  const filePath = path.join(root, relative);
  assert(fs.existsSync(filePath), `${course.key}: source file not found: ${course.source}`);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(raw) as any;
  if (SPECIALIZATION_COURSE_KEYS.has(course.key)) {
    assert(String(parsed?.course || "") === course.key, `${course.key}: source course metadata must match manifest`);
    assert(String(parsed?.language || "") === course.runtime, `${course.key}: source language metadata must match manifest`);
  }
  assert(Array.isArray(parsed?.topics) && parsed.topics.length > 0, `${course.key}: source has no topics`);
  const keys = new Set<string>();
  return parsed.topics.map((topic: any, index: number) => {
    const theory = typeof topic?.theory === "string" ? topic.theory : topic?.theory?.content;
    const title = String(topic?.title || "").trim();
    const key = String(topic?.key || slug(title));
    if (locale === "uk" && SPECIALIZATION_COURSE_KEYS.has(course.key)) {
      const qualityError = topicQualityIssues(course.key, topic, index).find((issue) => issue.severity === "error");
      assert(!qualityError, `${course.key}/${key}: ${qualityError?.message || "quality check failed"}`);
    }
    const exerciseFocus = String(topic?.exerciseFocus || "").trim();
    assert(title, `${course.key}: topic #${index + 1} has no title`);
    assert(key && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key), `${course.key}: invalid topic key at #${index + 1}: ${JSON.stringify(key)}`);
    assert(!keys.has(key), `${course.key}: duplicate topic key ${key}`);
    assert(typeof theory === "string" && theory.trim().length >= 1400, `${course.key}/${key}: theory is too short`);
    const content = theory.trim();
    assert(!/^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im.test(content),
      `${course.key}/${key}: template lesson sections are not allowed`);
    if (locale === "uk") {
      const hasIntuition = /###\s+(Інтуїтивне пояснення|Інтуїтивна модель)/i.test(content);
      const hasExecution = /###\s+(Що відбувається під час виконання|Як це працює)/i.test(content);
      const hasExample = /###\s+Мінімальний приклад коду/i.test(content) && /(```|~~~)/.test(content);
      const hasExplanation = /###\s+(Пояснення кожного рядка прикладу|Пояснення фрагмента|Пояснення)/i.test(content);
      const hasMistakes = /###\s+Типові помилки/i.test(content);
      const hasPractice = /###\s+На практиці/i.test(content);
      const hasSummary = /###\s+Підсумок/i.test(content);
      assert(hasIntuition && hasExecution && hasExample && hasExplanation && hasMistakes && hasPractice && hasSummary,
        `${course.key}/${key}: theory must contain intuition, execution, code, explanation, mistakes, practice and summary sections`);
    }
    assert(exerciseFocus.length >= 20, `${course.key}/${key}: exerciseFocus is required in the curriculum source`);
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
    if (locale === "uk" && ["flask", "fastapi", "computer-vision"].includes(course.key)) {
      // Authoring metadata is stored next to the topic in YAML, not inside the
      // learner markdown. Validate the actual lesson rather than rewarding a
      // hidden comment for length.
      assert(content.length >= 2400, `${course.key}/${key}: specialised theory is too short`);
      assert((content.match(/^### /gm) || []).length >= 10, `${course.key}/${key}: specialised theory needs a complete lesson structure`);
      assert(content.includes("### На практиці"), `${course.key}/${key}: theory must connect the concept to practice`);
      assert(content.includes('"type":"prediction"'), `${course.key}/${key}: specialised theory needs a prediction check`);
    }
    keys.add(key);
    return {
      key,
      title,
      description: String(topic?.description || "").trim(),
      exerciseFocus,
      content,
      sourcePath: course.source,
      sourceHash: sha256(JSON.stringify(topic)),
    } satisfies CurriculumTopic;
  });
}

export function validateCurriculum(root = repoRoot(), locale: CurriculumLocale = "uk"): { manifest: CurriculumManifest; manifestHash: string; topics: Record<string, CurriculumTopic[]> } {
  const { manifest, hash: manifestHash } = loadCurriculumManifest(root, locale);
  const topics: Record<string, CurriculumTopic[]> = {};
  for (const course of manifest.courses) topics[course.key] = loadCurriculumTopics(course, root, locale);
  for (const course of manifest.courses) loadCurriculumMiniProjects(course.key, root, locale);
  return { manifest, manifestHash, topics };
}

export { repoRoot };
