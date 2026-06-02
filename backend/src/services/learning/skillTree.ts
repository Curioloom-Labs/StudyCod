/**
 * Skill-tree / concept-map model.
 *
 * Pure transform: given the ordered topics (with optional prerequisites) and a
 * per-topic mastery/progress signal, produce a graph of nodes with a status
 * (locked / available / in_progress / mastered) plus the single recommended
 * "next" node. The React map renders nodes + edges from this.
 *
 * Status rules:
 *  - mastered:    masteryPct >= masteredThreshold
 *  - locked:      a prerequisite is not yet mastered
 *  - in_progress: unlocked, started (attempts > 0 or 0 < masteryPct)
 *  - available:   unlocked, not started
 */
export interface SkillTopicInput {
  id: number;
  title: string;
  order: number;
  /** Topic ids that must be mastered before this unlocks. */
  prerequisites?: number[];
  /** 0..1 mastery for this topic (e.g. from spaced-repetition / solved ratio). */
  masteryPct?: number;
  /** Whether the learner has attempted anything in this topic. */
  started?: boolean;
}

export type SkillNodeStatus = "locked" | "available" | "in_progress" | "mastered";

export interface SkillNode {
  id: number;
  title: string;
  order: number;
  status: SkillNodeStatus;
  masteryPct: number;
  prerequisites: number[];
  isNext: boolean;
}

export interface SkillTree {
  nodes: SkillNode[];
  edges: Array<{ from: number; to: number }>;
  nextNodeId: number | null;
}

export function buildSkillTree(topics: SkillTopicInput[], masteredThreshold = 0.8): SkillTree {
  const clampPct = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
  const ordered = [...topics].sort((a, b) => a.order - b.order);

  const masteredSet = new Set<number>();
  for (const t of ordered) {
    if (clampPct(t.masteryPct) >= masteredThreshold) masteredSet.add(t.id);
  }

  const nodes: SkillNode[] = ordered.map((t) => {
    const prereqs = (t.prerequisites ?? []).filter((p) => Number.isFinite(p));
    const masteryPct = clampPct(t.masteryPct);
    const prereqsMet = prereqs.every((p) => masteredSet.has(p));

    let status: SkillNodeStatus;
    if (masteryPct >= masteredThreshold) status = "mastered";
    else if (!prereqsMet) status = "locked";
    else if (t.started || masteryPct > 0) status = "in_progress";
    else status = "available";

    return { id: t.id, title: t.title, order: t.order, status, masteryPct, prerequisites: prereqs, isNext: false };
  });

  // Recommended next node: first in-progress, else first available, by order.
  const next =
    nodes.find((n) => n.status === "in_progress") ??
    nodes.find((n) => n.status === "available") ??
    null;
  if (next) next.isNext = true;

  const edges: Array<{ from: number; to: number }> = [];
  for (const n of nodes) {
    for (const p of n.prerequisites) edges.push({ from: p, to: n.id });
  }

  return { nodes, edges, nextNodeId: next ? next.id : null };
}
