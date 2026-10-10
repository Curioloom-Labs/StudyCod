import type { ContestStandings } from "../../lib/api/contests";

/** Local-only example standings. Never used outside the explicit dev preview. */
export const previewStandings: ContestStandings = {
  contestId: 102,
  scoringMode: "IOI",
  problems: [
    { id: 501, order: 1, label: "A", maxScore: 100 },
    { id: 502, order: 2, label: "B", maxScore: 150 },
    { id: 503, order: 3, label: "C", maxScore: 200 },
  ],
  rows: [
    {
      rank: 1,
      participantId: 31,
      displayName: "Іра М.",
      totalScore: 350,
      lastImprovementAt: null,
      problems: [
        { problemId: 501, score: 100, bestAt: null },
        { problemId: 502, score: 150, bestAt: null },
        { problemId: 503, score: 100, bestAt: null },
      ],
    },
    {
      rank: 2,
      participantId: 32,
      displayName: "Данило Р.",
      totalScore: 300,
      lastImprovementAt: null,
      problems: [
        { problemId: 501, score: 100, bestAt: null },
        { problemId: 502, score: 100, bestAt: null },
        { problemId: 503, score: 100, bestAt: null },
      ],
    },
    {
      rank: 3,
      participantId: 33,
      displayName: "Софія Л.",
      totalScore: 250,
      lastImprovementAt: null,
      problems: [
        { problemId: 501, score: 100, bestAt: null },
        { problemId: 502, score: 150, bestAt: null },
        { problemId: 503, score: 0, bestAt: null },
      ],
    },
  ],
};
