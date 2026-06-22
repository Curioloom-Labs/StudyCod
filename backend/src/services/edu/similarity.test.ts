import test from "node:test";
import assert from "node:assert/strict";
import { buildSimilarityPairs, markSharedLines } from "./similarity";

const A = `public class Main {
  public static int sum(int[] a) {
    int total = 0;
    for (int x : a) { total += x; }
    return total;
  }
}`;
// Near-identical to A (renamed identifiers / spacing) → high similarity.
const A2 = `public class Main {
  public static int sum(int[] arr) {
    int total = 0;
    for (int v : arr) { total += v; }
    return total;
  }
}`;
const B = `import java.util.*;
public class Solver {
  void bfs(Map<Integer,List<Integer>> g, int s) {
    Deque<Integer> q = new ArrayDeque<>();
    q.add(s);
    while (!q.isEmpty()) { int u = q.poll(); System.out.println(u); }
  }
}`;

test("buildSimilarityPairs flags near-identical code, ignores distinct", () => {
  const pairs = buildSimilarityPairs([
    { studentId: 1, code: A },
    { studentId: 2, code: A2 },
    { studentId: 3, code: B }
  ], { minSimilarity: 0.6, lang: "JAVA" });
  assert.equal(pairs.length, 1, "only the A/A2 pair is similar");
  assert.deepEqual([pairs[0].aStudentId, pairs[0].bStudentId], [1, 2]);
  assert.ok(pairs[0].similarity >= 0.6);
});

test("buildSimilarityPairs: unordered pair ids, sorted desc, blanks ignored", () => {
  const pairs = buildSimilarityPairs([
    { studentId: 9, code: A },
    { studentId: 4, code: A },        // identical → top
    { studentId: 7, code: A2 },
    { studentId: 5, code: "   " }     // blank → ignored
  ], { minSimilarity: 0.5, lang: "JAVA" });
  assert.ok(pairs.length >= 1);
  // Highest pair first, ids normalized a<b.
  assert.ok(pairs[0].aStudentId < pairs[0].bStudentId);
  for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i - 1].similarity >= pairs[i].similarity);
  assert.ok(!pairs.some(p => p.aStudentId === 5 || p.bStudentId === 5), "blank submission excluded");
});

test("buildSimilarityPairs: fewer than 2 → no pairs", () => {
  assert.deepEqual(buildSimilarityPairs([{ studentId: 1, code: A }]), []);
  assert.deepEqual(buildSimilarityPairs([]), []);
});

test("markSharedLines flags whitespace-insensitive shared non-blank lines", () => {
  const a = "int x = 1;\nreturn x;\nunique_a();";
  const b = "int   x = 1;\n\nreturn x;\nunique_b();";
  const { aShared, bShared } = markSharedLines(a, b);
  assert.deepEqual(aShared, [true, true, false], "x decl + return shared, unique_a not");
  assert.deepEqual(bShared, [true, false, true, false], "blank line never shared");
});
