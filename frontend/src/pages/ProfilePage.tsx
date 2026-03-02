import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Award, Flame, Medal, Sparkles, Trophy, History } from "lucide-react";
import type { User, CourseLanguage, Grade, PublicProfilePrivacy } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { getEmailSubscription, updateEmailSubscription, updateProfile } from "../lib/api/profile";
import { listGrades } from "../lib/api/grades";
import { listApprovedLibraryTasks, type JudgeLanguage, type LibraryTaskListItem } from "../lib/api/library";
import { useUIMode } from "../components/interface/UIModeProvider";
import {
  buildContestProfileUrl,
  contestPlatformLabel,
  validateContestHandle,
} from "../utils/contestAccounts";

interface Props {
  user: User;
  onUserChange: (u: User) => void;
}

const DEFAULT_PUBLIC_PROFILE_PRIVACY: PublicProfilePrivacy = {
  showContestStats: true,
  showSolvedHistory: true,
  showLanguageBreakdown: true,
};

type BadgeMilestone = 25 | 50 | 100 | 250 | 500 | 1000;
const BADGES: BadgeMilestone[] = [25, 50, 100, 250, 500, 1000];

function gradeTone(value: number): string {
  if (value >= 10) return "text-accent-success";
  if (value >= 7) return "text-accent-warn";
  if (value >= 4) return "text-yellow-500";
  return "text-accent-error";
}

function courseToJudgeLanguage(course: CourseLanguage): JudgeLanguage {
  if (course === "PYTHON") return "python";
  if (course === "CPP") return "cpp";
  return "java";
}

const ProgressBadge: React.FC<{ milestone: BadgeMilestone; unlocked: boolean }> = ({ milestone, unlocked }) => {
  return (
    <div
      className={
        "rounded-2xl border p-3 transition-fast " +
        (unlocked
          ? "border-primary/60 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),rgba(30,41,59,0.12)_55%,rgba(2,6,23,0.2))]"
          : "border-border bg-bg-base/70 opacity-70")
      }
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="inline-flex items-center gap-1 text-xs font-mono text-text-secondary">
          <Medal className={`w-3.5 h-3.5 ${unlocked ? "text-primary" : "text-text-muted"}`} />
          {unlocked ? "Unlocked" : "Locked"}
        </div>
        <div className="text-[11px] font-mono text-text-secondary">#{milestone}</div>
      </div>

      <div
        className={
          "mx-auto w-14 h-14 rounded-full border flex items-center justify-center text-lg font-mono " +
          (unlocked
            ? "border-primary/60 text-primary bg-primary/10 shadow-[0_0_24px_rgba(16,185,129,0.2)]"
            : "border-border text-text-muted bg-bg-surface")
        }
      >
        {milestone}
      </div>

      <div className="text-center mt-2 text-[11px] font-mono text-text-secondary">tasks solved</div>
    </div>
  );
};

export const ProfilePage: React.FC<Props> = ({ user, onUserChange }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "uk" ? "uk-UA" : "en-US";
  const ui = useUIMode();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);

  const isStudent = !!user.studentId;
  const isEducational = user.userMode === "EDUCATIONAL";

  const [course, setCourse] = useState<CourseLanguage>(user.course);
  const [avatarUrl, setAvatarUrl] = useState<string>(user.avatarUrl ?? "");
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [cfHandle, setCfHandle] = useState<string>(user.contestHandles?.codeforces ?? "");
  const [atcoderHandle, setAtcoderHandle] = useState<string>(user.contestHandles?.atcoder ?? "");
  const [leetcodeHandle, setLeetcodeHandle] = useState<string>(user.contestHandles?.leetcode ?? "");
  const [codechefHandle, setCodechefHandle] = useState<string>(user.contestHandles?.codechef ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const [gradesLoading, setGradesLoading] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryTasks, setLibraryTasks] = useState<LibraryTaskListItem[]>([]);

  const [emailPrefLoading, setEmailPrefLoading] = useState(false);
  const [emailPrefEnabled, setEmailPrefEnabled] = useState<boolean>(user.marketingEmailsEnabled ?? true);
  const [emailPrefEmail, setEmailPrefEmail] = useState<string | null>(user.email ?? null);
  const [publicProfilePrivacy, setPublicProfilePrivacy] = useState<PublicProfilePrivacy>({
    ...DEFAULT_PUBLIC_PROFILE_PRIVACY,
    ...(user.publicProfilePrivacy ?? {}),
  });

  const courseHandles = useMemo(() => {
    const byCourse = user.contestHandlesByCourse;
    const pick = (platform: "codeforces" | "atcoder" | "leetcode" | "codechef") => {
      const scoped = byCourse?.[platform]?.[course];
      if (typeof scoped === "string") return scoped;
      if (scoped === null) return "";
      return String(user.contestHandles?.[platform] ?? "");
    };
    return {
      codeforces: pick("codeforces"),
      atcoder: pick("atcoder"),
      leetcode: pick("leetcode"),
      codechef: pick("codechef"),
    };
  }, [user.contestHandlesByCourse, user.contestHandles, course]);

  useEffect(() => {
    setCourse(user.course);
    setCfHandle(String(user.contestHandles?.codeforces ?? ""));
    setAtcoderHandle(String(user.contestHandles?.atcoder ?? ""));
    setLeetcodeHandle(String(user.contestHandles?.leetcode ?? ""));
    setCodechefHandle(String(user.contestHandles?.codechef ?? ""));
    setPublicProfilePrivacy({
      ...DEFAULT_PUBLIC_PROFILE_PRIVACY,
      ...(user.publicProfilePrivacy ?? {}),
    });
  }, [user]);

  useEffect(() => {
    setCfHandle(courseHandles.codeforces);
    setAtcoderHandle(courseHandles.atcoder);
    setLeetcodeHandle(courseHandles.leetcode);
    setCodechefHandle(courseHandles.codechef);
  }, [courseHandles]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setEmailPrefLoading(true);
        const pref = await getEmailSubscription();
        if (!mounted) return;
        setEmailPrefEnabled(Boolean(pref.enabled));
        setEmailPrefEmail(pref.email ?? null);
      } catch {
        // ignore
      } finally {
        if (mounted) setEmailPrefLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const loadGrades = useCallback(async () => {
    setGradesLoading(true);
    try {
      const data = await listGrades();
      setGrades(Array.isArray(data) ? data : []);
    } catch {
      setGrades([]);
    } finally {
      setGradesLoading(false);
    }
  }, []);

  const loadLibraryTasks = useCallback(async (nextCourse: CourseLanguage) => {
    setLibraryLoading(true);
    try {
      const pageSize = 100;
      const first = await listApprovedLibraryTasks({
        judgeLanguage: courseToJudgeLanguage(nextCourse),
        page: 1,
        pageSize,
      });

      const total = Math.max(0, Number(first.total ?? (first.tasks || []).length));
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      let all = Array.isArray(first.tasks) ? [...first.tasks] : [];

      for (let page = 2; page <= totalPages; page++) {
        const chunk = await listApprovedLibraryTasks({
          judgeLanguage: courseToJudgeLanguage(nextCourse),
          page,
          pageSize,
        });
        if (Array.isArray(chunk.tasks) && chunk.tasks.length > 0) all = all.concat(chunk.tasks);
      }

      setLibraryTasks(all);
    } catch {
      setLibraryTasks([]);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([loadGrades(), loadLibraryTasks(course)]);
      if (!mounted) return;
    })();

    return () => {
      mounted = false;
    };
  }, [course, loadGrades, loadLibraryTasks]);

  const validGrades = useMemo(() => grades.filter((g) => Number.isFinite(Number(g.total))), [grades]);

  const solvedLibraryTasks = useMemo(() => {
    return libraryTasks.filter((t) => Boolean(t.attempt?.solved));
  }, [libraryTasks]);

  const profileStats = useMemo(() => {
    const librarySolved = solvedLibraryTasks.length;
    const badgesUnlocked = BADGES.filter((milestone) => librarySolved >= milestone).length;

    const totalGrades = validGrades.length;
    const avgGrade =
      totalGrades > 0
        ? Number((validGrades.reduce((s, g) => s + Number(g.total), 0) / totalGrades).toFixed(2))
        : null;
    const excellent = validGrades.filter((g) => Number(g.total) >= 10).length;

    return { librarySolved, badgesUnlocked, totalGrades, avgGrade, excellent };
  }, [solvedLibraryTasks, validGrades]);

  const recentHistory = useMemo(() => {
    return [...solvedLibraryTasks]
      .sort((a, b) => new Date(String(b.attempt?.lastCheckedAt ?? 0)).getTime() - new Date(String(a.attempt?.lastCheckedAt ?? 0)).getTime())
      .slice(0, 18);
  }, [solvedLibraryTasks]);

  const contestHandlesValidation = useMemo(() => {
    return {
      codeforces: validateContestHandle(cfHandle),
      atcoder: validateContestHandle(atcoderHandle),
      leetcode: validateContestHandle(leetcodeHandle),
      codechef: validateContestHandle(codechefHandle),
    };
  }, [cfHandle, atcoderHandle, leetcodeHandle, codechefHandle]);

  const hasInvalidContestHandle = useMemo(() => {
    return Object.values(contestHandlesValidation).some((v) => !v.valid);
  }, [contestHandlesValidation]);

  const switchCourse = async (next: CourseLanguage) => {
    if (next === course || isStudent || isEducational) return;
    setCourse(next);
    setMsg(null);
    try {
      const updated = await updateProfile({ course: next });
      onUserChange(updated);
      setMsg(tr("Профіль перемкнено на іншу мову.", "Profile switched to another language."));
      await Promise.all([loadGrades(), loadLibraryTasks(next)]);
    } catch (err: any) {
      setCourse(user.course);
      setMsg(err?.response?.data?.message ?? tr("Не вдалося перемкнути мову профілю", "Failed to switch profile language"));
    }
  };

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setMsg(tr("Підтримуються лише зображення (png/jpg).", "Only images are supported (png/jpg)."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        setAvatarData(data);
        setAvatarUrl(data);
      };
      reader.readAsDataURL(file);
    },
    [tr]
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
  };

  const handleSave = async () => {
    if (isEducational && !isStudent) {
      setMsg(t("teachersCannotChangeProfile"));
      return;
    }

    if (hasInvalidContestHandle) {
      setMsg(tr("Перевір хендли контестів: дозволені лише латиниця/цифри/._- (до 32).", "Check contest handles: only letters/digits/._- are allowed (max 32)."));
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const updated = await updateProfile({
        course: isStudent ? undefined : course,
        avatarUrl: avatarData ? undefined : avatarUrl || null,
        avatarData: avatarData ?? null,
        contestHandles: {
          codeforces: contestHandlesValidation.codeforces.value || null,
          atcoder: contestHandlesValidation.atcoder.value || null,
          leetcode: contestHandlesValidation.leetcode.value || null,
          codechef: contestHandlesValidation.codechef.value || null,
        },
        publicProfilePrivacy,
      });
      onUserChange(updated);
      setMsg(t("changesSaved"));
    } catch (err: any) {
      setMsg(err?.response?.data?.message ?? t("profileSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-0 flex flex-col bg-bg-base">
      <div className="border-b border-border bg-bg-surface p-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-mono text-text-primary">{t("profile")}</h1>
      </div>

      <div className="p-4 md:p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <Card className="p-5 border border-border/70 bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(30,64,175,0.08)_45%,rgba(15,23,42,0.45))]">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="w-20 h-20 rounded-xl border border-border overflow-hidden flex items-center justify-center text-2xl font-mono text-text-primary bg-bg-base/80">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-mono text-text-primary truncate">
                  {isStudent ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : user.username}
                </h2>
                <div className="text-xs text-text-secondary mt-1">
                  {isStudent ? (
                    <>
                      {t("classLabel")}: <span className="text-text-primary">{user.className || t("unknown")}</span>
                      {user.email ? <> · {t("email")}: <span className="text-text-primary">{user.email}</span></> : null}
                    </>
                  ) : (
                    <>
                      {t("language")}: <span className="text-text-primary">{course}</span>
                      {!isEducational ? (
                        <>
                          {" "}· {t("difus")}: <span className="text-text-primary">{user.difus === 1 ? t("advanced") : t("basic")}</span>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
                {!isStudent && !isEducational ? (
                  <div className="mt-2">
                    <Link
                      to={`/u/${encodeURIComponent(user.username)}`}
                      className="inline-flex items-center gap-1 px-2 py-1 border border-border text-[11px] font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
                    >
                      {tr("Публічний профіль", "Public profile")} · @{user.username}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary">{tr("Бібліотека (бейджі/заохочення)", "Library (badges/encouragement)")}</div>
              <div className="mt-1 text-2xl font-mono text-primary flex items-center gap-2">
                <Trophy className="w-5 h-5" /> {profileStats.librarySolved}
              </div>
              <div className="mt-2 text-xs text-text-secondary">
                {tr("Відкрито бейджів", "Badges unlocked")}: <span className="text-text-primary font-mono">{profileStats.badgesUnlocked}/{BADGES.length}</span>
              </div>
            </Card>

            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary">{tr("Навчальний прогрес (власні задачі)", "Learning progress (own tasks)")}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[11px] text-text-secondary">{tr("Оцінок", "Grades")}</div>
                  <div className="text-lg font-mono text-text-primary">{profileStats.totalGrades}</div>
                </div>
                <div>
                  <div className="text-[11px] text-text-secondary">{tr("Середній", "Average")}</div>
                  <div className={`text-lg font-mono ${profileStats.avgGrade != null ? gradeTone(profileStats.avgGrade) : "text-text-muted"}`}>
                    {profileStats.avgGrade != null ? profileStats.avgGrade : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-text-secondary">{tr("Відмінно", "Excellent")}</div>
                  <div className="text-lg font-mono text-accent-success flex items-center gap-1">
                    <Flame className="w-4 h-4" /> {profileStats.excellent}
                  </div>
                </div>
              </div>
              {profileStats.totalGrades === 0 ? (
                <div className="mt-2 text-[11px] text-text-secondary">
                  {tr("Середній бал показується після появи навчальних оцінок.", "Average is shown once learning grades are available.")}
                </div>
              ) : null}
            </Card>
          </div>

          <Card className="p-5 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
            <div className="text-sm font-mono text-text-primary mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              {tr("Бейджі прогресу", "Progress badges")}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {BADGES.map((milestone) => (
                <ProgressBadge key={milestone} milestone={milestone} unlocked={profileStats.librarySolved >= milestone} />
              ))}
            </div>
            <div className="text-[11px] text-text-secondary mt-3">
              {tr(
                "Бейдж відкривається, коли кількість зарахованих задач Бібліотеки досягає порогу.",
                "A badge unlocks when your completed Library tasks reach the milestone."
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 border border-border/70 bg-bg-surface/80 space-y-5">
              {!isStudent && !isEducational ? (
                <div>
                  <h3 className="text-sm font-mono text-text-primary mb-2">{t("programmingLanguage")}</h3>
                  <div className="flex gap-2">
                    <button
                      className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${
                        course === "JAVA" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"
                      }`}
                      onClick={() => switchCourse("JAVA")}
                    >
                      Java
                    </button>
                    <button
                      className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${
                        course === "PYTHON" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"
                      }`}
                      onClick={() => switchCourse("PYTHON")}
                    >
                      Python
                    </button>
                    <button
                      className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${
                        course === "CPP" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"
                      }`}
                      onClick={() => switchCourse("CPP")}
                    >
                      C++
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-mono text-text-primary mb-2">{t("profileAvatar")}</h3>
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border border-dashed border-border bg-bg-code p-5 text-center cursor-pointer hover:border-primary transition-fast"
                >
                  <p className="text-xs font-mono text-text-primary mb-1">{t("dragOrChooseFile")}</p>
                  <input type="file" accept="image/*" className="mt-2 text-xs font-mono" onChange={onSelectFile} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-mono text-text-primary mb-2">{tr("Акаунти для контестів", "Contest accounts")}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    value={cfHandle}
                    onChange={(e) => setCfHandle(e.target.value)}
                    className={`px-3 py-2 bg-bg-code border text-text-primary font-mono text-xs focus:outline-none focus:border-primary ${contestHandlesValidation.codeforces.valid ? "border-border" : "border-accent-error"}`}
                    placeholder="Codeforces handle"
                    maxLength={32}
                  />
                  <input
                    value={atcoderHandle}
                    onChange={(e) => setAtcoderHandle(e.target.value)}
                    className={`px-3 py-2 bg-bg-code border text-text-primary font-mono text-xs focus:outline-none focus:border-primary ${contestHandlesValidation.atcoder.valid ? "border-border" : "border-accent-error"}`}
                    placeholder="AtCoder handle"
                    maxLength={32}
                  />
                  <input
                    value={leetcodeHandle}
                    onChange={(e) => setLeetcodeHandle(e.target.value)}
                    className={`px-3 py-2 bg-bg-code border text-text-primary font-mono text-xs focus:outline-none focus:border-primary ${contestHandlesValidation.leetcode.valid ? "border-border" : "border-accent-error"}`}
                    placeholder="LeetCode handle"
                    maxLength={32}
                  />
                  <input
                    value={codechefHandle}
                    onChange={(e) => setCodechefHandle(e.target.value)}
                    className={`px-3 py-2 bg-bg-code border text-text-primary font-mono text-xs focus:outline-none focus:border-primary ${contestHandlesValidation.codechef.valid ? "border-border" : "border-accent-error"}`}
                    placeholder="CodeChef handle"
                    maxLength={32}
                  />
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  {([
                    ["codeforces", cfHandle],
                    ["atcoder", atcoderHandle],
                    ["leetcode", leetcodeHandle],
                    ["codechef", codechefHandle],
                  ] as const).map(([platform, value]) => {
                    const check = contestHandlesValidation[platform];
                    const link = buildContestProfileUrl(platform, value);
                    if (!value.trim()) {
                      return (
                        <div key={platform} className="text-text-muted font-mono">
                          {contestPlatformLabel(platform)}: {tr("не вказано", "not set")}
                        </div>
                      );
                    }
                    if (!check.valid) {
                      return (
                        <div key={platform} className="text-accent-error font-mono">
                          {contestPlatformLabel(platform)}: {check.error}
                        </div>
                      );
                    }
                    return (
                      <a
                        key={platform}
                        href={link || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="text-secondary hover:underline font-mono"
                      >
                        {contestPlatformLabel(platform)}: @{check.value}
                      </a>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] text-text-secondary">
                  {tr(
                    "Хендли зберігаються окремо для поточного курсу (Java / Python / C++).",
                    "Handles are saved separately for the current course (Java / Python / C++)."
                  )}
                </div>
              </div>

              {!isStudent && !isEducational ? (
                <div>
                  <h3 className="text-sm font-mono text-text-primary mb-2">{tr("Приватність публічного профілю", "Public profile privacy")}</h3>
                  <div className="border border-border bg-bg-code p-3 rounded-md space-y-3">
                    <label className="flex items-center justify-between gap-3 text-xs font-mono">
                      <span className="text-text-primary">{tr("Показувати статистику контестів", "Show contest statistics")}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(publicProfilePrivacy.showContestStats)}
                        onChange={(e) =>
                          setPublicProfilePrivacy((prev) => ({
                            ...prev,
                            showContestStats: e.target.checked,
                          }))
                        }
                        className="accent-primary"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-xs font-mono">
                      <span className="text-text-primary">{tr("Показувати історію розвʼязань", "Show solved history")}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(publicProfilePrivacy.showSolvedHistory)}
                        onChange={(e) =>
                          setPublicProfilePrivacy((prev) => ({
                            ...prev,
                            showSolvedHistory: e.target.checked,
                          }))
                        }
                        className="accent-primary"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-xs font-mono">
                      <span className="text-text-primary">{tr("Показувати розподіл за мовами", "Show language breakdown")}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(publicProfilePrivacy.showLanguageBreakdown)}
                        onChange={(e) =>
                          setPublicProfilePrivacy((prev) => ({
                            ...prev,
                            showLanguageBreakdown: e.target.checked,
                          }))
                        }
                        className="accent-primary"
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {emailPrefEmail ? (
                <div>
                  <h3 className="text-sm font-mono text-text-primary mb-2">{tr("Email-розсилка", "Email updates")}</h3>
                  <div className="border border-border bg-bg-code p-3 rounded-md flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-text-primary">{tr("Отримувати інформаційні листи", "Receive informational emails")}</div>
                      <div className="text-[11px] font-mono text-text-secondary mt-1">{emailPrefEmail}</div>
                    </div>
                    <button
                      disabled={emailPrefLoading}
                      onClick={async () => {
                        const next = !emailPrefEnabled;
                        setEmailPrefEnabled(next);
                        try {
                          setEmailPrefLoading(true);
                          await updateEmailSubscription(next);
                          onUserChange({ ...user, marketingEmailsEnabled: next });
                        } catch (e: any) {
                          setEmailPrefEnabled(!next);
                          alert(e?.response?.data?.message || tr("Не вдалося оновити налаштування", "Failed to update setting"));
                        } finally {
                          setEmailPrefLoading(false);
                        }
                      }}
                      className={`px-3 py-2 border font-mono text-xs transition-fast ${
                        emailPrefEnabled ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:border-primary/50"
                      } disabled:opacity-50`}
                    >
                      {emailPrefLoading ? tr("Збереження…", "Saving…") : emailPrefEnabled ? tr("Увімкнено", "On") : tr("Вимкнено", "Off")}
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-mono text-text-primary mb-2">{tr("Інтерфейс", "Interface")}</h3>
                <div className="border border-border bg-bg-code p-3 rounded-md space-y-3">
                  <div>
                    <div className="text-xs font-mono text-text-primary">{tr("Режим інтерфейсу", "UI mode")}</div>
                    <div className="text-[11px] font-mono text-text-secondary mt-1">
                      {tr(
                        "Focus — компактний робочий простір для щоденного розвʼязування. Classic — ширша класична навігація та звичний вигляд.",
                        "Focus — compact workspace for daily solving. Classic — broader classic navigation with familiar layout."
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => ui.setMode("classic")}
                      className={
                        "px-3 py-2 border font-mono text-xs transition-fast " +
                        (ui.mode === "classic" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50")
                      }
                    >
                      Classic
                    </button>
                    <button
                      onClick={() => ui.setMode("focus")}
                      className={
                        "px-3 py-2 border font-mono text-xs transition-fast " +
                        (ui.mode === "focus" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50")
                      }
                    >
                      Focus
                    </button>
                    <button
                      onClick={() => ui.setClassicForToday()}
                      className="px-3 py-2 border border-border font-mono text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
                    >
                      {tr("Classic до кінця дня", "Classic for today")}
                    </button>
                  </div>

                  {ui.override ? (
                    <div className="text-[11px] font-mono text-text-secondary border border-border bg-bg-surface px-3 py-2 flex items-center justify-between gap-3">
                      <span>
                        {tr("Тимчасовий режим", "Temporary mode")}: <span className="text-text-primary">{ui.override.mode === "classic" ? "Classic" : "Focus"}</span>
                      </span>
                      <button
                        onClick={() => ui.clearOverride()}
                        className="px-2 py-1 border border-border text-text-secondary hover:bg-bg-hover transition-fast"
                      >
                        {tr("Скасувати", "Clear")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {msg ? (
                <div className={`text-xs font-mono ${msg.toLowerCase().includes("error") ? "text-accent-error" : "text-accent-success"}`}>
                  {msg}
                </div>
              ) : null}

              {!user.googleId ? (
                <div>
                  <h3 className="text-sm font-mono text-text-primary mb-2">{t("googleConnection")}</h3>
                  <button
                    onClick={() => {
                      setLinkingGoogle(true);
                      const base = import.meta.env.VITE_API_URL || window.location.origin;
                      window.location.href = `${base}/auth/google?link=true`;
                    }}
                    disabled={linkingGoogle}
                    className="w-full flex items-center justify-center gap-2 border border-border bg-bg-code hover:bg-bg-hover px-4 py-2 text-sm font-mono text-text-primary transition-fast disabled:opacity-50"
                  >
                    {linkingGoogle ? t("linking") : t("linkGoogleAccount")}
                  </button>
                </div>
              ) : (
                <div className="text-xs font-mono text-text-secondary border border-border bg-bg-code px-3 py-2 rounded-md">
                  {tr("✅ Google акаунт підвʼязано.", "✅ Google account is linked.")}
                </div>
              )}

              {!isEducational ? (
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? t("saving") : t("saveChanges")}
                </Button>
              ) : null}
            </Card>

            <Card className="p-5 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
              <div className="text-sm font-mono text-text-primary mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                {tr("Історія виконаних задач", "Solved tasks history")}
              </div>

              {libraryLoading ? (
                <div className="text-sm text-text-secondary">{tr("Завантаження історії...", "Loading history...")}</div>
              ) : recentHistory.length === 0 ? (
                <div className="rounded-xl border border-border bg-bg-base/70 p-4 text-sm text-text-secondary">
                  {libraryLoading
                    ? tr("Завантаження історії бібліотеки...", "Loading library history...")
                    : tr("Ще немає зарахованих задач з Бібліотеки. Розвʼяжи перші задачі — тут зʼявиться історія.", "No completed Library tasks yet. Solve your first ones and history will appear here.")}
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
                  {recentHistory.map((t) => {
                    return (
                      <div key={t.id} className="rounded-xl border border-border bg-bg-base/80 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-mono text-text-primary truncate">{t.title}</div>
                            <div className="text-xs text-text-secondary mt-1">
                              {t.problemCode ?? t.slug ?? tr("Бібліотека", "Library")} · {fmtDateTime(t.attempt?.lastCheckedAt, locale)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-base font-mono font-semibold ${gradeTone(Number(t.attempt?.lastScore ?? 0))}`}>{t.attempt?.lastScore ?? "—"}</div>
                            <div className="text-[11px] text-text-secondary">{tr("Тести", "Tests")}: {t.attempt?.lastTestsPassed ?? 0}/{t.attempt?.lastTestsTotal ?? 0}</div>
                          </div>
                        </div>

                        <div className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono border-border bg-bg-surface text-text-secondary">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          {tr("Задача бібліотеки зарахована", "Library task counted as solved")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

function fmtDateTime(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(locale);
}

export default ProfilePage;
