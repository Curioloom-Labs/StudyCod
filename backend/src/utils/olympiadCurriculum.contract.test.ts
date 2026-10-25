import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { localizeCourseItem } from "../services/curriculumLocalization";
import { buildFinalAssessmentItem } from "../services/curriculumSyncService";
import { buildOlympiadPracticeContract, olympiadPracticeContractIssues, parseOlympiadPracticeContract } from "../services/learning/learningContract";
import { loadCurriculumMiniProjects, repoRoot, validateCurriculum } from "./curriculum";

type Runtime = "PYTHON" | "JAVA" | "CPP";
type TopicKey = "prefix-sums" | "maximum-subarray" | "kadane";

const courseDefinitions: Array<{ key: string; runtime: Runtime }> = [
  { key: "olympiad-python", runtime: "PYTHON" },
  { key: "olympiad-java", runtime: "JAVA" },
  { key: "olympiad-cpp", runtime: "CPP" },
];

test("all three Olympiad courses are published in Ukrainian and English catalogs", () => {
  const root = repoRoot();
  for (const locale of ["uk", "en"] as const) {
    const { catalogManifest } = validateCurriculum(root, locale);
    for (const courseDefinition of courseDefinitions) {
      const course = catalogManifest.courses.find((entry) => entry.key === courseDefinition.key);
      assert.ok(course, `${locale}/${courseDefinition.key} course definition`);
      assert.equal(course.status, "PUBLISHED", `${locale}/${courseDefinition.key} must be available to learners`);
    }
  }
});

test("Olympiad final items generate a fresh transfer-stage Judge task", () => {
  const { catalogManifest, topics } = validateCurriculum(repoRoot());
  for (const courseDefinition of courseDefinitions) {
    const course = catalogManifest.courses.find((entry) => entry.key === courseDefinition.key);
    const capstoneTopic = topics[courseDefinition.key].find((topic) => topic.key === "combine-techniques");
    assert.ok(course, `${courseDefinition.key} course definition`);
    assert.ok(capstoneTopic, `${courseDefinition.key} combine-techniques lesson`);
    const item = buildFinalAssessmentItem(course, 3, capstoneTopic, 123);
    const content = item.content as Record<string, unknown>;
    const exercise = content.exercise as Record<string, unknown>;
    const contract = exercise.learningContract as Record<string, unknown>;
    assert.equal(item.contentKey, `${courseDefinition.key}.final-assessment`);
    assert.equal(content.finalAssessmentMode, "JUDGE_GENERATED");
    assert.equal(content.generated, true);
    assert.equal(content.project, undefined);
    assert.equal(exercise.exerciseKey, `${courseDefinition.key}.final-assessment`);
    assert.equal(exercise.sequence, 3);
    assert.equal(exercise.total, 3);
    assert.equal(contract.kind, "OLYMPIAD_ALGORITHMIC_PRACTICE");
    assert.equal(contract.stage, "TRANSFER");
    assert.equal(contract.topicKey, "combine-techniques");
    assert.equal(contract.runtime, courseDefinition.runtime);
  }
});

test("all 47 lesson transfer contracts satisfy the dynamic Judge schema in each runtime", () => {
  const { topics } = validateCurriculum(repoRoot());
  for (const courseDefinition of courseDefinitions) {
    const courseTopics = topics[courseDefinition.key];
    assert.equal(courseTopics.length, 47, `${courseDefinition.key} topic count`);
    for (const topic of courseTopics) {
      const contract = buildOlympiadPracticeContract({
        courseKey: courseDefinition.key,
        topicKey: topic.key,
        topicTitle: topic.title,
        runtime: courseDefinition.runtime,
        objective: topic.exerciseFocus,
        sequence: 3,
        total: 3,
      });
      assert.deepEqual(
        olympiadPracticeContractIssues(contract, courseDefinition.runtime),
        [],
        `${courseDefinition.key}/${topic.key} generated practice contract`,
      );
      const hiddenContract = `<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
      assert.ok(parseOlympiadPracticeContract(hiddenContract), `${courseDefinition.key}/${topic.key} reaches the generator`);
    }
  }
});

test("every lesson exposes direct, generated bug-repair with boundary cases, and independent-transfer tasks", () => {
  const { topics } = validateCurriculum(repoRoot());
  const stages = [
    { sequence: 1, stage: "FOUNDATION", variation: /Direct implementation/ },
    { sequence: 2, stage: "EDGE_CASES", variation: /Boundary diagnosis/ },
    { sequence: 3, stage: "TRANSFER", variation: /Independent transfer/ },
  ] as const;

  for (const courseDefinition of courseDefinitions) {
    const courseTopics = topics[courseDefinition.key];
    assert.equal(courseTopics.length, 47, courseDefinition.key + " topic count");
    for (const topic of courseTopics) {
      for (const practiceStage of stages) {
        const contract = buildOlympiadPracticeContract({
          courseKey: courseDefinition.key,
          topicKey: topic.key,
          topicTitle: topic.title,
          runtime: courseDefinition.runtime,
          objective: topic.exerciseFocus,
          sequence: practiceStage.sequence,
          total: 3,
        });
        const label = courseDefinition.key + "/" + topic.key + "/" + practiceStage.stage;
        assert.equal(contract.stage, practiceStage.stage, label);
        assert.match(contract.variation, practiceStage.variation, label + " practice form");
        if (practiceStage.stage === "EDGE_CASES") {
          assert.match(contract.variation, /deliberately incorrect draft program/, label + " debugging form");
          const expectedFence = courseDefinition.runtime === "PYTHON" ? "python" : courseDefinition.runtime === "JAVA" ? "java" : "cpp";
          assert.match(contract.variation, new RegExp(`code block labelled ${expectedFence}`), label + " runtime fence");
          assert.match(contract.variation, /At least one public example and a required generated test/, label + " debuggable public sample");
          assert.ok(
            contract.requiredCases.includes("a valid input that exposes the single logical error in the supplied draft program"),
            label + " requires a test that exposes the draft's logical error",
          );
        }
        assert.deepEqual(olympiadPracticeContractIssues(contract, courseDefinition.runtime), [], label + " schema");
        const hiddenContract = "<!-- STUDYCOD_LEARNING_META_START\n"
          + JSON.stringify(contract)
          + "\nSTUDYCOD_LEARNING_META_END -->";
        assert.ok(parseOlympiadPracticeContract(hiddenContract), label + " reaches the generator");
      }
    }
  }
});

function execute(command: string, args: string[], input = "", cwd?: string) {
  const result = spawnSync(command, args, {
    input,
    cwd,
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${String(result.status)}\n${result.stderr || result.stdout}`);
  }
  return String(result.stdout ?? "").replace(/\r\n/g, "\n").trimEnd();
}

function brute(topic: TopicKey, values: number[], queries?: Array<[number, number]>): string {
  if (topic === "prefix-sums") {
    return (queries ?? []).map(([left, right]) => String(values.slice(left, right + 1).reduce((sum, value) => sum + value, 0))).join("\n");
  }
  if (topic === "maximum-subarray") {
    let best = Number.NEGATIVE_INFINITY;
    for (let left = 0; left < values.length; left += 1) {
      let sum = 0;
      for (let right = left; right < values.length; right += 1) {
        sum += values[right];
        best = Math.max(best, sum);
      }
    }
    return String(best);
  }

  let best = Number.NEGATIVE_INFINITY;
  let bestLeft = 0;
  let bestRight = 0;
  // Iterate right before left so strict updates select the required tie order.
  for (let right = 0; right < values.length; right += 1) {
    for (let left = 0; left <= right; left += 1) {
      const sum = values.slice(left, right + 1).reduce((total, value) => total + value, 0);
      if (sum > best) {
        best = sum;
        bestLeft = left;
        bestRight = right;
      }
    }
  }
  return `${best} ${bestLeft + 1} ${bestRight + 1}`;
}

function inputFor(topic: TopicKey, values: number[], queries?: Array<[number, number]>): string {
  if (topic === "prefix-sums") {
    const ranges = queries ?? [];
    return `${values.length} ${ranges.length}\n${values.join(" ")}\n${ranges.map(([left, right]) => `${left + 1} ${right + 1}`).join("\n")}\n`;
  }
  return `${values.length}\n${values.join(" ")}\n`;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function compile(root: string, runtime: Runtime, topic: TopicKey, tempDirectory: string): { command: string; args: string[]; cwd?: string } {
  const extension = runtime === "PYTHON" ? ".py" : runtime === "JAVA" ? ".java" : ".cpp";
  const source = path.join(root, "curriculum", "solutions", "olympiad-programming", runtime.toLowerCase(), `${topic}${extension}`);
  assert.ok(fs.existsSync(source), `Missing reference solution: ${source}`);
  if (runtime === "PYTHON") return { command: process.platform === "win32" ? "python" : "python3", args: [source] };
  if (runtime === "JAVA") {
    const javaSource = path.join(tempDirectory, "Main.java");
    fs.copyFileSync(source, javaSource);
    execute("javac", ["-encoding", "UTF-8", javaSource], "", tempDirectory);
    return { command: "java", args: ["-cp", tempDirectory, "Main"], cwd: tempDirectory };
  }
  const binary = path.join(tempDirectory, process.platform === "win32" ? "solution.exe" : "solution");
  execute("g++", ["-std=c++17", "-O2", "-pipe", source, "-o", binary], "", tempDirectory);
  return { command: binary, args: [], cwd: tempDirectory };
}

function compileAuthoredExample(runtime: Runtime, source: string, tempDirectory: string): { command: string; args: string[]; cwd?: string } {
  fs.mkdirSync(tempDirectory, { recursive: true });
  if (runtime === "PYTHON") {
    const file = path.join(tempDirectory, "main.py");
    fs.writeFileSync(file, source, "utf8");
    return { command: process.platform === "win32" ? "python" : "python3", args: [file] };
  }
  if (runtime === "JAVA") {
    const file = path.join(tempDirectory, "Main.java");
    fs.writeFileSync(file, source, "utf8");
    execute("javac", ["-encoding", "UTF-8", file], "", tempDirectory);
    return { command: "java", args: ["-cp", tempDirectory, "Main"], cwd: tempDirectory };
  }
  const file = path.join(tempDirectory, "main.cpp");
  const binary = path.join(tempDirectory, process.platform === "win32" ? "example.exe" : "example");
  fs.writeFileSync(file, source, "utf8");
  execute("g++", ["-std=c++17", "-O2", "-pipe", file, "-o", binary], "", tempDirectory);
  return { command: binary, args: [], cwd: tempDirectory };
}

test("foundational algorithm examples execute in every runtime and locale", () => {
  const root = repoRoot();
  const samples: Record<TopicKey, { input: string; output: string }> = {
    "prefix-sums": { input: "5 2\n1 2 3 4 5\n1 3\n2 5\n", output: "6\n14" },
    "maximum-subarray": { input: "", output: "8" },
    kadane: { input: "", output: "6 2 4" },
  };
  const topicsByLocale = {
    uk: validateCurriculum(root, "uk").topics,
    en: validateCurriculum(root, "en").topics,
  };
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "studycod-core-examples-"));
  try {
    for (const course of courseDefinitions) {
      const language = course.runtime === "PYTHON" ? "python" : course.runtime === "JAVA" ? "java" : "cpp";
      for (const locale of ["uk", "en"] as const) {
        const topics = topicsByLocale[locale][course.key] ?? [];
        for (const [topicKey, sample] of Object.entries(samples) as Array<[TopicKey, { input: string; output: string }]>) {
          const topic = topics.find((entry) => entry.key === topicKey);
          assert.ok(topic, `${locale}/${course.key}/${topicKey} lesson exists`);
          const source = topic.content.split(`\`\`\`${language}`)[1]?.split("```")[0]?.replace(/^\r?\n/, "").trimEnd();
          assert.ok(source, `${locale}/${course.key}/${topicKey} has a ${language} code example`);
          const executable = compileAuthoredExample(
            course.runtime,
            source,
            path.join(tempDirectory, `${locale}-${course.runtime}-${topicKey}`),
          );
          const actual = execute(executable.command, executable.args, sample.input, executable.cwd);
          assert.equal(actual, sample.output, `${locale}/${course.key}/${topicKey} authored example`);
        }
      }
    }
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("olympiad courses validate and their language-specific Judge solutions pass authored and brute-force cases", () => {
  const root = repoRoot();
  const topicsByCourse = validateCurriculum(root).topics;
  const englishTopics = validateCurriculum(root, "en").topics;
    const englishPrefix = englishTopics["olympiad-python"]?.find((topic) => topic.key === "prefix-sums");
    assert.ok(englishPrefix);
    const localizedPractice = localizeCourseItem({
      contentKey: "olympiad-python.prefix-sums.practice-1",
      title: "Практика 1/3: Префіксні суми в Python",
      content: {
        generated: true,
        exercise: {
          sequence: 1,
          total: 3,
          prompt: "українська мета",
          learningContract: buildOlympiadPracticeContract({
            courseKey: "olympiad-python", topicKey: "prefix-sums", topicTitle: "Префіксні суми в Python",
            runtime: "PYTHON", objective: "українська мета", sequence: 1, total: 3,
          }),
        },
      },
    }, "en");
    const localizedExercise = localizedPractice.content?.exercise as Record<string, unknown>;
    const localizedContract = localizedExercise.learningContract as Record<string, unknown>;
    assert.equal(localizedExercise.prompt, englishPrefix.exerciseFocus);
    assert.equal(localizedContract.objective, englishPrefix.exerciseFocus);
  const random = seededRandom(0x51_7d_2026);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "studycod-olympiad-"));
  try {
    for (const course of courseDefinitions) {
      const topics = topicsByCourse[course.key] ?? [];
      const expectedTopicCount = 47;
      assert.equal(topics.length, expectedTopicCount, `${course.key} lesson count`);
      const expectedEnglishTopicCount = 47;
      assert.equal((englishTopics[course.key] ?? []).length, expectedEnglishTopicCount, `${course.key} English lesson count`);
      assert.equal(new Set(topics.map((topic) => topic.moduleKey)).size, 12, `${course.key} must group lessons into twelve modules`);
      assert.equal(new Set((englishTopics[course.key] ?? []).map((topic) => topic.moduleTitle)).size, 12, `${course.key} needs twelve English module titles`);
      const projects = loadCurriculumMiniProjects(course.key, root, "uk");
      assert.equal(projects.length, 3, `${course.key} should have one Judge task per finished topic`);
      const topicByKey = new Map(topics.map((topic) => [topic.key, topic]));

      for (const [index, project] of projects.entries()) {
        const topicKey = project.requiredTopicKeys.find((key): key is TopicKey =>
          key === "prefix-sums" || key === "maximum-subarray" || key === "kadane",
        );
        assert.ok(topicKey, `${course.key}/${project.key} should target a generated algorithm lesson`);
        const topic = topicByKey.get(topicKey);
        assert.ok(topic, `${course.key}/${project.key} should reference an authored lesson`);
        const solutionDirectory = path.join(tempDirectory, `${course.runtime}-${topicKey}`);
        fs.mkdirSync(solutionDirectory, { recursive: true });
        const solution = compile(root, course.runtime, topicKey, solutionDirectory);
        const weights = project.tests.reduce((total, item) => total + Number(item.points ?? 1), 0);
        assert.equal(weights, 100, `${course.key}/${project.key} test weights must total 100`);
        assert.ok(project.tests.some((item) => item.hidden), `${project.key} needs hidden tests`);
        assert.ok(project.tests.some((item) => !item.hidden), `${project.key} needs public examples`);

        for (const [testIndex, judgeCase] of project.tests.entries()) {
          const output = execute(solution.command, solution.args, judgeCase.input, solution.cwd);
          assert.equal(output, judgeCase.expectedOutput.replace(/\r\n/g, "\n").trimEnd(), `${course.key}/${project.key} test ${testIndex + 1}`);
        }

        for (let sample = 0; sample < 12; sample += 1) {
          const length = 1 + Math.floor(random() * 7);
          const values = Array.from({ length }, () => Math.floor(random() * 17) - 8);
          const queries: Array<[number, number]> = [];
          if (topicKey === "prefix-sums") {
            const queryCount = 1 + Math.floor(random() * 5);
            for (let query = 0; query < queryCount; query += 1) {
              const first = Math.floor(random() * length);
              const second = Math.floor(random() * length);
              queries.push([Math.min(first, second), Math.max(first, second)]);
            }
          }
          const actual = execute(solution.command, solution.args, inputFor(topicKey, values, queries), solution.cwd);
          assert.equal(actual, brute(topicKey, values, queries), `${course.runtime}/${topicKey} randomized case ${sample + 1}`);
        }

        for (const locale of ["uk", "en"] as const) {
          const publicItem = localizeCourseItem({
            contentKey: `${course.key}.project.${project.key}`,
            title: project.title,
            content: { project: true, projectSpec: { tests: project.tests, checkSpec: { kind: "private" }, milestones: [] } },
          }, locale);
          const publicSpec = publicItem.content?.projectSpec as Record<string, unknown>;
          assert.equal(publicSpec.tests, undefined, `${locale}/${project.key} must not expose test data in the roadmap`);
          assert.equal(publicSpec.checkSpec, undefined, `${locale}/${project.key} must not expose judge harness details in the roadmap`);
        }
      }
    }

    const missingEnglishProject = localizeCourseItem({
      contentKey: "untranslated-course.project.untranslated-task",
      title: "Untranslated project",
      content: { project: true, projectSpec: { tests: [{ input: "private" }], checkSpec: { kind: "private" } } },
    }, "en");
    const fallbackSpec = missingEnglishProject.content?.projectSpec as Record<string, unknown>;
    assert.equal(fallbackSpec.tests, undefined, "an untranslated project must keep its authored tests private");
    assert.equal(fallbackSpec.checkSpec, undefined, "an untranslated project must keep harness data private");

    const finalExercise = {
      learningContract: buildOlympiadPracticeContract({
        courseKey: "olympiad-python",
        topicKey: "combine-techniques",
        topicTitle: "Комбінування алгоритмів у Python",
        runtime: "PYTHON",
        objective: "Використати бінарний пошук відповіді з жадібною перевіркою.",
        sequence: 3,
        total: 3,
      }),
      starterCode: "# Напишіть розв’язання тут\n",
      prompt: "Скласти задачу з комбінування технік.",
      sequence: 3,
      total: 3,
    };
    const finalAssessment = localizeCourseItem({
      contentKey: "olympiad-python.final-assessment",
      title: "Final assessment",
      content: { finalAssessment: true, finalAssessmentMode: "JUDGE_GENERATED", exercise: finalExercise },
    }, "en");
    const localizedFinalExercise = finalAssessment.content?.exercise as Record<string, unknown>;
    const localizedFinalContent = finalAssessment.content as Record<string, unknown>;
    const localizedContract = localizedFinalExercise.learningContract as Record<string, unknown>;
    assert.equal(finalAssessment.title, "Final algorithmic assessment");
    assert.equal(localizedFinalContent.project, undefined, "Olympiad final assessment must open as generated Judge practice");
    assert.equal(localizedFinalContent.finalAssessmentMode, "JUDGE_GENERATED");
    assert.equal(localizedContract.objective, englishTopics["olympiad-python"].find((topic) => topic.key === "combine-techniques")?.exerciseFocus);
    assert.equal(localizedFinalExercise.starterCode, "# Write your solution here\n");
    assert.equal(localizedFinalContent.projectSpec, undefined, "generated Olympiad assessment must not expose a project-review form");
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("generated curriculum lessons include executable language-specific examples", () => {
  const root = repoRoot();
  const ukrainian = validateCurriculum(root).topics;
  const english = validateCurriculum(root, "en").topics;
  const samples: Record<string, { input: string; output: string }> = {
    "contest-workflow": { input: "1 1 100 100 200 200 0\n", output: "WA" },
    "constraints-and-complexity": { input: "1000 1000000\n", output: "SAFE" },
    "language-runtime": { input: "4\n1000000000 1000000000 1000000000 -500000000\n", output: "2500000000" },
    "array-traversal": { input: "4\n-3 0 4 2\n", output: "2 6" },
    "extrema-and-counts": { input: "4\n-8 -3 -3 -6\n", output: "-8 -3 2" },
    "interval-basics": { input: "4\n5 -2 7 4\n2 4\n", output: "9" },
    "boundary-debugging": { input: "6\n4 4 1 1 1 3\n", output: "3" },
    "prefix-transformations": { input: "5 2\n-3 4 7 -2 5\n2 5\n1 1\n", output: "2\n1" },
    "fixed-window-sum": { input: "6 3\n2 -5 4 1 -2 6\n", output: "5" },
    "sorting-purpose": { input: "4\n3 -1 3 0\n", output: "-1 0 3 3" },
    "binary-search": { input: "6\n-4 1 3 7 9 12\n7\n", output: "4" },
    "lower-upper-bound": { input: "7 2\n-5 -2 -2 0 4 4 10\n-2 4\n11 12\n", output: "5\n0" },
    "answer-search": { input: "4 2\n2 3 4 5\n", output: "9" },
    "maps-and-sets": { input: "6\n7 -2 7 7 -2 4\n", output: "3 3" },
    "stack-patterns": { input: "6\n([{}])\n", output: "YES" },
    "queue-patterns": { input: "6\nADD 10\nADD 20\nSERVE\nADD -3\nSERVE\nSERVE\n", output: "10\n20\n-3" },
    "deque-selection": { input: "6\nPB 10\nPF 4\nOF\nPB -2\nOB\nOF\n", output: "4 -2 10" },
    "two-pointers-sorted": { input: "4\n1 3 4 6\n7\n", output: "1 4" },
    "sliding-window": { input: "4 3\n1 2 1 1\n", output: "7" },
    "longest-valid-window": { input: "5 5\n2 1 3 2 1\n", output: "2 1 2" },
    "shortest-valid-window": { input: "5 7\n2 1 3 4 1\n", output: "2 3 4" },
    "divisors-and-gcd": { input: "12\n", output: "6 28" },
    "euclidean-algorithm": { input: "3\n0 18 30\n", output: "6" },
    "prime-sieve": { input: "20\n", output: "2 3 5 7 11 13 17 19" },
    factorization: { input: "360\n", output: "3 2 3 3 2 5 1" },
    "modular-arithmetic": { input: "-2 5 13\n", output: "7" },
    "activity-selection": { input: "4\n1 3\n2 4\n3 5\n0 6\n", output: "2\n1 3" },
    "interval-stabbing": { input: "4\n1 4\n2 6\n5 7\n6 9\n", output: "2\n4 7" },
    "deadline-ordering": { input: "3\n3 4\n2 3\n1 8\n", output: "1" },
    "greedy-simulation": { input: "3 6\n4 3 1\n", output: "3 0" },
    "dp-min-cost-stairs": { input: "5\n2 7 3 6 1\n", output: "6" },
    "one-dimensional-counting": { input: "6\n", output: "13" },
    "dp-max-nonadjacent": { input: "4\n4 -1 5 6\n", output: "10" },
    "reconstruct-answer": { input: "3 6\n1 3 4\n", output: "2\n3 3" },
    "memory-optimized-counting": { input: "5 2\n", output: "8" },
    "read-constraints-first": { input: "5 2\n4 -2 7 1 3\n2 4\n1 5\n", output: "6\n13" },
    "choose-representation": { input: "4\n1 4\n2 6\n5 7\n6 9\n", output: "3 6" },
    "combine-techniques": { input: "5 3\n2 1 5 2 3\n", output: "5" },
    "compare-solutions": { input: "6\n4 -1 4 7 -1 4\n", output: "3 3" },
    "thematic-sets": { input: "5 2\n1 1\n2 0\n2 1\n2 1\n3 1\n", output: "2 3" },
    "mixed-set": { input: "5\n3 10\n1 4\n3 6\n2 5\n1 3\n", output: "3 28" },
    "timed-mock": { input: "4 20\n8 20\n18 40\n21 100\n12 30\n", output: "90 3" },
    "post-contest-review": { input: "6\n4 1\n2 0\n4 2\n2 1\n4 1\n7 0\n", output: "4 3" },
    "targeted-review": { input: "4\n4 2 7\n2 4 3\n8 1 9\n1 4 2\n", output: "2 11" },
  };
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "studycod-examples-"));
  try {
    for (const course of courseDefinitions) {
      for (const [topicKey, sample] of Object.entries(samples)) {
        const topic = ukrainian[course.key]?.find((entry) => entry.key === topicKey);
        const englishTopic = english[course.key]?.find((entry) => entry.key === topicKey);
        assert.ok(topic, `${course.key}/${topicKey} is authored`);
        assert.ok(englishTopic, `${course.key}/${topicKey} has English content`);
        const language = course.runtime === "PYTHON" ? "python" : course.runtime === "JAVA" ? "java" : "cpp";
        const extractSource = (content: string) => content.split(`\`\`\`${language}`)[1]?.split("```")[0]?.replace(/^\r?\n/, "").trimEnd();
        const source = extractSource(topic.content);
        const englishSource = extractSource(englishTopic.content);
        assert.ok(source, `${course.key}/${topicKey} has a ${language} example`);
        const normalizeSource = (value: string) => value.replace(/\r\n/g, "\n").replace(/\n[ \t]*\n+/g, "\n").trim();
        assert.equal(normalizeSource(englishSource), normalizeSource(source), `${course.key}/${topicKey} code stays equivalent across locales`);
        const executable = compileAuthoredExample(course.runtime, source, path.join(tempDirectory, `${course.runtime}-${topicKey}`));
        const cases = [sample];
        if (topicKey === "contest-workflow") {
          cases.push(
            { input: "0 0 0 100 0 100 0\n", output: "CE" },
            { input: "1 0 0 100 0 100 1\n", output: "RE" },
            { input: "1 1 101 100 0 100 1\n", output: "TLE" },
            { input: "1 1 100 100 101 100 1\n", output: "MLE" },
            { input: "1 1 100 100 100 100 1\n", output: "AC" },
          );
        }
        for (const [caseIndex, example] of cases.entries()) {
          const actual = execute(executable.command, executable.args, example.input, executable.cwd);
          assert.equal(actual, example.output, `${course.runtime}/${topicKey} authored example ${caseIndex + 1}`);
        }
      }
    }
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
