import test from "node:test";
import assert from "node:assert/strict";
import tasksRouter from "./tasks";
import { setTaskGenerationProgress } from "../services/taskGenerationProgress";

test("progress polling before the first snapshot is pending and becomes available after generation starts", async () => {
  const route = tasksRouter.stack.find((entry: any) =>
    entry.route?.path === "/generate/progress/:generationId" && entry.route.methods.get) as any;
  assert.ok(route);
  const userId = 900002;
  const generationId = `progress-contract-${Date.now()}`;
  let status = 200;
  let body: any;
  const response = {
    status(value: number) { status = value; return response; },
    json(value: unknown) { body = value; return response; },
  };
  const request = { userId, params: { generationId } };
  await route.route.stack.at(-1).handle(request, response);
  assert.equal(status, 202);
  assert.equal(body.pending, true);
  // Cached clients still receive the progress fields their overlay expects.
  assert.equal(body.status, "running");
  assert.equal(body.phase, "requesting");
  assert.equal(typeof body.progress, "number");

  await setTaskGenerationProgress({ userId, generationId, phase: "condition", progress: 40, message: "Generating" });
  status = 200;
  await route.route.stack.at(-1).handle(request, response);
  assert.equal(status, 200);
  assert.equal(body.phase, "condition");
  assert.equal(body.progress, 40);
  assert.equal(body.pending, undefined);
});
