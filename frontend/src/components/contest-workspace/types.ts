import type {
  ContestCheckResult,
  ContestProblemStatement,
  ContestRunResult,
  ContestSubmissionListItem,
  JudgeLanguage,
  ScoreboardRow,
} from "../../lib/api/contests";

export type WorkspaceTabKind = "contest-overview" | "problem" | "submissions" | "leaderboard" | "discussion";

export type WorkspaceTab = {
  id: string;
  kind: WorkspaceTabKind;
  title: string;
  closable: boolean;
};

export type WorkspaceVerdictTone = "accepted" | "wrong" | "neutral";

export type WorkspaceDockState = {
  collapsed: boolean;
  poppedOut: boolean;
  width: number;
};

export type ContestWorkspaceProps = {
  contestTitle: string;
  contestStartsAt: string | null;
  contestEndsAt: string | null;
  statement: ContestProblemStatement;
  language: JudgeLanguage;
  onLanguageChange: (next: JudgeLanguage) => void;
  code: string;
  onCodeChange: (next: string) => void;
  onRun: () => void;
  onSubmit: () => void;
  running: boolean;
  checking: boolean;
  runInput: string;
  onRunInputChange: (next: string) => void;
  runResult: ContestRunResult | null;
  checkResult: ContestCheckResult | null;
  submissions: ContestSubmissionListItem[];
  scoreboardRows: ScoreboardRow[];
  scoreboardLoading: boolean;
  onRefreshScoreboard: () => void;
  onRefreshSubmissions: () => void;
  wsStatus: "connecting" | "connected" | "offline";
  latestVerdict: string | null;
  latestVerdictAt: number;
  currentUserLabel?: string | null;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  canAskOrganizer?: boolean;
  onAskOrganizer?: (question: string) => Promise<void> | void;
};
