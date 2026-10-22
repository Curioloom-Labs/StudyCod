import { api } from "./client";

export type AwardPlace = 1 | 2 | 3 | null;
export type ContestAwardRow = {
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
export type ContestAwards = {
  contestId: number;
  sourceVersion: string;
  canConfirm: boolean;
  pendingSubmissions: number;
  confirmedAt: string | null;
  confirmed: boolean;
  stale: boolean;
  rows: ContestAwardRow[];
  suggested: ContestAwardRow[];
};

export async function getContestAwards(contestId: number): Promise<ContestAwards> {
  return (await api.get(`/contests/${contestId}/admin/awards`)).data;
}
export async function confirmContestAwards(contestId: number, sourceVersion: string, rows: ContestAwardRow[]): Promise<void> {
  await api.put(`/contests/${contestId}/admin/awards`, {
    sourceVersion, decisions: rows.map(({ participantId, awardPlace }) => ({ participantId, awardPlace })),
  });
}
