import assert from "node:assert/strict";
import test from "node:test";
import { projectEntryFile } from "./learningCatalogProjectFiles";

test("course projects use the judge-required entry file for each runtime", () => {
  assert.equal(projectEntryFile("PYTHON"), "main.py");
  assert.equal(projectEntryFile("JAVA"), "Main.java");
  assert.equal(projectEntryFile("CPP"), "main.cpp");
});
