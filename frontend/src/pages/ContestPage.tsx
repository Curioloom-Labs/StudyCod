import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ListOrdered, Table2, KeyRound, RefreshCw, Trophy, Eye, Ban, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { MarkdownView } from "../components/MarkdownView";
import { Skeleton } from "../components/ui/Skeleton";
import {
  addContestProblem,
  getContestDetails,
  getContestMyProgress,
  getContestScoreboard,
  listContestAdminParticipants,
  listContestParticipantSubmissionsForAdmin,
  setContestParticipantDisqualified,
  joinContest,
  updateContestProblemSettings,
  updateContest,
  type ContestAdminParticipant,
  type ContestAdminSubmission,
  type ContestDetails,
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
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-mono text-text-primary flex items-center gap-2">
          <Table2 className="w-4 h-4" />
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
        <div className="overflow-auto">
          <table className="min-w-[760px] w-full text-sm font-mono border border-border">
            <thead className="bg-bg-hover">
              <tr>
                <th className="p-2 border-b border-border text-left">#</th>
                <th className="p-2 border-b border-border text-left">{tr("Учасник", "Participant")}</th>
                {problems.map((p) => (
                  <th key={p.id} className="p-2 border-b border-border text-center">
                    {p.label}
                  </th>
                ))}
                <th className="p-2 border-b border-border text-center">{tr("Сума", "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.participantId} className="odd:bg-bg-base even:bg-bg-surface">
                  <td className="p-2 border-b border-border">{r.rank}</td>
                  <td className="p-2 border-b border-border">{r.displayName}</td>
                  {problems.map((p) => {
                    const hit = r.problems.find((x) => x.problemId === p.id);
                    return (
                      <td key={p.id} className="p-2 border-b border-border text-center">
                        {hit?.score ?? 0}
                      </td>
                    );
                  })}
                  <td className="p-2 border-b border-border text-center font-bold text-primary">{r.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

  const [tab, setTab] = React.useState<"problems" | "standings">("problems");
  const [standingsVersion, setStandingsVersion] = React.useState(0);

  const [joinCode, setJoinCode] = React.useState("");
  const [joining, setJoining] = React.useState(false);
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

  const [adminSubsOpen, setAdminSubsOpen] = React.useState(false);
  const [adminSubsLoading, setAdminSubsLoading] = React.useState(false);
  const [adminSubsError, setAdminSubsError] = React.useState<string | null>(null);
  const [adminSubsParticipant, setAdminSubsParticipant] = React.useState<ContestAdminParticipant | null>(null);
  const [adminSubsRows, setAdminSubsRows] = React.useState<ContestAdminSubmission[]>([]);

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

  const openAdminSubmissions = async (p: ContestAdminParticipant) => {
    if (!contestId) return;
    setAdminSubsParticipant(p);
    setAdminSubsRows([]);
    setAdminSubsError(null);
    setAdminSubsOpen(true);
    setAdminSubsLoading(true);
    try {
      const r = await listContestParticipantSubmissionsForAdmin(contestId, p.id, 200);
      setAdminSubsRows(Array.isArray((r as any)?.submissions) ? ((r as any).submissions as ContestAdminSubmission[]) : []);
    } catch (e: any) {
      const msg = (e as any)?.response?.data?.message ? String((e as any).response.data.message) : "";
      setAdminSubsError(msg || tr("Не вдалося завантажити подачі", "Failed to load submissions"));
      setAdminSubsRows([]);
    } finally {
      setAdminSubsLoading(false);
    }
  };

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

      <Modal
        open={adminSubsOpen}
        onClose={() => {
          setAdminSubsOpen(false);
          setAdminSubsError(null);
        }}
        title={tr("Подачі учасника", "Participant submissions")}
      >
        <div className="space-y-3">
          <div className="text-sm font-mono text-text-primary">
            {adminSubsParticipant ? `${adminSubsParticipant.displayName} (#${adminSubsParticipant.id})` : "—"}
          </div>

          {adminSubsError ? <div className="text-sm text-accent-error">{adminSubsError}</div> : null}

          {adminSubsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : adminSubsRows.length === 0 ? (
            <div className="text-sm text-text-secondary">{tr("Немає подач", "No submissions")}</div>
          ) : (
            <div className="max-h-[60vh] overflow-auto border border-border">
              <table className="min-w-[980px] w-full text-xs font-mono">
                <thead className="bg-bg-hover">
                  <tr>
                    <th className="p-2 border-b border-border text-left">#</th>
                    <th className="p-2 border-b border-border text-left">{tr("Час", "Time")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Задача", "Problem")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Фаза", "Phase")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Вердикт", "Verdict")}</th>
                    <th className="p-2 border-b border-border text-center">{tr("Бали", "Score")}</th>
                    <th className="p-2 border-b border-border text-left">{tr("Мова", "Lang")}</th>
                    <th className="p-2 border-b border-border text-left">{tr("Код", "Code")}</th>
                  </tr>
                </thead>
                <tbody>
                  {adminSubsRows.map((s) => (
                    <tr key={s.id} className="odd:bg-bg-base even:bg-bg-surface align-top">
                      <td className="p-2 border-b border-border">{s.id}</td>
                      <td className="p-2 border-b border-border">{fmtDateTime(s.createdAt, i18n.language)}</td>
                      <td className="p-2 border-b border-border text-center">{s.problem?.label ?? "—"}</td>
                      <td className="p-2 border-b border-border text-center">{s.phase === "UPSOLVE" ? tr("Дорішування", "Upsolve") : tr("Контест", "Contest")}</td>
                      <td className="p-2 border-b border-border text-center">{s.verdict ?? "—"}</td>
                      <td className="p-2 border-b border-border text-center">{s.score != null && s.maxScore != null ? `${s.score}/${s.maxScore}` : "—"}</td>
                      <td className="p-2 border-b border-border">{s.language}</td>
                      <td className="p-2 border-b border-border">
                        <pre className="text-[11px] bg-bg-base border border-border p-2 overflow-auto max-h-[180px] max-w-[420px] whitespace-pre-wrap">{s.submittedCode || ""}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <div className="text-lg font-mono text-text-primary">{data.contest.title}</div>
              {data.phase.finished ? <Badge color="warn">{tr("Завершено", "Finished")}</Badge> : data.phase.started ? <Badge color="success">{tr("Йде", "Running")}</Badge> : <Badge color="info">{tr("Скоро", "Upcoming")}</Badge>}
              {data.contest.visibility === "PUBLIC" ? <Badge color="info">Public</Badge> : data.contest.visibility === "PRIVATE_CODE" ? <Badge color="warn">{tr("За кодом", "Code")}</Badge> : <Badge color="info">Class</Badge>}
              {data.contest.isPublished ? <Badge color="success">{tr("Опубліковано", "Published")}</Badge> : <Badge color="warn">{tr("Чернетка", "Draft")}</Badge>}
              {data.contest.allowUpsolve ? <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge> : null}
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
                                    <span>{last.verdict ?? "-"}</span>
                                    {last.phase === "UPSOLVE" ? (
                                      <Badge color="info">{tr("Дорішування", "Upsolve")}</Badge>
                                    ) : (
                                      <Badge color="success">{tr("Контест", "Contest")}</Badge>
                                    )}
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
          ) : (
            <div className="space-y-4">
              <Scoreboard key={`sb-${standingsVersion}`} contestId={data.contest.id} canManage={!!data.access.canManage} />

              {hasToken && data.access.canManage ? (
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-mono text-text-primary">{tr("Модерація учасників", "Participant moderation")}</div>
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
                              <td className="p-2 border-b border-border">
                                {p.isDisqualified ? (
                                  <Badge color="warn">{tr("Дискваліфіковано", "Disqualified")}</Badge>
                                ) : (
                                  <Badge color="success">{tr("У заліку", "Active")}</Badge>
                                )}
                              </td>
                              <td className="p-2 border-b border-border text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button variant="secondary" onClick={() => openAdminSubmissions(p)}>
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
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
