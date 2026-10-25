import assert from "node:assert/strict";
import test from "node:test";
import { auditCurriculum, CORE_LESSON_HEADINGS, loadCurriculumManifest, loadCurriculumMiniProjects, loadCurriculumTopics, slug, validateCurriculum } from "./curriculum";

test("curriculum manifest is valid and every course has theory", () => {
  const result = validateCurriculum();
  assert.equal(result.manifest.version, 1);
  assert.ok(result.manifest.courses.length >= 9);
  for (const course of result.catalogManifest.courses) {
    assert.ok(result.topics[course.key]?.length, course.key);
    assert.equal(new Set(result.topics[course.key].map((topic) => topic.key)).size, result.topics[course.key].length);
  }
});

test("authored theory has the learner-facing contract and generated exercise focus", () => {
  const result = validateCurriculum();
  const requiredSections = [
    /###\s+(Інтуїтивне пояснення|Інтуїтивна модель)/i,
    /###\s+(Що відбувається під час виконання|Як це працює)/i,
    /###\s+Мінімальний приклад коду[\s\S]*```/i,
    /###\s+(Пояснення кожного рядка прикладу|Пояснення фрагмента|Пояснення)/i,
    /###\s+Типові помилки/i,
    /###\s+На практиці/i,
    /###\s+Підсумок/i,
  ];

  for (const course of result.catalogManifest.courses) {
    for (const topic of result.topics[course.key]) {
      for (const section of requiredSections) assert.match(topic.content, section, `${course.key}/${topic.key}`);
      assert.ok(topic.exerciseFocus.length >= 20, `${course.key}/${topic.key} exerciseFocus`);
      assert.doesNotMatch(topic.content, /STUDYCOD_LEARNING_META|exercise_focus:/i, `${course.key}/${topic.key} metadata leaked into theory`);
      assert.ok(topic.content.length >= 1400, `${course.key}/${topic.key} is too short`);
    }
  }
});

test("every Olympiad lesson states outcomes, prerequisites, and time and space complexity", () => {
  for (const locale of ["uk", "en"] as const) {
    const result = validateCurriculum(undefined, locale);
    for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"]) {
      for (const topic of result.topics[courseKey]) {
        const prose = topic.content.replace(/```[\s\S]*?```/g, "");
        const lines = prose.split(/\r?\n/);
        assert.match(prose, /\*\*(?:Результати навчання|Learning outcomes):\*\*\s*\S/i, `${locale}/${courseKey}/${topic.key} learning outcomes`);
        assert.match(prose, /\*\*(?:Попередні знання|Prerequisites):\*\*\s*\S/i, `${locale}/${courseKey}/${topic.key} prerequisites`);
        assert.ok(lines.some((line) => /(?:час|time|runtime)/i.test(line) && /O\s*\(/i.test(line)), `${locale}/${courseKey}/${topic.key} time complexity`);
        assert.ok(lines.some((line) => /(?:пам.?ят|простор|space|memory)/i.test(line) && /O\s*\(/i.test(line)), `${locale}/${courseKey}/${topic.key} space complexity`);
      }
    }
  }
});

test("every Olympiad lesson has one topic-specific teaching scenario", () => {
  for (const locale of ["uk", "en"] as const) {
    const result = validateCurriculum(undefined, locale);
    for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"]) {
      const scenarios: string[] = [];
      for (const topic of result.topics[courseKey]) {
        const headings = [...topic.content.matchAll(/\*\*(?:Сценарій уроку|Lesson scenario):\*\*/gi)];
        assert.equal(headings.length, 1, `${locale}/${courseKey}/${topic.key} must have exactly one scenario`);
        const start = headings[0].index! + headings[0][0].length;
        const following = topic.content.slice(start);
        const end = following.search(/\n\s*\n/);
        const scenario = (end < 0 ? following : following.slice(0, end)).trim();
        assert.ok(scenario, `${locale}/${courseKey}/${topic.key} scenario is non-empty`);
        const numberedSteps = [...scenario.matchAll(/(?:^|;\s*)\d+[.)]\s+/gm)].length;
        const scenarioLines = scenario.split(/\r?\n/).filter((line) => line.trim()).length;
        assert.ok(Math.max(numberedSteps, scenarioLines) >= 5, `${locale}/${courseKey}/${topic.key} has at least five scenario actions`);
        scenarios.push(scenario.replace(/\s+/g, " ").trim().toLocaleLowerCase());
      }
      assert.equal(scenarios.length, 47, `${locale}/${courseKey} scenario count`);
      assert.equal(new Set(scenarios).size, 47, `${locale}/${courseKey} scenarios are specific to each lesson`);
    }
  }
});

test("array foundations have topic-specific code explanations, scenarios, and honest memory claims", () => {
  const keys = ["array-traversal", "extrema-and-counts", "interval-basics", "boundary-debugging"];
  for (const locale of ["uk", "en"] as const) {
    const result = validateCurriculum(undefined, locale);
    for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"]) {
      const explanations = new Set<string>();
      for (const key of keys) {
        const topic = result.topics[courseKey].find((entry) => entry.key === key);
        assert.ok(topic, `${locale}/${courseKey}/${key}`);
        const explanation = topic.content.match(/### (?:Пояснення кожного рядка прикладу|Line-by-line explanation)\s*\n([\s\S]*?)(?=\n### )/i)?.[1]?.trim();
        assert.ok(explanation, `${locale}/${courseKey}/${key} has a code explanation`);
        assert.doesNotMatch(explanation, /state variables keep only information|змінні стану зберігають лише інформацію/i, `${locale}/${courseKey}/${key} is not generic boilerplate`);
        explanations.add(explanation.replace(/\s+/g, " "));

        const scenario = topic.content.match(/\*\*(?:Сценарій уроку|Lesson scenario):\*\*\s*\n([\s\S]*?)(?=\n### )/i)?.[1] ?? "";
        const steps = [...scenario.matchAll(/^\d+\.\s+/gm)].length;
        assert.ok(steps >= 5, `${locale}/${courseKey}/${key} has a staged lesson scenario (${steps})`);
        assert.match(topic.content, /(?:\*\*Judge practice is generated|\*\*Judge-практика генерується)/i, `${locale}/${courseKey}/${key} retains dynamic Judge practice`);
      }
      assert.equal(explanations.size, keys.length, `${locale}/${courseKey} explanations are topic-specific`);
    }
  }

  const ukrainianPython = validateCurriculum().topics["olympiad-python"];
  for (const key of ["array-traversal", "extrema-and-counts", "boundary-debugging"]) {
    const topic = ukrainianPython.find((entry) => entry.key === key)!;
    assert.match(topic.content, /пам’ять вводу — O\(n\)/i, `${key} accounts for Python's parsed input`);
  }
  const interval = ukrainianPython.find((entry) => entry.key === "interval-basics")!;
  assert.match(interval.content, /пам’ять — O\(n\)/i, "the saved array is included in the space bound");
});

test("English Olympiad theory does not contain Ukrainian prose", () => {
  const result = validateCurriculum(undefined, "en");
  for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"]) {
    for (const topic of result.topics[courseKey]) {
      const prose = topic.content.replace(/```[\s\S]*?```/g, "");
      assert.doesNotMatch(prose, /[\u0400-\u04FF]/u, `${courseKey}/${topic.key} English prose`);
    }
  }
});

test("fixed-window lessons explain rolling sums without prefix or remainder carryover", () => {
  for (const locale of ["uk", "en"] as const) {
    const result = validateCurriculum(undefined, locale);
    for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"]) {
      const topic = result.topics[courseKey].find((entry) => entry.key === "fixed-window-sum")!;
      assert.doesNotMatch(topic.content, /negative remainder|від'ємний залишок|prefix list has n\+1|список префіксів має n\+1/i, `${locale}/${courseKey}/fixed-window-sum`);
      assert.match(topic.content, /departing|leaves the window|що виходить|виходить зліва/i, `${locale}/${courseKey}/fixed-window-sum must explain the rolling update`);
    }
  }
});

test("language-runtime lessons demonstrate a sum beyond signed 32-bit range", () => {
  const typeClaims = {
    uk: {
      "olympiad-python": /Python `int` зберігає її точно/,
      "olympiad-java": /межу `int`.*`long`/,
      "olympiad-cpp": /межу `int`.*`long long`/,
    },
    en: {
      "olympiad-python": /Python `int` stores it exactly/,
      "olympiad-java": /range of `int`.*`long`/,
      "olympiad-cpp": /range of `int`.*`long long`/,
    },
  } as const;
  for (const locale of ["uk", "en"] as const) {
    const result = validateCurriculum(undefined, locale);
    for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"] as const) {
      const topic = result.topics[courseKey].find((entry) => entry.key === "language-runtime");
      assert.ok(topic, `${locale}/${courseKey}/language-runtime`);
      assert.match(topic.content, /2500000000/, `${locale}/${courseKey} demonstrates a large sum`);
      assert.match(topic.content, typeClaims[locale][courseKey], `${locale}/${courseKey} explains the numeric type`);
    }
  }
});

test("Olympiad workshop quizzes explain the decision their question asks about", () => {
  const checks = [
    { key: "thematic-sets", uk: /перенесення.*запам|запам'ятовування/i, en: /transfer.*remember|apply it to different data/i },
    { key: "mixed-set", uk: /обмеженн|n²|операц|ліміт/i, en: /constraints|n²|repeated operations|limit/i },
    { key: "timed-mock", uk: /зафіксований набір|чесн|однаков.*умов/i, en: /freezing.*set|same conditions|unfair to compare/i },
    { key: "post-contest-review", uk: /TLE.*час|TLE.*складн|WA.*логік/i, en: /TLE.*runtime|WA.*wrong result|complexity.*logic/i },
    { key: "targeted-review", uk: /нова задача.*пау|нов.*задач.*пау|відкладен.*перенес/i, en: /new problem.*pause|delayed recall.*transfer/i },
  ] as const;

  for (const locale of ["uk", "en"] as const) {
    const result = validateCurriculum(undefined, locale);
    const expectedForLocale = locale === "uk" ? "uk" : "en";
    for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"]) {
      for (const check of checks) {
        const topic = result.topics[courseKey].find((entry) => entry.key === check.key);
        assert.ok(topic, `${locale}/${courseKey}/${check.key}`);
        const blocks = [...topic.content.matchAll(/```interactive\s*\n([\s\S]*?)\n\s*```/g)];
        const quiz = blocks.map(([, source]) => {
          try {
            return JSON.parse(source.trim()) as { type?: string; questions?: Array<{ explanation?: string }> };
          } catch {
            return undefined;
          }
        }).find((block) => block?.type === "quiz" && block.questions?.length);
        assert.ok(quiz?.questions?.[0]?.explanation, `${locale}/${courseKey}/${check.key} has a quiz explanation`);
        assert.match(quiz.questions[0].explanation, check[expectedForLocale], `${locale}/${courseKey}/${check.key} explains the decision`);
      }
    }
  }
});

test("Olympiad quiz explanations are not copied verbatim from lesson prose", () => {
  const duplicates: string[] = [];
  for (const locale of ["uk", "en"] as const) {
    const result = validateCurriculum(undefined, locale);
    for (const courseKey of ["olympiad-python", "olympiad-java", "olympiad-cpp"]) {
      for (const topic of result.topics[courseKey]) {
        const prose = topic.content
          .replace(/```interactive\s*\n[\s\S]*?\n\s*```/g, "")
          .replace(/```[\s\S]*?```/g, "");
        const blocks = [...topic.content.matchAll(/```interactive\s*\n([\s\S]*?)\n\s*```/g)];
        for (const [, source] of blocks) {
          let payload: { type?: string; questions?: Array<{ explanation?: string }> } | undefined;
          try {
            payload = JSON.parse(source.trim()) as typeof payload;
          } catch {
            continue;
          }
          if (payload?.type !== "quiz") continue;
          for (const question of payload.questions ?? []) {
            const explanation = question.explanation?.trim();
            if (explanation && explanation.length >= 40 && prose.includes(explanation)) {
              duplicates.push(`${locale}/${courseKey}/${topic.key}: ${explanation}`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual(duplicates, []);
});

test("topic identity stays stable when the same source is loaded twice", () => {
  const course = validateCurriculum().manifest.courses.find((entry) => entry.key === "python-core")!;
  const first = loadCurriculumTopics(course);
  const second = loadCurriculumTopics(course);
  assert.deepEqual(first.map((topic) => [topic.key, topic.sourceHash]), second.map((topic) => [topic.key, topic.sourceHash]));
});

test("match/case practice section demonstrates match/case instead of an unrelated if condition", () => {
  const course = validateCurriculum().topics["python-core"];
  const topic = course.find((entry) => entry.title === "Зіставлення зі зразком: match/case")!;
  const practice = topic.content.split("### На практиці")[1]?.split("### Підсумок")[0] || "";
  assert.match(practice, /match command:/);
  assert.match(practice, /case "pick":/);
  assert.match(practice, /case _:/);
  assert.doesNotMatch(practice, /if score\s*>=\s*60/);
});

test("specialised lessons are authored lessons, not padded generic notes", () => {
  const result = validateCurriculum();
  for (const courseKey of ["flask", "fastapi", "computer-vision"]) {
    for (const topic of result.topics[courseKey]) {
      assert.ok(topic.content.length >= 2400, `${courseKey}/${topic.key}`);
      assert.ok((topic.content.match(/^### /gm) || []).length >= 10, `${courseKey}/${topic.key}`);
      assert.match(topic.content, /```interactive\s*\n\{"type":"prediction"/i, `${courseKey}/${topic.key}`);
      assert.match(topic.content, /\*\*Навіщо саме(?: це)?/i, `${courseKey}/${topic.key}`);
      assert.doesNotMatch(topic.content, /^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im, `${courseKey}/${topic.key}`);
    }
  }
  for (const topic of result.topics["python-extensions"]) {
    assert.ok(topic.content.length >= 2600, `python-extensions/${topic.key}`);
  }
});

test("every course exposes positioned integration projects", () => {
  const result = validateCurriculum();
  assert.ok(result.topics.fastapi.length >= 24, "FastAPI needs a complete progression, not a short overview");
  assert.match(result.topics.fastapi[0].title, /Вступ|HTTP|ASGI/i);
  for (const course of result.catalogManifest.courses) {
    const projects = loadCurriculumMiniProjects(course.key);
    assert.ok(projects.length >= 1, `${course.key} must expose a mini-project`);
    const topicKeys = new Set(result.topics[course.key].map((topic) => topic.key));
    for (const project of projects) {
      assert.ok(project.skills.length >= 2, `${course.key}/${project.key} skills`);
      assert.ok(project.milestones.length >= 1, `${course.key}/${project.key} milestones`);
      assert.ok(project.acceptanceCriteria.length >= 1, `${course.key}/${project.key} acceptance`);
      assert.ok(project.requiredTopicKeys.length >= 1, `${course.key}/${project.key} required topics`);
      for (const topicKey of project.requiredTopicKeys) assert.ok(topicKeys.has(topicKey), `${course.key}/${project.key} references ${topicKey}`);
    }
  }
});

test("every mini-project has an explicit IO contract and at least 15 cases", () => {
  const result = validateCurriculum();
  let projectCount = 0;
  for (const course of result.catalogManifest.courses) {
    for (const project of loadCurriculumMiniProjects(course.key)) {
      projectCount += 1;
      assert.ok(project.inputFormat.length >= 20, `${course.key}/${project.key} inputFormat`);
      assert.ok(project.outputFormat.length >= 20, `${course.key}/${project.key} outputFormat`);
      assert.ok(project.tests && project.tests.length >= 15, `${course.key}/${project.key} tests`);
      assert.equal(project.tests?.filter((test) => test.hidden).length, 3, `${course.key}/${project.key} hidden tests`);
      assert.ok(project.tests?.every((test) => test.input !== undefined && test.expectedOutput !== undefined), `${course.key}/${project.key} test IO`);
    }
  }
  assert.equal(projectCount, 54);
});

test("mini-project contracts cannot be a generic all-OK placeholder", () => {
  const result = validateCurriculum();
  for (const course of result.catalogManifest.courses) {
    for (const project of loadCurriculumMiniProjects(course.key)) {
      const outputs = project.tests.map((testCase) => testCase.expectedOutput.trim());
      const declaresOkBehavior = /\bOK\b|без помилки 5xx|without a 5xx/i.test(project.outputFormat);
      if (declaresOkBehavior) continue;
      assert.ok(new Set(outputs).size >= 3, `${course.key}/${project.key} needs multiple semantic expected outputs`);
      assert.ok(outputs.some((output) => output !== "OK"), `${course.key}/${project.key} must not accept only OK`);
    }
  }
});

test("English mini-project dependencies use persisted canonical topic keys", () => {
  const ukManifest = loadCurriculumManifest(undefined, "uk").manifest;
  const enManifest = loadCurriculumManifest(undefined, "en").manifest;

  for (const englishCourse of enManifest.courses) {
    const ukrainianCourse = ukManifest.courses.find((course) => course.key === englishCourse.key)!;
    const persistedTopicKeys = new Set(loadCurriculumTopics(ukrainianCourse, undefined, "uk").map((topic) => topic.key));
    for (const project of loadCurriculumMiniProjects(englishCourse.key, undefined, "en")) {
      for (const topicKey of project.requiredTopicKeys) {
        assert.ok(persistedTopicKeys.has(topicKey), `${englishCourse.key}/${project.key} references a non-canonical topic key ${topicKey}`);
      }
    }
  }
});

test("every specialization has a full lesson shape without template blocks", () => {
  const result = validateCurriculum();
  for (const courseKey of ["python-extensions", "flask", "fastapi", "computer-vision", "java-advanced", "cpp-advanced"]) {
    for (const topic of result.topics[courseKey]) {
      const minimumHeadings = ["flask", "fastapi", "computer-vision"].includes(courseKey) ? 10 : 8;
      assert.ok((topic.content.match(/^### /gm) || []).length >= minimumHeadings, `${courseKey}/${topic.key} needs a complete lesson shape`);
      assert.match(topic.content, /###\s+На практиці/i, `${courseKey}/${topic.key} needs a practical explanation`);
      assert.doesNotMatch(topic.content, /^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im, `${courseKey}/${topic.key} contains a template block`);
    }
  }
});

test("no theory file contains the removed template headings", () => {
  const result = validateCurriculum();
  for (const topics of Object.values(result.topics)) {
    for (const topic of topics) {
      assert.doesNotMatch(topic.content, /^###\s+(?:Крок за кроком|Перед вправою|Підготовка до мініпроєкту)\b/im, topic.title);
    }
  }
});

test("specialization lessons keep stable keys and the canonical Core section order", () => {
  const result = validateCurriculum();
  const specializationKeys = ["python-extensions", "flask", "fastapi", "computer-vision", "java-advanced", "cpp-advanced"];
  let topicCount = 0;

  for (const courseKey of specializationKeys) {
    for (const topic of result.topics[courseKey]) {
      topicCount += 1;
      assert.equal(topic.key, slug(topic.title), `${courseKey}/${topic.title} key must remain title-derived`);
      let previous = -1;
      for (const heading of CORE_LESSON_HEADINGS) {
        const index = topic.content.indexOf(`### ${heading}`);
        assert.ok(index >= 0, `${courseKey}/${topic.key} missing ${heading}`);
        assert.ok(index > previous, `${courseKey}/${topic.key} has ${heading} out of order`);
        assert.equal(topic.content.indexOf(`### ${heading}`, index + 1), -1, `${courseKey}/${topic.key} duplicates ${heading}`);
        previous = index;
      }
      assert.match(topic.content, /```interactive\s*\n/i, `${courseKey}/${topic.key} needs an interactive check`);
    }
  }

  assert.equal(topicCount, 130);
});

test("curriculum quality report is clean for all courses", () => {
  const report = auditCurriculum();
  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(
    [...report.courses, ...report.olympiadCourses].map((course) => [course.courseKey, course.topicCount, course.errorCount, course.warningCount]),
    [
      ["python-core", 30, 0, 0],
      ["java-core", 29, 0, 0],
      ["cpp-core", 30, 0, 0],
      ["python-extensions", 22, 0, 0],
      ["flask", 18, 0, 0],
      ["fastapi", 31, 0, 0],
      ["computer-vision", 19, 0, 0],
      ["java-advanced", 20, 0, 0],
      ["cpp-advanced", 20, 0, 0],
      ["olympiad-python", 47, 0, 0],
      ["olympiad-java", 47, 0, 0],
      ["olympiad-cpp", 47, 0, 0],
    ],
  );
});
