import test from "node:test";
import assert from "node:assert/strict";
import { contestDefaultLanguage } from "./contestDefaultLanguage";

const languages = ["java", "python", "cpp"] as const;
test("imported C++/Python problem opens with its C++ template despite legacy JAVA", () => {
  assert.equal(contestDefaultLanguage({ lang: "JAVA", templatesByLanguage: { cpp: "#include <iostream>", python: "# solve" } }, languages), "cpp");
});
test("a matching configured legacy language keeps its preference", () => {
  assert.equal(contestDefaultLanguage({ lang: "PYTHON", templatesByLanguage: { cpp: "int main() {}", python: "print(1)" } }, languages), "python");
});
test("legacy tasks without language-specific templates keep their language", () => {
  assert.equal(contestDefaultLanguage({ lang: "CPP" }, languages), "cpp");
  assert.equal(contestDefaultLanguage({ lang: "JAVA" }, languages), "java");
});
test("unsupported or blank templates cannot select an unavailable language", () => {
  assert.equal(contestDefaultLanguage({ lang: "JAVA", templatesByLanguage: { unknown: "code", java: " ", python: "print(1)" } }, languages), "python");
});
