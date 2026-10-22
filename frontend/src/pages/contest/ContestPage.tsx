import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound, RefreshCw, Eye, Ban, RotateCcw, MessageSquare, Megaphone, Send, ShieldCheck, Users2, Sparkles, ImagePlus, Upload, FileSpreadsheet, Trash2, Copy, Download, CircleCheck, TriangleAlert, UsersRound, Type, FileText, Archive, X, Check, FileArchive, AlertCircle } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { Card } from "../../components/ui/Card";
import { StatusChip, type StatusChipTone } from "../../components/ui/StatusChip";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { MarkdownView } from "../../components/MarkdownView";
import { CodeEditor } from "../../components/CodeEditor";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  addContestProblem,
  addContestOrganizer,
  answerContestCommunityQuestion,
  getContestCommunity,
  getContestDetails,
  generateContestAccounts,
  listContestTemporaryAccounts,
  deleteContestTemporaryAccount,
  deleteContest as deleteContestRequest,
  deleteContestProblem,
  sendContestAccountsEmails,
  getContestMyProgress,
  listContestOrganizers,
  listContestAnnulments,
  listContestAdminParticipants,
  listContestParticipantSubmissionsForAdmin,
  getContestSimilarity,
  postContestCommunityAnnouncement,
  postContestCommunityQuestion,
  removeContestOrganizer,
  setContestAnnulment,
  setContestPaused,
  setContestParticipantDisqualified,
  getContestSafetyState,
  setContestOrganizerSafetyLock,
  sendContestParticipantMessage,
  joinContest,
  updateContestProblemSettings,
  updateContest,
  type ContestAdminParticipant,
  type ContestAdminSubmission,
  type ContestGeneratedAccount,
  type ContestTemporaryAccount,
  type ContestCommunityData,
  type ContestDetails,
  type ContestAnnulmentItem,
  type ContestOrganizerListItem,
  type ContestMyProgressProblem,
  type ContestSimilarityPair,
  type ContestVisibility,
  type ContestBannerTheme,
  type ContestParticipantAccessMode,
  type ContestScoreboardVisibility,
  type ContestSafetyRedLockMode,
  type ContestSafetyState,
} from "../../lib/api/contests";
import { getClasses, uploadStatementImage, type Class as EduClass } from "../../lib/api/edu";
import { CONTEST_BANNER_THEMES, CONTEST_ICONS } from "./contestBranding";
import { ContestAwardsPanel } from "./ContestAwardsPanel";
import { ContestDisqualificationDialog } from "./ContestDisqualificationDialog";
import { ContestCertificatesPanel } from "./ContestCertificatesPanel";
import { ContestSafetyGate } from "./ContestSafetyGate";
import {
  importLibraryTaskArchives,
  listApprovedLibraryTasks,
  listMyLibraryTasks,
  type LibraryTaskListItem,
} from "../../lib/api/library";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { toast } from "../../lib/toast";
import { ContestSectionNav, type ContestSection } from "./ContestSectionNav";

type ParsedTestInput = {
  input?: unknown;
  expectedOutput?: unknown;
  isHidden?: unknown;
  points?: unknown;
};

type CodeEditorLanguage = "JAVA" | "PYTHON" | "CPP" | "java" | "python" | "cpp" | "c" | "csharp" | "kotlin" | "html" | "css" | "javascript";

function toCodeEditorLanguage(value: unknown): CodeEditorLanguage {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "java") return "java";
  if (raw === "python") return "python";
  if (raw === "cpp") return "cpp";
  if (raw === "c") return "c";
  if (raw === "csharp") return "csharp";
  if (raw === "kotlin") return "kotlin";
  if (raw === "html") return "html";
  if (raw === "css") return "css";
  if (raw === "javascript" || raw === "js") return "javascript";
  if (raw === "JAVA") return "JAVA";
  if (raw === "PYTHON") return "PYTHON";
  if (raw === "CPP") return "CPP";
  return "java";
}

function getErrorMessage(error: unknown): string {
  return getErrorMessageFromUnknown(error, "");
}

function createContestInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint8Array(8);
  window.crypto.getRandomValues(values);
  return `SC-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

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
  return parsed.map((item) => {
    const t: ParsedTestInput = item && typeof item === "object" ? (item as ParsedTestInput) : {};
    return {
      input: String(t.input ?? ""),
      expectedOutput: String(t.expectedOutput ?? ""),
      isHidden: Boolean(t.isHidden),
      points: t.points != null ? Number(t.points) : undefined,
    };
  });
}

function inferDifficultyFromTests(tests: Array<{ points?: number }>): "EASY" | "MEDIUM" | "HARD" | undefined {
  if (!Array.isArray(tests) || tests.length === 0) return undefined;
  const total = tests.reduce((sum, t) => sum + (Number.isFinite(Number(t?.points)) ? Math.max(1, Number(t?.points)) : 1), 0);
  if (total >= 250 || tests.length >= 16) return "HARD";
  if (total >= 120 || tests.length >= 8) return "MEDIUM";
  return "EASY";
}

function parseRosterInput(raw: string): Array<{ fullName: string; email: string }> {
  return parseRosterTextDetailed(raw).entries;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function normalizeRosterHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function parseRosterMatrixDetailed(matrix: unknown[][]): RosterCsvParseResult {
  const rows = matrix.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "").replace(/^\uFEFF/, "").trim()) : []);
  const firstNonEmpty = rows.findIndex((row) => row.some(Boolean));
  if (firstNonEmpty < 0) return { entries: [], invalidLines: [], duplicateEmails: [] };

  const headers = rows[firstNonEmpty].map(normalizeRosterHeader);
  const emailIndex = headers.findIndex((cell) => cell.includes("email") || cell.includes("пошта") || cell.includes("електроннаадреса"));
  const fullNameIndex = headers.findIndex((cell) => cell.includes("піб") || cell.includes("fullname") || cell.includes("учасник") || cell.includes("participant"));
  const firstNameIndex = headers.findIndex((cell) => ["імя", "firstname", "givenname"].includes(cell));
  const surnameIndex = headers.findIndex((cell) => cell.includes("прізвище") || cell.includes("surname") || cell.includes("lastname"));
  const middleNameIndex = headers.findIndex((cell) => cell.includes("побатькові") || cell.includes("middlename"));
  const genericNameIndex = fullNameIndex >= 0 ? fullNameIndex : headers.findIndex((cell) => cell === "name");
  const hasHeader = emailIndex >= 0 || genericNameIndex >= 0 || firstNameIndex >= 0 || surnameIndex >= 0 || middleNameIndex >= 0;
  const dataRows = hasHeader ? rows.slice(firstNonEmpty + 1) : rows.slice(firstNonEmpty);
  const entries: Array<{ fullName: string; email: string }> = [];
  const invalidLines: string[] = [];
  const emailHit = new Map<string, number>();

  for (const row of dataRows) {
    if (!row.some(Boolean)) continue;
    const emailCell = emailIndex >= 0 ? row[emailIndex] ?? "" : row.find((cell) => /\S+@\S+\.\S+/.test(cell)) ?? "";
    const email = emailCell.trim();
    const nameCell = genericNameIndex >= 0 ? row[genericNameIndex] ?? "" : "";
    const orderedNameIndexes = [firstNameIndex, surnameIndex, middleNameIndex].filter((index) => index >= 0).sort((a, b) => a - b);
    const splitName = orderedNameIndexes.map((index) => String(row[index] ?? "").trim()).filter(Boolean).join(" ");
    const fullName = nameCell.trim() || splitName || (hasHeader ? "" : String(row[0] ?? "").trim());

    if (!fullName || (email && !/\S+@\S+\.\S+/.test(email))) {
      invalidLines.push(row.join("\t"));
      continue;
    }
    if (email) emailHit.set(email.toLowerCase(), (emailHit.get(email.toLowerCase()) ?? 0) + 1);
    entries.push({ fullName, email });
  }

  const duplicateEmails = Array.from(emailHit.entries()).filter(([, count]) => count > 1).map(([email]) => email);
  if (entries.length > 300) invalidLines.push(...entries.splice(300).map((entry) => entry.fullName));
  return { entries, invalidLines, duplicateEmails };
}

function parseRosterTextDetailed(raw: string): RosterCsvParseResult {
  const lines = String(raw ?? "").split(/\r?\n/).filter((line) => line.trim());
  const first = lines[0] ?? "";
  const delimiter = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
  return parseRosterMatrixDetailed(lines.map((line) => parseDelimitedLine(line, delimiter)));
}

type RosterCsvParseResult = {
  entries: Array<{ fullName: string; email: string }>;
  invalidLines: string[];
  duplicateEmails: string[];
};

function parseRosterCsvTextDetailed(raw: string): RosterCsvParseResult {
  return parseRosterTextDetailed(raw);
}

type RosterInputAnalysis = {
  entries: Array<{ fullName: string; email: string }>;
  invalidLines: string[];
  duplicateEmails: string[];
};

function analyzeRosterInput(raw: string): RosterInputAnalysis {
  return parseRosterTextDetailed(raw);
}

function makeRosterRowKey(row: { fullName: string; email: string }): string {
  const email = row.email.trim().toLowerCase();
  return email ? `email:${email}` : `name:${row.fullName.trim().toLowerCase()}`;
}

function mergeRosterRows(
  existing: Array<{ fullName: string; email: string }>,
  incoming: Array<{ fullName: string; email: string }>
): Array<{ fullName: string; email: string }> {
  const dedup = new Map<string, { fullName: string; email: string }>();
  for (const row of [...existing, ...incoming]) {
    const key = makeRosterRowKey(row);
    dedup.set(key, { fullName: row.fullName.trim(), email: row.email.trim() });
  }
  return Array.from(dedup.values());
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

function submissionScoreTone(score: number | null | undefined): StatusChipTone {
  if (score == null || !Number.isFinite(Number(score))) return "neutral";
  const value = Number(score);
  if (value >= 100) return "success";
  if (value >= 50) return "warn";
  if (value >= 1) return "error";
  // 0 with an existing submission is valid and should stay non-error.
  return "info";
}

export const ContestPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const tr = React.useCallback((uk: string, en: string) => (isEn ? en : uk), [isEn]);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useParams<{ id?: string }>();
  const contestId = React.useMemo(() => {
    const v = Number(params.id);
    return Number.isFinite(v) ? v : null;
  }, [params]);

  const hasToken = true;

  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<ContestDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const requestedSection = searchParams.get("tab");
  const tab: ContestSection = (["problems", "standings", "community", "accounts", "participants", "certificates", "management"] as string[])
    .includes(requestedSection ?? "") ? requestedSection as ContestSection : "problems";

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
  const [publishing, setPublishing] = React.useState(false);
  const [settingsSaved, setSettingsSaved] = React.useState(false);
  React.useEffect(() => {
    if (!searchParams.has("settings")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("settings");
    next.set("tab", "management");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [settingsSection, setSettingsSection] = React.useState<"general" | "schedule" | "access" | "appearance">("general");
  const [deleteContestOpen, setDeleteContestOpen] = React.useState(false);
  const [deleteContestConfirmation, setDeleteContestConfirmation] = React.useState("");
  const [deleteContestLoading, setDeleteContestLoading] = React.useState(false);
  const [deleteContestError, setDeleteContestError] = React.useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [settingsTitle, setSettingsTitle] = React.useState("");
  const [settingsDescription, setSettingsDescription] = React.useState("");
  const [settingsTags, setSettingsTags] = React.useState("");
  const [settingsDifficulty, setSettingsDifficulty] = React.useState<"EASY" | "MEDIUM" | "HARD" | "">("");
  const [settingsStartsAt, setSettingsStartsAt] = React.useState("");
  const [settingsEndsAt, setSettingsEndsAt] = React.useState("");
  const [settingsAllowUpsolve, setSettingsAllowUpsolve] = React.useState(true);
  const [settingsSafetyAlertsEnabled, setSettingsSafetyAlertsEnabled] = React.useState(false);
  const [settingsSafetyRedLocationUid, setSettingsSafetyRedLocationUid] = React.useState("");
  const [settingsSafetyRedLockMode, setSettingsSafetyRedLockMode] = React.useState<ContestSafetyRedLockMode>("PAUSE_10_MIN");
  const [settingsSafetyState, setSettingsSafetyState] = React.useState<ContestSafetyState | null>(null);
  const [settingsSafetyLocationsLoading, setSettingsSafetyLocationsLoading] = React.useState(false);
  const [settingsSafetyLockSaving, setSettingsSafetyLockSaving] = React.useState(false);
  const [settingsScoringMode, setSettingsScoringMode] = React.useState<"IOI" | "ICPC">("IOI");
  const [settingsVisibility, setSettingsVisibility] = React.useState<ContestVisibility>("PUBLIC");
  const [settingsJoinCode, setSettingsJoinCode] = React.useState("");
  const [settingsClassId, setSettingsClassId] = React.useState("");
  const [settingsIcon, setSettingsIcon] = React.useState("🏆");
  const [settingsIconImageUrl, setSettingsIconImageUrl] = React.useState<string | null>(null);
  const [settingsIconUploading, setSettingsIconUploading] = React.useState(false);
  const [settingsBannerTheme, setSettingsBannerTheme] = React.useState<ContestBannerTheme>("forest");
  const [settingsBannerImageUrl, setSettingsBannerImageUrl] = React.useState<string | null>(null);
  const [settingsBannerUploading, setSettingsBannerUploading] = React.useState(false);
  const [settingsScoreboardVisibility, setSettingsScoreboardVisibility] = React.useState<ContestScoreboardVisibility>("LIVE");
  const [settingsParticipantAccessMode, setSettingsParticipantAccessMode] = React.useState<ContestParticipantAccessMode>("SELF_REGISTRATION");
  const [settingsClasses, setSettingsClasses] = React.useState<EduClass[]>([]);
  const [settingsClassesLoading, setSettingsClassesLoading] = React.useState(false);
  const [settingsClassesError, setSettingsClassesError] = React.useState<string | null>(null);
  const [settingsClassesRetry, setSettingsClassesRetry] = React.useState(0);

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
  const [archiveFiles, setArchiveFiles] = React.useState<File[]>([]);
  const [archiveImportResult, setArchiveImportResult] = React.useState<{ attached: string[]; failures: Array<{ name: string; message: string }> } | null>(null);
  const [archiveDropActive, setArchiveDropActive] = React.useState(false);
  const [importingArchive, setImportingArchive] = React.useState(false);

  const [manageOpen, setManageOpen] = React.useState(false);
  const [focusedProblemSettingsId, setFocusedProblemSettingsId] = React.useState<number | null>(null);
  const [savingProblemSettingsId, setSavingProblemSettingsId] = React.useState<number | null>(null);
  const [problemSettingsError, setProblemSettingsError] = React.useState<string | null>(null);
  const [deletingContestProblemId, setDeletingContestProblemId] = React.useState<number | null>(null);
  const [problemSettingsDraft, setProblemSettingsDraft] = React.useState<Record<number, { label: string; points: string; order: string }>>({});

  const [progressLoading, setProgressLoading] = React.useState(false);
  const [progressError, setProgressError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<ContestMyProgressProblem[] | null>(null);

  const [disqualificationTarget, setDisqualificationTarget] = React.useState<ContestAdminParticipant | null>(null);
  const [adminParticipantsLoading, setAdminParticipantsLoading] = React.useState(false);
  const [adminParticipantsError, setAdminParticipantsError] = React.useState<string | null>(null);
  const [adminParticipants, setAdminParticipants] = React.useState<ContestAdminParticipant[]>([]);
  const [adminParticipantsActionMessage, setAdminParticipantsActionMessage] = React.useState<string | null>(null);
  const [adminParticipantsActionTone, setAdminParticipantsActionTone] = React.useState<"success" | "warn" | "error">("success");
  const [contestMessageTitle, setContestMessageTitle] = React.useState("");
  const [contestMessageText, setContestMessageText] = React.useState("");
  const [contestMessageAttachments, setContestMessageAttachments] = React.useState<File[]>([]);
  const [contestMessageSending, setContestMessageSending] = React.useState(false);
  const [contestMessageError, setContestMessageError] = React.useState<string | null>(null);
  const [contestMessageResult, setContestMessageResult] = React.useState<{
    sent: number;
    eligible: number;
    skipped: number;
    failed: Array<{ email: string; name: string }>;
    duplicateAddresses: number;
  } | null>(null);
  const [simProblemId, setSimProblemId] = React.useState<number | null>(null);
  const [simPairs, setSimPairs] = React.useState<ContestSimilarityPair[]>([]);
  const [simLoading, setSimLoading] = React.useState(false);
  const [simError, setSimError] = React.useState<string | null>(null);
  const [simCompared, setSimCompared] = React.useState<number | null>(null);
  const [accountRosterText, setAccountRosterText] = React.useState("");
  const [accountRosterImportKey, setAccountRosterImportKey] = React.useState(0);
  const [accountRosterImportPreviewOpen, setAccountRosterImportPreviewOpen] = React.useState(false);
  const [accountRosterImportFileName, setAccountRosterImportFileName] = React.useState("");
  const [accountRosterImportEntries, setAccountRosterImportEntries] = React.useState<Array<{ fullName: string; email: string }>>([]);
  const [accountRosterImportInvalidLines, setAccountRosterImportInvalidLines] = React.useState<string[]>([]);
  const [accountRosterImportDuplicateEmails, setAccountRosterImportDuplicateEmails] = React.useState<string[]>([]);
  const [accountGenLoading, setAccountGenLoading] = React.useState(false);
  const [accountGenError, setAccountGenError] = React.useState<string | null>(null);
  const [accountGenMessage, setAccountGenMessage] = React.useState<string | null>(null);
  const [generatedAccounts, setGeneratedAccounts] = React.useState<ContestGeneratedAccount[]>([]);
  const [temporaryAccounts, setTemporaryAccounts] = React.useState<ContestTemporaryAccount[]>([]);
  const [temporaryAccountsLoading, setTemporaryAccountsLoading] = React.useState(false);
  const [temporaryAccountsError, setTemporaryAccountsError] = React.useState<string | null>(null);
  const [deletingTemporaryAccountId, setDeletingTemporaryAccountId] = React.useState<number | null>(null);
  const [accountMailLoading, setAccountMailLoading] = React.useState(false);
  const [accountMailError, setAccountMailError] = React.useState<string | null>(null);
  const [accountMailResult, setAccountMailResult] = React.useState<string | null>(null);
  const [accountMailCustomMessage, setAccountMailCustomMessage] = React.useState("");
  const [accountMailAttachments, setAccountMailAttachments] = React.useState<File[]>([]);

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
      .catch((e: unknown) => {
        const msg = getErrorMessage(e);
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
    if (!data?.access?.canAccessContent || (data.access.canManage && !data.access.isJoined)) {
      setProgress(null);
      return;
    }

    setProgressLoading(true);
    setProgressError(null);
    getContestMyProgress(contestId)
      .then((r) => {
        setProgress(Array.isArray(r.problems) ? r.problems : []);
      })
      .catch((e: unknown) => {
        const msg = getErrorMessage(e);
        setProgressError(msg || tr("Не вдалося завантажити прогрес", "Failed to load progress"));
        setProgress(null);
      })
      .finally(() => setProgressLoading(false));
  }, [contestId, hasToken, data?.access?.canAccessContent, data?.access?.canManage, data?.access?.isJoined, tr]);

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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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
      setAdminParticipants(Array.isArray(r.participants) ? r.participants : []);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAdminParticipantsError(msg || tr("Не вдалося завантажити учасників", "Failed to load participants"));
      setAdminParticipants([]);
    } finally {
      setAdminParticipantsLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  const sendContestMessage = async (retryEmails?: string[]) => {
    if (!contestId || !data?.access?.canManage || !contestMessageTitle.trim() || !contestMessageText.trim()) return;
    setContestMessageSending(true);
    setContestMessageError(null);
    if (!retryEmails) setContestMessageResult(null);
    try {
      const result = await sendContestParticipantMessage(contestId, {
        title: contestMessageTitle.trim(),
        text: contestMessageText.trim(),
        ...(retryEmails ? { retryEmails } : {}),
      }, contestMessageAttachments);
      const combinedResult = retryEmails && contestMessageResult
        ? {
            ...contestMessageResult,
            sent: contestMessageResult.sent + result.sent,
            failed: result.failed,
          }
        : result;
      setContestMessageResult(combinedResult);
      if (combinedResult.sent > 0 && combinedResult.failed.length === 0) {
        setContestMessageTitle("");
        setContestMessageText("");
        setContestMessageAttachments([]);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const uploadErrorMessages: Record<string, string> = {
        UNSUPPORTED_MEDIA_TYPE: tr("Цей тип файлу не підтримується.", "This file type is not supported."),
        FILE_TOO_LARGE: tr("Файл завеликий. Максимум — 10 МБ.", "A file is too large. Maximum size is 10 MB."),
        ATTACHMENTS_TOO_LARGE: tr("Загальний розмір вкладень не може перевищувати 20 МБ.", "Attachments cannot exceed 20 MB in total."),
        TOO_MANY_FILES: tr("Можна прикріпити не більше 5 файлів.", "You can attach up to 5 files."),
        UPLOAD_FAILED: tr("Не вдалося завантажити вкладення.", "Failed to upload attachments."),
      };
      setContestMessageError(uploadErrorMessages[message] || message || tr("Не вдалося надіслати листи учасникам.", "Failed to email participants."));
    } finally {
      setContestMessageSending(false);
    }
  };

  React.useEffect(() => {
    if (tab !== "participants") return;
    loadAdminParticipants();
  }, [tab, loadAdminParticipants]);

  const loadTemporaryAccounts = React.useCallback(async () => {
    if (!contestId || !data?.access?.canManage) {
      setTemporaryAccounts([]);
      setTemporaryAccountsError(null);
      return;
    }
    setTemporaryAccountsLoading(true);
    setTemporaryAccountsError(null);
    try {
      const r = await listContestTemporaryAccounts(contestId);
      setTemporaryAccounts(Array.isArray(r.accounts) ? r.accounts : []);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setTemporaryAccountsError(msg || tr("Не вдалося завантажити тимчасові акаунти", "Failed to load temporary accounts"));
    } finally {
      setTemporaryAccountsLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab === "accounts") void loadTemporaryAccounts();
  }, [tab, loadTemporaryAccounts]);

  React.useEffect(() => {
    if (!adminParticipantsActionMessage) return;
    const timer = window.setTimeout(() => {
      setAdminParticipantsActionMessage(null);
    }, 7000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [adminParticipantsActionMessage]);

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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setOrganizersError(msg || tr("Не вдалося завантажити організаторів", "Failed to load organizers"));
      setOrganizers([]);
    } finally {
      setOrganizersLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "management") return;
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAnnulmentsError(msg || tr("Не вдалося завантажити анулювання", "Failed to load annulments"));
      setAnnulments([]);
    } finally {
      setAnnulmentsLoading(false);
    }
  }, [contestId, data?.access?.canManage, tr]);

  React.useEffect(() => {
    if (tab !== "management") return;
    loadAnnulments();
  }, [tab, loadAnnulments]);

  const toggleContestPaused = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const targetPaused = !Boolean(data.access.isPaused);
    setPauseSaving(true);
    try {
      const r = await setContestPaused(contestId, targetPaused);
      setData((prev) => (prev ? { ...prev, access: { ...prev.access, isPaused: !!r.isPaused } } : prev));
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || tr("Не вдалося змінити стан паузи", "Failed to change pause state"));
    } finally {
      setPauseSaving(false);
    }
  };

  const confirmDeleteContest = async () => {
    if (!contestId || !data?.access.canDelete || deleteContestConfirmation !== data.contest.title) return;
    setDeleteContestLoading(true);
    setDeleteContestError(null);
    try {
      await deleteContestRequest(contestId, deleteContestConfirmation);
      navigate("/contest/contests", { replace: true });
    } catch (e: unknown) {
      setDeleteContestError(getErrorMessage(e) || tr("Не вдалося видалити контест", "Could not delete the contest"));
    } finally {
      setDeleteContestLoading(false);
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setOrganizersError(msg || tr("Не вдалося додати організатора", "Failed to add organizer"));
    }
  };

  const removeOrganizer = async (userId: number) => {
    if (!contestId || !data?.access?.canManage) return;
    if (!window.confirm(tr("Прибрати цього організатора з контесту?", "Remove this organizer from the contest?"))) return;
    try {
      await removeContestOrganizer(contestId, userId);
      await loadOrganizers();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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
      const rows = Array.isArray(r.submissions) ? r.submissions : [];
      setAdminSubsRows(rows);
      setAdminSubsCodeViewer(rows[0] ?? null);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAdminSubsError(msg || tr("Не вдалося завантажити подачі", "Failed to load submissions"));
      setAdminSubsRows([]);
      setAdminSubsCodeViewer(null);
    } finally {
      setAdminSubsLoading(false);
    }
  };

  const generateAccounts = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const entries = parseRosterInput(accountRosterText);
    if (entries.length === 0) {
      setAccountGenError(tr("Додайте хоча б одне ім’я учасника", "Add at least one participant name"));
      return;
    }

    setAccountGenLoading(true);
    setAccountGenError(null);
    setAccountGenMessage(null);
    setAccountMailError(null);
    setAccountMailResult(null);
    try {
      const r = await generateContestAccounts(contestId, { entries });
      setGeneratedAccounts(Array.isArray(r.created) ? r.created : []);
      setAccountGenMessage(tr(`Згенеровано акаунтів: ${Array.isArray(r.created) ? r.created.length : 0}`, `Generated accounts: ${Array.isArray(r.created) ? r.created.length : 0}`));
      await loadAdminParticipants();
      await loadTemporaryAccounts();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAccountGenError(msg || tr("Не вдалося згенерувати акаунти", "Failed to generate accounts"));
    } finally {
      setAccountGenLoading(false);
    }
  };

  const deleteTemporaryAccount = async (account: ContestTemporaryAccount) => {
    if (!contestId || deletingTemporaryAccountId != null) return;
    const confirmed = window.confirm(tr(
      `Видалити тимчасовий акаунт «${account.username}»? Його подачі й результати в цьому контесті також буде видалено.`,
      `Delete temporary account “${account.username}”? Its submissions and results in this contest will also be deleted.`
    ));
    if (!confirmed) return;

    setDeletingTemporaryAccountId(account.userId);
    setTemporaryAccountsError(null);
    try {
      await deleteContestTemporaryAccount(contestId, account.userId);
      setTemporaryAccounts((current) => current.filter((item) => item.userId !== account.userId));
      setGeneratedAccounts((current) => current.filter((item) => item.userId !== account.userId));
      void loadAdminParticipants();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setTemporaryAccountsError(msg || tr("Не вдалося видалити акаунт", "Failed to delete account"));
    } finally {
      setDeletingTemporaryAccountId(null);
    }
  };

  const importRosterCsvFile = async (file: File | null) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) {
        setAccountGenError(tr("Файл має бути меншим за 10 МБ", "File must be smaller than 10 MB"));
        return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      let parsed: RosterCsvParseResult;
      if (["xlsx", "xls", "ods"].includes(extension)) {
        const XLSX = await import("@e965/xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, sheetRows: 301 });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
        if (!firstSheet) {
          setAccountGenError(tr("У таблиці немає аркушів з даними", "The spreadsheet has no data sheets"));
          return;
        }
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: false, defval: "", blankrows: false });
        parsed = parseRosterMatrixDetailed(matrix);
      } else {
        parsed = parseRosterCsvTextDetailed(await file.text());
      }
      if (parsed.entries.length === 0) {
        setAccountGenError(tr("Таблиця не містить валідних імен учасників", "The table has no valid participant names"));
        return;
      }
      setAccountRosterImportFileName(String(file.name ?? ""));
      setAccountRosterImportEntries(parsed.entries);
      setAccountRosterImportInvalidLines(parsed.invalidLines);
      setAccountRosterImportDuplicateEmails(parsed.duplicateEmails);
      setAccountRosterImportPreviewOpen(true);
      setAccountGenError(null);
      setAccountGenMessage(null);
    } catch {
      setAccountGenError(tr("Не вдалося прочитати файл таблиці", "Could not read the spreadsheet file"));
    } finally {
      setAccountRosterImportKey((k) => k + 1);
    }
  };

  const cancelRosterCsvImportPreview = () => {
    setAccountRosterImportPreviewOpen(false);
    setAccountRosterImportFileName("");
    setAccountRosterImportEntries([]);
    setAccountRosterImportInvalidLines([]);
    setAccountRosterImportDuplicateEmails([]);
  };

  const applyRosterCsvImportPreview = () => {
    if (!accountRosterImportEntries.length) {
      cancelRosterCsvImportPreview();
      return;
    }

    const existing = parseRosterInput(accountRosterText);
    const beforeUniqueCount = mergeRosterRows(existing, []).length;
    const merged = mergeRosterRows(existing, accountRosterImportEntries);
    const lines = merged.map((r) => [r.fullName, r.email].filter(Boolean).join(", "));
    const addedCount = Math.max(0, merged.length - beforeUniqueCount);

    setAccountRosterText(lines.join("\n"));
    setAccountGenError(null);
    setAccountGenMessage(
      tr(
        `Імпортовано: ${accountRosterImportEntries.length}. Додано нових: ${addedCount}. Всього в списку: ${lines.length}`,
        `Imported: ${accountRosterImportEntries.length}. Added new: ${addedCount}. Total in roster: ${lines.length}`
      )
    );
    cancelRosterCsvImportPreview();
  };

  const generatedAccountsCsv = React.useMemo(() => {
    if (!generatedAccounts.length) return "";
    const header = "fullName,email,username,password,userId,participantId";
    const rows = generatedAccounts.map((a) => [a.fullName ?? "", a.email ?? "", a.username, a.password, String(a.userId), String(a.participantId)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","));
    return [header, ...rows].join("\n");
  }, [generatedAccounts]);
  const generatedAccountsByUserId = React.useMemo(() => new Map(generatedAccounts.map((account) => [account.userId, account])), [generatedAccounts]);

  const rosterInputAnalysis = React.useMemo(() => analyzeRosterInput(accountRosterText), [accountRosterText]);
  const rosterPreviewRows = React.useMemo(() => rosterInputAnalysis.entries.slice(0, 8), [rosterInputAnalysis.entries]);
  const existingRosterEntries = React.useMemo(() => parseRosterInput(accountRosterText), [accountRosterText]);
  const existingRosterKeySet = React.useMemo(() => {
    return new Set(existingRosterEntries.map((row) => makeRosterRowKey(row)));
  }, [existingRosterEntries]);
  const accountRosterImportDiff = React.useMemo(() => {
    const seenImport = new Set<string>();
    let duplicateWithinImport = 0;

    const rows = accountRosterImportEntries.map((row) => {
      const key = makeRosterRowKey(row);
      const isDuplicateInImport = seenImport.has(key);
      if (isDuplicateInImport) duplicateWithinImport += 1;
      else seenImport.add(key);

      const isExisting = existingRosterKeySet.has(key);
      return { ...row, key, isExisting, isDuplicateInImport };
    });

    const uniqueImportKeys = Array.from(seenImport);
    const existingCount = uniqueImportKeys.filter((key) => existingRosterKeySet.has(key)).length;
    const newCount = Math.max(0, uniqueImportKeys.length - existingCount);

    return {
      rows,
      uniqueImportCount: uniqueImportKeys.length,
      newCount,
      existingCount,
      duplicateWithinImport,
    };
  }, [accountRosterImportEntries, existingRosterKeySet]);
  const accountRosterImportPreviewRows = React.useMemo(() => accountRosterImportDiff.rows.slice(0, 10), [accountRosterImportDiff.rows]);

  const clearRosterInput = () => {
    setAccountRosterText("");
    setAccountRosterImportKey((k) => k + 1);
    cancelRosterCsvImportPreview();
    setAccountGenError(null);
    setAccountGenMessage(null);
  };

  const clearGeneratedAccounts = () => {
    setGeneratedAccounts([]);
    setAccountMailCustomMessage("");
    setAccountMailError(null);
    setAccountMailResult(null);
  };

  const sendGeneratedAccountsByEmail = async () => {
    if (!contestId || !generatedAccounts.length) return;
    setAccountMailLoading(true);
    setAccountMailError(null);
    setAccountMailResult(null);
    try {
      const recipients = generatedAccounts
        .filter((a) => String(a.email ?? "").trim())
        .map((a) => ({
          fullName: String(a.fullName ?? a.username).trim(),
          email: String(a.email ?? "").trim(),
          username: a.username,
          password: a.password,
        }));

      if (!recipients.length) {
        setAccountMailError(tr("У згенерованих акаунтах немає email для розсилки", "No emails found in generated accounts"));
        return;
      }

      const r = await sendContestAccountsEmails(contestId, {
        recipients,
        includeContestInfo: true,
        customMessage: accountMailCustomMessage.trim() || undefined,
        locale: i18n.language.toLowerCase().startsWith("en") ? "en" : "uk",
      }, accountMailAttachments);

      setAccountMailResult(
        tr(
          `Надіслано: ${r.sentCount}, помилок: ${r.failedCount}`,
          `Sent: ${r.sentCount}, failed: ${r.failedCount}`
        )
      );
      if (r.failedCount === 0) setAccountMailAttachments([]);

      if (Array.isArray(r.failed) && r.failed.length > 0) {
        const preview = r.failed.slice(0, 5).map((f) => `${f.email}: ${f.reason}`).join("; ");
        setAccountMailError(
          tr(`Частина листів не надіслана: ${preview}`, `Some emails failed: ${preview}`)
        );
      }
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAccountMailError(msg || tr("Не вдалося надіслати листи", "Failed to send emails"));
    } finally {
      setAccountMailLoading(false);
    }
  };

  const copyGeneratedAccounts = async () => {
    if (!generatedAccountsCsv || typeof window === "undefined") return;
    try {
      await navigator.clipboard?.writeText(generatedAccountsCsv);
    } catch {
      // ignore clipboard errors
    }
  };

  const downloadGeneratedAccountsCsv = () => {
    if (!generatedAccountsCsv || typeof window === "undefined") return;
    const blob = new Blob(["\uFEFF", generatedAccountsCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contest-${contestId}-accounts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadGeneratedAccountsXlsx = async () => {
    if (!generatedAccounts.length || typeof window === "undefined") return;
    try {
      const XLSX = await import("@e965/xlsx");
      const worksheet = XLSX.utils.json_to_sheet(generatedAccounts.map((account) => ({
        "ПІБ": account.fullName ?? "",
        "Email": account.email ?? "",
        "Логін": account.username,
        "Пароль": account.password,
        "User ID": account.userId,
        "Participant ID": account.participantId,
      })));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Акаунти");
      const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `contest-${contestId}-accounts.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setAccountGenError(tr("Не вдалося створити файл XLSX", "Could not create the XLSX file"));
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
          <div className={`border border-border overflow-auto ${adminSubsFullPage ? "max-h-[42vh] sm:max-h-[calc(100vh-250px)]" : "max-h-[50vh] sm:max-h-[72vh]"}`}>
            <table className="min-w-[560px] md:min-w-[700px] w-full text-xs font-mono">
              <caption className="sr-only">{tr("Таблиця подач учасника", "Participant submissions table")}</caption>
              <thead className="bg-bg-hover sticky top-0">
                <tr>
                  <th className="hidden sm:table-cell p-2 border-b border-border text-left">#</th>
                  <th className="p-2 border-b border-border text-left">{tr("Час", "Time")}</th>
                  <th className="p-2 border-b border-border text-center">{tr("Задача", "Problem")}</th>
                  <th className="hidden md:table-cell p-2 border-b border-border text-center">{tr("Фаза", "Phase")}</th>
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
                    <td className="hidden sm:table-cell p-2 border-b border-border">{s.id}</td>
                    <td className="p-2 border-b border-border">{fmtDateTime(s.createdAt, i18n.language)}</td>
                    <td className="p-2 border-b border-border text-center">{s.problem?.label ?? "—"}</td>
                    <td className="hidden md:table-cell p-2 border-b border-border text-center">
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
                <div className={`border border-border overflow-hidden ${adminSubsFullPage ? "h-[48vh] sm:h-[56vh] md:h-[calc(100vh-280px)] min-h-[240px] md:min-h-[480px]" : "h-[42vh] sm:h-[54vh] md:h-[62vh] min-h-[220px] md:min-h-[420px]"}`}>
                  <CodeEditor
                    language={toCodeEditorLanguage(adminSubsCodeViewer.language)}
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

  const runSimilarityCheck = async (problemId: number | null) => {
    if (!contestId || !problemId) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await getContestSimilarity(contestId, problemId);
      setSimPairs(Array.isArray(res.pairs) ? res.pairs : []);
      setSimCompared(Number(res.comparedSubmissions ?? 0) || 0);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setSimError(msg || tr("Не вдалося обчислити схожість", "Failed to compute similarity"));
      setSimPairs([]);
      setSimCompared(null);
    } finally {
      setSimLoading(false);
    }
  };

  const toggleParticipantDisqualification = async (p: ContestAdminParticipant, options?: { retainParticipation: boolean; reason: string }) => {
    if (!contestId) return;
    if (!p.isDisqualified && !options) { setDisqualificationTarget(p); return; }
    try {
      const reason = options?.reason ?? null;

      const nextDisqualified = !p.isDisqualified;
      const response = await setContestParticipantDisqualified(contestId, p.id, {
        disqualified: !p.isDisqualified,
        retainParticipation: options?.retainParticipation ?? false,
        reason: p.isDisqualified ? null : (String(reason).trim() || null),
      });

      if (!nextDisqualified) {
        setAdminParticipantsActionTone("success");
        setAdminParticipantsActionMessage(
          tr(
            `Учасника ${p.displayName} повернуто до заліку.`,
            `Participant ${p.displayName} has been restored.`
          )
        );
      } else {
        const n = response?.notification;
        if (n?.sent && n.recipientEmail) {
          setAdminParticipantsActionTone("success");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано. Лист надіслано: ${n.recipientEmail}.`,
              `Participant ${p.displayName} disqualified. Email sent to: ${n.recipientEmail}.`
            )
          );
        } else if (n?.reason === "EMAIL_NOT_AVAILABLE") {
          setAdminParticipantsActionTone("warn");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано, але email для сповіщення відсутній.`,
              `Participant ${p.displayName} disqualified, but no email is available for notification.`
            )
          );
        } else if (n?.reason === "EMAIL_SEND_FAILED") {
          setAdminParticipantsActionTone("warn");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано, але лист не вдалося надіслати.`,
              `Participant ${p.displayName} disqualified, but email sending failed.`
            )
          );
        } else {
          setAdminParticipantsActionTone("warn");
          setAdminParticipantsActionMessage(
            tr(
              `Учасника ${p.displayName} дискваліфіковано. Статус сповіщення невідомий.`,
              `Participant ${p.displayName} disqualified. Notification status is unknown.`
            )
          );
        }
      }

      setDisqualificationTarget(null);
      await loadAdminParticipants();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setAdminParticipantsActionTone("error");
      setAdminParticipantsActionMessage(msg || tr("Не вдалося змінити статус дискваліфікації", "Failed to update disqualification status"));
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || tr("Невірний код", "Invalid code"));
    } finally {
      setJoining(false);
    }
  };

  const togglePublished = async () => {
    if (!contestId || !data?.access?.canManage) return;
    setPublishing(true);
    try {
      await updateContest(contestId, { isPublished: !data.contest.isPublished });
      await load();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || tr("Не вдалося оновити публікацію", "Failed to update publication status"));
    } finally {
      setPublishing(false);
    }
  };

  React.useEffect(() => {
    if (tab !== "management" || !data?.access.canManage || !data.contest) return;
    setSettingsError(null);
    setSettingsTitle(String(data.contest.title ?? ""));
    setSettingsDescription(String(data.contest.description ?? ""));
    setSettingsTags(Array.isArray(data.contest.tags) ? data.contest.tags.join(", ") : "");
    setSettingsDifficulty(data.contest.difficulty ?? "");
    setSettingsStartsAt(toDateTimeLocalInput(data.contest.startsAt));
    setSettingsEndsAt(toDateTimeLocalInput(data.contest.endsAt));
    setSettingsAllowUpsolve(Boolean(data.contest.allowUpsolve));
    setSettingsSafetyAlertsEnabled(Boolean(data.contest.safetyAlertsEnabled));
    setSettingsSafetyRedLocationUid(data.contest.safetyRedLocationUid ? String(data.contest.safetyRedLocationUid) : "");
    setSettingsSafetyRedLockMode(data.contest.safetyRedLockMode ?? "PAUSE_10_MIN");
    setSettingsScoringMode(data.contest.scoringMode === "ICPC" ? "ICPC" : "IOI");
    setSettingsVisibility(data.contest.visibility ?? "PUBLIC");
    setSettingsJoinCode("");
    setSettingsClassId(data.contest.classId ? String(data.contest.classId) : "");
    setSettingsIcon(data.contest.icon || "🏆");
    setSettingsIconImageUrl(data.contest.iconImageUrl ?? null);
    setSettingsBannerTheme(data.contest.bannerTheme || "forest");
    setSettingsBannerImageUrl(data.contest.bannerImageUrl ?? null);
    setSettingsScoreboardVisibility(data.contest.scoreboardVisibility || "LIVE");
    setSettingsParticipantAccessMode(data.contest.participantAccessMode || "SELF_REGISTRATION");
    setSettingsClassesError(null);
  }, [tab, data?.access.canManage, data?.contest]);

  React.useEffect(() => {
    if (!contestId || tab !== "management" || !data?.access.canManage) return;
    let active = true;
    setSettingsSafetyLocationsLoading(true);
    getContestSafetyState(contestId)
      .then((result) => { if (active) setSettingsSafetyState(result); })
      .catch(() => { if (active) setSettingsSafetyState(null); })
      .finally(() => { if (active) setSettingsSafetyLocationsLoading(false); });
    return () => { active = false; };
  }, [tab, contestId, data?.access.canManage]);

  React.useEffect(() => {
    if (tab !== "management" || settingsVisibility !== "CLASS") return;
    let active = true;
    setSettingsClassesLoading(true);
    setSettingsClassesError(null);
    getClasses()
      .then((items) => { if (active) setSettingsClasses(Array.isArray(items) ? items : []); })
      .catch((e: unknown) => {
        if (active) setSettingsClassesError(getErrorMessage(e) || tr("Не вдалося завантажити список класів", "Could not load classes"));
      })
      .finally(() => { if (active) setSettingsClassesLoading(false); });
    return () => { active = false; };
  }, [tab, settingsVisibility, settingsClassesRetry, tr]);

  const saveContestSettings = async () => {
    if (!contestId || !data?.access?.canManage) return;
    const title = settingsTitle.trim();
    if (title.length < 3) {
      setSettingsError(tr("Назва контесту занадто коротка", "Contest title is too short"));
      return;
    }

    if (settingsVisibility === "PRIVATE_CODE" && settingsJoinCode.trim().length > 0 && settingsJoinCode.trim().length < 4) {
      setSettingsError(tr("Код має містити щонайменше 4 символи", "Join code must contain at least 4 characters"));
      return;
    }
    if (settingsVisibility === "PRIVATE_CODE" && data.contest.visibility !== "PRIVATE_CODE" && settingsJoinCode.trim().length < 4) {
      setSettingsError(tr("Вкажи код для приватного контесту", "Enter a code for a private contest"));
      return;
    }
    if (settingsVisibility === "CLASS" && (!Number.isSafeInteger(Number(settingsClassId)) || Number(settingsClassId) <= 0)) {
      setSettingsError(tr("Оберіть клас для контесту", "Select a class for the contest"));
      return;
    }

    const tags = Array.from(new Set(settingsTags.split(",").map((tag) => tag.trim()).filter(Boolean)));
    if (tags.length > 8 || tags.some((tag) => tag.length > 32)) {
      setSettingsError(tr("Додай не більше 8 тегів, кожен до 32 символів", "Use at most 8 tags, each up to 32 characters"));
      return;
    }

    const startsAtIso = fromDateTimeLocalInput(settingsStartsAt);
    const endsAtIso = fromDateTimeLocalInput(settingsEndsAt);
    if (settingsScoreboardVisibility === "AFTER_END" && !endsAtIso) {
      setSettingsError(tr("Задай час фінішу, щоб відкрити таблицю після завершення", "Set an end time to reveal the scoreboard after the contest"));
      return;
    }
    if (startsAtIso && endsAtIso && new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
      setSettingsError(tr("Завершення має бути пізніше за старт", "End must be after the start"));
      return;
    }

    setSettingsSaving(true);
    setSettingsSaved(false);
    setSettingsError(null);
    try {
      await updateContest(contestId, {
        title,
        description: settingsDescription.trim() ? settingsDescription.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        tags,
        difficulty: settingsDifficulty || null,
        visibility: settingsVisibility,
        ...(settingsVisibility === "PRIVATE_CODE" && settingsJoinCode.trim() ? { joinCode: settingsJoinCode.trim() } : {}),
        ...(settingsVisibility === "CLASS" ? { classId: Number(settingsClassId) } : {}),
        allowUpsolve: settingsAllowUpsolve,
        safetyAlertsEnabled: settingsSafetyAlertsEnabled,
        safetyRedLocationUid: settingsSafetyRedLocationUid ? Number(settingsSafetyRedLocationUid) : null,
        safetyRedLockMode: settingsSafetyRedLockMode,
        scoringMode: settingsScoringMode,
        icon: settingsIcon,
        iconImageUrl: settingsIconImageUrl,
        bannerTheme: settingsBannerTheme,
        bannerImageUrl: settingsBannerImageUrl,
        scoreboardVisibility: settingsScoreboardVisibility,
        participantAccessMode: settingsVisibility === "TEMPORARY_ACCOUNTS" ? "ISSUED_ACCOUNTS" : settingsParticipantAccessMode,
      });
      await load();
      setSettingsSaved(true);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setSettingsError(msg || tr("Не вдалося зберегти налаштування контесту", "Failed to save contest settings"));
    } finally {
      setSettingsSaving(false);
    }
  };

  const setOrganizerSafetyLock = async (locked: boolean) => {
    if (!contestId || !data?.access?.canManage || settingsSafetyLockSaving) return;
    setSettingsSafetyLockSaving(true);
    try {
      await setContestOrganizerSafetyLock(contestId, locked);
      setData((current) => current ? {
        ...current,
        contest: { ...current.contest, safetyManualLocked: locked },
      } : current);
      setSettingsSafetyState((current) => current ? { ...current, manualLockActive: locked } : current);
      toast.success(locked
        ? tr("Доступ учасників призупинено", "Participant access paused")
        : tr("Доступ учасників відновлено", "Participant access restored"));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || tr("Не вдалося змінити блокування", "Could not update the participant lock"));
    } finally {
      setSettingsSafetyLockSaving(false);
    }
  };

  const uploadContestBanner = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setSettingsError(tr("Додай PNG, JPG, WebP або AVIF до 8 МБ", "Use PNG, JPG, WebP, or AVIF up to 8 MB"));
      return;
    }
    setSettingsBannerUploading(true);
    setSettingsError(null);
    try {
      const uploaded = await uploadStatementImage(file);
      setSettingsSaved(false);
      setSettingsBannerImageUrl(uploaded.url);
    } catch (e: unknown) {
      setSettingsError(getErrorMessage(e) || tr("Не вдалося завантажити банер", "Could not upload banner"));
    } finally {
      setSettingsBannerUploading(false);
    }
  };

  const uploadContestIcon = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setSettingsError(tr("Додай PNG, JPG, WebP або AVIF до 8 МБ", "Use PNG, JPG, WebP, or AVIF up to 8 MB"));
      return;
    }
    setSettingsIconUploading(true);
    setSettingsError(null);
    try {
      const uploaded = await uploadStatementImage(file);
      setSettingsSaved(false);
      setSettingsIconImageUrl(uploaded.url);
    } catch (e: unknown) {
      setSettingsError(getErrorMessage(e) || tr("Не вдалося завантажити іконку", "Could not upload the icon"));
    } finally {
      setSettingsIconUploading(false);
    }
  };

  React.useEffect(() => {
    if (!contestId || !data) return;
    if (requestedSection === "standings") {
      const preserved = new URLSearchParams(searchParams);
      preserved.delete("tab");
      const query = preserved.toString();
      navigate(`/contest/contests/${contestId}/scoreboard${query ? `?${query}` : ""}`, { replace: true });
      return;
    }
    if (!data.access.canManage && ["accounts", "participants", "certificates", "management"].includes(tab)) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [contestId, data, navigate, requestedSection, searchParams, setSearchParams, tab]);

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
    setArchiveFiles([]);
    setArchiveImportResult(null);
    setArchiveDropActive(false);
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
    if (!archiveFiles.length) {
      setAddError(tr("Додай хоча б один ZIP-архів", "Add at least one ZIP archive"));
      return;
    }
    setImportingArchive(true);
    setAddError(null);
    setArchiveImportResult(null);
    try {
      const imported = await importLibraryTaskArchives(archiveFiles, { hideFromLibrary: true });
      const tasks = imported.tasks?.length ? imported.tasks : imported.task ? [imported.task] : [];
      const failures = (imported.failures ?? []).map((failure) => ({ name: failure.source, message: failure.message }));
      const attached: string[] = [];
      for (const task of tasks) {
        const taskId = Number(task?.id);
        if (!Number.isFinite(taskId) || taskId <= 0) {
          failures.push({ name: task?.title || tr("Невідома задача", "Unknown problem"), message: tr("Сервер не повернув ID задачі", "The server did not return a task ID") });
          continue;
        }
        try {
          await addContestProblem(contestId, { mode: "COPY", libraryTaskId: taskId });
          attached.push(String(task.title || `#${taskId}`));
        } catch (error: unknown) {
          failures.push({ name: String(task.title || `#${taskId}`), message: getErrorMessage(error) || tr("Не вдалося додати задачу до контесту", "Could not add the problem to the contest") });
        }
      }
      setArchiveImportResult({ attached, failures });
      setArchiveFiles([]);
      if (attached.length) {
        await load();
        if (tab === "problems") loadProgress();
      }
      if (!attached.length && !failures.length) {
        setAddError(tr("В архівах не знайдено задач для імпорту", "No problems were found in the selected archives"));
      }
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
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

  React.useEffect(() => {
    if (!manageOpen || focusedProblemSettingsId == null) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-contest-problem-settings="${focusedProblemSettingsId}"]`)?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [manageOpen, focusedProblemSettingsId]);

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
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setProblemSettingsError(msg || tr("Не вдалося зберегти налаштування задачі", "Failed to save problem settings"));
    } finally {
      setSavingProblemSettingsId(null);
    }
  };

  const removeContestProblem = async (problemId: number, title: string) => {
    if (!contestId || deletingContestProblemId != null) return;
    const confirmed = window.confirm(tr(
      `Видалити задачу «${title}» з контесту? Усі її подачі й результати також буде видалено.`,
      `Remove “${title}” from the contest? All submissions and results for it will also be deleted.`
    ));
    if (!confirmed) return;

    setDeletingContestProblemId(problemId);
    setProblemSettingsError(null);
    try {
      await deleteContestProblem(contestId, problemId);
      setProblemSettingsDraft((current) => {
        const next = { ...current };
        delete next[problemId];
        return next;
      });
      setData((current) => current ? { ...current, problems: current.problems.filter((problem) => problem.id !== problemId) } : current);
      load();
      if (tab === "problems") loadProgress();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setProblemSettingsError(msg || tr("Не вдалося видалити задачу з контесту", "Failed to remove the problem from the contest"));
    } finally {
      setDeletingContestProblemId(null);
    }
  };

  return (
    <div data-contest-safety-background="" className="contest-page-shell">
      {data?.contest.id === contestId && data.access.isJoined && !data.access.canManage
        ? <ContestSafetyGate contestId={contestId} onUnlocked={() => load()} />
        : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/contest/contests" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {tr("Контести", "Contests")}
        </Link>
        {data?.access.canManage ? <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{tr("Організатор", "Organizer")}</span> : null}
      </div>

      <Modal
        open={addOpen}
        onClose={() => {
          if (importingArchive) return;
          setAddOpen(false);
          setAddError(null);
        }}
        closable={!importingArchive}
        title={tr("Додати задачу", "Add problem")}
      >
        <div className="space-y-4">
          {addError ? <div className="text-sm text-accent-error">{addError}</div> : null}

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-base/50 p-1">
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
                  <div role="status" aria-live="polite" className="p-3 text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</div>
                ) : copyItems.length === 0 ? (
                  <div className="p-3 text-sm text-text-secondary">{tr("Задачі не знайдено", "No tasks found")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {copyItems.map((t) => (
                      <button type="button"
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
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-bg-surface/60 p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-primary/10 text-accent-primary"><Archive className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-text-primary">{tr("Пакетний імпорт задач", "Bulk problem import")}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">{tr("Завантаж один ZIP із ZIP-архівами задач усередині або вибери кілька архівів задач окремо.", "Upload one ZIP containing task ZIPs, or select several task archives at once.")}</p>
                  </div>
                </div>
                <input
                  id="contest-task-archives"
                  type="file"
                  accept=".zip,application/zip"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const selected = Array.from(event.currentTarget.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".zip"));
                    setArchiveFiles((current) => [...current, ...selected].filter((file, index, all) => all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index));
                    setArchiveImportResult(null);
                    setAddError(null);
                    event.currentTarget.value = "";
                  }}
                />
                <label
                  htmlFor="contest-task-archives"
                  onDragOver={(event) => { event.preventDefault(); setArchiveDropActive(true); }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setArchiveDropActive(false); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setArchiveDropActive(false);
                    const selected = Array.from(event.dataTransfer.files).filter((file) => file.name.toLowerCase().endsWith(".zip"));
                    setArchiveFiles((current) => [...current, ...selected].filter((file, index, all) => all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index));
                    setArchiveImportResult(null);
                    setAddError(null);
                  }}
                  className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-6 text-center transition-colors ${archiveDropActive ? "border-accent-primary bg-accent-primary/10" : "border-border bg-bg-base/40 hover:border-accent-primary/60 hover:bg-bg-hover/50"}`}
                >
                  <Upload className="mb-2 h-6 w-6 text-accent-primary" />
                  <span className="font-semibold text-text-primary">{tr("Перетягни ZIP сюди або вибери файли", "Drop ZIP files here or browse")}</span>
                  <span className="mt-1 text-xs text-text-secondary">{tr("Можна додати кілька архівів за раз", "You can add multiple archives at once")}</span>
                </label>
                {archiveFiles.length ? (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-text-primary">{tr("Вибрано архівів", "Selected archives")} <span className="text-accent-primary">{archiveFiles.length}</span></span>
                      <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-bg-hover hover:text-text-primary" onClick={() => { setArchiveFiles([]); setArchiveImportResult(null); }}>{tr("Очистити список", "Clear list")}</button>
                    </div>
                    <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {archiveFiles.map((file, index) => (
                        <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 rounded-xl border border-border bg-bg-base/40 px-3 py-2.5">
                          <FileArchive className="h-4 w-4 shrink-0 text-text-secondary" />
                          <span className="min-w-0 flex-1 truncate text-sm text-text-primary" title={file.name}>{file.name}</span>
                          <span className="shrink-0 text-xs text-text-muted">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}</span>
                          <button type="button" aria-label={tr(`Видалити ${file.name}`, `Remove ${file.name}`)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary" onClick={() => { setArchiveFiles((current) => current.filter((_, itemIndex) => itemIndex !== index)); setArchiveImportResult(null); }}><X className="h-4 w-4" /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-text-muted">{tr("Задачі імпортуються як чернетки, одразу додаються до цього контесту та не публікуються в загальній бібліотеці.", "Problems are imported as drafts, attached to this contest, and kept out of the public library.")}</p>
              </div>
              {archiveImportResult ? (
                <div className="space-y-3 rounded-xl border border-border bg-bg-base/40 p-4" aria-live="polite">
                  {archiveImportResult.attached.length ? <div className="flex items-center gap-2 font-semibold text-accent-primary"><Check className="h-4 w-4" />{tr(`Додано задач: ${archiveImportResult.attached.length}`, `Problems added: ${archiveImportResult.attached.length}`)}</div> : null}
                  {archiveImportResult.attached.length ? <ul className="max-h-32 space-y-1 overflow-y-auto pl-6 text-sm text-text-secondary">{archiveImportResult.attached.map((name, index) => <li key={`${name}-${index}`} className="list-disc">{name}</li>)}</ul> : null}
                  {archiveImportResult.failures.length ? <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex items-center gap-2 font-semibold text-accent-error"><AlertCircle className="h-4 w-4" />{tr(`Не вдалося додати: ${archiveImportResult.failures.length}`, `Could not add: ${archiveImportResult.failures.length}`)}</div>
                    <ul className="max-h-36 space-y-2 overflow-y-auto">{archiveImportResult.failures.map((failure, index) => <li key={`${failure.name}-${index}`} className="rounded-lg border border-accent-error/30 px-3 py-2 text-sm"><span className="block break-all font-medium text-text-primary">{failure.name}</span><span className="text-xs text-text-secondary">{failure.message}</span></li>)}</ul>
                  </div> : null}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => { if (importingArchive) return; setAddOpen(false); }} disabled={adding || importingArchive}>
              {addMode === "IMPORT" ? tr("Закрити", "Close") : tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={() => {
              if (addMode === "IMPORT" && archiveImportResult) {
                setAddOpen(false);
                resetAddForm();
                return;
              }
              return addMode === "IMPORT" ? importArchiveAndAttach() : submitAddProblem();
            }} disabled={adding || importingArchive || (addMode === "IMPORT" && !archiveImportResult && archiveFiles.length === 0)}>
              {addMode === "IMPORT" ? importingArchive ? tr("Імпорт і додавання…", "Importing and adding…") : archiveImportResult ? tr("Готово", "Done") : tr("Імпортувати й додати", "Import and add") : adding ? tr("Додавання…", "Adding…") : tr("Додати", "Add")}
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
              <table className="min-w-[620px] md:min-w-[760px] w-full text-xs sm:text-sm font-mono">
                <caption className="sr-only">
                  {tr("Налаштування задач контесту", "Contest problem settings")}
                </caption>
                <thead className="bg-bg-hover">
                  <tr>
                    <th className="hidden md:table-cell p-2 border-b border-border text-left">ID</th>
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
                    const deletingThis = deletingContestProblemId === p.id;
                    return (
                      <tr
                        key={p.id}
                        data-contest-problem-settings={p.id}
                        className={`${focusedProblemSettingsId === p.id ? "bg-primary/10" : "odd:bg-bg-base even:bg-bg-surface"}`}
                      >
                        <td className="hidden md:table-cell p-2 border-b border-border">{p.id}</td>
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
                          <div className="flex items-center justify-end gap-1">
                          <Button variant="secondary" onClick={() => saveProblemSettings(p.id)} disabled={savingThis}>
                            {savingThis ? tr("Збереження…", "Saving…") : tr("Зберегти", "Save")}
                          </Button>
                          <button type="button" onClick={() => void removeContestProblem(p.id, p.title)} disabled={deletingContestProblemId != null || savingProblemSettingsId != null} aria-label={tr(`Видалити задачу ${p.title}`, `Delete problem ${p.title}`)} title={tr("Видалити задачу й подачі", "Delete problem and submissions")} className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-accent-error transition-colors hover:bg-accent-error/10 disabled:opacity-50">{deletingThis ? <RefreshCw aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}</button>
                          </div>
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
        open={deleteContestOpen}
        onClose={() => {
          if (deleteContestLoading) return;
          setDeleteContestOpen(false);
          setDeleteContestConfirmation("");
          setDeleteContestError(null);
        }}
        title={tr("Видалити контест назавжди?", "Delete this contest permanently?")}
        description={tr("Цю дію не можна скасувати. Для підтвердження введи точну назву контесту.", "This action cannot be undone. Type the exact contest title to confirm.")}
      >
        <div className="space-y-4">
          {deleteContestError ? <div role="alert" className="rounded-lg border border-accent-error/30 bg-accent-error/10 p-3 text-sm text-accent-error">{deleteContestError}</div> : null}
          <div className="rounded-xl border border-accent-error/25 bg-accent-error/[.04] p-3 text-sm leading-6 text-text-secondary">
            {tr("Буде видалено задачі контесту, всі подачі й результати, спільноту, сертифікати та видані тільки для цього контесту акаунти.", "Contest problems, submissions and results, community posts, certificates, and accounts issued only for this contest will be deleted.")}
          </div>
          <Input
            label={tr(`Назва контесту: ${data?.contest.title ?? ""}`, `Contest title: ${data?.contest.title ?? ""}`)}
            value={deleteContestConfirmation}
            onChange={(event) => setDeleteContestConfirmation(event.target.value)}
            autoComplete="off"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteContestOpen(false)} disabled={deleteContestLoading}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDeleteContest()}
              disabled={deleteContestLoading || !data || deleteContestConfirmation !== data.contest.title}
            >
              <Trash2 aria-hidden="true" className="mr-2 size-4" />
              {deleteContestLoading ? tr("Видаляю…", "Deleting…") : tr("Видалити назавжди", "Delete permanently")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={accountRosterImportPreviewOpen}
        onClose={cancelRosterCsvImportPreview}
        title={tr("Перевірка таблиці перед імпортом", "Spreadsheet import preview")}
      >
        <div className="space-y-3">
          <div className="text-xs text-text-secondary">
            {accountRosterImportFileName
              ? tr(`Файл: ${accountRosterImportFileName}`, `File: ${accountRosterImportFileName}`)
              : tr("Файл таблиці", "Spreadsheet file")}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs font-mono">
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Валідні рядки", "Valid rows")}</div>
              <div className="text-text-primary">{accountRosterImportEntries.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Нові до імпорту", "New to import")}</div>
              <div className="text-accent-success">{accountRosterImportDiff.newCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Вже в ростері", "Already in roster")}</div>
              <div className="text-accent-warn">{accountRosterImportDiff.existingCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Невалідні рядки", "Invalid rows")}</div>
              <div className="text-text-primary">{accountRosterImportInvalidLines.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-text-secondary">{tr("Дублікати email", "Duplicate emails")}</div>
              <div className="text-text-primary">{accountRosterImportDuplicateEmails.length}</div>
            </div>
          </div>

          {accountRosterImportInvalidLines.length > 0 ? (
            <div className="text-xs text-accent-error">
              {tr(
                `Пропущені рядки (перші 4): ${accountRosterImportInvalidLines.slice(0, 4).join(" | ")}`,
                `Skipped rows (first 4): ${accountRosterImportInvalidLines.slice(0, 4).join(" | ")}`
              )}
            </div>
          ) : null}

          {accountRosterImportDuplicateEmails.length > 0 ? (
            <div className="text-xs text-accent-warn">
              {tr(
                `Повтори email (перші 6): ${accountRosterImportDuplicateEmails.slice(0, 6).join(", ")}`,
                `Duplicate emails (first 6): ${accountRosterImportDuplicateEmails.slice(0, 6).join(", ")}`
              )}
            </div>
          ) : null}

          <div className="border border-border bg-bg-surface/60 rounded-lg overflow-auto max-h-[240px]">
            <table className="min-w-[560px] w-full text-xs font-mono">
              <thead className="bg-bg-hover">
                <tr>
                  <th className="p-2 border-b border-border text-left">{tr("ПІБ", "Full name")}</th>
                  <th className="p-2 border-b border-border text-left">email</th>
                  <th className="p-2 border-b border-border text-left">{tr("Статус", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {accountRosterImportPreviewRows.map((row, idx) => (
                  <tr key={`${row.email}-${idx}`} className="odd:bg-bg-base even:bg-bg-surface">
                    <td className="p-2 border-b border-border">{row.fullName}</td>
                    <td className="p-2 border-b border-border">{row.email}</td>
                    <td className="p-2 border-b border-border">
                      {row.isDuplicateInImport ? (
                        <span className="inline-flex items-center rounded px-2 py-0.5 border border-accent-warn/60 bg-accent-warn/10 text-accent-warn">
                          {tr("Дубль у таблиці", "Duplicate in table")}
                        </span>
                      ) : row.isExisting ? (
                        <span className="inline-flex items-center rounded px-2 py-0.5 border border-primary/50 bg-primary/10 text-primary">
                          {tr("Вже є", "Existing")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded px-2 py-0.5 border border-accent-success/60 bg-accent-success/10 text-accent-success">
                          {tr("Новий", "New")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {accountRosterImportEntries.length > accountRosterImportPreviewRows.length ? (
              <div className="px-2 py-1 text-[11px] text-text-secondary border-t border-border">
                {tr(
                  `Показано ${accountRosterImportPreviewRows.length} з ${accountRosterImportEntries.length}`,
                  `Showing ${accountRosterImportPreviewRows.length} of ${accountRosterImportEntries.length}`
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={cancelRosterCsvImportPreview}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={applyRosterCsvImportPreview} disabled={!accountRosterImportDiff.uniqueImportCount}>
              {tr("Імпортувати в список", "Import to roster")}
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
        <div className="contest-manager-content space-y-4">
          {data.access.canManage ? (
            <header className="contest-manager-header">
              <div className="contest-manager-header__main">
                <span aria-hidden="true" className="contest-manager-header__icon">{data.contest.iconImageUrl ? <img src={data.contest.iconImageUrl} alt="" width={56} height={56} className="size-full object-cover" /> : data.contest.icon || "🏆"}</span>
                <div className="min-w-0">
                  <p className="contest-manager-header__eyebrow">{tr("Панель організатора", "Organizer workspace")}</p>
                  <h1>{data.contest.title}</h1>
                  <p className="contest-manager-header__meta">{fmtDateTime(data.contest.startsAt, i18n.language)} <span aria-hidden="true">→</span> {fmtDateTime(data.contest.endsAt, i18n.language)}</p>
                </div>
              </div>
              <div className="contest-manager-header__aside">
                {(() => {
                  const chip = contestPhaseChip({ started: data.phase.started, finished: data.phase.finished, paused: !!data.access.isPaused, tr });
                  return <StatusChip glyph={chip.glyph} label={chip.label} tone={chip.tone} />;
                })()}
                <span className="contest-manager-header__status">{data.contest.isPublished ? tr("Опубліковано", "Published") : tr("Чернетка", "Draft")}</span>
                <Link to={`/contest/contests/${contestId}`} className="contest-manager-header__preview">{tr("Переглянути як учасник", "View contest page")} <ArrowLeft aria-hidden="true" className="size-4 rotate-180" /></Link>
              </div>
            </header>
          ) : <Card className="contest-hero-card overflow-hidden border p-0">
            {data.contest.bannerImageUrl ? (
              <div className="contest-hero-card__image-wrap" aria-hidden="true">
                <img
                  src={data.contest.bannerImageUrl}
                  alt=""
                  aria-hidden="true"
                  width={1200}
                  height={360}
                  fetchPriority="high"
                  className="contest-hero-card__image"
                />
              </div>
            ) : null}
            <div className="contest-hero-card__content">
            {/* Hero heading */}
            <div className="space-y-1.5">
              <PageEyebrow label={tr("Контест", "Contest")} />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h1 className="flex min-w-0 flex-1 items-center gap-3 break-words text-3xl font-bold leading-tight tracking-tight text-text-primary md:text-4xl [text-wrap:balance]">
                  <span aria-hidden="true" className="contest-hero-icon grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl text-2xl">{data.contest.iconImageUrl ? <img src={data.contest.iconImageUrl} alt="" width={44} height={44} fetchPriority="high" className="size-full object-cover" /> : data.contest.icon || "🏆"}</span>{data.contest.title}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  {(() => {
                    const chip = contestPhaseChip({
                      started: data.phase.started,
                      finished: data.phase.finished,
                      paused: !!data.access.isPaused,
                      tr,
                    });
                    return <StatusChip glyph={chip.glyph} label={chip.label} tone={chip.tone} />;
                  })()}
                  {data.contest.visibility === "PUBLIC" ? <Badge color="info">Public</Badge> : data.contest.visibility === "PRIVATE_CODE" ? <Badge color="warn">{tr("За кодом", "Code")}</Badge> : data.contest.visibility === "TEMPORARY_ACCOUNTS" ? <Badge color="warn">{tr("Лише тимчасовий доступ", "Temporary access only")}</Badge> : <Badge color="info">Class</Badge>}
                  {data.contest.isPublished ? <Badge color="success">{tr("Опубліковано", "Published")}</Badge> : <Badge color="warn">{tr("Чернетка", "Draft")}</Badge>}
                  {data.contest.allowUpsolve ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : null}
                </div>
              </div>
            </div>

            <div className="contest-hero-stats" aria-label={tr("Коротко про контест", "Contest overview")}>
              <div className="contest-hero-stat">
                <div className="contest-hero-stat__label">{tr("Підрахунок", "Scoring")}</div>
                <div className="contest-hero-stat__value">{data.contest.scoringMode === "ICPC" ? tr("ICPC · задачі та штраф", "ICPC · solved and penalty") : tr("IOI · бали за задачі", "IOI · points per problem")}</div>
              </div>
              <div className="contest-hero-stat">
                <div className="contest-hero-stat__label">{tr("Учасники", "Participants")}</div>
                <div className="contest-hero-stat__value contest-hero-stat__value--number">{data.participantsCount}</div>
              </div>
              <div className="contest-hero-stat">
                <div className="contest-hero-stat__label">{tr("Задачі", "Problems")}</div>
                <div className="contest-hero-stat__value contest-hero-stat__value--number">{data.problems.length}</div>
              </div>
            </div>

            <div className="contest-hero-schedule">
              <span><span className="contest-hero-schedule__label">{tr("Старт", "Start")}</span>{fmtDateTime(data.contest.startsAt, i18n.language)}</span>
              <span aria-hidden="true" className="contest-hero-schedule__separator" />
              <span><span className="contest-hero-schedule__label">{tr("Фініш", "End")}</span>{fmtDateTime(data.contest.endsAt, i18n.language)}</span>
            </div>

            {data.phase.finished && data.contest.allowUpsolve ? (
              <div className="mt-3 text-sm text-text-secondary">
                {tr(
                  "Контест завершено. Режим дорішування увімкнено — можете продовжувати відправляти розв’язки, але таблиця не зміниться.",
                  "Contest is finished. Upsolving is enabled — you can still submit, but standings won’t change."
                )}
              </div>
            ) : null}

            {data.access.joinRequired && data.access.accountRequired ? (
              <div className="mt-4 flex items-start gap-3 border border-border bg-bg-base p-3 text-sm text-text-secondary">
                <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span><span className="block font-semibold text-text-primary">{tr("Потрібен виданий доступ", "Issued access required")}</span>{tr("Використай дані для входу, які надав організатор. Самостійна реєстрація недоступна.", "Use the sign-in details provided by the organizer. Self-registration is unavailable.")}</span>
              </div>
            ) : data.access.joinRequired ? (
              <div className="mt-4 border border-border bg-bg-base p-3">
                <div className="flex items-center gap-2 mb-2 text-sm font-mono text-text-primary">
                  <KeyRound className="w-4 h-4" />
                  {tr("Потрібен код доступу", "Join code required")}
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    id="contest-join-code"
                    name="joinCode"
                    type="text"
                    autoComplete="off"
                    aria-label={tr("Код доступу до контесту", "Contest join code")}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="flex-1 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                    placeholder={tr("Введіть код…", "Enter code…")}
                  />
                  <Button onClick={onJoin} disabled={joining || !joinCode.trim()}>
                    {joining ? tr("Приєднання…", "Joining…") : tr("Приєднатися", "Join")}
                  </Button>
                </div>
                <div className="text-xs text-text-secondary mt-2">
                  {tr("Після приєднання відкриються задачі та таблиця.", "After joining you will see problems and standings.")}
                </div>
              </div>
            ) : null}

            {data.contest.description ? (
              <details className="mt-4 rounded-xl border border-border bg-bg-base/50 px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Опис і правила", "Description and rules")}</summary>
                <div className="mt-3"><MarkdownView content={data.contest.description} /></div>
              </details>
            ) : null}
            </div>
          </Card>}

          {contestId ? <ContestSectionNav contestId={contestId} active={tab} canManage={!!data.access.canManage} /> : null}

          {tab === "problems" ? (
            <>
              <Card className="contest-problems-card border border-border/70 bg-bg-surface/80">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-text-primary">{tr("Задачі", "Problems")}</h2>
                  <p className="mt-1 text-sm text-text-secondary">{tr("Відкрий задачу або переглянь останній результат.", "Open a problem or review your latest result.")}</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
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
                    <Skeleton key={i} className="h-[84px] w-full rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="contest-problem-list" role="list" aria-label={tr("Задачі контесту", "Contest problems")}>
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
                        const isSolved = pr != null && pr.maxScore != null && pr.bestContestScore >= pr.maxScore;
                        const isAttempted = pr?.last != null && !isSolved;

                        return (
                          <article key={p.id} role="listitem" className={`contest-problem-row${isSolved ? " is-solved" : isAttempted ? " is-attempted" : ""}`}>
                            <div className="contest-problem-row__identity">
                              <span className="contest-problem-row__letter">{p.label}</span>
                              <div className="min-w-0">
                                <h3 className="contest-problem-row__title" title={p.title}>{p.title}</h3>
                                <div className="contest-problem-row__subtitle">
                                  <span>{p.points != null ? `${p.points} ${tr("балів", "pts")}` : tr("без окремої ваги", "unweighted")}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{isSolved ? tr("Розв’язано", "Solved") : isAttempted ? tr("Є спроба", "Attempted") : tr("Ще не розпочато", "Not started")}</span>
                                </div>
                              </div>
                            </div>

                            <div className="contest-problem-row__best">
                              <span>{tr("Найкращий результат", "Best result")}</span>
                              <strong>{bestText}</strong>
                            </div>

                            <div className="contest-problem-row__last">
                              <span>{tr("Остання подача", "Latest submission")}</span>
                              {last ? (
                                <div className="contest-problem-row__verdict">
                                  {(() => {
                                    const v = verdictChip(last.verdict, tr);
                                    return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} size="sm" />;
                                  })()}
                                  {(() => {
                                    const phase = submissionPhaseChip(last.phase, tr);
                                    return <StatusChip glyph={phase.glyph} label={phase.label} tone={phase.tone} size="sm" />;
                                  })()}
                                  <span className="tabular-nums">{lastScoreText}</span>
                                </div>
                              ) : <strong className="contest-problem-row__empty">{tr("Подач поки немає", "No submissions yet")}</strong>}
                              {last?.createdAt ? <time className="contest-problem-row__time" dateTime={last.createdAt}>{fmtDateTime(last.createdAt, i18n.language)}</time> : null}
                            </div>

                            <div className="contest-problem-row__actions">
                                {hasToken && data.access.canManage ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFocusedProblemSettingsId(p.id);
                                      setManageOpen(true);
                                    }}
                                    className="contest-problem-row__edit"
                                    title={tr("Налаштувати задачу в контесті", "Configure this contest problem")}
                                  >
                                    {tr("Налаштувати", "Settings")}
                                  </button>
                                ) : null}
                                {disabled ? (
                                  <span className="contest-problem-row__disabled">{tr("Недоступна", "Unavailable")}</span>
                                ) : (
                                  <Link to={`/contest/contests/${data.contest.id}/problems/${p.id}`} className="contest-problem-row__open">
                                    {tr("До задачі", "Open problem")} <span aria-hidden="true">→</span>
                                  </Link>
                                )}
                            </div>
                          </article>
                        );
                  })}

                  <div className="contest-problem-note">
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
          ) : ["standings", "accounts", "participants", "certificates", "management"].includes(tab) ? (
            <div className="space-y-4">
              {hasToken && data.access.canManage ? (
                <>
                  {tab === "certificates" ? <ContestCertificatesPanel contestId={data.contest.id} onOpenParticipants={() => {
                    const next = new URLSearchParams(searchParams); next.set("tab", "participants"); setSearchParams(next);
                  }} /> : null}

                  {tab === "accounts" ? (
                  <Card id="contest-account-generation" className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-bg-surface p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-4 border-b border-border/[.08] pb-5 dark:border-white/[.08] sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg-hover text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><KeyRound aria-hidden="true" className="size-5" /></span>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[.12em] text-primary">{tr("ДОСТУПИ УЧАСНИКІВ", "PARTICIPANT ACCESS")}</p>
                          <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em] text-text-primary dark:text-text-primary">{tr("Тимчасові акаунти", "Temporary accounts")}</h2>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Додай список людей і створи окремі логіни для цього контесту.", "Add a roster and create separate logins for this contest.")}</p>
                        </div>
                      </div>
                      {generatedAccounts.length > 0 && <span className="inline-flex w-fit items-center gap-2 rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><UsersRound aria-hidden="true" className="size-3.5" />{tr(`Доступів створено: ${generatedAccounts.length}`, `Accounts created: ${generatedAccounts.length}`)}</span>}
                    </div>

                    <div className="mt-5 rounded-2xl border border-border/[.08] bg-bg-hover p-3.5 dark:border-white/[.08] dark:bg-white/[.025] sm:p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-bold text-text-primary dark:text-text-primary"><FileSpreadsheet aria-hidden="true" className="size-4 shrink-0 text-primary-strong dark:text-primary-soft" /><span className="truncate">{accountRosterImportFileName || tr("Завантажити список", "Upload a roster")}</span></p>
                          <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{tr("XLSX, XLS, ODS, CSV, TSV або TXT · до 10 МБ", "XLSX, XLS, ODS, CSV, TSV, or TXT · up to 10 MB")}</p>
                        </div>
                        <label htmlFor="contest-roster-file" className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/10 bg-white px-4 py-2 text-sm font-bold text-text-primary transition-colors hover:bg-bg-hover focus-within:outline-none focus-within:ring-2 focus-within:ring-primary dark:border-white/10 dark:bg-white/[.06] dark:text-text-primary dark:hover:bg-white/[.1]">
                          <Upload aria-hidden="true" className="size-4 text-primary-strong dark:text-primary-soft" />{tr("Обрати файл", "Choose file")}
                          <input
                            key={accountRosterImportKey}
                            id="contest-roster-file"
                            type="file"
                            accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            onChange={(e) => void importRosterCsvFile(e.target.files?.[0] ?? null)}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="mt-5">
                      <label htmlFor="contest-roster-text" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Список учасників", "Participant list")}</label>
                      <p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Одне ім’я на рядок. Email можна додати після коми — він потрібен лише для розсилки.", "One name per line. Add an email after a comma if you want to send credentials by email.")}</p>
                      <textarea
                        id="contest-roster-text"
                        value={accountRosterText}
                        onChange={(e) => { setAccountRosterText(e.target.value); setAccountGenError(null); setAccountGenMessage(null); }}
                        className="mt-3 min-h-[150px] w-full resize-y rounded-2xl border border-border/10 bg-bg-surface px-4 py-3 text-sm leading-6 text-text-primary outline-none transition-[border-color,box-shadow] placeholder:text-text-muted focus:border-primary-strong/45 focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-bg-code dark:text-text-primary dark:placeholder:text-text-muted"
                        placeholder={tr("Іван Петренко\nОлена Коваль, olena@example.com", "John Smith\nAlex Green, alex@example.com")}
                      />

                      {accountRosterText.trim() ? <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-hover px-2.5 py-1 text-xs font-semibold text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><CircleCheck aria-hidden="true" className="size-3.5" />{tr(`${rosterInputAnalysis.entries.length} розпізнано`, `${rosterInputAnalysis.entries.length} recognized`)}</span>
                        {rosterInputAnalysis.invalidLines.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-hover px-2.5 py-1 text-xs font-semibold text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn"><TriangleAlert aria-hidden="true" className="size-3.5" />{tr(`${rosterInputAnalysis.invalidLines.length} помилок`, `${rosterInputAnalysis.invalidLines.length} invalid`)}</span>}
                        {rosterInputAnalysis.duplicateEmails.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-hover px-2.5 py-1 text-xs font-semibold text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn"><TriangleAlert aria-hidden="true" className="size-3.5" />{tr(`${rosterInputAnalysis.duplicateEmails.length} повторів email`, `${rosterInputAnalysis.duplicateEmails.length} duplicate emails`)}</span>}
                      </div> : <p className="mt-3 text-xs text-text-muted dark:text-text-secondary">{tr("Після вставлення побачиш кількість розпізнаних імен та помилки формату.", "Once you paste names, you’ll see how many were recognized and any formatting issues.")}</p>}

                      {rosterInputAnalysis.duplicateEmails.length > 0 && <div role="status" className="mt-3 rounded-xl border border-accent-warn bg-bg-hover px-3 py-2.5 text-xs leading-5 text-accent-warn dark:border-accent-warn/20 dark:bg-accent-warn/[.06] dark:text-accent-warn">
                        {tr(`Повторювані email: ${rosterInputAnalysis.duplicateEmails.slice(0, 5).join(", ")}`, `Duplicate emails: ${rosterInputAnalysis.duplicateEmails.slice(0, 5).join(", ")}`)}
                      </div>}
                      {rosterInputAnalysis.invalidLines.length > 0 && <div role="alert" className="mt-3 rounded-xl border border-accent-error bg-bg-hover px-3 py-2.5 text-xs leading-5 text-accent-error dark:border-accent-error/20 dark:bg-accent-error/[.06] dark:text-accent-error">
                        {tr(`Перевір рядки: ${rosterInputAnalysis.invalidLines.slice(0, 3).join(" · ")}`, `Check these rows: ${rosterInputAnalysis.invalidLines.slice(0, 3).join(" · ")}`)}
                      </div>}
                    </div>

                    {rosterPreviewRows.length > 0 && <div className="mt-5 overflow-hidden rounded-2xl border border-border/10 dark:border-white/10">
                      <div className="flex items-center justify-between gap-3 bg-bg-hover px-4 py-3 dark:bg-white/[.035]">
                        <p className="text-sm font-bold text-text-primary dark:text-text-primary">{tr("Перевірка списку", "Roster preview")}</p>
                        <span className="text-xs font-medium text-text-muted dark:text-text-secondary">{tr(`${rosterPreviewRows.length} з ${rosterInputAnalysis.entries.length}`, `${rosterPreviewRows.length} of ${rosterInputAnalysis.entries.length}`)}</span>
                      </div>
                      <div className="max-h-[220px] overflow-auto">
                        <table className="min-w-[520px] w-full text-sm">
                          <thead className="sticky top-0 bg-white text-left text-xs font-semibold text-text-muted dark:bg-bg-surface dark:text-text-secondary">
                            <tr><th className="px-4 py-2.5">{tr("Ім’я", "Name")}</th><th className="px-4 py-2.5">Email</th></tr>
                          </thead>
                          <tbody>
                            {rosterPreviewRows.map((row, idx) => <tr key={`${row.email}-${idx}`} className="border-t border-border/[.07] text-text-primary odd:bg-white even:bg-bg-hover dark:border-white/[.06] dark:text-text-primary dark:odd:bg-bg-surface dark:even:bg-white/[.02]">
                              <td className="px-4 py-2.5 font-medium">{row.fullName}</td><td className="px-4 py-2.5 text-text-muted dark:text-text-secondary">{row.email || "—"}</td>
                            </tr>)}
                          </tbody>
                        </table>
                      </div>
                    </div>}

                    <div className="mt-5 flex flex-col gap-3 border-t border-border/[.08] pt-4 dark:border-white/[.08] sm:flex-row sm:flex-wrap sm:items-center">
                      <Button variant="default" onClick={generateAccounts} disabled={accountGenLoading || rosterInputAnalysis.entries.length === 0} className="min-h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary focus-visible:ring-primary">
                        <UsersRound aria-hidden="true" className="size-4" />{accountGenLoading ? tr("Створюю акаунти…", "Creating accounts…") : tr("Згенерувати акаунти", "Generate accounts")}
                      </Button>
                      {accountRosterText.trim() && <Button variant="ghost" onClick={clearRosterInput} className="min-h-10 gap-2 rounded-xl px-3 text-text-muted hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-white/[.06]">
                        <Trash2 aria-hidden="true" className="size-4" />{tr("Очистити список", "Clear list")}
                      </Button>}
                      {generatedAccounts.length > 0 && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                        <Button variant="outline" onClick={copyGeneratedAccounts} className="min-h-9 gap-2 rounded-xl border-border/10 bg-white px-3 text-xs font-semibold text-text-primary hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.04] dark:text-text-primary dark:hover:bg-white/[.08]"><Copy aria-hidden="true" className="size-3.5" />{tr("Копіювати CSV", "Copy CSV")}</Button>
                        <Button variant="outline" onClick={downloadGeneratedAccountsCsv} className="min-h-9 gap-2 rounded-xl border-border/10 bg-white px-3 text-xs font-semibold text-text-primary hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.04] dark:text-text-primary dark:hover:bg-white/[.08]"><Download aria-hidden="true" className="size-3.5" />CSV</Button>
                        <Button variant="outline" onClick={() => void downloadGeneratedAccountsXlsx()} className="min-h-9 gap-2 rounded-xl border-border/10 bg-white px-3 text-xs font-semibold text-text-primary hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.04] dark:text-text-primary dark:hover:bg-white/[.08]"><Download aria-hidden="true" className="size-3.5" />XLSX</Button>
                        <Button variant="ghost" onClick={clearGeneratedAccounts} className="min-h-9 gap-2 rounded-xl px-3 text-xs font-semibold text-accent-error hover:bg-bg-hover dark:text-accent-error dark:hover:bg-accent-error/10"><Trash2 aria-hidden="true" className="size-3.5" />{tr("Очистити з екрана", "Clear from screen")}</Button>
                      </div>}
                    </div>

                    {accountGenError && <div role="alert" className="mt-3 rounded-xl border border-accent-error bg-bg-hover px-3 py-2.5 text-sm text-accent-error dark:border-accent-error/20 dark:bg-accent-error/[.06] dark:text-accent-error">{accountGenError}</div>}
                    {accountGenMessage && <div role="status" className="mt-3 rounded-xl border border-border bg-bg-hover px-3 py-2.5 text-sm text-[#176b3c] dark:border-primary/20 dark:bg-primary/[.06] dark:text-primary-strong">{accountGenMessage}</div>}

                    {temporaryAccountsLoading && <div role="status" className="mt-4 text-sm text-text-muted dark:text-text-secondary">{tr("Завантажую тимчасові акаунти…", "Loading temporary accounts…")}</div>}
                    {temporaryAccountsError && <div role="alert" className="mt-4 rounded-xl border border-accent-error bg-bg-hover px-3 py-2.5 text-sm text-accent-error dark:border-accent-error/20 dark:bg-accent-error/[.06] dark:text-accent-error">{temporaryAccountsError}</div>}
                    {temporaryAccounts.length > 0 && <section className="mt-5 overflow-hidden rounded-2xl border border-border/10 dark:border-white/10">
                      <div className="flex flex-col gap-3 bg-bg-hover px-4 py-4 dark:bg-white/[.035] sm:flex-row sm:items-center sm:justify-between">
                        <div><h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-text-primary dark:text-text-primary">{tr("Тимчасові акаунти", "Temporary accounts")}</h3><p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Паролі показуються лише одразу після генерації. Видалення акаунта також видалить його подачі й результати.", "Passwords are shown only immediately after generation. Deleting an account also removes its submissions and results.")}</p></div>
                        <span className="inline-flex w-fit items-center rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{tr(`${temporaryAccounts.length} акаунтів`, `${temporaryAccounts.length} accounts`)}</span>
                      </div>
                      <div className="max-h-[320px] overflow-auto">
                        <table className="min-w-[620px] w-full text-sm">
                          <caption className="sr-only">{tr("Тимчасові облікові записи учасників", "Temporary participant accounts")}</caption>
                          <thead className="sticky top-0 bg-white text-left text-xs font-semibold text-text-muted dark:bg-bg-surface dark:text-text-secondary">
                            <tr><th className="px-4 py-3">{tr("Ім’я", "Name")}</th><th className="hidden px-4 py-3 md:table-cell">Email</th><th className="px-4 py-3">{tr("Логін", "Username")}</th><th className="px-4 py-3">{tr("Пароль", "Password")}</th><th className="hidden px-4 py-3 lg:table-cell">userId</th><th className="hidden px-4 py-3 lg:table-cell">participantId</th><th className="px-4 py-3 text-right">{tr("Дія", "Action")}</th></tr>
                          </thead>
                          <tbody>
                            {temporaryAccounts.map((a) => {
                              const credentials = generatedAccountsByUserId.get(a.userId);
                              const isDeleting = deletingTemporaryAccountId === a.userId;
                              return <tr key={`${a.userId}-${a.participantId}`} className="border-t border-border/[.07] text-text-primary odd:bg-white even:bg-bg-hover dark:border-white/[.06] dark:text-text-primary dark:odd:bg-bg-surface dark:even:bg-white/[.02]">
                                <td className="px-4 py-3 font-medium">{a.fullName ?? "—"}</td><td className="hidden px-4 py-3 text-text-muted md:table-cell dark:text-text-secondary">{a.email ?? "—"}</td><td className="px-4 py-3 font-mono text-xs">{a.username}</td><td className="px-4 py-3 font-mono text-xs">{credentials?.password ?? "—"}</td><td className="hidden px-4 py-3 font-mono text-xs lg:table-cell">{a.userId}</td><td className="hidden px-4 py-3 font-mono text-xs lg:table-cell">{a.participantId}</td>
                                <td className="px-4 py-2 text-right"><button type="button" onClick={() => void deleteTemporaryAccount(a)} disabled={deletingTemporaryAccountId != null} aria-label={tr(`Видалити акаунт ${a.username}`, `Delete account ${a.username}`)} title={tr("Видалити акаунт", "Delete account")} className="inline-grid size-9 place-items-center rounded-lg text-accent-error transition-colors hover:bg-bg-hover disabled:opacity-50 dark:text-accent-error dark:hover:bg-accent-error/10">{isDeleting ? <RefreshCw aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}</button></td>
                              </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t border-border/[.08] bg-white p-4 dark:border-white/[.08] dark:bg-bg-surface sm:p-5">
                        <label htmlFor="contest-account-email-message" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Повідомлення для учасників", "Message to participants")} <span className="font-normal text-text-muted dark:text-text-muted">{tr("(необов’язково)", "(optional)")}</span></label>
                        <textarea
                          id="contest-account-email-message"
                          value={accountMailCustomMessage}
                          onChange={(e) => setAccountMailCustomMessage(e.target.value)}
                          className="mt-2 min-h-[88px] w-full resize-y rounded-xl border border-border/10 bg-bg-surface px-3.5 py-3 text-sm leading-6 text-text-primary outline-none transition-[border-color,box-shadow] placeholder:text-text-muted focus:border-primary-strong/45 focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-bg-code dark:text-text-primary dark:placeholder:text-text-muted"
                          placeholder={tr("Напиши коротке привітання або інструкцію для входу", "Add a short welcome or sign-in instruction")}
                        />
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/12 px-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-hover dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.04]">
                            <Upload aria-hidden="true" className="size-4" />
                            {tr("Додати файли", "Attach files")}
                            <input
                              type="file"
                              multiple
                              accept=".pdf,.txt,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp,.tif,.tiff,.heic,.heif,.zip,.doc,.docx,.xls,.xlsx"
                              className="sr-only"
                              onChange={(event) => {
                                const selected = Array.from(event.currentTarget.files ?? []);
                                const unique = new Map(accountMailAttachments.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]));
                                for (const file of selected) unique.set(`${file.name}:${file.size}:${file.lastModified}`, file);
                                if (Array.from(unique.values()).some((file) => file.size > 10 * 1024 * 1024)) {
                                  setAccountMailError(tr("Файл завеликий. Максимальний розмір — 10 МБ", "A file is too large. Maximum size is 10 MB"));
                                } else if (unique.size > 5) {
                                  setAccountMailError(tr("Можна додати не більше 5 файлів", "You can attach up to 5 files"));
                                } else {
                                  setAccountMailAttachments(Array.from(unique.values()));
                                  setAccountMailError(null);
                                }
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                          <span className="text-xs text-text-muted dark:text-text-secondary">{tr("До 5 файлів, максимум 10 МБ кожен", "Up to 5 files, 10 MB each")}</span>
                        </div>
                        {accountMailAttachments.length > 0 && <ul className="mt-2 flex flex-wrap gap-2" aria-label={tr("Вкладені файли", "Attached files")}>
                          {accountMailAttachments.map((file) => <li key={`${file.name}:${file.size}:${file.lastModified}`} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-bg-hover px-2.5 py-1.5 text-xs text-text-primary dark:bg-white/[.06] dark:text-text-primary">
                            <FileText aria-hidden="true" className="size-3.5 shrink-0" />
                            <span className="max-w-[240px] truncate">{file.name}</span>
                            <button type="button" aria-label={tr(`Прибрати файл ${file.name}`, `Remove ${file.name}`)} onClick={() => setAccountMailAttachments((current) => current.filter((item) => item !== file))} className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"><X aria-hidden="true" className="size-3.5" /></button>
                          </li>)}
                        </ul>}
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button variant="default" onClick={sendGeneratedAccountsByEmail} disabled={accountMailLoading} className="min-h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary focus-visible:ring-primary">
                            <Send aria-hidden="true" className="size-4" />{accountMailLoading ? tr("Надсилаю…", "Sending…") : tr("Надіслати доступи поштою", "Email access details")}
                          </Button>
                          {accountMailError && <span role="alert" className="text-sm text-accent-error dark:text-accent-error">{accountMailError}</span>}
                          {accountMailResult && <span role="status" className="text-sm text-[#176b3c] dark:text-primary-strong">{accountMailResult}</span>}
                        </div>
                      </div>
                    </section>}
                  </Card>
                  ) : null}

                  {tab === "management" ? <>
                  <section aria-labelledby="contest-settings-heading" className="contest-settings-workspace">
                    <div className="contest-settings-workspace__header">
                      <div>
                        <span className="contest-settings-workspace__eyebrow">{tr("Керування контестом", "Contest control")}</span>
                        <h2 id="contest-settings-heading">{tr("Налаштування", "Settings")}</h2>
                        <p>{tr("Усе, що визначає вигляд, доступ і правила контесту.", "Set the contest identity, access, and rules in one place.")}</p>
                      </div>
                    </div>
        <div className="contest-settings-layout" onChangeCapture={() => setSettingsSaved(false)}>
          {settingsError ? <div role="alert" className="contest-settings-error text-sm text-accent-error">{settingsError}</div> : null}

          <div className="contest-settings-tabs" role="tablist" aria-label={tr("Розділи налаштувань", "Settings sections")}>
            {([
              ["general", tr("Основне", "Basics"), tr("Назва, опис і теми", "Title, description, topics")],
              ["schedule", tr("Формат", "Format"), tr("Час і підрахунок", "Schedule and scoring")],
              ["access", tr("Доступ", "Access"), tr("Учасники й рейтинг", "Participants and standings")],
              ["appearance", tr("Вигляд", "Appearance"), tr("Іконка й обкладинка", "Icon and banner")],
            ] as const).map(([id, label, detail]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`contest-settings-tab-${id}`}
                aria-selected={settingsSection === id}
                aria-controls="contest-settings-panel"
                onClick={() => setSettingsSection(id)}
                className={`contest-settings-tab${settingsSection === id ? " is-active" : ""}`}
              >
                <span>{label}</span>
                <small>{detail}</small>
              </button>
            ))}
          </div>

          <div id="contest-settings-panel" role="tabpanel" aria-labelledby={`contest-settings-tab-${settingsSection}`} className="contest-settings-panel">
          {settingsSection === "general" ? <section className="contest-settings-section">
            <div className="contest-settings-section__intro"><h3>{tr("Інформація для учасників", "What participants will see")}</h3><p>{tr("Дай контесту зрозумілу назву й короткий опис.", "Give the contest a clear name and a short description.")}</p></div>
          <Input label={tr("Назва", "Title")} value={settingsTitle} onChange={(e) => setSettingsTitle(e.target.value)} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-text-primary">{tr("Опис і правила", "Description and rules")}</label>
            <textarea
              value={settingsDescription}
              onChange={(e) => setSettingsDescription(e.target.value)}
              rows={4}
              className="w-full resize-y bg-bg-code border border-border text-text-primary rounded-xl px-4 py-3 leading-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder={tr("Коротко поясни формат, правила та важливі деталі…", "Summarize the format, rules, and any important details…")}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label={tr("Теми через кому", "Topics separated by commas")} value={settingsTags} onChange={(e) => setSettingsTags(e.target.value)} placeholder={tr("алгоритми, графи, Python", "algorithms, graphs, Python")} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contest-settings-difficulty" className="text-sm font-semibold text-text-primary">{tr("Складність", "Difficulty")}</label>
              <select id="contest-settings-difficulty" value={settingsDifficulty} onChange={(e) => setSettingsDifficulty(e.target.value as typeof settingsDifficulty)} className="w-full rounded-xl border border-border bg-bg-code px-4 py-2.5 text-text-primary focus-visible:ring-2 focus-visible:ring-primary">
                <option value="">{tr("Не вказано", "Not set")}</option>
                <option value="EASY">{tr("Початковий", "Beginner")}</option>
                <option value="MEDIUM">{tr("Середній", "Intermediate")}</option>
                <option value="HARD">{tr("Складний", "Advanced")}</option>
              </select>
            </div>
          </div>
          </section> : null}

          {settingsSection === "appearance" ? <section className="contest-settings-section">
            <div className="contest-settings-section__intro"><h3>{tr("Візуальний стиль", "Visual identity")}</h3><p>{tr("Обкладинка та іконка допоможуть відрізнити контест у списку.", "A banner and icon make the contest easier to recognize.")}</p></div>
            <div className="text-sm font-semibold text-text-primary">{tr("Оформлення", "Branding")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {CONTEST_ICONS.map((icon) => <button key={icon} type="button" aria-label={tr(`Обрати іконку ${icon}`, `Choose icon ${icon}`)} aria-pressed={!settingsIconImageUrl && settingsIcon === icon} onClick={() => { setSettingsSaved(false); setSettingsIconImageUrl(null); setSettingsIcon(icon); }} className={`grid size-10 place-items-center rounded-lg border text-xl ${!settingsIconImageUrl && settingsIcon === icon ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border hover:bg-bg-hover"}`}>{icon}</button>)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {settingsIconImageUrl && <img src={settingsIconImageUrl} alt="" className="size-10 rounded-lg border border-border bg-bg-surface object-cover" />}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover focus-within:ring-2 focus-within:ring-primary">
                <ImagePlus aria-hidden="true" className="size-4" />{settingsIconUploading ? tr("Завантажую іконку…", "Uploading icon…") : settingsIconImageUrl ? tr("Замінити зображення", "Replace image") : tr("Завантажити зображення", "Upload image")}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={settingsIconUploading || settingsSaving} onChange={(event) => { void uploadContestIcon(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
              {settingsIconImageUrl && <Button variant="ghost" onClick={() => setSettingsIconImageUrl(null)} disabled={settingsIconUploading || settingsSaving}>{tr("Прибрати", "Remove")}</Button>}
              <span className="text-xs text-text-secondary">PNG, JPG, WebP, AVIF · 8 MB</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Зображення замінить emoji в картці та на сторінці контесту. Без зображення використовується обрана emoji-іконка.", "The image replaces the emoji in the contest card and page. Without an image, the selected emoji is used.")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.entries(CONTEST_BANNER_THEMES) as Array<[ContestBannerTheme, (typeof CONTEST_BANNER_THEMES)[ContestBannerTheme]]>).map(([theme, preset]) => <button key={theme} type="button" aria-pressed={settingsBannerTheme === theme} onClick={() => { setSettingsSaved(false); setSettingsBannerTheme(theme); }} className={`h-12 rounded-lg border px-3 text-left text-xs font-semibold text-white ${settingsBannerTheme === theme ? "ring-2 ring-primary ring-offset-1" : "border-white/20 opacity-80 hover:opacity-100"}`} style={{ background: preset.background }}>{tr(preset.label, theme)}</button>)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {settingsBannerImageUrl && <img src={settingsBannerImageUrl} alt={tr("Попередній перегляд банера", "Banner preview")} className="h-14 w-28 rounded-lg border border-border object-cover" />}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover focus-within:ring-2 focus-within:ring-primary">
                <ImagePlus aria-hidden="true" className="size-4" />{settingsBannerUploading ? tr("Завантажую…", "Uploading…") : tr("Завантажити банер", "Upload banner")}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={settingsBannerUploading || settingsSaving} onChange={(event) => { void uploadContestBanner(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
              {settingsBannerImageUrl && <Button variant="ghost" onClick={() => setSettingsBannerImageUrl(null)} disabled={settingsSaving || settingsBannerUploading}>{tr("Прибрати", "Remove")}</Button>}
              <span className="text-xs text-text-secondary">PNG, JPG, WebP, AVIF · 8 MB</span>
            </div>
          </section> : null}

          {settingsSection === "access" ? <section className="contest-settings-section">
          <div className="contest-settings-section__intro"><h3>{tr("Хто може брати участь", "Who can participate")}</h3><p>{tr("Визнач, хто побачить контест і як люди отримають доступ.", "Choose who can see the contest and how they get access.")}</p></div>
          <section className="rounded-2xl border border-border bg-bg-base/45 p-4">
            <div className="text-sm font-semibold text-text-primary">{tr("Хто має доступ", "Who can access")}</div>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Зміна доступу одразу оновить видимість контесту для учасників.", "Changing access immediately updates contest visibility for participants.")}</p>
            <label htmlFor="contest-settings-visibility" className="mt-3 block text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Формат доступу", "Access type")}</label>
            <select id="contest-settings-visibility" name="visibility" value={settingsVisibility} onChange={(e) => { const visibility = e.target.value as ContestVisibility; setSettingsVisibility(visibility); if (visibility === "TEMPORARY_ACCOUNTS") setSettingsParticipantAccessMode("ISSUED_ACCOUNTS"); else if (settingsVisibility === "TEMPORARY_ACCOUNTS") setSettingsParticipantAccessMode("SELF_REGISTRATION"); setSettingsError(null); }} className="mt-1.5 w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-primary">
              <option value="PUBLIC">{tr("Відкритий — доступний усім", "Public — available to everyone")}</option>
              <option value="PRIVATE_CODE">{tr("За кодом — приватне запрошення", "Private — invite code required")}</option>
              <option value="CLASS">{tr("Для класу — тільки учні класу", "Class — only students in a class")}</option>
              <option value="TEMPORARY_ACCOUNTS">{tr("Лише тимчасовий доступ — тільки видані учасникам дані входу", "Temporary access only — issued credentials required")}</option>
            </select>
            {settingsVisibility === "TEMPORARY_ACCOUNTS" && <p className="mt-2 text-xs leading-5 text-text-secondary">{tr("Контест не показується у відкритому каталозі. Доступ матимуть лише учасники з виданими організатором даними входу.", "This contest stays out of the public catalog. Only participants with credentials issued by the organizer can enter.")}</p>}
            {settingsVisibility === "PRIVATE_CODE" && <div className="mt-3">
              <label htmlFor="contest-settings-join-code" className="block text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Код-запрошення", "Invite code")}</label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input id="contest-settings-join-code" name="joinCode" autoComplete="off" spellCheck={false} maxLength={64} value={settingsJoinCode} onChange={(e) => setSettingsJoinCode(e.target.value)} className="min-w-0 flex-1 bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 font-mono uppercase focus-visible:ring-2 focus-visible:ring-primary" placeholder={data?.contest.visibility === "PRIVATE_CODE" ? tr("Не змінювати поточний код", "Leave blank to keep current code") : tr("Введи або згенеруй код", "Enter or generate a code")} />
                <Button type="button" variant="secondary" onClick={() => setSettingsJoinCode(createContestInviteCode())}><Sparkles className="mr-2 size-4" />{tr("Згенерувати", "Generate")}</Button>
              </div>
              <p className="mt-1.5 text-xs text-text-secondary">{data?.contest.visibility === "PRIVATE_CODE" ? tr("Залиш поле порожнім, щоб зберегти поточний код. Новий код замінить старий.", "Leave blank to keep the current code. A new code replaces it.") : tr("Код має містити від 4 до 64 символів.", "Use 4–64 characters.")}</p>
            </div>}
            {settingsVisibility === "CLASS" && <div className="mt-3">
              <label htmlFor="contest-settings-class" className="block text-xs font-semibold text-text-muted uppercase tracking-wider">{tr("Клас", "Class")}</label>
              <select id="contest-settings-class" name="classId" value={settingsClassId} onChange={(e) => setSettingsClassId(e.target.value)} disabled={settingsClassesLoading} className="mt-1.5 w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
                <option value="">{settingsClassesLoading ? tr("Завантажую класи…", "Loading classes…") : tr("Оберіть клас", "Select a class")}</option>
                {settingsClassId && !settingsClasses.some((item) => item.id === Number(settingsClassId)) && <option value={settingsClassId}>{tr(`Поточний клас #${settingsClassId}`, `Current class #${settingsClassId}`)}</option>}
                {settingsClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.studentsCount} {tr("учнів", "students")}</option>)}
              </select>
              {settingsClassesError && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-accent-error"><p role="alert">{settingsClassesError}</p><button type="button" onClick={() => { setSettingsClassesError(null); setSettingsClassesRetry((current) => current + 1); }} className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Спробувати ще раз", "Try again")}</button></div>}
              {!settingsClassesLoading && !settingsClassesError && settingsClasses.length === 0 && <p className="mt-2 text-xs text-text-secondary">{tr("Список класів порожній або недоступний для цього акаунту.", "No classes are available for this account.")}</p>}
            </div>}
          </section>

          <section className="rounded-2xl border border-border bg-bg-base/45 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contest-settings-participant-access" className="text-sm font-semibold text-text-primary">{tr("Реєстрація учасників", "Participant registration")}</label>
                <select id="contest-settings-participant-access" value={settingsVisibility === "TEMPORARY_ACCOUNTS" ? "ISSUED_ACCOUNTS" : settingsParticipantAccessMode} onChange={(event) => setSettingsParticipantAccessMode(event.target.value as ContestParticipantAccessMode)} disabled={settingsVisibility === "TEMPORARY_ACCOUNTS"} className="mt-1.5 w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70">
                  <option value="SELF_REGISTRATION" disabled={settingsVisibility === "TEMPORARY_ACCOUNTS"}>{tr("Самостійна реєстрація", "Self-registration")}</option>
                  <option value="ISSUED_ACCOUNTS">{tr("Доступи, видані організатором", "Access issued by organizer")}</option>
                </select>
                <p className="mt-1.5 text-xs leading-5 text-text-secondary">{settingsVisibility === "TEMPORARY_ACCOUNTS" ? tr("Формат доступу автоматично вимагає дані для входу від організатора й обмежує контест призначеними учасниками.", "This access type requires sign-in details from the organizer and limits the contest to assigned participants.") : settingsParticipantAccessMode === "ISSUED_ACCOUNTS" ? tr("Учасники входять лише за даними, створеними у розділі «Акаунти».", "Only participants with details issued in the Accounts section can enter.") : tr("Учасники можуть приєднатися самостійно згідно з форматом доступу вище.", "Participants can join themselves according to the access type above.")}</p>
              </div>
              <div>
                <label htmlFor="contest-settings-scoreboard-visibility" className="text-sm font-semibold text-text-primary">{tr("Видимість таблиці", "Scoreboard visibility")}</label>
                <select id="contest-settings-scoreboard-visibility" value={settingsScoreboardVisibility} onChange={(event) => setSettingsScoreboardVisibility(event.target.value as ContestScoreboardVisibility)} className="mt-1.5 w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-primary">
                  <option value="LIVE">{tr("Показувати наживо", "Show live")}</option>
                  <option value="AFTER_END">{tr("Відкрити після завершення", "Reveal after finish")}</option>
                  <option value="ORGANIZERS_ONLY">{tr("Лише організаторам", "Organizers only")}</option>
                </select>
                <p className="mt-1.5 text-xs leading-5 text-text-secondary">{tr("Приховані результати не повертаються API учасникам до заданого часу.", "Hidden results are not returned to participants before the release time.")}</p>
              </div>
            </div>
          </section>
          </section> : null}

          {settingsSection === "schedule" ? <section className="contest-settings-section">
          <div className="contest-settings-section__intro"><h3>{tr("Час і правила підрахунку", "Schedule and scoring")}</h3><p>{tr("Зміни правила, за якими рахуватимуть результати контесту.", "Set when the contest runs and how results are calculated.")}</p></div>
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

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-bg-base/45 p-4 text-sm">
            <input
              type="checkbox"
              checked={settingsSafetyAlertsEnabled}
              disabled={!data.contest.safetyAlertProviderReady && !settingsSafetyAlertsEnabled}
              onChange={(event) => setSettingsSafetyAlertsEnabled(event.target.checked)}
              className="mt-0.5 size-4 accent-[#00b869]"
            />
            <span>
              <span className="block font-semibold text-text-primary">{tr("Попереджати учасників про повітряні загрози", "Warn participants about air threats")}</span>
              <span className="mt-1 block text-xs leading-5 text-text-secondary">{tr("Учасник обере місто, район або область. Під час тривоги чи повідомлення про загрозу з’явиться блокувальне вікно з вибором: продовжити в безпечному місці або взяти паузу до 10 хвилин. Фактичний час паузи додається лише до його контесту.", "Participants choose a city, district, or region. During an air alert or threat, a blocking prompt lets them continue from safety or take up to 10 minutes; only their own contest time is extended by the pause.")}</span>
              {!data.contest.safetyAlertProviderReady && <span className="mt-2 block text-xs font-medium text-accent-error">{tr("Сервіс сповіщень тимчасово недоступний. Спробуйте пізніше.", "The alert service is temporarily unavailable. Try again later.")}</span>}
              {data.contest.safetyAlertProviderReady && <span className="mt-2 block text-xs text-text-secondary">{tr("API не потребує токена. Учасник обирає доступну локацію; GPS-координати не збираються.", "No API token is needed. Participants choose an available area; GPS coordinates are not collected.")}</span>}
            </span>
          </label>

          {settingsSafetyAlertsEnabled ? <div className="grid gap-4 rounded-2xl border border-border bg-bg-base/45 p-4">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">{tr("Червоний рівень загрози", "Red-level threat")}</h4>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Місто-орієнтир задає організатор. Зміна рівня з червоного на жовтий знімає глобальне блокування й запускає звичну паузу до 10 хвилин для учасників, яких стосується тривога.", "The organizer chooses a reference city. When the level changes from red to yellow, the global lock ends and the usual up-to-10-minute pause is offered to participants affected by the alert.")}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-text-secondary">
                {tr("Місто-орієнтир", "Reference city")}
                <select value={settingsSafetyRedLocationUid} onChange={(event) => setSettingsSafetyRedLocationUid(event.target.value)} disabled={settingsSafetyLocationsLoading} className="mt-1.5 w-full rounded-lg border border-border bg-bg-code px-4 py-2.5 text-sm font-normal text-text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
                  <option value="">{settingsSafetyLocationsLoading ? tr("Завантажуємо міста…", "Loading cities…") : tr("Не обрано", "Not selected")}</option>
                  {(settingsSafetyState?.availableLocations ?? []).filter((location) => location.type === "Місто" || location.type === "Місто з спеціальним статусом").map((location) => <option key={location.uid} value={location.uid}>{location.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-text-secondary">
                {tr("Дія під час червоного рівня", "Action during red level")}
                <select value={settingsSafetyRedLockMode} onChange={(event) => setSettingsSafetyRedLockMode(event.target.value as ContestSafetyRedLockMode)} className="mt-1.5 w-full rounded-lg border border-border bg-bg-code px-4 py-2.5 text-sm font-normal text-text-primary focus-visible:ring-2 focus-visible:ring-primary">
                  <option value="PAUSE_10_MIN">{tr("Як жовтий: учасник обирає паузу до 10 хв", "Like yellow: participants can take up to 10 minutes")}</option>
                  <option value="LOCK_UNTIL_CLEAR">{tr("Блокувати всіх до зміни рівня", "Lock everyone until the level changes")}</option>
                </select>
              </label>
            </div>
            {!settingsSafetyLocationsLoading && !settingsSafetyState?.availableLocations.length ? <p className="text-xs text-accent-error">{tr("Не вдалося завантажити міста. Онови сторінку, щоб налаштувати червоний рівень.", "Could not load cities. Refresh the page to configure red-level behavior.")}</p> : null}
          </div> : null}

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-base/45 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">{tr("Ручне блокування учасників", "Manual participant lock")}</h4>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Організатор може призупинити доступ до умови й редактора для всіх. Тривалість блокування додається всім до часу контесту.", "The organizer can pause access to tasks and the editor for everyone. The lock duration is added to every participant's contest time.")}</p>
              <p role="status" className="mt-2 text-xs font-semibold">{data.contest.safetyManualLocked ? tr("Учасників зараз заблоковано", "Participants are currently locked") : tr("Ручне блокування вимкнено", "Manual lock is off")}</p>
            </div>
            <button type="button" onClick={() => void setOrganizerSafetyLock(!data.contest.safetyManualLocked)} disabled={settingsSafetyLockSaving} aria-pressed={Boolean(data.contest.safetyManualLocked)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60 ${data.contest.safetyManualLocked ? "border border-border bg-bg-code text-text-primary hover:bg-bg-hover" : "bg-accent-error px-5 text-white hover:brightness-110"}`}>
              {settingsSafetyLockSaving ? tr("Оновлюємо…", "Updating…") : data.contest.safetyManualLocked ? tr("Відновити доступ", "Restore access") : tr("Заблокувати зараз", "Lock now")}
            </button>
          </div>

          <div>
            <div className="text-sm font-mono text-text-primary mb-1.5">{tr("Модель рейтингу", "Ranking model")}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                ["IOI", tr("IOI — сума найкращих балів", "IOI — sum of best scores"), tr("Часткові бали за підзадачі; рейтинг за сумою.", "Partial subtask scores; ranked by total points.")],
                ["ICPC", tr("ICPC — задачі + штраф", "ICPC — solved + penalty"), tr("Рейтинг за к-стю розв'язаних, потім за штрафним часом.", "Ranked by problems solved, then penalty time.")],
              ] as Array<["IOI" | "ICPC", string, string]>).map(([mode, title, desc]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSettingsScoringMode(mode)}
                  className={`text-left rounded-lg border px-3 py-2 transition-fast ${settingsScoringMode === mode ? "border-primary/60 bg-primary/10" : "border-border bg-bg-code hover:bg-bg-hover"}`}
                >
                  <div className={`text-sm font-mono ${settingsScoringMode === mode ? "text-primary" : "text-text-primary"}`}>{title}</div>
                  <div className="text-[11px] text-text-secondary mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          </section> : null}

          </div>

          <div className="contest-settings-footer">
            {settingsSaved ? <span role="status" className="contest-settings-saved">{tr("Зміни збережено", "Changes saved")}</span> : null}
            <Button onClick={saveContestSettings} disabled={settingsSaving || settingsIconUploading || settingsBannerUploading}>
              {settingsIconUploading ? tr("Завантажую іконку…", "Uploading icon…") : settingsBannerUploading ? tr("Завантажую банер…", "Uploading banner…") : settingsSaving ? tr("Збереження…", "Saving…") : tr("Зберегти", "Save")}
            </Button>
          </div>
        </div>
                  </section>

                  <div className="contest-manager-section-heading">
                    <span>{tr("Адміністрування", "Administration")}</span>
                    <h2>{tr("Організатори та контроль", "Organizers and controls")}</h2>
                    <p>{tr("Керуй публікацією, доступом організаторів і винятками в результатах.", "Manage publication, organizer access, and result exceptions.")}</p>
                  </div>
                  <Card className="p-4 sm:p-5">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-base font-semibold text-text-primary flex items-center gap-2"><ShieldCheck aria-hidden="true" className="w-4 h-4 text-primary" />{tr("Організатори та стан контесту", "Organizers and contest status")}</h2>
                      <Button variant="secondary" onClick={loadOrganizers} disabled={organizersLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Button variant="secondary" onClick={togglePublished} disabled={publishing}>
                        {publishing ? tr("Оновлення…", "Updating…") : data.contest.isPublished ? tr("Зняти з публікації", "Unpublish") : tr("Опублікувати", "Publish")}
                      </Button>
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
                          <div key={o.userId} className="flex flex-col gap-2 border border-border bg-bg-base px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

                  <Card className="p-4 sm:p-5">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-base font-semibold text-text-primary">{tr("Анулювання задач", "Problem annulments")}</h2>
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
                      <div className="space-y-2">
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

                  {data.access.canDelete ? (
                    <Card className="border border-accent-error/35 bg-accent-error/[.035] p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="flex items-center gap-2 text-base font-semibold text-accent-error">
                            <Trash2 aria-hidden="true" className="size-4" />
                            {tr("Небезпечна дія", "Danger zone")}
                          </h2>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                            {tr("Видалити контест разом із задачами, подачами, сертифікатами та виданими лише для нього тимчасовими акаунтами. Звичайні акаунти учасників залишаться.", "Delete the contest, its problems, submissions, certificates, and temporary accounts issued only for it. Regular participant accounts are kept.")}
                          </p>
                        </div>
                        <Button variant="destructive" className="shrink-0" onClick={() => {
                          setDeleteContestConfirmation("");
                          setDeleteContestError(null);
                          setDeleteContestOpen(true);
                        }}>
                          <Trash2 aria-hidden="true" className="mr-2 size-4" />
                          {tr("Видалити контест", "Delete contest")}
                        </Button>
                      </div>
                    </Card>
                  ) : null}

                  </> : null}

                  {tab === "participants" ? <>
                  <ContestAwardsPanel contestId={data.contest.id} refreshKey={adminParticipants} />
                  {disqualificationTarget && <ContestDisqualificationDialog key={disqualificationTarget.id} participant={disqualificationTarget} onClose={() => setDisqualificationTarget(null)} onConfirm={options => toggleParticipantDisqualification(disqualificationTarget, options)} />}
                  <Card className="p-4 sm:p-5">
                    <div className="mb-4">
                      <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                        <Send aria-hidden="true" className="w-4 h-4 text-primary" />
                        {tr("Лист учасникам", "Email participants")}
                      </h2>
                      <p className="mt-1 text-sm text-text-secondary">
                        {tr("Надішли нагадування на email адреси, вказані для учасників контесту. Однакові адреси отримають один лист.", "Send a reminder to the email addresses saved for contest participants. Duplicate addresses receive one email.")}
                      </p>
                    </div>
                    <div className="grid gap-3">
                      <div>
                        <label htmlFor="contest-participant-message-title" className="mb-1.5 block text-sm font-medium text-text-primary">
                          {tr("Тема листа", "Email subject")}
                        </label>
                        <input
                          id="contest-participant-message-title"
                          type="text"
                          maxLength={160}
                          value={contestMessageTitle}
                          onChange={(event) => setContestMessageTitle(event.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                          placeholder={tr("Нагадування про контест", "Contest reminder")}
                        />
                      </div>
                      <div>
                        <label htmlFor="contest-participant-message-text" className="mb-1.5 block text-sm font-medium text-text-primary">
                          {tr("Повідомлення", "Message")}
                        </label>
                        <textarea
                          id="contest-participant-message-text"
                          maxLength={5000}
                          rows={5}
                          value={contestMessageText}
                          onChange={(event) => setContestMessageText(event.target.value)}
                          className="w-full resize-y rounded-lg border border-border bg-bg-base px-3 py-2 text-sm leading-6 text-text-primary outline-none focus:border-primary"
                          placeholder={tr("Напиши учасникам важливу інформацію або нагадування…", "Write an update or reminder for participants…")}
                        />
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-text-muted">{tr("Посилання http://, https:// та www. у листі будуть клікабельними.", "http://, https:// and www. links in the email will be clickable.")}</p>
                          <p className="text-right text-xs text-text-muted">{contestMessageText.length}/5000</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover">
                            <Upload aria-hidden="true" className="h-4 w-4" />
                            {tr("Додати файли", "Attach files")}
                            <input
                              type="file"
                              multiple
                              accept=".pdf,.txt,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp,.tif,.tiff,.heic,.heif,.zip,.doc,.docx,.xls,.xlsx"
                              className="sr-only"
                              onChange={(event) => {
                                const selected = Array.from(event.currentTarget.files ?? []);
                                const unique = new Map(contestMessageAttachments.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]));
                                for (const file of selected) unique.set(`${file.name}:${file.size}:${file.lastModified}`, file);
                                const nextAttachments = Array.from(unique.values());
                                if (nextAttachments.some((file) => file.size > 10 * 1024 * 1024)) {
                                  setContestMessageError(tr("Файл завеликий. Максимум — 10 МБ.", "A file is too large. Maximum size is 10 MB."));
                                } else if (nextAttachments.length > 5) {
                                  setContestMessageError(tr("Можна прикріпити не більше 5 файлів.", "You can attach up to 5 files."));
                                } else if (nextAttachments.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
                                  setContestMessageError(tr("Загальний розмір вкладень не може перевищувати 20 МБ.", "Attachments cannot exceed 20 MB in total."));
                                } else {
                                  setContestMessageAttachments(nextAttachments);
                                  setContestMessageError(null);
                                }
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                          <span className="text-xs text-text-muted">{tr("До 5 файлів, максимум 10 МБ кожен і 20 МБ разом.", "Up to 5 files, 10 MB each and 20 MB total.")}</span>
                        </div>
                        {contestMessageAttachments.length > 0 ? (
                          <ul className="mt-2 flex flex-wrap gap-2" aria-label={tr("Вкладені файли", "Attached files")}>
                            {contestMessageAttachments.map((file) => (
                              <li key={`${file.name}:${file.size}:${file.lastModified}`} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-bg-hover px-2.5 py-1.5 text-xs text-text-primary">
                                <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                                <span className="max-w-[240px] truncate">{file.name}</span>
                                <button
                                  type="button"
                                  aria-label={tr(`Прибрати файл ${file.name}`, `Remove ${file.name}`)}
                                  onClick={() => setContestMessageAttachments((current) => current.filter((item) => item !== file))}
                                  className="rounded p-0.5 hover:bg-black/10"
                                >
                                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      {contestMessageError ? <p role="alert" className="text-sm text-accent-error">{contestMessageError}</p> : null}
                      {contestMessageResult ? (
                        <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${contestMessageResult.failed.length || contestMessageResult.skipped > 0 ? "border-accent-warn/50 bg-accent-warn/10 text-text-primary" : "border-accent-success/40 bg-accent-success/10 text-text-primary"}`}>
                          <p>{tr(
                            `Надіслано листів: ${contestMessageResult.sent} із ${contestMessageResult.eligible}. Без email пропущено учасників: ${contestMessageResult.skipped}. Помилок: ${contestMessageResult.failed.length}.`,
                            `Emails sent: ${contestMessageResult.sent} of ${contestMessageResult.eligible}. Participants skipped without an email: ${contestMessageResult.skipped}. Failed: ${contestMessageResult.failed.length}.`,
                          )}</p>
                          {contestMessageResult.duplicateAddresses > 0 ? <p className="mt-1 text-xs text-text-secondary">{tr(
                            `Дубльованих адрес об’єднано: ${contestMessageResult.duplicateAddresses}.`,
                            `Duplicate addresses combined: ${contestMessageResult.duplicateAddresses}.`,
                          )}</p> : null}
                          {contestMessageResult.failed.length > 0 ? <p className="mt-1 text-xs text-text-secondary">{contestMessageResult.failed.slice(0, 5).map((item) => item.name || item.email).join(", ")}{contestMessageResult.failed.length > 5 ? "…" : ""}</p> : null}
                          {contestMessageResult.failed.length > 0 ? <Button className="mt-2" variant="secondary" onClick={() => void sendContestMessage(contestMessageResult.failed.map((item) => item.email))} disabled={contestMessageSending}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            {contestMessageSending ? tr("Повторюємо…", "Retrying…") : tr("Повторити невдалі листи", "Retry failed emails")}
                          </Button> : null}
                        </div>
                      ) : null}
                      <div>
                        <Button onClick={() => void sendContestMessage()} disabled={contestMessageSending || !contestMessageTitle.trim() || !contestMessageText.trim()}>
                          <Send className="mr-2 h-4 w-4" />
                          {contestMessageSending ? tr("Надсилаємо…", "Sending…") : tr("Надіслати листи", "Send emails")}
                        </Button>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 sm:p-5">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-base font-semibold text-text-primary flex items-center gap-2"><Users2 aria-hidden="true" className="w-4 h-4 text-primary" />{tr("Список і модерація учасників", "Participants and moderation")}</h2>
                      <Button variant="secondary" onClick={loadAdminParticipants} disabled={adminParticipantsLoading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {tr("Оновити", "Refresh")}
                      </Button>
                    </div>

                    {adminParticipantsError ? (
                      <div className="text-sm text-accent-error mb-3">{adminParticipantsError}</div>
                    ) : null}

                    {adminParticipantsActionMessage ? (
                      <div
                        className={`text-sm mb-3 ${
                          adminParticipantsActionTone === "success"
                            ? "text-accent-success"
                            : adminParticipantsActionTone === "warn"
                              ? "text-accent-warn"
                              : "text-accent-error"
                        }`}
                      >
                        {adminParticipantsActionMessage}
                      </div>
                    ) : null}

                    <div className="mb-4 rounded-lg border border-border bg-bg-base/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-mono text-text-primary">{tr("Перевірка на схожість коду", "Code similarity check")}</span>
                        <select
                          value={simProblemId ?? ""}
                          onChange={(e) => setSimProblemId(e.target.value ? Number(e.target.value) : null)}
                          aria-label={tr("Оберіть задачу", "Select problem")}
                          className="h-9 px-2 rounded-md bg-bg-code border border-border text-sm font-mono text-text-primary focus:outline-none"
                        >
                          <option value="">{tr("Оберіть задачу…", "Select problem…")}</option>
                          {(data?.problems ?? []).map((pr) => (
                            <option key={pr.id} value={pr.id}>{pr.label} · {pr.title}</option>
                          ))}
                        </select>
                        <Button variant="secondary" onClick={() => runSimilarityCheck(simProblemId)} disabled={!simProblemId || simLoading}>
                          {simLoading ? tr("Аналіз…", "Analyzing…") : tr("Перевірити", "Check")}
                        </Button>
                        {simCompared != null ? (
                          <span className="text-[11px] text-text-secondary">{tr(`Порівняно подач: ${simCompared}`, `Compared: ${simCompared}`)}</span>
                        ) : null}
                      </div>
                      {simError ? <div className="mt-2 text-xs text-accent-error">{simError}</div> : null}
                      {!simError && simCompared != null && simPairs.length === 0 && !simLoading ? (
                        <div className="mt-2 text-xs text-text-secondary">{tr("Підозрілих пар не знайдено (поріг 60%).", "No suspicious pairs found (60% threshold).")}</div>
                      ) : null}
                      {simPairs.length > 0 ? (
                        <div className="mt-3 space-y-1.5">
                          {simPairs.map((pair, idx) => {
                            const pct = Math.round(pair.similarity * 100);
                            const tone = pct >= 85 ? "text-accent-error border-accent-error/50 bg-accent-error/10" : pct >= 70 ? "text-accent-warn border-accent-warn/50 bg-accent-warn/10" : "text-text-secondary border-border bg-bg-surface";
                            return (
                              <div key={`${pair.a.participantId}-${pair.b.participantId}-${idx}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs font-mono ${tone}`}>
                                <span className="text-text-primary truncate">{pair.a.displayName} ↔ {pair.b.displayName}</span>
                                <span>{pct}%</span>
                              </div>
                            );
                          })}
                          <div className="text-[10px] text-text-muted mt-1">
                            {tr(
                              "Евристика (токен-шинглінг). Високий відсоток — привід для перевірки, не доказ.",
                              "Heuristic (token shingling). A high percentage is a reason to review, not proof."
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

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
                        <table className="min-w-[620px] md:min-w-[760px] w-full text-sm font-mono">
                          <caption className="sr-only">{tr("Учасники контесту та їх статус", "Contest participants and status")}</caption>
                          <thead className="bg-bg-hover">
                            <tr>
                              <th className="hidden sm:table-cell p-2 border-b border-border text-left">#</th>
                              <th className="p-2 border-b border-border text-left">{tr("Учасник", "Participant")}</th>
                              <th className="hidden md:table-cell p-2 border-b border-border text-left">{tr("Тип", "Type")}</th>
                              <th className="hidden lg:table-cell p-2 border-b border-border text-left">{tr("Контест-акаунт", "Contest account")}</th>
                              <th className="p-2 border-b border-border text-left">{tr("Статус", "Status")}</th>
                              <th className="p-2 border-b border-border text-right">{tr("Дія", "Action")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminParticipants.map((p) => (
                              <tr key={p.id} className="odd:bg-bg-base even:bg-bg-surface">
                                <td className="hidden sm:table-cell p-2 border-b border-border">{p.id}</td>
                                <td className="p-2 border-b border-border">{p.displayName}</td>
                                <td className="hidden md:table-cell p-2 border-b border-border">{p.principalType}</td>
                                <td className="hidden lg:table-cell p-2 border-b border-border">{p.contestAccountHandle ? p.contestAccountHandle : "—"}</td>
                                <td className="p-2 border-b border-border">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {p.isDisqualified ? (
                                      <Badge color="warn">{p.retainParticipation ? tr("Учасник · 0 балів", "Participant · 0 points") : tr("Дискваліфіковано", "Disqualified")}</Badge>
                                    ) : (
                                      <Badge color="success">{tr("У заліку", "Active")}</Badge>
                                    )}
                                    {p.attendance === "ABSENT" ? <Badge color="warn">{tr("Відсутній · немає подач", "Absent · no submissions")}</Badge> : p.attendance === "PENDING" ? <span className="text-xs text-text-muted">{tr("Ще немає подач", "No submissions yet")}</span> : p.attendance === "PRESENT" ? <span className="text-xs text-text-muted">{tr(`Подач: ${p.submissionCount ?? 0}`, `Submissions: ${p.submissionCount ?? 0}`)}</span> : null}
                                    {p.integrity && p.integrity.total > 0 ? (
                                      <span
                                        className="inline-flex items-center gap-1 rounded border border-accent-warn/50 bg-accent-warn/10 px-1.5 py-0.5 text-[10px] font-mono text-accent-warn"
                                        title={Object.entries(p.integrity.byType)
                                          .map(([k, v]) => `${k}: ${v}`)
                                          .join(" · ")}
                                      >
                                        ⚠ {p.integrity.total}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="p-2 border-b border-border text-right">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
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
                    <Card className="p-4 border border-border/70 bg-bg-surface/80">
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="font-mono text-text-primary">
                          {tr("Інспектор подач", "Submission inspector")}: {adminSubsParticipant.displayName} (#{adminSubsParticipant.id})
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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

                  {adminSubsParticipant && adminSubsFullPage && typeof document !== "undefined" ? createPortal(
                    <div className="fixed inset-0 z-[110] bg-bg-base" role="dialog" aria-modal="true" aria-label={tr("Інспектор подач", "Submission inspector")}>
                      <div className="h-full flex flex-col">
                        <div className="border-b border-border bg-bg-surface/95 backdrop-blur px-3 py-3 sm:px-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="font-mono text-text-primary text-sm md:text-base">
                            {tr("Інспектор подач", "Submission inspector")}: {adminSubsParticipant.displayName} (#{adminSubsParticipant.id})
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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

                        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                          {adminInspectorBody}
                        </div>
                      </div>
                    </div>,
                    document.body,
                  ) : null}
                  </> : null}
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="contest-manager-section-heading flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span>{tr("Спілкування", "Communication")}</span>
                  <h2>{tr("Питання та оголошення", "Questions and announcements")}</h2>
                  <p>{tr("Відповідай учасникам і публікуй важливі оновлення.", "Answer participants and share important updates.")}</p>
                  </div>
                  <Button variant="secondary" onClick={loadCommunity} disabled={communityLoading || !data.access.canAccessContent}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {tr("Оновити", "Refresh")}
                  </Button>
              </div>
              {communityError ? <div role="alert" className="text-sm text-accent-error">{communityError}</div> : null}
              {!data.access.canAccessContent ? <div className="text-sm text-text-secondary">{tr("Немає доступу до спільноти цього контесту.", "You don't have access to this contest community.")}</div> : null}

              <div className="contest-community-grid">
              <Card className="p-4">
                <h2 className="text-base font-semibold text-text-primary mb-2 flex items-center gap-2">
                  <MessageSquare aria-hidden="true" className="w-4 h-4 text-primary" /> {tr("Питання до організатора", "Questions to organizer")}
                </h2>
                <div className="text-xs text-text-secondary mb-3">
                  {tr(
                    "Це приватні звернення: учасник бачить лише власні питання та відповіді організаторів.",
                    "These are private requests: each participant sees only their own questions and organizer answers."
                  )}
                </div>

                <div className="space-y-3 mb-4">
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
                      id="contest-community-question"
                      name="communityQuestion"
                      aria-label={tr("Питання до організатора", "Question for the organizer")}
                      value={communityQuestionText}
                      onChange={(e) => setCommunityQuestionText(e.target.value)}
                      className="w-full min-h-[90px] rounded-xl bg-bg-code border border-border px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      placeholder={tr("Постав запитання щодо задач, правил або тестів…", "Ask about tasks, rules, or tests…")}
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
                <h2 className="text-base font-semibold text-text-primary mb-2 flex items-center gap-2">
                  <Megaphone aria-hidden="true" className="w-4 h-4 text-primary" /> {tr("Оголошення", "Announcements")}
                </h2>

                {data.access.canManage ? (
                  <div className="space-y-2 mb-3">
                    <textarea
                      id="contest-community-announcement"
                      name="communityAnnouncement"
                      aria-label={tr("Текст оголошення", "Announcement text")}
                      value={communityAnnouncementText}
                      onChange={(e) => setCommunityAnnouncementText(e.target.value)}
                      className="w-full min-h-[80px] rounded-xl bg-bg-code border border-border px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      placeholder={tr("Наприклад: о 18:00 оновлено умову задачі B", "Example: at 18:00 problem B statement updated")}
                    />
                    <div className="flex justify-end">
                      <Button variant="secondary" onClick={postContestAnnouncement} disabled={!communityAnnouncementText.trim()}>
                        {tr("Опублікувати оголошення", "Publish announcement")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};
