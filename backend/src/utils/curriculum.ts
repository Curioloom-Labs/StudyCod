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

function profileContractCases(profile: string): Array<[string, string]> {
  if (profile === "records") return [
    ['{"id":1,"name":"Alice","value":10}\n{"id":2,"name":"Bob","value":5}', "1|Alice|10\n2|Bob|5\nrows=2 total=15"],
    ['{"id":7,"name":"A","value":0}', "7|A|0\nrows=1 total=0"],
    ['{"id":1,"name":"A","value":-2}\ninvalid\n{"id":2,"name":"B","value":4}', "1|A|-2\n2|B|4\nrows=2 total=2"],
    ['\n{"id":3,"name":"C","value":8}\n', "3|C|8\nrows=1 total=8"],
    ['{"id":1,"name":"Same","value":1}\n{"id":1,"name":"Same","value":1}', "1|Same|1\n1|Same|1\nrows=2 total=2"],
    ['{"id":10,"name":"Z","value":100}\n{"id":2,"name":"A","value":-5}', "10|Z|100\n2|A|-5\nrows=2 total=95"],
    ['{"id":4,"name":"UTF","value":12}', "4|UTF|12\nrows=1 total=12"],
    ['{"id":0,"name":"Zero","value":0}\n{}', "0|Zero|0\nrows=1 total=0"],
    ['{"id":1,"name":"A","value":2}\n{"id":2,"name":"B","value":3}\n{"id":3,"name":"C","value":4}', "1|A|2\n2|B|3\n3|C|4\nrows=3 total=9"],
    ['not-json', "rows=0 total=0"],
    ['{"id":5,"name":"Missing"}', "rows=0 total=0"],
    ['{"id":6,"name":"Decimal","value":3.5}', "6|Decimal|3.5\nrows=1 total=3.5"],
    ['{"id":8,"name":"N","value":-10}\ninvalid\ninvalid', "8|N|-10\nrows=1 total=-10"],
    ['{"id":9,"name":"Last","value":1}\n{"id":10,"name":"Last","value":2}', "9|Last|1\n10|Last|2\nrows=2 total=3"],
    ['{}\n{}', "rows=0 total=0"],
  ];
  if (profile === "collection") return [
    ["ADD A red 10\nREPORT\nEXIT\n", "red total=10 count=1"],
    ["ADD A red 10\nADD B red 5\nREPORT\nEXIT\n", "red total=15 count=2"],
    ["ADD A blue -2\nREPORT\nEXIT\n", "blue total=-2 count=1"],
    ["REPORT\nEXIT\n", "EMPTY"],
    ["ADD Z red 1\nADD A blue 2\nREPORT\nEXIT\n", "blue total=2 count=1\nred total=1 count=1"],
    ["ADD A red 0\nREPORT\nEXIT\n", "red total=0 count=1"],
    ["ADD A red 1\nADD A red 3\nREPORT\nEXIT\n", "red total=4 count=2"],
    ["ADD A red 1\nADD B blue 2\nADD C red 3\nREPORT\nEXIT\n", "blue total=2 count=1\nred total=4 count=2"],
    ["ADD A green 100\nREPORT\nEXIT\n", "green total=100 count=1"],
    ["ADD A red -1\nADD B red -2\nREPORT\nEXIT\n", "red total=-3 count=2"],
    ["ADD A red 1\nREPORT\nREPORT\nEXIT\n", "red total=1 count=1\nred total=1 count=1"],
    ["ADD A red 1\nEXIT\n", ""],
    ["ADD A red 1\nADD B yellow 2\nADD C yellow 3\nREPORT\nEXIT\n", "red total=1 count=1\nyellow total=5 count=2"],
    ["ADD A red 7\nREPORT\nEXIT\n", "red total=7 count=1"],
    ["ADD A red 1\nBAD\nREPORT\nEXIT\n", "red total=1 count=1"],
  ];
  if (profile === "jobs") return [
    ['{"jobs":[{"id":1,"status":"done"}]}', "done=1\nfailed=0\ncancelled=0\ntotal=1"],
    ['{"jobs":[{"id":1,"status":"failed"},{"id":2,"status":"done"}]}', "done=1\nfailed=1\ncancelled=0\ntotal=2"],
    ['{"jobs":[{"id":1,"status":"cancelled"}]}', "done=0\nfailed=0\ncancelled=1\ntotal=1"],
    ['{"jobs":[]}', "done=0\nfailed=0\ncancelled=0\ntotal=0"],
    ['{"jobs":[{"id":1,"status":"done"},{"id":2,"status":"done"}]}', "done=2\nfailed=0\ncancelled=0\ntotal=2"],
    ['{"jobs":[{"id":1,"status":"failed"},{"id":2,"status":"failed"}]}', "done=0\nfailed=2\ncancelled=0\ntotal=2"],
    ['{"jobs":[{"id":1,"status":"cancelled"},{"id":2,"status":"failed"}]}', "done=0\nfailed=1\ncancelled=1\ntotal=2"],
    ['{"jobs":[{"id":1,"status":"unknown"}]}', "done=0\nfailed=0\ncancelled=0\ntotal=0"],
    ['{"jobs":[{"id":0,"status":"done"}]}', "done=1\nfailed=0\ncancelled=0\ntotal=1"],
    ['{"jobs":[{"id":1,"status":"done"},{"id":1,"status":"failed"}]}', "done=1\nfailed=1\ncancelled=0\ntotal=2"],
    ['{}', "done=0\nfailed=0\ncancelled=0\ntotal=0"],
    ["not-json", "done=0\nfailed=0\ncancelled=0\ntotal=0"],
    ['{"jobs":[{"id":1,"status":"done"},{"id":2,"status":"cancelled"},{"id":3,"status":"failed"}]}', "done=1\nfailed=1\ncancelled=1\ntotal=3"],
    ['{"jobs":[{"id":"x","status":"done"}]}', "done=1\nfailed=0\ncancelled=0\ntotal=1"],
    ['{"jobs":[{"id":1,"status":"done","extra":true}]}', "done=1\nfailed=0\ncancelled=0\ntotal=1"],
  ];
  if (profile === "numeric" || profile === "vector") return [
    ["0\n", "count=0"], ["1\n7\n", "count=1 min=7 max=7 average=7.00"], ["3\n1 2 3\n", "count=3 min=1 max=3 average=2.00"],
    ["3\n-2 0 5\n", "count=3 min=-2 max=5 average=1.00"], ["4\n2 2 2 2\n", "count=4 min=2 max=2 average=2.00"],
    ["2\n100 -100\n", "count=2 min=-100 max=100 average=0.00"], ["5\n1 10 3 8 6\n", "count=5 min=1 max=10 average=5.60"],
    ["2\n0 1\n", "count=2 min=0 max=1 average=0.50"], ["1\n-9\n", "count=1 min=-9 max=-9 average=-9.00"],
    ["3\n10 20 30\n", "count=3 min=10 max=30 average=20.00"], ["4\n-1 -2 -3 -4\n", "count=4 min=-4 max=-1 average=-2.50"],
    ["2\n7 13\n", "count=2 min=7 max=13 average=10.00"], ["3\n9 9 1\n", "count=3 min=1 max=9 average=6.33"],
    ["1\n0\n", "count=1 min=0 max=0 average=0.00"], ["5\n5 4 3 2 1\n", "count=5 min=1 max=5 average=3.00"],
  ];
  if (profile === "grade") return [
    ["0\n", "average=0.00\nmin=NA\nmax=NA"], ["1\n100\n", "average=100.00\nmin=100\nmax=100"], ["3\n80 90 100\n", "average=90.00\nmin=80\nmax=100"], ["2\n0 50\n", "average=25.00\nmin=0\nmax=50"], ["4\n75 75 75 75\n", "average=75.00\nmin=75\nmax=75"], ["3\n1 2 3\n", "average=2.00\nmin=1\nmax=3"], ["2\n99 1\n", "average=50.00\nmin=1\nmax=99"], ["5\n60 70 80 90 100\n", "average=80.00\nmin=60\nmax=100"], ["1\n0\n", "average=0.00\nmin=0\nmax=0"], ["2\n33 34\n", "average=33.50\nmin=33\nmax=34"], ["3\n-1 50 101\n", "average=50.00\nmin=0\nmax=100"], ["2\n25 75\n", "average=50.00\nmin=25\nmax=75"], ["4\n10 20 30 40\n", "average=25.00\nmin=10\nmax=40"], ["3\n100 100 99\n", "average=99.67\nmin=99\nmax=100"], ["2\n49 51\n", "average=50.00\nmin=49\nmax=51"],
  ];
  if (profile === "shape") return [
    ["1\ncircle 1\n", "circle 3.14"], ["1\nrectangle 2 3\n", "rectangle 6.00"], ["2\ncircle 2\nrectangle 4 5\n", "circle 12.57\nrectangle 20.00"], ["1\ncircle 0\n", "circle 0.00"], ["1\nrectangle 0 4\n", "rectangle 0.00"], ["3\ncircle 1\ncircle 2\ncircle 3\n", "circle 3.14\ncircle 12.57\ncircle 28.27"], ["2\nrectangle 1 1\nrectangle 10 2\n", "rectangle 1.00\nrectangle 20.00"], ["1\ntriangle 2 3\n", "ERROR"], ["2\ncircle 1\ninvalid\n", "circle 3.14\nERROR"], ["1\nrectangle 3 7\n", "rectangle 21.00"], ["1\ncircle -1\n", "ERROR"], ["2\nrectangle 2 2\ncircle 1\n", "rectangle 4.00\ncircle 3.14"], ["1\nrectangle 1.5 2\n", "rectangle 3.00"], ["1\ncircle 10\n", "circle 314.16"], ["1\nrectangle 0 0\n", "rectangle 0.00"],
  ];
  if (profile === "array") return [
    ["1\n7\n", "min=7 index=0\nmax=7 index=0"], ["3\n3 1 2\n", "min=1 index=1\nmax=3 index=0"], ["4\n5 5 2 2\n", "min=2 index=2\nmax=5 index=0"], ["2\n-1 -5\n", "min=-5 index=1\nmax=-1 index=0"], ["0\n", "EMPTY"], ["3\n0 0 1\n", "min=0 index=0\nmax=1 index=2"], ["5\n10 8 6 4 2\n", "min=2 index=4\nmax=10 index=0"], ["2\n9 1\n", "min=1 index=1\nmax=9 index=0"], ["3\n-2 -2 -2\n", "min=-2 index=0\nmax=-2 index=0"], ["1\n0\n", "min=0 index=0\nmax=0 index=0"], ["4\n1 4 2 3\n", "min=1 index=0\nmax=4 index=1"], ["2\n100 -100\n", "min=-100 index=1\nmax=100 index=0"], ["3\n7 8 9\n", "min=7 index=0\nmax=9 index=2"], ["5\n1 1 1 1 1\n", "min=1 index=0\nmax=1 index=0"], ["2\n-3 0\n", "min=-3 index=0\nmax=0 index=1"],
  ];
  if (profile === "config") return [
    ['{"host":"localhost","port":8080,"secret":"x"}', "VALID"], ['{"host":"api","port":1,"secret":"s"}', "VALID"], ['{"host":"api","port":65535,"secret":"s"}', "VALID"], ['{"host":"","port":8080,"secret":"x"}', "INVALID: host"], ['{"host":"api","port":0,"secret":"x"}', "INVALID: port"], ['{"host":"api","port":65536,"secret":"x"}', "INVALID: port"], ['{"host":"api","port":80,"secret":""}', "INVALID: secret"], ['{}', "INVALID: host"], ["not-json", "INVALID: json"], ['{"host":"api","port":443,"secret":"long-secret"}', "VALID"], ['{"host":"api","port":22,"secret":"s","extra":true}', "VALID"], ['{"host":"api","port":-1,"secret":"s"}', "INVALID: port"], ['{"host":" api ","port":3000,"secret":" s "}', "VALID"], ['{"host":"api","port":null,"secret":"s"}', "INVALID: port"], ['{"host":123,"port":3000,"secret":"s"}', "INVALID: host"],
  ];
  return numberedCases(profile);
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
  return profileContractCases(profile);
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
