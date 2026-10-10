import test from "node:test";
import assert from "node:assert/strict";
import { sharedContestRead } from "./sharedRead";

test("identical concurrent contest queries share one read and retain no stale value", async () => {
  let calls = 0;
  const read = async () => ++calls;
  const values = await Promise.all(Array.from({ length: 100 }, () => sharedContestRead("public-list", read)));
  assert.ok(values.every(value => value === 1));
  assert.equal(await sharedContestRead("public-list", read), 2);
});
test("different viewer query parameters never share data", async () => {
  const [a, b] = await Promise.all([sharedContestRead("user:1", async () => "one"), sharedContestRead("user:2", async () => "two")]);
  assert.equal(a, "one"); assert.equal(b, "two");
});
test("a failed read is removed so the next request can recover", async () => {
  await assert.rejects(sharedContestRead("retry", async () => { throw new Error("DB_FAILURE"); }));
  assert.equal(await sharedContestRead("retry", async () => "ready"), "ready");
});
