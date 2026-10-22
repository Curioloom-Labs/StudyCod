export type AwardPlace = 1 | 2 | 3 | null;
export type AwardRow = {
  participantId: number;
  displayName: string;
  rank: number | null;
  totalScore: number;
  maxScore: number;
  submissionCount: number;
  isDisqualified: boolean;
  retainParticipation: boolean;
  awardPlace: AwardPlace;
};

export function eligibleForCertificate(row: AwardRow): boolean {
  return row.submissionCount > 0 && (!row.isDisqualified || row.retainParticipation);
}

export function proposeAwards(rows: AwardRow[]): AwardRow[] {
  const eligible = rows.filter(r => r.submissionCount > 0 && !r.isDisqualified)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const positions = new Map(eligible.map((r, i) => [r.participantId, i + 1]));
  return rows.map(row => {
    const position = positions.get(row.participantId) ?? 0;
    return { ...row, awardPlace: position >= 1 && position <= 3 ? position as AwardPlace : null };
  });
}

export function applyAwardDecisions(rows: AwardRow[], decisions: Array<{ participantId: number; awardPlace: AwardPlace }>): AwardRow[] {
  const byId = new Map(decisions.map(d => [d.participantId, d.awardPlace]));
  if (byId.size !== decisions.length || decisions.length !== rows.length || rows.some(r => !byId.has(r.participantId))) {
    throw new Error("INVALID_AWARD_PARTICIPANTS");
  }
  return rows.map(row => {
    const awardPlace = byId.get(row.participantId) ?? null;
    if (awardPlace !== null && (![1, 2, 3].includes(awardPlace) || !eligibleForCertificate(row) || row.isDisqualified)) {
      throw new Error("INELIGIBLE_AWARD_PARTICIPANT");
    }
    return { ...row, awardPlace };
  });
}
