import React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ListOrdered, Table2, KeyRound, RefreshCw, Trophy, Eye, Ban, RotateCcw, MessageSquare, Megaphone, Send, Flame, ShieldCheck, Users2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { StatusChip, type StatusChipTone } from "../components/ui/StatusChip";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { MarkdownView } from "../components/MarkdownView";
import { CodeEditor } from "../components/CodeEditor";
import { Skeleton } from "../components/ui/Skeleton";
import {
  addContestProblem,
  addContestOrganizer,
  answerContestCommunityQuestion,
  getContestCommunity,
  getContestDetails,
  getContestAccount,
  getContestMyProgress,
  getContestScoreboard,
  listContestOrganizers,
  listContestAnnulments,
  listContestAdminParticipants,
  listContestParticipantSubmissionsForAdmin,
  postContestCommunityAnnouncement,
  postContestCommunityQuestion,
  removeContestOrganizer,
  setContestAnnulment,
  setContestPaused,
  setContestParticipantDisqualified,
  joinContest,
  updateContestProblemSettings,
  updateContestAccount,
  updateContest,
  type ContestAccount,
  type ContestAdminParticipant,
  type ContestAdminSubmission,
  type ContestCommunityData,
  type ContestDetails,
  type ContestAnnulmentItem,
  type ContestOrganizerListItem,
  type ContestMyProgressProblem,
  type ScoreboardProblem,
  type ScoreboardRow,
} from "../lib/api/contests";
import {
  importLibraryTaskArchive,
  listApprovedLibraryTasks,
  listMyLibraryTasks,
  type LibraryTaskListItem,
} from "../lib/api/library";

function fmtDateTime(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function toDateTimeLocalInput(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocalInput(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseTestsJson(raw: string): Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }> {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("TESTS_JSON_MUST_BE_ARRAY");
  return parsed.map((t: any) => ({
    input: String(t?.input ?? ""),
    expectedOutput: String(t?.expectedOutput ?? ""),
    isHidden: Boolean(t?.isHidden),
    points: t?.points != null ? Number(t.points) : undefined,
  }));
}

function inferDifficultyFromTests(tests: Array<{ points?: number }>): "EASY" | "MEDIUM" | "HARD" | undefined {
  if (!Array.isArray(tests) || tests.length === 0) return undefined;
  const total = tests.reduce((sum, t) => sum + (Number.isFinite(Number(t?.points)) ? Math.max(1, Number(t?.points)) : 1), 0);
  if (total >= 250 || tests.length >= 16) return "HARD";
  if (total >= 120 || tests.length >= 8) return "MEDIUM";
  return "EASY";
}

type TrFn = (uk: string, en: string) => string;

function contestPhaseChip(params: { started: boolean; finished: boolean; paused?: boolean; tr: TrFn }) {
  if (params.paused) {
    return {
      glyph: "⏸",
      label: params.tr("Пауза", "Paused"),
      tone: "warn" as StatusChipTone,
    };
  }
  if (params.finished) {
    return {
      glyph: "■",
      label: params.tr("Завершено", "Finished"),
      tone: "error" as StatusChipTone,
    };
  }
  if (params.started) {
    return {
      glyph: "▶",
      label: params.tr("Йде", "Running"),
      tone: "success" as StatusChipTone,
    };
  }
  return {
    glyph: "⏱",
    label: params.tr("Скоро", "Upcoming"),
    tone: "info" as StatusChipTone,
  };
}

function submissionPhaseChip(phase: "CONTEST" | "UPSOLVE", tr: TrFn) {
  if (phase === "UPSOLVE") {
    return {
      glyph: "↺",
      label: tr("Дорішування", "Upsolve"),
      tone: "info" as StatusChipTone,
    };
  }
  return {
    glyph: "◆",
    label: tr("Контест", "Contest"),
    tone: "primary" as StatusChipTone,
  };
}

function verdictChip(verdictRaw: string | null | undefined, tr: TrFn) {
  const verdict = String(verdictRaw ?? "").trim().toUpperCase();
  if (!verdict) {
    return {
      glyph: "·",
      label: tr("Н/Д", "N/A"),
      tone: "neutral" as StatusChipTone,
    };
  }

  if (verdict === "AC") {
    return {
      glyph: "✓",
      label: "AC",
      tone: "success" as StatusChipTone,
    };
  }
  if (verdict === "WA") {
    return {
      glyph: "≈",
      label: "WA",
      tone: "warn" as StatusChipTone,
    };
  }
  if (verdict === "TLE") {
    return {
      glyph: "⏱",
      label: "TLE",
      tone: "warn" as StatusChipTone,
    };
  }
  if (verdict === "CE") {
    return {
      glyph: "⚙",
      label: "CE",
      tone: "error" as StatusChipTone,
    };
  }
  if (verdict === "RE") {
    return {
      glyph: "💥",
      label: "RE",
      tone: "error" as StatusChipTone,
    };
  }

  return {
    glyph: "•",
    label: verdict,
    tone: "neutral" as StatusChipTone,
  };
}

function problemScoreTone(score: number | null | undefined, hasSubmission: boolean): string {
  if (!hasSubmission) return "border-border bg-bg-surface text-text-secondary";
  const value = Number(score ?? 0);
  if (value >= 100) return "border-accent-success/60 bg-accent-success/10 text-accent-success";
  if (value >= 50) return "border-accent-warn/60 bg-accent-warn/10 text-accent-warn";
  if (value >= 1) return "border-accent-error/60 bg-accent-error/10 text-accent-error";
  // 0 with a real submission is a valid score, not an error state.
  return "border-primary/40 bg-primary/10 text-primary";
}

function submissionScoreTone(score: number | null | undefined): StatusChipTone {
  if (score == null || !Number.isFinite(Number(score))) return "neutral";
  const value = Number(score);
  if (value >= 100) return "success";
  if (value >= 50) return "warn";
  if (value >= 1) return "error";
  // 0 with an existing submission is valid and should stay non-error.
  return "info";
}

const Scoreboard: React.FC<{ contestId: number; canManage?: boolean }> = ({ contestId, canManage }) => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);

  const [loading, setLoading] = React.useState(true);
  const [problems, setProblems] = React.useState<ScoreboardProblem[]>([]);
  const [rows, setRows] = React.useState<ScoreboardRow[]>([]);
  const [disqualifiedCount, setDisqualifiedCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    getContestScoreboard(contestId)
      .then((r) => {
        setProblems(Array.isArray(r.problems) ? r.problems : []);
        setRows(Array.isArray(r.rows) ? r.rows : []);
        setDisqualifiedCount(Number((r as any)?.disqualifiedCount ?? 0) || 0);
      })
      .catch((e: any) => {
        const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
        setError(msg || tr("Не вдалося завантажити таблицю", "Failed to load standings"));
        setProblems([]);
        setRows([]);
        setDisqualifiedCount(0);
      })
      .finally(() => setLoading(false));
  }, [contestId, tr]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="p-4 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-mono text-text-primary flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" />
          {tr("Таблиця", "Standings")}
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {tr("Оновити", "Refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-accent-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-text-secondary">{tr("Поки що немає учасників.", "No participants yet.")}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.participantId} className="rounded-xl border border-border bg-bg-base/80 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-lg border border-primary/50 bg-primary/10 text-primary text-xs font-bold">
                    #{r.rank}
                  </span>
                  <span className="text-sm font-mono text-text-primary truncate">{r.displayName}</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg border border-accent-success/40 bg-accent-success/10 px-2 py-1 text-xs font-mono text-accent-success">
                  <Trophy className="w-3.5 h-3.5" /> {tr("Сума", "Total")}: {r.totalScore}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {problems.map((p) => {
                  const hit = r.problems.find((x) => x.problemId === p.id);
                  const score = Number(hit?.score ?? 0);
                  const hasSubmission = Boolean((hit as any)?.bestAt);
                  const scoreTone = problemScoreTone(score, hasSubmission);
                  return (
                    <span key={p.id} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono ${scoreTone}`}>
                      <span className="opacity-80">{p.label}</span>
                      <span>{hasSubmission ? score : "—"}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="text-xs text-text-secondary mt-2">
            {tr(
              "Таблиця рахує лише подачі в межах контесту. Дорішування не впливає на результат.",
              "Standings include only official contest submissions. Upsolving does not affect results."
            )}
            {canManage && disqualifiedCount > 0 ? (
              <span className="ml-2">
                {tr(`Дискваліфіковано: ${disqualifiedCount}`, `Disqualified: ${disqualifiedCount}`)}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
};

export const ContestPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);
  const navigate = useNavigate();
  const params = useParams();
  const contestId = React.useMemo(() => {
    const v = Number((params as any)?.id);
    return Number.isFinite(v) ? v : null;
  }, [params]);

  const hasToken = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem("token");
    } catch {
      return false;
    }
  }, []);

  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<ContestDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<"problems" | "standings" | "community">("problems");
  const [standingsVersion, setStandingsVersion] = React.useState(0);

  const [communityQuestionText, setCommunityQuestionText] = React.useState("");
  const [communityAnnouncementText, setCommunityAnnouncementText] = React.useState("");
  const [communityLoading, setCommunityLoading] = React.useState(false);
  const [communityError, setCommunityError] = React.useState<string | null>(null);
  const [communityData, setCommunityData] = React.useState<ContestCommunityData>({
    contestId: Number(contestId ?? 0),
    questions: [],
    announcements: [],
  });

  const [joinCode, setJoinCode] = React.useState("");
  const [joining, setJoining] = React.useState(false);
  const [contestAccount, setContestAccount] = React.useState<ContestAccount>({ handle: null, note: null });
  const [contestAccountHandle, setContestAccountHandle] = React.useState("");
  const [contestAccountNote, setContestAccountNote] = React.useState("");
  const [contestAccountLoading, setContestAccountLoading] = React.useState(false);
  const [contestAccountSaving, setContestAccountSaving] = React.useState(false);
  const [contestAccountError, setContestAccountError] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [settingsTitle, setSettingsTitle] = React.useState("");
  const [settingsDescription, setSettingsDescription] = React.useState("");
  const [settingsStartsAt, setSettingsStartsAt] = React.useState("");
  const [settingsEndsAt, setSettingsEndsAt] = React.useState("");
  const [settingsAllowUpsolve, setSettingsAllowUpsolve] = React.useState(true);

  const [addOpen, setAddOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addMode, setAddMode] = React.useState<"CREATE" | "COPY" | "IMPORT">("CREATE");
  const [addTitle, setAddTitle] = React.useState("");
  const [addDescription, setAddDescription] = React.useState("");
  const [addTemplate, setAddTemplate] = React.useState("public class Main {\n  public static void main(String[] args) {\n    // TODO\n  }\n}\n");
  const [addTestsJson, setAddTestsJson] = React.useState("");
  const [addMaxAttempts, setAddMaxAttempts] = React.useState<number>(3);
  const [copyLibraryTaskId, setCopyLibraryTaskId] = React.useState("");
  const [copyQuery, setCopyQuery] = React.useState("");
  const [copyLoading, setCopyLoading] = React.useState(false);
  const [copyItems, setCopyItems] = React.useState<LibraryTaskListItem[]>([]);
  const [archiveFile, setArchiveFile] = React.useState<File | null>(null);
  const [importingArchive, setImportingArchive] = React.useState(false);

  const [manageOpen, setManageOpen] = React.useState(false);
  const [savingProblemSettingsId, setSavingProblemSettingsId] = React.useState<number | null>(null);
  const [problemSettingsError, setProblemSettingsError] = React.useState<string | null>(null);
  const [problemSettingsDraft, setProblemSettingsDraft] = React.useState<Record<number, { label: string; points: string; order: string }>>({});

  const [progressLoading, setProgressLoading] = React.useState(false);
  const [progressError, setProgressError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<ContestMyProgressProblem[] | null>(null);

  const [adminParticipantsLoading, setAdminParticipantsLoading] = React.useState(false);
  const [adminParticipantsError, setAdminParticipantsError] = React.useState<string | null>(null);
  const [adminParticipants, setAdminParticipants] = React.useState<ContestAdminParticipant[]>([]);

  const [pauseSaving, setPauseSaving] = React.useState(false);
  const [organizersLoading, setOrganizersLoading] = React.useState(false);
  const [organizersError, setOrganizersError] = React.useState<string | null>(null);
  const [organizers, setOrganizers] = React.useState<ContestOrganizerListItem[]>([]);
  const [newOrganizerUserId, setNewOrganizerUserId] = React.useState("");
  const [annulmentsLoading, setAnnulmentsLoading] = React.useState(false);
  const [annulmentsError, setAnnulmentsError] = React.useState<string | null>(null);
  const [annulments, setAnnulments] = React.useState<ContestAnnulmentItem[]>([]);
  const [annulProblemId, setAnnulProblemId] = React.useState("");
  const [annulParticipantId, setAnnulParticipantId] = React.useState("");
  const [annulReason, setAnnulReason] = React.useState("");
  const [annulledActive, setAnnulledActive] = React.useState(true);

  const [adminSubsLoading, setAdminSubsLoading] = React.useState(false);
  const [adminSubsError, setAdminSubsError] = React.useState<string | null>(null);
  const [adminSubsParticipant, setAdminSubsParticipant] = React.useState<ContestAdminParticipant | null>(null);
  const [adminSubsFullPage, setAdminSubsFullPage] = React.useState(true);
  const [adminSubsRows, setAdminSubsRows] = React.useState<ContestAdminSubmission[]>([]);
  const [adminSubsVerdictFilter, setAdminSubsVerdictFilter] = React.useState<string>("ALL");
  const [adminSubsProblemFilter, setAdminSubsProblemFilter] = React.useState<string>("ALL");
  const [adminSubsCodeViewer, setAdminSubsCodeViewer] = React.useState<ContestAdminSubmission | null>(null);

  const load = React.useCallback(() => {
    if (!contestId) return;
    setLoading(true);
    setError(null);
    getContestDetails(contestId)
      .then((r) => setData(r))
      .catch((e: any) => {
        const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
        setError(msg || tr("Не вдалося завантажити контест", "Failed to load contest"));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [contestId, tr]);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadProgress = React.useCallback(() => {
    if (!contestId) return;
    if (!hasToken) {
      setProgress(null);
      return;
    }
    if (!data?.access?.canAccessContent) {
      setProgress(null);
      return;
    }

    setProgressLoading(true);
    setProgressError(null);
    getContestMyProgress(contestId)
      .then((r) => {
        setProgress(Array.isArray((r as any)?.problems) ? ((r as any).problems as ContestMyProgressProblem[]) : []);
      })
      .catch((e: any) => {
        const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
        setProgressError(msg || tr("Не вдалося завантажити прогрес", "Failed to load progress"));
        setProgress(null);
      })
      .finally(() => setProgressLoading(false));
  }, [contestId, hasToken, data?.access?.canAccessContent, tr]);

  React.useEffect(() => {
    if (tab !== "problems") return;
    loadProgress();
  }, [tab, loadProgress]);

  const loadCommunity = React.useCallback(async () => {
    if (!contestId) return;
    if (!data?.access?.canAccessContent) {
      setCommunityData({ contestId, questions: [], announcements: [] });
      setCommunityError(null);
      return;
    }
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const r = await getContestCommunity(contestId);
      setCommunityData({
        contestId,
        questions: Array.isArray(r?.questions) ? r.questions : [],
        announcements: Array.isArray(r?.announcements) ? r.announcements : [],
      });
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setCommunityError(msg || tr("Не вдалося завантажити ком'юніті", "Failed to load community"));
      setCommunityData({ contestId, questions: [], announcements: [] });
    } finally {
      setCommunityLoading(false);
    }
  }, [contestId, data?.access?.canAccessContent, tr]);

  React.useEffect(() => {
    if (tab !== "community") return;
    loadCommunity();
  }, [tab, loadCommunity]);

  const postContestQuestion = async () => {
    if (!contestId || !data?.access?.canAccessContent) return;
    const text = communityQuestionText.trim();
    if (!text) return;
    try {
      const r = await postContestCommunityQuestion(contestId, text);
      setCommunityData((prev) => ({
        ...prev,
        questions: [...prev.questions, r.question],
      }));
      setCommunityQuestionText("");
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setCommunityError(msg || tr("Не вдалося надіслати питання", "Failed to send question"));
    }
  };

  const answerContestQuestion = async (qid: number) => {
    if (!contestId || !data?.access?.canManage) return;
    const answer = typeof window !== "undefined"
      ? window.prompt(tr("Введіть відповідь організатора", "Enter organizer answer"), "")
      : null;
    if (!answer || !answer.trim()) return;
    try {
      const r = await answerContestCommunityQuestion(contestId, qid, answer.trim());
      setCommunityData((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === qid ? r.question : q)),
      }));
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setCommunityError(msg || tr("Не вдалося зберегти відповідь", "Failed to save answer"));
    }
  };

  const postContestAnnouncement = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const text = communityAnnouncementText.trim();
    if (!text) return;
    try {
      const r = await postContestCommunityAnnouncement(contestId, text);
      setCommunityData((prev) => ({
        ...prev,
        announcements: [r.announcement, ...prev.announcements],
      }));
      setCommunityAnnouncementText("");
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setCommunityError(msg || tr("Не вдалося опублікувати оголошення", "Failed to publish announcement"));
    }
  };

  const loadAdminParticipants = React.useCallback(async () => {
    if (!contestId || !data?.access?.canManage) {
      setAdminParticipants([]);
      setAdminParticipantsError(null);
      return;
    }
    setAdminParticipantsLoading(true);
    setAdminParticipantsError(null);
    try {
      const r = await listContestAdminParticipants(contestId);
      setAdminParticipants(Array.isArray((r as any)?.participants) ? ((r as any).participants as ContestAdminParticipant[]) : []);
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setAdminParticipantsError(msg || tr("Не вдалося завантажити учасників", "Failed to load participants"));
      setAdminParticipants([]);
    } finally {
      setAdminParticipantsLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "standings") return;
    loadAdminParticipants();
  }, [tab, loadAdminParticipants]);

  const loadOrganizers = React.useCallback(async () => {
    if (!contestId || !data?.access?.canManage) {
      setOrganizers([]);
      setOrganizersError(null);
      return;
    }
    setOrganizersLoading(true);
    setOrganizersError(null);
    try {
      const r = await listContestOrganizers(contestId);
      setOrganizers(Array.isArray(r.organizers) ? r.organizers : []);
      setData((prev) => (prev ? { ...prev, access: { ...prev.access, isPaused: !!r.isPaused } } : prev));
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setOrganizersError(msg || tr("Не вдалося завантажити організаторів", "Failed to load organizers"));
      setOrganizers([]);
    } finally {
      setOrganizersLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "standings") return;
    loadOrganizers();
  }, [tab, loadOrganizers]);

  const loadAnnulments = React.useCallback(async () => {
    if (!contestId || !data?.access?.canManage) {
      setAnnulments([]);
      setAnnulmentsError(null);
      return;
    }
    setAnnulmentsLoading(true);
    setAnnulmentsError(null);
    try {
      const r = await listContestAnnulments(contestId);
      setAnnulments(Array.isArray(r.annulments) ? r.annulments : []);
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setAnnulmentsError(msg || tr("Не вдалося завантажити анулювання", "Failed to load annulments"));
      setAnnulments([]);
    } finally {
      setAnnulmentsLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "standings") return;
    loadAnnulments();
  }, [tab, loadAnnulments]);

  const toggleContestPaused = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const targetPaused = !Boolean(data.access.isPaused);
    setPauseSaving(true);
    try {
      const r = await setContestPaused(contestId, targetPaused);
      setData((prev) => (prev ? { ...prev, access: { ...prev.access, isPaused: !!r.isPaused } } : prev));
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setError(msg || tr("Не вдалося змінити стан паузи", "Failed to change pause state"));
    } finally {
      setPauseSaving(false);
    }
  };

  const addOrganizer = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const uid = Number(newOrganizerUserId);
    if (!Number.isFinite(uid) || uid <= 0) {
      setOrganizersError(tr("Вкажіть коректний user ID", "Provide a valid user ID"));
      return;
    }
    try {
      await addContestOrganizer(contestId, uid);
      setNewOrganizerUserId("");
      await loadOrganizers();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setOrganizersError(msg || tr("Не вдалося додати організатора", "Failed to add organizer"));
    }
  };

  const removeOrganizer = async (userId: number) => {
    if (!contestId || !data?.access?.canManage) return;
    try {
      await removeContestOrganizer(contestId, userId);
      await loadOrganizers();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setOrganizersError(msg || tr("Не вдалося видалити організатора", "Failed to remove organizer"));
    }
  };

  const applyAnnulment = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const problemId = Number(annulProblemId);
    const participantId = String(annulParticipantId).trim() ? Number(annulParticipantId) : null;
    if (!Number.isFinite(problemId) || problemId <= 0) {
      setAnnulmentsError(tr("Вкажіть коректний problem ID", "Provide a valid problem ID"));
      return;
    }
    if (participantId != null && (!Number.isFinite(participantId) || participantId <= 0)) {
      setAnnulmentsError(tr("Некоректний participant ID", "Invalid participant ID"));
      return;
    }
    try {
      await setContestAnnulment(contestId, {
        problemId,
        participantId,
        annulled: annulledActive,
        reason: annulReason.trim() ? annulReason.trim() : null,
      });
      await loadAnnulments();
      setAnnulReason("");
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setAnnulmentsError(msg || tr("Не вдалося застосувати анулювання", "Failed to apply annulment"));
    }
  };

  const closeAdminInspector = React.useCallback(() => {
    setAdminSubsParticipant(null);
    setAdminSubsRows([]);
    setAdminSubsCodeViewer(null);
    setAdminSubsError(null);
  }, []);

  const openAdminSubmissions = async (p: ContestAdminParticipant, opts?: { fullPage?: boolean }) => {
    if (!contestId) return;
    if (typeof opts?.fullPage === "boolean") setAdminSubsFullPage(opts.fullPage);
    setAdminSubsParticipant(p);
    setAdminSubsRows([]);
    setAdminSubsVerdictFilter("ALL");
    setAdminSubsProblemFilter("ALL");
    setAdminSubsError(null);
    setAdminSubsLoading(true);
    try {
      const r = await listContestParticipantSubmissionsForAdmin(contestId, p.id, 200);
      const rows = Array.isArray((r as any)?.submissions) ? ((r as any).submissions as ContestAdminSubmission[]) : [];
      setAdminSubsRows(rows);
      setAdminSubsCodeViewer(rows[0] ?? null);
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setAdminSubsError(msg || tr("Не вдалося завантажити подачі", "Failed to load submissions"));
      setAdminSubsRows([]);
      setAdminSubsCodeViewer(null);
    } finally {
      setAdminSubsLoading(false);
    }
  };

  const adminSubsProblemOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; label: string }> = [];
    for (const s of adminSubsRows) {
      const key = String(s.problem?.id ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: String(s.problem?.label ?? `P${s.problem?.order ?? "?"}`) });
    }
    return out;
  }, [adminSubsRows]);

  const adminSubsVerdictOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of adminSubsRows) {
      const verdict = String(s.verdict ?? "N/A").toUpperCase();
      if (seen.has(verdict)) continue;
      seen.add(verdict);
      out.push(verdict);
    }
    return out;
  }, [adminSubsRows]);

  const adminSubsFilteredRows = React.useMemo(() => {
    return adminSubsRows.filter((s) => {
      const byProblem = adminSubsProblemFilter === "ALL" || String(s.problem?.id ?? "") === adminSubsProblemFilter;
      const verdict = String(s.verdict ?? "N/A").toUpperCase();
      const byVerdict = adminSubsVerdictFilter === "ALL" || verdict === adminSubsVerdictFilter;
      return byProblem && byVerdict;
    });
  }, [adminSubsRows, adminSubsProblemFilter, adminSubsVerdictFilter]);

  const adminInspectorBody = (
    <>
      {!adminSubsLoading && adminSubsRows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          <div className="border border-border bg-bg-base rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">{tr("Задача", "Problem")}</div>
            <select
              value={adminSubsProblemFilter}
              onChange={(e) => setAdminSubsProblemFilter(e.target.value)}
              className="w-full bg-bg-base text-text-primary text-xs font-mono border border-border rounded px-2 py-1"
            >
              <option value="ALL">{tr("Усі", "All")}</option>
              {adminSubsProblemOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="border border-border bg-bg-base rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">{tr("Вердикт", "Verdict")}</div>
            <select
              value={adminSubsVerdictFilter}
              onChange={(e) => setAdminSubsVerdictFilter(e.target.value)}
              className="w-full bg-bg-base text-text-primary text-xs font-mono border border-border rounded px-2 py-1"
            >
              <option value="ALL">{tr("Усі", "All")}</option>
              {adminSubsVerdictOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className="border border-border bg-bg-base rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-text-secondary">{tr("Показано", "Shown")}</span>
            <span className="text-sm font-mono text-text-primary">{adminSubsFilteredRows.length}/{adminSubsRows.length}</span>
          </div>
        </div>
      ) : null}

      {adminSubsError ? <div className="text-sm text-accent-error mb-3">{adminSubsError}</div> : null}

      {adminSubsLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : adminSubsFilteredRows.length === 0 ? (
        <div className="text-sm text-text-secondary">{tr("Немає подач", "No submissions")}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
          <div className={`border border-border overflow-auto ${adminSubsFullPage ? "max-h-[calc(100vh-250px)]" : "max-h-[72vh]"}`}>
            <table className="min-w-[700px] w-full text-xs font-mono">
              <thead className="bg-bg-hover sticky top-0">
                <tr>
                  <th className="p-2 border-b border-border text-left">#</th>
                  <th className="p-2 border-b border-border text-left">{tr("Час", "Time")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Задача", "Problem")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Фаза", "Phase")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Вердикт", "Verdict")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Бали", "Score")}</th>
                </tr>
              </thead>
              <tbody>
                {adminSubsFilteredRows.map((s) => (
                  <tr
                    key={s.id}
                    className={`cursor-pointer odd:bg-bg-base even:bg-bg-surface hover:bg-bg-hover ${adminSubsCodeViewer?.id === s.id ? "!bg-primary/10" : ""}`}
                    onClick={() => setAdminSubsCodeViewer(s)}
                  >
                    <td className="p-2 border-b border-border">{s.id}</td>
                    <td className="p-2 border-b border-border">{fmtDateTime(s.createdAt, i18n.language)}</td>
                    <td className="p-2 border-b border-border text-center">{s.problem?.label ?? "—"}</td>
                    <td className="p-2 border-b border-border text-center">
                      {(() => {
                        const p = submissionPhaseChip(s.phase, tr);
                        return <StatusChip glyph={p.glyph} label={p.label} tone={p.tone} />;
                      })()}
                    </td>
                    <td className="p-2 border-b border-border text-center">
                      {(() => {
                        const v = verdictChip(s.verdict, tr);
                        return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} />;
                      })()}
                    </td>
                    <td className="p-2 border-b border-border text-center">
                      {s.score != null && s.maxScore != null ? (
                        <StatusChip
                          glyph="◉"
                          label={`${s.score}/${s.maxScore}`}
                          tone={submissionScoreTone(s.score)}
                        />
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-border bg-bg-base/70 p-2">
            {adminSubsCodeViewer ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary font-mono">
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">#{adminSubsCodeViewer.id}</span>
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">{adminSubsCodeViewer.problem?.label ?? "—"}</span>
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">{adminSubsCodeViewer.language ?? "—"}</span>
                  <span className="px-2 py-1 rounded border border-border bg-bg-base">{fmtDateTime(adminSubsCodeViewer.createdAt, i18n.language)}</span>
                  {adminSubsCodeViewer.score != null && adminSubsCodeViewer.maxScore != null ? (
                    <span className="px-2 py-1 rounded border border-border bg-bg-base">{adminSubsCodeViewer.score}/{adminSubsCodeViewer.maxScore}</span>
                  ) : null}
                </div>
                <div className={`border border-border overflow-hidden ${adminSubsFullPage ? "h-[calc(100vh-280px)] min-h-[480px]" : "h-[62vh] min-h-[420px]"}`}>
                  <CodeEditor
                    language={(adminSubsCodeViewer.language as any) || "java"}
                    value={adminSubsCodeViewer.submittedCode || ""}
                    readOnly
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-secondary p-4">{tr("Виберіть подачу зліва, щоб переглянути код.", "Pick a submission on the left to inspect code.")}</div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const toggleParticipantDisqualification = async (p: ContestAdminParticipant) => {
    if (!contestId) return;
    try {
      const reason = p.isDisqualified
        ? null
        : (typeof window !== "undefined"
            ? (window.prompt(tr("Причина дискваліфікації (необов'язково)", "Disqualification reason (optional)"), p.disqualificationReason ?? "") ?? "")
            : "");

      await setContestParticipantDisqualified(contestId, p.id, {
        disqualified: !p.isDisqualified,
        reason: p.isDisqualified ? null : (String(reason).trim() || null),
      });

      await loadAdminParticipants();
      setStandingsVersion((v) => v + 1);
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setError(msg || tr("Не вдалося змінити статус дискваліфікації", "Failed to update disqualification status"));
    }
  };

  const progressByProblemId = React.useMemo(() => {
    const m = new Map<number, ContestMyProgressProblem>();
    for (const p of progress || []) {
      if (p && Number.isFinite(p.problemId)) m.set(p.problemId, p);
    }
    return m;
  }, [progress]);

  const onJoin = async () => {
    if (!contestId) return;
    setJoining(true);
    try {
      await joinContest(contestId, joinCode.trim());
      setJoinCode("");
      load();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setError(msg || tr("Невірний код", "Invalid code"));
    } finally {
      setJoining(false);
    }
  };

  const loadContestAccount = React.useCallback(async () => {
    if (!contestId || !hasToken || !data?.access?.canAccessContent) {
      setContestAccount({ handle: null, note: null });
      setContestAccountHandle("");
      setContestAccountNote("");
      setContestAccountError(null);
      return;
    }
    setContestAccountLoading(true);
    setContestAccountError(null);
    try {
      const r = await getContestAccount(contestId);
      const account = r?.account ?? { handle: null, note: null };
      setContestAccount(account);
      setContestAccountHandle(String(account.handle ?? ""));
      setContestAccountNote(String(account.note ?? ""));
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setContestAccountError(msg || tr("Не вдалося завантажити контест-акаунт", "Failed to load contest account"));
    } finally {
      setContestAccountLoading(false);
    }
  }, [contestId, hasToken, data?.access?.canAccessContent, tr]);

  React.useEffect(() => {
    if (tab !== "problems") return;
    loadContestAccount();
  }, [tab, loadContestAccount]);

  const saveContestAccount = async () => {
    if (!contestId || !hasToken || !data?.access?.canAccessContent) return;
    setContestAccountSaving(true);
    setContestAccountError(null);
    try {
      const r = await updateContestAccount(contestId, {
        handle: contestAccountHandle.trim() ? contestAccountHandle.trim() : null,
        note: contestAccountNote.trim() ? contestAccountNote.trim() : null,
      });
      setContestAccount(r.account);
      setContestAccountHandle(String(r.account?.handle ?? ""));
      setContestAccountNote(String(r.account?.note ?? ""));
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setContestAccountError(msg || tr("Не вдалося зберегти контест-акаунт", "Failed to save contest account"));
    } finally {
      setContestAccountSaving(false);
    }
  };

  const togglePublished = async () => {
    if (!contestId || !data?.access?.canManage) return;
    setPublishing(true);
    try {
      await updateContest(contestId, { isPublished: !data.contest.isPublished });
      await load();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setError(msg || tr("Не вдалося оновити публікацію", "Failed to update publication status"));
    } finally {
      setPublishing(false);
    }
  };

  React.useEffect(() => {
    if (!settingsOpen || !data?.contest) return;
    setSettingsError(null);
    setSettingsTitle(String(data.contest.title ?? ""));
    setSettingsDescription(String(data.contest.description ?? ""));
    setSettingsStartsAt(toDateTimeLocalInput(data.contest.startsAt));
    setSettingsEndsAt(toDateTimeLocalInput(data.contest.endsAt));
    setSettingsAllowUpsolve(Boolean(data.contest.allowUpsolve));
  }, [settingsOpen, data?.contest]);

  const saveContestSettings = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const title = settingsTitle.trim();
    if (title.length < 3) {
      setSettingsError(tr("Назва контесту занадто коротка", "Contest title is too short"));
      return;
    }

    const startsAtIso = fromDateTimeLocalInput(settingsStartsAt);
    const endsAtIso = fromDateTimeLocalInput(settingsEndsAt);
    if (startsAtIso && endsAtIso && new Date(endsAtIso).getTime() < new Date(startsAtIso).getTime()) {
      setSettingsError(tr("Кінець не може бути раніше старту", "End cannot be before start"));
      return;
    }

    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await updateContest(contestId, {
        title,
        description: settingsDescription.trim() ? settingsDescription.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        allowUpsolve: settingsAllowUpsolve,
      });
      setSettingsOpen(false);
      await load();
      if (tab === "problems") loadProgress();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setSettingsError(msg || tr("Не вдалося зберегти налаштування контесту", "Failed to save contest settings"));
    } finally {
      setSettingsSaving(false);
    }
  };

  const resetAddForm = React.useCallback(() => {
    setAddError(null);
    setAddMode("CREATE");
    setAddTitle("");
    setAddDescription("");
    setAddTemplate("public class Main {\n  public static void main(String[] args) {\n    // TODO\n  }\n}\n");
    setAddTestsJson("");
    setAddMaxAttempts(3);
    setCopyLibraryTaskId("");
    setCopyQuery("");
    setCopyItems([]);
    setArchiveFile(null);
  }, []);

  const loadCopyItems = React.useCallback(async () => {
    setCopyLoading(true);
    try {
      const [mine, approved] = await Promise.all([
        listMyLibraryTasks().catch(() => ({ tasks: [] as LibraryTaskListItem[] })),
        listApprovedLibraryTasks({ q: copyQuery.trim() || undefined, page: 1, pageSize: 50 }).catch(() => ({ tasks: [] as LibraryTaskListItem[] })),
      ]);
      const map = new Map<number, LibraryTaskListItem>();
      for (const t of [...(mine.tasks || []), ...(approved.tasks || [])]) {
        if (!t || !Number.isFinite(t.id)) continue;
        if (copyQuery.trim()) {
          const n = copyQuery.trim().toLowerCase();
          if (!`${t.title} ${t.problemCode ?? ""} ${t.slug ?? ""}`.toLowerCase().includes(n)) continue;
        }
        map.set(t.id, t);
      }
      const arr = Array.from(map.values()).sort((a, b) => Number(b.id) - Number(a.id));
      setCopyItems(arr.slice(0, 100));
    } finally {
      setCopyLoading(false);
    }
  }, [copyQuery]);

  const importArchiveAndAttach = async () => {
    if (!contestId) return;
    if (!archiveFile) {
      setAddError(tr("Оберіть zip-архів", "Select a zip archive"));
      return;
    }
    setImportingArchive(true);
    setAddError(null);
    try {
      const imported = await importLibraryTaskArchive(archiveFile, { hideFromLibrary: true });
      const taskId = Number(imported?.task?.id);
      if (!Number.isFinite(taskId) || taskId <= 0) {
        setAddError(tr("Не вдалося імпортувати задачу", "Failed to import task"));
        return;
      }
      await addContestProblem(contestId, { mode: "COPY", libraryTaskId: taskId });
      setAddOpen(false);
      resetAddForm();
      await load();
      if (tab === "problems") loadProgress();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setAddError(msg || tr("Помилка імпорту архіву", "Archive import failed"));
    } finally {
      setImportingArchive(false);
    }
  };

  const submitAddProblem = async () => {
    if (!contestId) return;
    setAddError(null);

    try {
      setAdding(true);
      if (addMode === "CREATE") {
        const title = addTitle.trim();
        const description = addDescription.trim();
        const template = addTemplate;
        if (title.length < 3) {
          setAddError(tr("Назва задачі занадто коротка", "Problem title is too short"));
          return;
        }
        if (!description) {
          setAddError(tr("Опис задачі обовʼязковий", "Problem description is required"));
          return;
        }
        if (!template.trim()) {
          setAddError(tr("Шаблон обовʼязковий", "Template is required"));
          return;
        }

        const tests = parseTestsJson(addTestsJson);
        const inferredDifficulty = inferDifficultyFromTests(tests);
        await addContestProblem(contestId, {
          mode: "CREATE",
          title,
          description,
          template,
          maxAttempts: Math.max(1, Math.min(100, Math.floor(Number(addMaxAttempts) || 3))),
          ...(inferredDifficulty ? { difficulty: inferredDifficulty } : {}),
          ...(tests.length ? { tests } : {}),
        });
      } else if (addMode === "COPY") {
        const libraryTaskId = Number(copyLibraryTaskId);
        if (!Number.isFinite(libraryTaskId) || libraryTaskId <= 0) {
          setAddError(tr("Вкажіть коректний Library Task ID", "Provide a valid Library Task ID"));
          return;
        }
        await addContestProblem(contestId, { mode: "COPY", libraryTaskId });
      } else {
        await importArchiveAndAttach();
        return;
      }

      setAddOpen(false);
      resetAddForm();
      load();
      if (tab === "problems") loadProgress();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setAddError(msg || tr("Не вдалося додати задачу", "Failed to add problem"));
    } finally {
      setAdding(false);
    }
  };

  React.useEffect(() => {
    if (!addOpen) return;
    if (addMode !== "COPY") return;
    loadCopyItems();
  }, [addOpen, addMode, copyQuery, loadCopyItems]);

  React.useEffect(() => {
    if (!manageOpen || !data?.problems) return;
    const next: Record<number, { label: string; points: string; order: string }> = {};
    for (const p of data.problems) {
      next[p.id] = {
        label: String(p.label ?? ""),
        points: p.points != null ? String(p.points) : "",
        order: String(p.order ?? 0),
      };
    }
    setProblemSettingsDraft(next);
    setProblemSettingsError(null);
  }, [manageOpen, data?.problems]);

  const saveProblemSettings = async (problemId: number) => {
    if (!contestId) return;
    const d = problemSettingsDraft[problemId];
    if (!d) return;

    setSavingProblemSettingsId(problemId);
    setProblemSettingsError(null);
    try {
      const label = String(d.label ?? "").trim();
      const pointsRaw = String(d.points ?? "").trim();
      const orderRaw = String(d.order ?? "").trim();
      const points = pointsRaw ? Number(pointsRaw) : null;
      const order = orderRaw ? Number(orderRaw) : undefined;
      await updateContestProblemSettings(contestId, problemId, {
        label: label ? label : null,
        points: points != null ? points : null,
        ...(Number.isFinite(order) ? { order: Math.max(0, Math.floor(order as number)) } : {}),
      });
      await load();
      if (tab === "problems") loadProgress();
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setProblemSettingsError(msg || tr("Не вдалося зберегти налаштування задачі", "Failed to save problem settings"));
    } finally {
      setSavingProblemSettingsId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Button variant="ghost" onClick={() => navigate("/contests")}
          title={tr("Назад до списку", "Back to list")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {tr("Контести", "Contests")}
        </Button>

        <div className="flex items-center gap-2">
          <Button variant={tab === "problems" ? "secondary" : "ghost"} onClick={() => setTab("problems")}
            title={tr("Задачі", "Problems")}
          >
            <ListOrdered className="w-4 h-4 mr-2" />
            {tr("Задачі", "Problems")}
          </Button>
          <Button variant={tab === "standings" ? "secondary" : "ghost"} onClick={() => setTab("standings")}
            title={tr("Таблиця", "Standings")}
          >
            <Table2 className="w-4 h-4 mr-2" />
            {tr("Таблиця", "Standings")}
          </Button>
          <Button variant={tab === "community" ? "secondary" : "ghost"} onClick={() => setTab("community")}
            title={tr("Ком'юніті", "Community")}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {tr("Ком'юніті", "Community")}
          </Button>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddError(null);
        }}
        title={tr("Додати задачу", "Add problem")}
      >
        <div className="space-y-4">
          {addError ? <div className="text-sm text-accent-error">{addError}</div> : null}

          <div className="flex items-center gap-2">
            <Button variant={addMode === "CREATE" ? "secondary" : "ghost"} onClick={() => setAddMode("CREATE")}>
              {tr("Нова", "Create")}
            </Button>
            <Button variant={addMode === "COPY" ? "secondary" : "ghost"} onClick={() => setAddMode("COPY")}>
              {tr("Копія", "Copy")}
            </Button>
            <Button variant={addMode === "IMPORT" ? "secondary" : "ghost"} onClick={() => setAddMode("IMPORT")}>
              {tr("Імпорт", "Import")}
            </Button>
          </div>

          {addMode === "CREATE" ? (
            <>
              <Input label={tr("Назва", "Title")} value={addTitle} onChange={(e) => setAddTitle(e.target.value)} />
              <Input
                label={tr("Макс. спроб", "Max attempts")}
                value={String(addMaxAttempts)}
                onChange={(e) => setAddMaxAttempts(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))}
                inputMode="numeric"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Опис", "Description")}</label>
                <textarea
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  rows={7}
                  className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Шаблон", "Template")}</label>
                <textarea
                  value={addTemplate}
                  onChange={(e) => setAddTemplate(e.target.value)}
                  rows={9}
                  className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Тести JSON (з points)", "Tests JSON (with points)")}</label>
                <textarea
                  value={addTestsJson}
                  onChange={(e) => setAddTestsJson(e.target.value)}
                  rows={8}
                  className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
                  placeholder={tr(
                    "Приклад: [{\"input\":\"1 2\",\"expectedOutput\":\"3\",\"isHidden\":true,\"points\":75}]",
                    "Example: [{\"input\":\"1 2\",\"expectedOutput\":\"3\",\"isHidden\":true,\"points\":75}]"
                  )}
                />
                <div className="text-xs text-text-secondary">
                  {tr("Саме points у тестах задають вагу та часткове оцінювання задачі.", "Test points define problem weight and partial scoring.")}
                </div>
              </div>
            </>
          ) : addMode === "COPY" ? (
            <div className="space-y-3">
              <Input
                label={tr("Пошук задач", "Search tasks")}
                value={copyQuery}
                onChange={(e) => setCopyQuery(e.target.value)}
                placeholder={tr("Назва / code / slug", "Title / code / slug")}
              />
              <Input
                label={tr("Library Task ID", "Library Task ID")}
                value={copyLibraryTaskId}
                onChange={(e) => setCopyLibraryTaskId(e.target.value)}
                inputMode="numeric"
                placeholder="123"
              />
              <div className="border border-border max-h-52 overflow-auto">
                {copyLoading ? (
                  <div className="p-3 text-sm text-text-secondary">{tr("Завантаження...", "Loading...")}</div>
                ) : copyItems.length === 0 ? (
                  <div className="p-3 text-sm text-text-secondary">{tr("Задачі не знайдено", "No tasks found")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {copyItems.map((t) => (
                      <button
                        key={t.id}
                        className={`w-full text-left p-2 hover:bg-bg-hover ${String(t.id) === String(copyLibraryTaskId) ? "bg-bg-hover" : ""}`}
                        onClick={() => setCopyLibraryTaskId(String(t.id))}
                      >
                        <div className="text-sm font-mono text-text-primary">#{t.id} — {t.title}</div>
                        <div className="text-xs text-text-secondary">{t.problemCode ?? t.slug ?? ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block">{tr("Імпорт архіву .zip", "Import .zip archive")}</label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setArchiveFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-text-secondary"
              />
              <div className="text-xs text-text-secondary">
                {tr("Архів імпортується в бібліотеку як чернетка і одразу додається в контест.", "Archive is imported to library as draft and then attached to this contest.")}
              </div>
              <div>
                <Button variant="secondary" onClick={importArchiveAndAttach} disabled={importingArchive || !archiveFile}>
                  {importingArchive ? tr("Імпорт...", "Importing...") : tr("Імпортувати й додати", "Import and add")}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={adding}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={submitAddProblem} disabled={adding}>
              {adding ? tr("Додавання...", "Adding...") : tr("Додати", "Add")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title={tr("Меню задач контесту", "Contest problem settings")}
      >
        <div className="space-y-3">
          {problemSettingsError ? <div className="text-sm text-accent-error">{problemSettingsError}</div> : null}
          {!data?.problems?.length ? (
            <div className="text-sm text-text-secondary">{tr("У контесті ще немає задач.", "No problems in this contest yet.")}</div>
          ) : (
            <div className="overflow-auto border border-border">
              <table className="min-w-[760px] w-full text-sm font-mono">
                <thead className="bg-bg-hover">
                  <tr>
                    <th className="p-2 border-b border-border text-left">ID</th>
                    <th className="p-2 border-b border-border text-left">{tr("Назва", "Title")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Літера", "Label")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Порядок", "Order")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Бали", "Points")}</th>
                    <th className="p-2 border-b border-border text-right">{tr("Дія", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.problems.map((p) => {
                    const draft = problemSettingsDraft[p.id] ?? { label: p.label, points: p.points != null ? String(p.points) : "", order: String(p.order) };
                    const savingThis = savingProblemSettingsId === p.id;
                    return (
                      <tr key={p.id} className="odd:bg-bg-base even:bg-bg-surface">
                        <td className="p-2 border-b border-border">{p.id}</td>
                        <td className="p-2 border-b border-border">{p.title}</td>
                        <td className="p-2 border-b border-border text-center">
                          <input
                            value={draft.label}
                            onChange={(e) => setProblemSettingsDraft((s) => ({ ...s, [p.id]: { ...draft, label: e.target.value } }))}
                            className="w-16 px-2 py-1 bg-bg-base border border-border text-text-primary text-center"
                          />
                        </td>
                        <td className="p-2 border-b border-border text-center">
                          <input
                            value={draft.order}
                            onChange={(e) => setProblemSettingsDraft((s) => ({ ...s, [p.id]: { ...draft, order: e.target.value } }))}
                            className="w-20 px-2 py-1 bg-bg-base border border-border text-text-primary text-center"
                            inputMode="numeric"
                          />
                        </td>
                        <td className="p-2 border-b border-border text-center">
                          <input
                            value={draft.points}
                            onChange={(e) => setProblemSettingsDraft((s) => ({ ...s, [p.id]: { ...draft, points: e.target.value } }))}
                            className="w-24 px-2 py-1 bg-bg-base border border-border text-text-primary text-center"
                            inputMode="numeric"
                            placeholder="100"
                          />
                        </td>
                        <td className="p-2 border-b border-border text-right">
                          <Button variant="secondary" onClick={() => saveProblemSettings(p.id)} disabled={savingThis}>
                            {savingThis ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => {
          if (!settingsSaving) setSettingsOpen(false);
        }}
        title={tr("Налаштування контесту", "Contest settings")}
      >
        <div className="space-y-4">
          {settingsError ? <div className="text-sm text-accent-error">{settingsError}</div> : null}

          <Input label={tr("Назва", "Title")} value={settingsTitle} onChange={(e) => setSettingsTitle(e.target.value)} />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Опис", "Description")}</label>
            <textarea
              value={settingsDescription}
              onChange={(e) => setSettingsDescription(e.target.value)}
              rows={6}
              className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Старт", "Start")}</label>
              <input
                type="datetime-local"
                value={settingsStartsAt}
                onChange={(e) => setSettingsStartsAt(e.target.value)}
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Фініш", "End")}</label>
              <input
                type="datetime-local"
                value={settingsEndsAt}
                onChange={(e) => setSettingsEndsAt(e.target.value)}
                className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-mono text-text-primary">
            <input type="checkbox" checked={settingsAllowUpsolve} onChange={(e) => setSettingsAllowUpsolve(e.target.checked)} />
            {tr("Дозволити дорішування після завершення", "Allow upsolve after finish")}
          </label>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={saveContestSettings} disabled={settingsSaving}>
              {settingsSaving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
            </Button>
          </div>
        </div>
      </Modal>

      

      {loading ? (
        <Card className="p-4">
          <Skeleton className="h-8 w-2/3 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-6" />
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : error ? (
        <Card className="p-4">
          <div className="text-sm text-accent-error">{error}</div>
        </Card>
      ) : !data ? null : (
        <div className="space-y-4">
          <Card className="p-4 border border-border/70 bg-[linear-gradient(145deg,rgba(99,102,241,0.12),rgba(16,185,129,0.08)_45%,rgba(15,23,42,0.5))]">
            <div className="flex flex-wrap items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <Badge color="info">StudyCod Arena</Badge>
              <div className="text-lg font-mono text-text-primary">{data.contest.title}</div>
              {(() => {
                const chip = contestPhaseChip({
                  started: data.phase.started,
                  finished: data.phase.finished,
                  paused: !!data.access.isPaused,
                  tr,
                });
                return <StatusChip glyph={chip.glyph} label={chip.label} tone={chip.tone} />;
              })()}
              {data.contest.visibility === "PUBLIC" ? <Badge color="info">Public</Badge> : data.contest.visibility === "PRIVATE_CODE" ? <Badge color="warn">{tr("За кодом", "Code")}</Badge> : <Badge color="info">Class</Badge>}
              {data.contest.isPublished ? <Badge color="success">{tr("Опубліковано", "Published")}</Badge> : <Badge color="warn">{tr("Чернетка", "Draft")}</Badge>}
              {data.contest.allowUpsolve ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : null}
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-bg-base/70 px-3 py-2">
                <div className="text-text-secondary">{tr("Формат", "Format")}</div>
                <div className="text-text-primary font-mono">{tr("IOI-стиль · partial scoring", "IOI-style · partial scoring")}</div>
              </div>
              <div className="rounded-lg border border-border bg-bg-base/70 px-3 py-2">
                <div className="text-text-secondary">{tr("Режим", "Mode")}</div>
                <div className="text-text-primary font-mono">{data.access.isPaused ? tr("Пауза", "Paused") : tr("Змагальний", "Competitive")}</div>
              </div>
              <div className="rounded-lg border border-border bg-bg-base/70 px-3 py-2">
                <div className="text-text-secondary">{tr("Платформа", "Platform")}</div>
                <div className="text-text-primary font-mono">StudyCod Contests</div>
              </div>
            </div>

            {hasToken && data.access.canManage ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                  {tr("Налаштування", "Settings")}
                </Button>
                <Button variant="secondary" onClick={togglePublished} disabled={publishing}>
                  {publishing
                    ? tr("Оновлення...", "Updating...")
                    : data.contest.isPublished
                      ? tr("Зняти з публікації", "Unpublish")
                      : tr("Опублікувати", "Publish")}
                </Button>
                <Button variant="secondary" onClick={toggleContestPaused} disabled={pauseSaving}>
                  {pauseSaving
                    ? tr("Оновлення...", "Updating...")
                    : data.access.isPaused
                      ? tr("Продовжити контест", "Resume contest")
                      : tr("Поставити на паузу", "Pause contest")}
                </Button>
              </div>
            ) : null}

            <div className="text-xs text-text-secondary mt-2 flex flex-wrap gap-3">
              <span>
                {tr("Старт", "Start")}: {fmtDateTime(data.contest.startsAt, i18n.language)}
              </span>
              <span>
                {tr("Фініш", "End")}: {fmtDateTime(data.contest.endsAt, i18n.language)}
              </span>
            </div>

            {data.phase.finished && data.contest.allowUpsolve ? (
              <div className="mt-3 text-sm text-text-secondary">
                {tr(
                  "Контест завершено. Режим дорішування увімкнено — можете продовжувати відправляти розв’язки, але таблиця не зміниться.",
                  "Contest is finished. Upsolving is enabled — you can still submit, but standings won’t change."
                )}
              </div>
            ) : null}

            {data.access.joinRequired ? (
              <div className="mt-4 border border-border bg-bg-base p-3">
                <div className="flex items-center gap-2 mb-2 text-sm font-mono text-text-primary">
                  <KeyRound className="w-4 h-4" />
                  {tr("Потрібен код доступу", "Join code required")}
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="flex-1 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                    placeholder={tr("Введіть код...", "Enter code...")}
                  />
                  <Button onClick={onJoin} disabled={joining || !joinCode.trim()}>
                    {joining ? tr("Приєднання...", "Joining...") : tr("Приєднатися", "Join")}
                  </Button>
                </div>
                <div className="text-xs text-text-secondary mt-2">
                  {tr("Після приєднання відкриються задачі та таблиця.", "After joining you will see problems and standings.")}
                </div>
              </div>
            ) : null}

            {data.contest.description ? (
              <div className="mt-4">
                <MarkdownView content={data.contest.description} />
              </div>
            ) : null}
          </Card>

          {tab === "problems" ? (
            <>
              {hasToken && data.access.canAccessContent ? (
                <Card className="p-4 border border-border/70 bg-bg-surface/80">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-mono text-text-primary">{tr("Контест-акаунт", "Contest account")}</div>
                    <Button variant="secondary" onClick={loadContestAccount} disabled={contestAccountLoading || contestAccountSaving}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {tr("Оновити", "Refresh")}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      value={contestAccountHandle}
                      onChange={(e) => setContestAccountHandle(e.target.value)}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                      placeholder={tr("Handle (напр. petr)", "Handle (e.g. tourist)")}
                      maxLength={120}
                    />
                    <input
                      value={contestAccountNote}
                      onChange={(e) => setContestAccountNote(e.target.value)}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary"
                      placeholder={tr("Нотатка (команда/група)", "Note (team/group)")}
                      maxLength={255}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-secondary">
                    <span>
                      {contestAccount.handle
                        ? tr(`Поточний акаунт: ${contestAccount.handle}`, `Current account: ${contestAccount.handle}`)
                        : tr("Акаунт ще не вказано", "No account set yet")}
                    </span>
                    <Button variant="secondary" onClick={saveContestAccount} disabled={contestAccountLoading || contestAccountSaving}>
                      {contestAccountSaving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
                    </Button>
                  </div>

                  {contestAccountError ? <div className="text-sm text-accent-error mt-2">{contestAccountError}</div> : null}
                </Card>
              ) : null}

              <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-mono text-text-primary">{tr("Задачі", "Problems")}</div>
                <div className="flex items-center gap-2">
                  {hasToken && data.access.canAccessContent ? (
                    <Button variant="secondary" onClick={loadProgress} disabled={progressLoading}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {tr("Оновити", "Refresh")}
                    </Button>
                  ) : null}
                  {hasToken && data.access.canManage ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAddMode("CREATE");
                          setAddOpen(true);
                          setAddError(null);
                        }}
                      >
                        {tr("Додати задачу", "Add problem")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAddMode("IMPORT");
                          setAddOpen(true);
                          setAddError(null);
                        }}
                      >
                        {tr("Імпорт архіву", "Import archive")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setManageOpen(true)}
                      >
                        {tr("Меню задач", "Problem menu")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {!data.access.canAccessContent ? null : !hasToken ? (
                <div className="text-sm text-text-secondary mb-3">
                  {tr(
                    "Увійдіть, щоб бачити ваш прогрес (кращий результат і останню подачу).",
                    "Log in to see your progress (best score and last submission)."
                  )}
                </div>
              ) : progressError ? (
                <div className="text-sm text-accent-error mb-3">{progressError}</div>
              ) : null}

              {progressLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-[860px] w-full text-sm font-mono border border-border">
                    <thead className="bg-bg-hover">
                      <tr>
                        <th className="p-2 border-b border-border text-left">{tr("Задача", "Problem")}</th>
                        <th className="p-2 border-b border-border text-left">{tr("Назва", "Title")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Бали", "Points")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Кращий", "Best")}</th>
                        <th className="p-2 border-b border-border text-center">{tr("Остання подача", "Last")}</th>
                        <th className="p-2 border-b border-border text-right">{tr("Дія", "Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.problems.map((p) => {
                        const disabled = !p.libraryTaskId;
                        const pr = progressByProblemId.get(p.id) ?? null;
                        const bestText = pr
                          ? pr.maxScore != null
                            ? `${pr.bestContestScore}/${pr.maxScore}`
                            : String(pr.bestContestScore)
                          : "—";
                        const last = pr?.last ?? null;
                        const lastScoreText = last
                          ? last.score != null && last.maxScore != null
                            ? `${last.score}/${last.maxScore}`
                            : last.score != null
                              ? String(last.score)
                              : "—"
                          : "—";

                        return (
                          <tr key={p.id} className="odd:bg-bg-base even:bg-bg-surface">
                            <td className="p-2 border-b border-border">
                              <button
                                className="text-primary hover:underline"
                                disabled={disabled}
                                onClick={() => navigate(`/contests/${data.contest.id}/problems/${p.id}`)}
                                title={tr("Відкрити задачу", "Open problem")}
                              >
                                {p.label}
                              </button>
                            </td>
                            <td className="p-2 border-b border-border">
                              <div className="truncate max-w-[520px]">{p.title}</div>
                            </td>
                            <td className="p-2 border-b border-border text-center">{p.points != null ? p.points : "—"}</td>
                            <td className="p-2 border-b border-border text-center">{bestText}</td>
                            <td className="p-2 border-b border-border text-center">
                              {last ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const v = verdictChip(last.verdict, tr);
                                      return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} size="sm" />;
                                    })()}
                                    {(() => {
                                      const p = submissionPhaseChip(last.phase, tr);
                                      return <StatusChip glyph={p.glyph} label={p.label} tone={p.tone} size="sm" />;
                                    })()}
                                    <span className="text-text-secondary">{lastScoreText}</span>
                                  </div>
                                  <div className="text-xs text-text-secondary">{fmtDateTime(last.createdAt, i18n.language)}</div>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-2 border-b border-border text-right">
                              <div className="flex items-center justify-end gap-2">
                                {hasToken && data.access.canManage && p.libraryTaskId ? (
                                  <Button
                                    variant="ghost"
                                    onClick={() => navigate(`/library?view=mine&sel=${p.libraryTaskId}&edit=1`)}
                                    title={tr("Редагувати тести/бали", "Edit tests/points")}
                                  >
                                    {tr("Бали/тести", "Points/tests")}
                                  </Button>
                                ) : null}
                                <Button
                                  variant={disabled ? "secondary" : "primary"}
                                  disabled={disabled}
                                  onClick={() => navigate(`/contests/${data.contest.id}/problems/${p.id}`)}
                                >
                                  {tr("Відкрити", "Open")}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="text-xs text-text-secondary mt-2">
                    {tr(
                      "“Кращий” рахується лише за офіційні подачі в межах контесту. “Остання” може бути як з контесту, так і з дорішування.",
                      "“Best” counts only official contest submissions. “Last” may be from contest or upsolve."
                    )}
                  </div>
                </div>
              )}

              {!data.access.canAccessContent ? (
                <div className="text-sm text-text-secondary mt-4">
                  {data.contest.visibility === "PRIVATE_CODE"
                    ? tr("Щоб бачити задачі, приєднайтесь за кодом.", "Join with a code to see problems.")
                    : tr("Немає доступу до задач цього контесту.", "You don’t have access to this contest.")}
                </div>
              ) : null}
              </Card>
            </>
          ) : tab === "standings" ? (
            <div className="space-y-4">
              <Scoreboard key={`sb-${standingsVersion}`} contestId={data.contest.id} canManage={!!data.access.canManage} />

              {hasToken && data.access.canManage ? (
                <>
                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />{tr("Організатори та пауза", "Organizers and pause")}</div>
                      <Button variant="secondary" onClick={loadOrganizers} disabled={organizersLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Button variant="secondary" onClick={toggleContestPaused} disabled={pauseSaving}>
                        {data.access.isPaused ? tr("Зняти з паузи", "Resume") : tr("Пауза", "Pause")}
                      </Button>
                      <Badge color={data.access.isPaused ? "warn" : "success"}>
                        {data.access.isPaused ? tr("Контест на паузі", "Contest is paused") : tr("Контест активний", "Contest is active")}
                      </Badge>
                    </div>

                    <div className="flex flex-col md:flex-row gap-2 mb-3">
                      <input
                        value={newOrganizerUserId}
                        onChange={(e) => setNewOrganizerUserId(e.target.value)}
                        className="md:w-56 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                        placeholder={tr("User ID організатора", "Organizer user ID")}
                        inputMode="numeric"
                      />
                      <Button variant="secondary" onClick={addOrganizer}>
                        {tr("Додати організатора", "Add organizer")}
                      </Button>
                    </div>

                    {organizersError ? <div className="text-sm text-accent-error mb-3">{organizersError}</div> : null}

                    {organizersLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : organizers.length === 0 ? (
                      <div className="text-sm text-text-secondary">{tr("Додаткових організаторів ще немає", "No additional organizers yet")}</div>
                    ) : (
                      <div className="space-y-2">
                        {organizers.map((o) => (
                          <div key={o.userId} className="flex items-center justify-between gap-2 border border-border bg-bg-base px-3 py-2">
                            <div className="text-sm font-mono text-text-primary">
                              #{o.userId} · {o.username} {" "}
                              <Link to={`/u/${encodeURIComponent(o.username)}`} className="text-primary hover:underline">
                                {tr("профіль", "profile")}
                              </Link>
                            </div>
                            <Button variant="ghost" onClick={() => removeOrganizer(o.userId)}>
                              {tr("Прибрати", "Remove")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary">{tr("Анулювання задач", "Problem annulments")}</div>
                      <Button variant="secondary" onClick={loadAnnulments} disabled={annulmentsLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                      <input
                        value={annulProblemId}
                        onChange={(e) => setAnnulProblemId(e.target.value)}
                        className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                        placeholder={tr("Problem ID", "Problem ID")}
                        inputMode="numeric"
                      />
                      <input
                        value={annulParticipantId}
                        onChange={(e) => setAnnulParticipantId(e.target.value)}
                        className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono"
                        placeholder={tr("Participant ID (опц.)", "Participant ID (opt)")}
                        inputMode="numeric"
                      />
                      <input
                        value={annulReason}
                        onChange={(e) => setAnnulReason(e.target.value)}
                        className="px-3 py-2 bg-bg-base border border-border text-text-primary"
                        placeholder={tr("Причина (опц.)", "Reason (opt)")}
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={annulledActive ? "1" : "0"}
                          onChange={(e) => setAnnulledActive(e.target.value === "1")}
                          className="px-3 py-2 bg-bg-base border border-border text-text-primary"
                        >
                          <option value="1">{tr("Анулювати", "Annul")}</option>
                          <option value="0">{tr("Скасувати анулювання", "Un-annul")}</option>
                        </select>
                        <Button variant="secondary" onClick={applyAnnulment}>
                          {tr("Застосувати", "Apply")}
                        </Button>
                      </div>
                    </div>

                    <div className="text-xs text-text-secondary mb-2">
                      {tr("Якщо Participant ID порожній — дія застосовується для всіх учасників.", "If Participant ID is empty, action applies to all participants.")}
                    </div>

                    {annulmentsError ? <div className="text-sm text-accent-error mb-2">{annulmentsError}</div> : null}

                    {annulmentsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : annulments.length === 0 ? (
                      <div className="text-sm text-text-secondary">{tr("Немає записів анулювання", "No annulment records")}</div>
                    ) : (
                      <div className="space-y-2 max-h-[260px] overflow-auto">
                        {annulments.map((a) => (
                          <div key={a.id} className="border border-border bg-bg-base px-3 py-2 text-sm font-mono">
                            <div>#{a.id} · P{a.problemId} · {a.participantId ? `U${a.participantId}` : tr("для всіх", "for all")}</div>
                            <div className="text-xs text-text-secondary">
                              {a.isActive ? tr("активне", "active") : tr("неактивне", "inactive")} · {fmtDateTime(a.updatedAt ?? a.createdAt, i18n.language)}
                              {a.reason ? ` · ${a.reason}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-mono text-text-primary flex items-center gap-2"><Users2 className="w-4 h-4 text-primary" />{tr("Модерація учасників", "Participant moderation")}</div>
                      <Button variant="secondary" onClick={loadAdminParticipants} disabled={adminParticipantsLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    {adminParticipantsError ? (
                      <div className="text-sm text-accent-error mb-3">{adminParticipantsError}</div>
                    ) : null}

                    {adminParticipantsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : adminParticipants.length === 0 ? (
                      <div className="text-sm text-text-secondary">{tr("Поки що немає учасників", "No participants yet")}</div>
                    ) : (
                      <div className="overflow-auto border border-border">
                        <table className="min-w-[860px] w-full text-sm font-mono">
                          <thead className="bg-bg-hover">
                            <tr>
                              <th className="p-2 border-b border-border text-left">#</th>
                              <th className="p-2 border-b border-border text-left">{tr("Учасник", "Participant")}</th>
                              <th className="p-2 border-b border-border text-left">{tr("Тип", "Type")}</th>
                              <th className="p-2 border-b border-border text-left">{tr("Контест-акаунт", "Contest account")}</th>
                              <th className="p-2 border-b border-border text-left">{tr("Статус", "Status")}</th>
                              <th className="p-2 border-b border-border text-right">{tr("Дія", "Action")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminParticipants.map((p) => (
                              <tr key={p.id} className="odd:bg-bg-base even:bg-bg-surface">
                                <td className="p-2 border-b border-border">{p.id}</td>
                                <td className="p-2 border-b border-border">{p.displayName}</td>
                                <td className="p-2 border-b border-border">{p.principalType}</td>
                                <td className="p-2 border-b border-border">{p.contestAccountHandle ? p.contestAccountHandle : "—"}</td>
                                <td className="p-2 border-b border-border">
                                  {p.isDisqualified ? (
                                    <Badge color="warn">{tr("Дискваліфіковано", "Disqualified")}</Badge>
                                  ) : (
                                    <Badge color="success">{tr("У заліку", "Active")}</Badge>
                                  )}
                                </td>
                                <td className="p-2 border-b border-border text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button variant="secondary" onClick={() => openAdminSubmissions(p, { fullPage: true })}>
                                      <Eye className="w-4 h-4 mr-2" />
                                      {tr("Подачі", "Submissions")}
                                    </Button>
                                    <Button variant="secondary" onClick={() => toggleParticipantDisqualification(p)}>
                                      {p.isDisqualified ? (
                                        <>
                                          <RotateCcw className="w-4 h-4 mr-2" />
                                          {tr("Повернути", "Restore")}
                                        </>
                                      ) : (
                                        <>
                                          <Ban className="w-4 h-4 mr-2" />
                                          {tr("Дискваліфікувати", "Disqualify")}
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  {adminSubsParticipant && !adminSubsFullPage ? (
                    <Card className="p-4 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="font-mono text-text-primary">
                          {tr("Інспектор подач", "Submission inspector")}: {adminSubsParticipant.displayName} (#{adminSubsParticipant.id})
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" onClick={() => openAdminSubmissions(adminSubsParticipant)} disabled={adminSubsLoading}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {tr("Оновити", "Refresh")}
                          </Button>
                          <Button variant="secondary" onClick={() => setAdminSubsFullPage(true)}>
                            {tr("На весь екран", "Full page")}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={closeAdminInspector}
                          >
                            {tr("Закрити інспектор", "Close inspector")}
                          </Button>
                        </div>
                      </div>

                      {adminInspectorBody}
                    </Card>
                  ) : null}

                  {adminSubsParticipant && adminSubsFullPage ? (
                    <div className="fixed inset-0 z-50 bg-bg-base">
                      <div className="h-full flex flex-col">
                        <div className="border-b border-border bg-bg-surface/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
                          <div className="font-mono text-text-primary text-sm md:text-base">
                            {tr("Інспектор подач", "Submission inspector")}: {adminSubsParticipant.displayName} (#{adminSubsParticipant.id})
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="secondary" onClick={() => openAdminSubmissions(adminSubsParticipant)} disabled={adminSubsLoading}>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              {tr("Оновити", "Refresh")}
                            </Button>
                            <Button variant="secondary" onClick={() => setAdminSubsFullPage(false)}>
                              {tr("Згорнути", "Minimize")}
                            </Button>
                            <Button variant="ghost" onClick={closeAdminInspector}>
                              {tr("Закрити", "Close")}
                            </Button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                          {adminInspectorBody}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-text-secondary">
                    {tr("Питання та оголошення зберігаються на сервері в межах цього контесту.", "Questions and announcements are persisted on the server for this contest.")}
                  </div>
                  <Button variant="secondary" onClick={loadCommunity} disabled={communityLoading || !data.access.canAccessContent}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {tr("Оновити", "Refresh")}
                  </Button>
                </div>
                {communityError ? <div className="text-sm text-accent-error mt-2">{communityError}</div> : null}
                {!data.access.canAccessContent ? (
                  <div className="text-sm text-text-secondary mt-2">{tr("Немає доступу до ком'юніті цього контесту.", "You don't have access to this contest community.")}</div>
                ) : null}
              </Card>

              <Card className="p-4">
                <div className="text-sm font-mono text-text-primary mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> {tr("Питання до організатора", "Questions to organizer")}
                </div>
                <div className="text-xs text-text-secondary mb-3">
                  {tr(
                    "Це приватні звернення: учасник бачить лише власні питання та відповіді організаторів.",
                    "These are private requests: each participant sees only their own questions and organizer answers."
                  )}
                </div>

                <div className="space-y-2 mb-3 max-h-[360px] overflow-auto pr-1">
                  {communityLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : communityData.questions.length === 0 ? (
                    <div className="text-sm text-text-secondary">{tr("Питань ще немає.", "No questions yet.")}</div>
                  ) : (
                    communityData.questions.map((q) => (
                      <div key={q.id} className="rounded-xl border border-border bg-bg-base p-3">
                        <div className="text-xs text-text-secondary mb-1 flex items-center gap-2 flex-wrap">
                          <span>{q.author} · {fmtDateTime(q.createdAt, i18n.language)}</span>
                          <StatusChip
                            glyph={q.answer ? "✓" : "…"}
                            label={q.answer ? tr("Відповідь є", "Answered") : tr("Очікує відповіді", "Waiting")}
                            tone={q.answer ? "success" : "warn"}
                            size="sm"
                          />
                        </div>
                        <div className="text-sm text-text-primary whitespace-pre-wrap">{q.text}</div>
                        {q.answer ? (
                          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/10 p-2">
                            <div className="text-[11px] text-primary mb-1">{tr("Відповідь організатора", "Organizer answer")}</div>
                            <div className="text-xs text-text-primary whitespace-pre-wrap">{q.answer}</div>
                            {q.answeredAt ? <div className="text-[10px] text-text-secondary mt-1">{fmtDateTime(q.answeredAt, i18n.language)}</div> : null}
                          </div>
                        ) : data.access.canManage ? (
                          <div className="mt-2">
                            <Button variant="secondary" onClick={() => answerContestQuestion(q.id)}>
                              {tr("Відповісти", "Answer")}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                {hasToken && data.access.canAccessContent ? (
                  <div className="space-y-2">
                    <textarea
                      value={communityQuestionText}
                      onChange={(e) => setCommunityQuestionText(e.target.value)}
                      className="w-full min-h-[90px] rounded-xl bg-bg-code border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                      placeholder={tr("Постав запитання щодо задач, правил або тестів...", "Ask about tasks, rules, or tests...")}
                    />
                    <div className="flex justify-end">
                      <Button onClick={postContestQuestion} disabled={!communityQuestionText.trim()}>
                        <Send className="w-4 h-4 mr-2" /> {tr("Надіслати питання", "Send question")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-text-secondary">{tr("Увійдіть і отримайте доступ до контесту, щоб ставити питання.", "Log in and join the contest to ask questions.")}</div>
                )}
              </Card>

              <Card className="p-4">
                <div className="text-sm font-mono text-text-primary mb-2 flex items-center gap-2">
                  <Megaphone className="w-4 h-4" /> {tr("Оголошення", "Announcements")}
                </div>

                {data.access.canManage ? (
                  <div className="space-y-2 mb-3">
                    <textarea
                      value={communityAnnouncementText}
                      onChange={(e) => setCommunityAnnouncementText(e.target.value)}
                      className="w-full min-h-[80px] rounded-xl bg-bg-code border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                      placeholder={tr("Наприклад: о 18:00 оновлено умову задачі B", "Example: at 18:00 problem B statement updated")}
                    />
                    <div className="flex justify-end">
                      <Button variant="secondary" onClick={postContestAnnouncement} disabled={!communityAnnouncementText.trim()}>
                        {tr("Опублікувати оголошення", "Publish announcement")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                  {communityLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : communityData.announcements.length === 0 ? (
                    <div className="text-sm text-text-secondary">{tr("Оголошень ще немає.", "No announcements yet.")}</div>
                  ) : (
                    communityData.announcements.map((a) => (
                      <div key={a.id} className="rounded-xl border border-border bg-bg-base p-3">
                        <div className="text-xs text-text-secondary mb-1">{a.author} · {fmtDateTime(a.createdAt, i18n.language)}</div>
                        <div className="text-sm text-text-primary whitespace-pre-wrap">{a.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
