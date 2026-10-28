import React from "react";
import { BadgeCheck } from "lucide-react";
import type { PortfolioEvidence, PortfolioEvidenceSourceType, PortfolioSkill } from "../../lib/api/portfolio";

type EvidenceCardItem = Pick<PortfolioEvidence,
  "id" | "sourceType" | "sourceTitle" | "sourceLabel" | "sourceDetail" | "description" | "skillIds" | "language" | "judgeVerdict" | "testsPassed" | "testsTotal"
>;

export function isPortfolioAchievement(type: PortfolioEvidenceSourceType): boolean {
  return type === "LEARNING_ACTIVITY" || type === "LEARNING_COURSE" || type === "COMPETITION_RESULT";
}

export function localizePortfolioEvidenceDetail(type: PortfolioEvidenceSourceType, detail: string, en: boolean): string {
  if (en || type === "PROJECT_PUBLICATION") return detail;
  if (type === "ONLINE_JUDGE") {
    const match = detail.match(/^(\d+)\/(\d+)/);
    return match ? `${match[1]}/${match[2]} тестів пройдено` : "Результат Online Judge";
  }
  if (type === "LEARNING_ACTIVITY") return "Завершення навчальної активності зафіксовано StudyCod.";
  if (type === "LEARNING_COURSE") return "Завершення курсу зафіксовано StudyCod.";
  if (type === "ASSESSMENT_FEEDBACK") {
    const count = Number(detail.match(/^(\d+)/)?.[1] ?? 0);
    return `${count} ${count === 1 ? "інтерв'юер відкрив" : "інтерв'юери відкрили"} відгук кандидату.`;
  }
  if (type === "ASSESSMENT_TASK_RESULT") {
    const match = detail.match(/^(Passed|Did not pass)(?: · (\d+)\/(\d+) tests passed)?/);
    if (!match) return "Результат Judge перевірено компанією.";
    const result = match[1] === "Passed" ? "Залік" : "Не зараховано";
    return match[2] ? `${result} · ${match[2]}/${match[3]} тестів пройдено; результат перевірено компанією.` : `${result}; результат перевірено компанією.`;
  }
  if (type === "COMPETITION_RESULT") {
    const count = Number(detail.match(/^(\d+)/)?.[1] ?? 0);
    const noun = count === 1 ? "задачу зараховано" : count > 1 && count < 5 ? "задачі зараховано" : "задач зараховано";
    const awardPlace = detail.match(/StudyCod award certificate confirms place ([1-3])\./)?.[1];
    const award = awardPlace ? ` Диплом StudyCod підтверджує ${awardPlace} місце.` : "";
    return `${count} ${noun} у межах офіційного змагання.${award}`;
  }
  return detail;
}

export const PortfolioEvidenceCard: React.FC<{ item: EvidenceCardItem; skills: PortfolioSkill[]; en: boolean }> = ({ item, skills, en }) => {
  const sourceLabel = ({
    ONLINE_JUDGE: en ? "Online Judge · accepted solution" : "Online Judge · прийнятий розв'язок",
    LEARNING_ACTIVITY: en ? "Learn · completed course activity" : "Learn · завершена активність курсу",
    LEARNING_COURSE: en ? "Learn · course completion" : "Learn · завершення курсу",
    PROJECT_PUBLICATION: en ? "Published StudyCod project" : "Опублікований проєкт StudyCod",
    ASSESSMENT_FEEDBACK: en ? "Assess · released interview feedback" : "Assess · опублікований відгук інтерв'ю",
    ASSESSMENT_TASK_RESULT: en ? "Assess · reviewed Judge task" : "Assess · перевірена Judge задача",
    COMPETITION_RESULT: en ? "Competition · official result" : "Змагання · офіційний результат",
  })[item.sourceType];
  const sourceDetail = item.sourceType === "ONLINE_JUDGE" && item.testsPassed != null && item.testsTotal != null
    ? `${item.testsPassed}/${item.testsTotal} ${en ? "tests passed" : "тестів пройдено"}`
    : localizePortfolioEvidenceDetail(item.sourceType, item.sourceDetail, en);
  return <article className="rounded-2xl border border-border bg-bg-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{sourceLabel}</p>
        <h3 className="mt-1 font-bold">{item.sourceTitle}</h3>
      </div>
      <span className="inline-flex items-center gap-1 rounded-lg bg-accent-success/10 px-2.5 py-1.5 text-xs font-semibold text-accent-success">
        <BadgeCheck className="size-4" />
        {item.sourceType === "ONLINE_JUDGE"
          ? (en ? `Judge: ${item.judgeVerdict ?? "accepted"}` : `Judge: ${item.judgeVerdict ?? "прийнято"}`)
          : (en ? "Source verified" : "Джерело підтверджено")}
      </span>
    </div>
    {item.description && <p className="mt-3 text-sm leading-6 text-text-secondary">{item.description}</p>}
    <div className="mt-3 flex flex-wrap gap-1.5">{item.skillIds.map(id => {
      const skill = skills.find(candidate => candidate.id === id);
      return skill ? <span key={id} className="rounded-lg border border-border bg-bg-base px-2.5 py-1.5 text-xs font-medium text-text-secondary">{en ? skill.labelEn : skill.labelUk}</span> : null;
    })}</div>
    <footer className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-xs text-text-muted">
      <span>{sourceLabel}</span><span>{sourceDetail}</span>
    </footer>
  </article>;
};
