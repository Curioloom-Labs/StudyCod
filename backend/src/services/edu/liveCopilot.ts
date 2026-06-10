import { getLLMProvider } from "../llm/provider";
import { logger } from "../../utils/logger";

export type LiveCodeStatus = "not_started" | "in_progress" | "stuck" | "passed";

export interface LiveOverviewStudent {
  studentId: number;
  name: string;
  status: LiveCodeStatus;
  currentTaskTitle: string | null;
}

export interface StuckCluster {
  taskTitle: string;
  count: number;
  names: string[];
}

export interface LiveSignals {
  totalStudents: number;
  totals: Record<LiveCodeStatus, number>;
  stuckClusters: StuckCluster[];
  idleNames: string[];
  stuckNames: string[];
  readiness: "ready_to_advance" | "mixed" | "needs_support";
}

export interface LiveBriefing {
  headline: string;
  diagnosis: string;
  actions: string[];
  source: "ai" | "rule";
}

/**
 * Pure, deterministic aggregation of the live overview into actionable signals:
 * who's stuck (and clustered on which task), who's idle, and an overall
 * readiness verdict. This is the always-available substrate; the LLM briefing
 * is a narrative layer on top of it.
 */
export function buildLiveSignals(students: LiveOverviewStudent[]): LiveSignals {
  const totals: Record<LiveCodeStatus, number> = { not_started: 0, in_progress: 0, stuck: 0, passed: 0 };
  const idleNames: string[] = [];
  const stuckNames: string[] = [];
  const stuckByTask = new Map<string, string[]>();

  for (const s of students) {
    totals[s.status] += 1;
    if (s.status === "not_started") idleNames.push(s.name);
    if (s.status === "stuck") {
      stuckNames.push(s.name);
      const key = s.currentTaskTitle || "—";
      const arr = stuckByTask.get(key) ?? [];
      arr.push(s.name);
      stuckByTask.set(key, arr);
    }
  }

  const stuckClusters: StuckCluster[] = [...stuckByTask.entries()]
    .filter(([, names]) => names.length >= 2)
    .map(([taskTitle, names]) => ({ taskTitle, count: names.length, names }))
    .sort((a, b) => b.count - a.count);

  const active = totals.in_progress + totals.stuck + totals.passed;
  let readiness: LiveSignals["readiness"] = "mixed";
  if (active > 0 && totals.passed / active >= 0.7) readiness = "ready_to_advance";
  else if (active > 0 && totals.stuck / active >= 0.4) readiness = "needs_support";

  return {
    totalStudents: students.length,
    totals,
    stuckClusters,
    idleNames,
    stuckNames,
    readiness
  };
}

/**
 * Deterministic teacher briefing — used as the LLM fallback and when the AI
 * provider is unavailable, so the suffler always returns something useful and
 * never blocks a live lesson on an outage.
 */
export function buildRuleBriefing(signals: LiveSignals, locale: "uk" | "en"): LiveBriefing {
  const uk = locale !== "en";
  const t = (u: string, e: string) => (uk ? u : e);
  const actions: string[] = [];

  const topCluster = signals.stuckClusters[0];
  if (topCluster) {
    actions.push(
      t(
        `Розберіть зі всіма «${topCluster.taskTitle}» — застрягли ${topCluster.count} (${topCluster.names.slice(0, 4).join(", ")}).`,
        `Walk through "${topCluster.taskTitle}" with everyone — ${topCluster.count} are stuck (${topCluster.names.slice(0, 4).join(", ")}).`
      )
    );
  } else if (signals.stuckNames.length > 0) {
    actions.push(
      t(
        `Підійдіть до тих, хто застряг: ${signals.stuckNames.slice(0, 4).join(", ")}.`,
        `Check in with the stuck students: ${signals.stuckNames.slice(0, 4).join(", ")}.`
      )
    );
  }
  if (signals.idleNames.length > 0) {
    actions.push(
      t(
        `Залучіть неактивних (${signals.idleNames.length}): ${signals.idleNames.slice(0, 4).join(", ")}.`,
        `Re-engage idle students (${signals.idleNames.length}): ${signals.idleNames.slice(0, 4).join(", ")}.`
      )
    );
  }
  if (signals.readiness === "ready_to_advance") {
    actions.push(t("Більшість склали — можна рухатись далі або дати складніше.", "Most have passed — you can move on or add a harder task."));
  }
  if (actions.length === 0) {
    actions.push(t("Клас рівно працює — тримайте темп.", "The class is working steadily — keep the pace."));
  }

  const headline =
    signals.readiness === "needs_support"
      ? t("Клас потребує підтримки", "Class needs support")
      : signals.readiness === "ready_to_advance"
      ? t("Клас готовий рухатись далі", "Class is ready to move on")
      : t("Робота триває", "Work in progress");

  const diagnosis = t(
    `Склали: ${signals.totals.passed}, працюють: ${signals.totals.in_progress}, застрягли: ${signals.totals.stuck}, неактивні: ${signals.totals.not_started}.`,
    `Passed: ${signals.totals.passed}, working: ${signals.totals.in_progress}, stuck: ${signals.totals.stuck}, idle: ${signals.totals.not_started}.`
  );

  return { headline, diagnosis, actions: actions.slice(0, 4), source: "rule" };
}

const briefingSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    diagnosis: { type: "string" },
    actions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 }
  },
  required: ["headline", "diagnosis", "actions"]
};

/**
 * AI teacher briefing: feeds the deterministic signals to the LLM for a short,
 * natural-language diagnosis + 2–4 concrete actions. Always falls back to the
 * rule-based briefing on any failure/empty/disabled provider.
 */
export async function generateLiveBriefing(signals: LiveSignals, locale: "uk" | "en"): Promise<LiveBriefing> {
  const fallback = buildRuleBriefing(signals, locale);
  try {
    const provider = getLLMProvider();
    const uk = locale !== "en";
    const systemPrompt = uk
      ? "Ти — AI-асистент вчителя програмування під час ЖИВОГО уроку. Дай стислий, дієвий діагноз класу та 2–4 конкретні дії. Без води. Відповідай українською у форматі JSON."
      : "You are an AI co-pilot for a programming teacher during a LIVE lesson. Give a concise, actionable class diagnosis and 2–4 concrete next actions. No fluff. Respond in English as JSON.";

    // Privacy: student names are NEVER sent to the external LLM (they are minors'
    // PII). We send only counts and task titles; the rule-based fallback, which
    // runs locally, is what surfaces specific names to the teacher.
    const clusterLines = signals.stuckClusters
      .map((c) => `- "${c.taskTitle}": ${c.count} stuck`)
      .join("\n") || "(none)";

    const userPrompt = `
Class size: ${signals.totalStudents}
Passed: ${signals.totals.passed}, Working: ${signals.totals.in_progress}, Stuck: ${signals.totals.stuck}, Idle: ${signals.totals.not_started}
Readiness signal: ${signals.readiness}

Stuck clusters (same task):
${clusterLines}

Idle student count: ${signals.idleNames.length}

Return JSON: {"headline": string, "diagnosis": string, "actions": string[2..4]}.
Refer to students by group/situation, not by name.
`.trim();

    const parsed = await provider.generateJSON<{ headline?: string; diagnosis?: string; actions?: string[] }>(
      userPrompt,
      briefingSchema,
      systemPrompt,
      { temperature: 0.3, maxTokens: 500, language: locale }
    );

    const headline = String(parsed?.headline ?? "").trim();
    const diagnosis = String(parsed?.diagnosis ?? "").trim();
    const actions = Array.isArray(parsed?.actions)
      ? parsed!.actions.map((a) => String(a).trim()).filter(Boolean).slice(0, 4)
      : [];

    if (!headline || !diagnosis || actions.length === 0) return fallback;
    return { headline, diagnosis, actions, source: "ai" };
  } catch (err: any) {
    logger.warn("[edu/live] AI briefing failed, using rule fallback", { error: err?.message });
    return fallback;
  }
}
