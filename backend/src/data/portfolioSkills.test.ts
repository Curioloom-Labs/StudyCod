import assert from "node:assert/strict";
import test from "node:test";
import { ALL_JUDGE_LANGUAGES } from "../config/judgeLanguages";
import { PORTFOLIO_SKILLS } from "./portfolioSkills";

test("Portfolio language skills cover every language family supported by Judge", () => {
  const skills = new Map<string, typeof PORTFOLIO_SKILLS[number]>(PORTFOLIO_SKILLS.map(skill => [skill.id, skill]));
  const skillIdFor = (language: string) => language === "java" ? "java-language" : language;

  for (const language of ALL_JUDGE_LANGUAGES) {
    const skill = skills.get(skillIdFor(language));
    assert.ok(skill, `Portfolio taxonomy must include ${language}`);
    assert.equal(skill.categoryId, "languages", `${language} belongs to the programming languages category`);
    assert.ok(skill.labelUk.trim(), `${language} has a Ukrainian label`);
    assert.ok(skill.labelEn.trim(), `${language} has an English label`);
  }

  assert.equal(new Set(PORTFOLIO_SKILLS.map(skill => skill.id)).size, PORTFOLIO_SKILLS.length, "skill IDs must remain unique");
});
