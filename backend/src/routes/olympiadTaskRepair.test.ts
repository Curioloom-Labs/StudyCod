import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { Task } from "../entities/Task";
import { TestData } from "../entities/TestData";
import { Topic } from "../entities/Topic";
import { User } from "../entities/User";
import { buildOlympiadPracticeContract } from "../services/learning/learningContract";
import tasksRouter, { taskGenerationDependencies } from "./tasks";

test("an oracle rejection regenerates a dynamic Olympiad task with feedback and removes the rejected variant", async (t) => {
  const contract = buildOlympiadPracticeContract({
    courseKey: "olympiad-python",
    topicKey: "queue-patterns",
    topicTitle: "Queues",
    runtime: "PYTHON",
    objective: "Process arrivals in first-in, first-out order.",
    sequence: 2,
    total: 3,
  });
  const item = {
    id: 73,
    kind: "CODE_TASK",
    order: 1,
    contentKey: "olympiad-python.queue-patterns.practice-1",
    title: "Queue orders",
    content: { exercise: { prompt: "Track the waiting orders.", learningContract: contract, starterCode: "SHOULD_NOT_OVERRIDE_DEBUG_DRAFT" } },
    module: { id: 9, order: 1 },
  };
  const context = {
    course: { id: 5, catalogKey: "olympiad-python" },
    item,
    enrollment: { id: 27, variant: { runtime: "PYTHON" } },
    progress: null,
    theoryMarkdown: "## Queue practice\nUse FIFO order for arrivals and service.",
  };

  const savedTasks: any[] = [];
  const removedIds: number[] = [];
  const savedTestRows: any[][] = [];
  const query = {
    leftJoin() { return this; },
    innerJoin() { return this; },
    where() { return this; },
    andWhere() { return this; },
    orderBy() { return this; },
    addOrderBy() { return this; },
    take() { return this; },
    select() { return this; },
    getOne: async () => null,
    getMany: async () => [],
  };
  let nextTaskId = 100;
  const taskRepository = {
    createQueryBuilder: () => query,
    create: (value: any) => ({ ...value }),
    async save(value: any) {
      if (!value.id) value.id = nextTaskId++;
      const existing = savedTasks.findIndex((task) => task.id === value.id);
      if (existing >= 0) savedTasks[existing] = value;
      else savedTasks.push(value);
      return value;
    },
    async remove(value: any) {
      removedIds.push(value.id);
      const index = savedTasks.findIndex((task) => task.id === value.id);
      if (index >= 0) savedTasks.splice(index, 1);
    },
    async findOne({ where }: any) { return savedTasks.find((task) => task.id === where.id) ?? null; },
  };
  const testDataRepository = {
    create: (value: any) => value,
    async save(value: any[]) { savedTestRows.push(value); return value; },
  };

  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    if (entity === User) return { findOne: async () => ({ id: 900001, userMode: "PERSONAL" }) } as any;
    if (entity === Task) return taskRepository as any;
    if (entity === TestData) return testDataRepository as any;
    if (entity === Topic) return { find: async () => [] } as any;
    throw new Error(`Unexpected repository: ${String(entity)}`);
  });
  t.mock.method(taskGenerationDependencies, "getCoursePracticeContext", async () => context as any);
  t.mock.method(taskGenerationDependencies, "startCourseItem", async () => undefined);
  t.mock.method(taskGenerationDependencies, "getStableDifus", async () => 2);

  const taskFeedback: Array<string | undefined> = [];
  let testGenerationCalls = 0;
  t.mock.method(taskGenerationDependencies, "safeAICall", async (mode: string, params: any) => {
    if (mode === "generateTask") {
      taskFeedback.push(params.validationFeedback);
      const repaired = taskFeedback.length > 1;
      return {
        success: true,
        data: {
          title: repaired ? "Orders leave in arrival order" : "Orders are served",
          practicalTask: "Read a sequence of arrival and service commands for a queue. This draft has one logical bug; identify it and repair it, then submit a complete corrected program. Print each served order identifier on its own line, or EMPTY if no order was served.\n\n```python\nq = int(input())\norders = list(map(int, input().split()))\nprint(orders[0])\n```",
          ioType: "STDIN_STDOUT",
          inputFormat: "Read q commands, each on a separate line.",
          outputFormat: "Print each served identifier on its own line, or EMPTY if none was served.",
          constraints: "1 <= q <= 200000; every SERVE command has a waiting order.",
          examples: [{ input: "2\nADD 5\nSERVE", output: repaired ? "5" : "99" }],
        },
      };
    }
    if (mode === "generateTestData") {
      testGenerationCalls++;
      if (testGenerationCalls === 1) {
        return {
          success: false,
          error: {
            statusCode: 422,
            details: { validationError: "TASK_CONTRACT_REVIEW_FAILED[publicExamples]: Example 1: reference output is 5 but the example says 99." },
          },
        };
      }
      return {
        success: true,
        data: Array.from({ length: Number(params.count) }, (_, index) => {
          const identifier = index + 10;
          return { input: `2\nADD ${identifier}\nSERVE`, output: String(identifier) };
        }),
      };
    }
    throw new Error(`Unexpected AI mode: ${mode}`);
  });

  const route = tasksRouter.stack.find((entry: any) => entry.route?.path === "/generate" && entry.route.methods.post) as any;
  assert.ok(route);
  let status = 200;
  let body: any;
  const res = {
    status(value: number) { status = value; return res; },
    json(value: unknown) { body = value; return res; },
    setHeader() {},
  };
  await route.route.stack.at(-1).handle({
    userId: 900001,
    learningRuntime: "PYTHON",
    body: { courseItemId: item.id },
    headers: { "x-ui-language": "uk" },
    query: {},
  }, res);

  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.task.title, "Orders leave in arrival order");
  assert.equal(taskFeedback.length, 2);
  assert.equal(taskFeedback[0], undefined);
  assert.match(taskFeedback[1] ?? "", /reference output is 5/);
  assert.match(taskFeedback[1] ?? "", /same learning-contract objective and algorithm/i);
  assert.deepEqual(removedIds, [100]);
  assert.equal(savedTasks.length, 1);
  assert.equal(savedTasks[0].id, 101);
  assert.equal(savedTasks[0].template, "q = int(input())\norders = list(map(int, input().split()))\nprint(orders[0])");
  assert.equal(savedTestRows[0].length, 12);
});
