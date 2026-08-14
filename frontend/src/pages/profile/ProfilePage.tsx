import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { animate, motion, useReducedMotion } from "framer-motion";
import { Award, Flame, Medal, Trophy, History, Star, Shield, Crown, Rocket, Gem, Sparkles } from "lucide-react";
import { Skeleton } from "../../components/ui/Skeleton";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import type { User, CourseLanguage, Grade, PublicProfilePrivacy } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

const CountUp: React.FC<{ value: number; decimals?: number; className?: string }> = ({ value, decimals = 0, className }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = value.toFixed(decimals);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = v.toFixed(decimals);
      },
    });
    return () => controls.stop();
  }, [value, decimals, reduce]);
  return <span ref={ref} className={className}>{value.toFixed(decimals)}</span>;
};
import { getEmailSubscription, updateEmailSubscription, updateProfile } from "../../lib/api/profile";
import { prepareGoogleLinkSession } from "../../lib/api/auth";
import { listGrades } from "../../lib/api/grades";
import { getMyLearningEvidence, listApprovedLibraryTasks, type JudgeLanguage, type LibraryTaskListItem, type LearningSkillEvidence } from "../../lib/api/library";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { PremiumProfileV2, SkillEvidenceDetails, type SkillEvidence } from "../core/PremiumPersonalExperience";

function buildApiUrl(path: string): string {
  const base = String(import.meta.env.VITE_API_URL || window.location.origin || "")
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  return `${base}/api${path.startsWith("/") ? path : `/${path}`}`;
}

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

type BadgeMeta = {
  nameUk: string;
  nameEn: string;
  flavorUk: string;
  flavorEn: string;
  Icon: React.ComponentType<{ className?: string }>;
};

type BadgeRarityMeta = {
  uk: string;
  en: string;
  chipTone: string;
};

const BADGE_RARITY: Record<BadgeMilestone, BadgeRarityMeta> = {
  25: { uk: "Звичайний", en: "Common", chipTone: "border-border bg-bg-code text-text-secondary" },
  50: { uk: "Рідкісний", en: "Rare", chipTone: "border-secondary/45 bg-secondary/12 text-secondary" },
  100: { uk: "Епічний", en: "Epic", chipTone: "border-accent-info/45 bg-accent-info/12 text-accent-info" },
  250: { uk: "Міфічний", en: "Mythic", chipTone: "border-primary/45 bg-primary/12 text-primary" },
  500: { uk: "Легендарний", en: "Legendary", chipTone: "border-accent-warning/45 bg-accent-warning/12 text-accent-warning" },
  1000: { uk: "Артефакт", en: "Artifact", chipTone: "border-accent-error/45 bg-accent-error/12 text-accent-error" },
};

const BADGE_META: Record<BadgeMilestone, BadgeMeta> = {
  25: {
    nameUk: "Перший крок",
    nameEn: "First Steps",
    flavorUk: "Початок серії перемог",
    flavorEn: "The beginning of your streak",
    Icon: Star,
  },
  50: {
    nameUk: "Стабільний ритм",
    nameEn: "Steady Rhythm",
    flavorUk: "Рухаємось без зупинок",
    flavorEn: "Consistent and unstoppable",
    Icon: Shield,
  },
  100: {
    nameUk: "Сотка",
    nameEn: "Century",
    flavorUk: "Потужний рубіж досягнуто",
    flavorEn: "A major milestone unlocked",
    Icon: Medal,
  },
  250: {
    nameUk: "Майстер",
    nameEn: "Master",
    flavorUk: "Твоя форма вже еталон",
    flavorEn: "Your form is now elite",
    Icon: Crown,
  },
  500: {
    nameUk: "Легенда",
    nameEn: "Legend",
    flavorUk: "Півтисячі — це серйозно",
    flavorEn: "500 solved — serious level",
    Icon: Rocket,
  },
  1000: {
    nameUk: "Космічний рівень",
    nameEn: "Cosmic Tier",
    flavorUk: "1000+ — режим боса",
    flavorEn: "1000+ solved — boss mode",
    Icon: Gem,
  },
};

function gradeTone(value: number): string {
  if (value >= 85) return "text-accent-success";
  if (value >= 65) return "text-accent-warn";
  if (value >= 40) return "text-accent-warning";
  return "text-accent-error";
}

function courseToJudgeLanguage(course: CourseLanguage): JudgeLanguage {
  if (course === "PYTHON") return "python";
  if (course === "CPP") return "cpp";
  return "java";
}

const ProgressBadge: React.FC<{ milestone: BadgeMilestone; solvedCount: number; unlocked: boolean; tr: (uk: string, en: string) => string }> = ({ milestone, solvedCount, unlocked, tr }) => {
  const meta = BADGE_META[milestone];
  const rarity = BADGE_RARITY[milestone];
  const progress = Math.max(0, Math.min(100, Math.round((solvedCount / milestone) * 100)));
  const remaining = Math.max(0, milestone - solvedCount);
  const Icon = meta.Icon;
  const badgeHint = unlocked
    ? tr("Бейдж відкрито. Продовжуй серію!", "Badge unlocked. Keep the streak alive!")
    : tr(`Ще ${remaining} задач до розблокування`, `${remaining} tasks left to unlock`);

  const reduce = useReducedMotion();

  return (
    <motion.div
      variants={fadeUpItem}
      title={badgeHint}
      tabIndex={0}
      aria-label={badgeHint}
      className={
        "group rounded-xl border p-4 transition-fast relative overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] " +
        (unlocked
          ? "border-primary/40 bg-bg-surface hover:border-primary/60"
          : "border-border bg-bg-surface opacity-70 hover:opacity-100 hover:border-primary/30")
      }
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-mono tracking-wide ${rarity.chipTone}`}>
          {tr(rarity.uk, rarity.en)}
        </span>
        <div className="text-[11px] font-mono text-text-muted">#{milestone}</div>
      </div>

      <div
        className={
          "mx-auto relative w-14 h-14 rounded-full border flex items-center justify-center transition-fast group-hover:scale-105 " +
          (unlocked
            ? "border-primary/60 text-primary bg-primary/10"
            : "border-border text-text-muted bg-bg-base")
        }
      >
        <Icon className="w-6 h-6 relative z-[1]" />
      </div>

      <div className="text-center mt-2.5 text-xs font-mono text-text-primary">{tr(meta.nameUk, meta.nameEn)}</div>
      <div className="text-center mt-1 text-[11px] font-mono text-text-secondary truncate">{tr(meta.flavorUk, meta.flavorEn)}</div>

      <div className="mt-3 space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-bg-hover overflow-hidden">
          <motion.div
            className={`h-full rounded-full origin-left ${unlocked ? "bg-primary" : "bg-text-muted/40"}`}
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: progress / 100 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: "100%", transformOrigin: "left" }}
          />
        </div>
        <div className="text-center text-[11px] font-mono text-text-secondary">
          {solvedCount}/{milestone} {tr("задач", "tasks")}
        </div>
      </div>
    </motion.div>
  );
};

export const ProfilePage: React.FC<Props> = ({ user, onUserChange }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "uk" ? "uk-UA" : "en-US";
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const isDesignPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

  const isStudent = !!user.studentId;
  const isEducational = user.userMode === "EDUCATIONAL";

  const [course, setCourse] = useState<CourseLanguage>(user.activeRuntime || "PYTHON");
  const [avatarUrl, setAvatarUrl] = useState<string>(user.avatarUrl ?? "");
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const [, setGradesLoading] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryTasks, setLibraryTasks] = useState<LibraryTaskListItem[]>([]);
  const [learningEvidence, setLearningEvidence] = useState<LearningSkillEvidence | null>(null);

  const [emailPrefLoading, setEmailPrefLoading] = useState(false);
  const [emailPrefEnabled, setEmailPrefEnabled] = useState<boolean>(user.marketingEmailsEnabled ?? true);
  const [emailPrefEmail, setEmailPrefEmail] = useState<string | null>(user.email ?? null);
  const [publicProfilePrivacy, setPublicProfilePrivacy] = useState<PublicProfilePrivacy>({
    ...DEFAULT_PUBLIC_PROFILE_PRIVACY,
    ...(user.publicProfilePrivacy ?? {}),
  });

  useEffect(() => {
    setCourse(user.activeRuntime || "PYTHON");
    setPublicProfilePrivacy({
      ...DEFAULT_PUBLIC_PROFILE_PRIVACY,
      ...(user.publicProfilePrivacy ?? {}),
    });
  }, [user]);

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
    if (isEducational) {
      setGrades([]);
      setGradesLoading(false);
      return;
    }

    setGradesLoading(true);
    try {
      const data = await listGrades();
      setGrades(Array.isArray(data) ? data : []);
    } catch {
      setGrades([]);
    } finally {
      setGradesLoading(false);
    }
  }, [isEducational]);

  const libraryReqRef = useRef(0);
  const loadLibraryTasks = useCallback(async (nextCourse: CourseLanguage) => {
    // Each call gets a token; a later call (e.g. fast course switching) bumps it
    // so this run's paginated results can't overwrite the newer course's data.
    const reqId = ++libraryReqRef.current;
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
        if (libraryReqRef.current !== reqId) return; // superseded by a newer load
        const chunk = await listApprovedLibraryTasks({
          judgeLanguage: courseToJudgeLanguage(nextCourse),
          page,
          pageSize,
        });
        if (Array.isArray(chunk.tasks) && chunk.tasks.length > 0) all = all.concat(chunk.tasks);
      }

      if (libraryReqRef.current !== reqId) return; // superseded; don't clobber newer data
      setLibraryTasks(all);
    } catch {
      if (libraryReqRef.current === reqId) setLibraryTasks([]);
    } finally {
      if (libraryReqRef.current === reqId) setLibraryLoading(false);
    }
  }, []);

  const loadLearningEvidence = useCallback(async () => {
    try {
      setLearningEvidence(await getMyLearningEvidence());
    } catch {
      setLearningEvidence(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([loadGrades(), loadLibraryTasks(course), loadLearningEvidence()]);
      if (!mounted) return;
    })();

    return () => {
      mounted = false;
    };
  }, [course, loadGrades, loadLibraryTasks, loadLearningEvidence]);

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
    const excellent = validGrades.filter((g) => Number(g.total) >= 85).length;

    return { librarySolved, badgesUnlocked, totalGrades, avgGrade, excellent };
  }, [solvedLibraryTasks, validGrades]);

  const skillEvidence = useMemo<SkillEvidence>(() => {
    if (isEducational && learningEvidence) {
      return {
        practicedTasks: learningEvidence.practicedTasks,
        solvedTasks: learningEvidence.solvedTasks,
        solvedAfterFailure: learningEvidence.solvedAfterFailure,
        revisitedSolved: learningEvidence.revisitedSolved,
        topics: learningEvidence.topics.map(({ name, practiced, solved }) => ({ name, practiced, solved })),
        overcomeCategories: learningEvidence.overcomeCategories,
        recentSkills: learningEvidence.recentSkills,
      };
    }
    return {
      practicedTasks: 0,
      solvedTasks: 0,
      solvedAfterFailure: 0,
      revisitedSolved: 0,
      topics: [],
      overcomeCategories: [],
      recentSkills: [],
    };
  }, [isEducational, learningEvidence]);

  const weeklyActiveDays = useMemo(() => {
    const startOfWindow = Date.now() - 6 * 24 * 60 * 60 * 1000;
    return new Set(
      validGrades
        .filter((grade) => new Date(grade.createdAt).getTime() >= startOfWindow)
        .map((grade) => new Date(grade.createdAt).toDateString())
    ).size;
  }, [validGrades]);

  const legacyIad = (user as User & { iad?: number | null }).iad;
  const currentIad = Number(legacyIad ?? user.difus ?? 0);

  const recentHistory = useMemo(() => {
    return [...solvedLibraryTasks]
      .sort((a, b) => new Date(String(b.attempt?.lastCheckedAt ?? 0)).getTime() - new Date(String(a.attempt?.lastCheckedAt ?? 0)).getTime())
      .slice(0, 18);
  }, [solvedLibraryTasks]);

  const switchCourse = async (next: CourseLanguage) => {
    if (next === course || isStudent || isEducational) return;
    if (isDesignPreview) {
      setCourse(next);
      setMsg(null);
      return;
    }
    // A runtime is selected by activating a course in the catalog. The profile
    // must not mutate a global User.lang/course field or pretend that a click
    // changed the learning route.
    window.location.assign("/learning/catalog");
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

    setSaving(true);
    setMsg(null);
    try {
      const updated = await updateProfile({
        avatarUrl: avatarData ? undefined : avatarUrl || null,
        avatarData: avatarData ?? null,
        publicProfilePrivacy,
      });
      onUserChange(updated);
      setMsg(t("changesSaved"));
    } catch (err: unknown) {
      setMsg(getErrorMessageFromUnknown(err, t("profileSaveError")));
    } finally {
      setSaving(false);
    }
  };

  if (!isEducational) {
    return <>
      <PremiumProfileV2
        user={user}
        avatarUrl={avatarUrl}
        course={course}
        stats={isDesignPreview && profileStats.totalGrades === 0 && profileStats.librarySolved === 0
          ? { librarySolved: 18, badgesUnlocked: 2, totalGrades: 11, avgGrade: 84.6, excellent: 7 }
          : profileStats}
        currentIad={currentIad}
        weeklyActiveDays={isDesignPreview && weeklyActiveDays === 0 ? 4 : weeklyActiveDays}
        skillEvidence={undefined}
        saving={saving}
        message={msg}
        onAvatar={onSelectFile}
        onCourse={switchCourse}
        onSave={handleSave}
      />
    </>;
  }

  return (
    <div className="min-h-0 flex flex-col bg-bg-base overflow-y-auto">
      <div className="px-4 md:px-8 pt-8 pb-6 max-w-5xl mx-auto w-full">
        <PageEyebrow label={t("profile")} />
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="mt-4 flex flex-col sm:flex-row sm:items-center gap-5"
        >
          <motion.div variants={fadeUpItem} className="relative shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-3xl font-mono text-primary bg-bg-surface ring-2 ring-primary/40 ring-offset-2 ring-offset-bg-base">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`${tr("Аватар", "Avatar")}: ${user.username}`} className="w-full h-full object-cover" />
              ) : (
                user.username.slice(0, 1).toUpperCase()
              )}
            </div>
          </motion.div>

          <motion.div variants={fadeUpItem} className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary truncate">
              {isStudent ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : user.username}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border bg-bg-surface px-2.5 py-0.5 text-[11px] font-mono text-text-secondary">
                #{user.id}
              </span>
              {isStudent ? (
                <>
                  <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-mono text-primary">
                    {user.className || t("unknown")}
                  </span>
                  {user.email ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-bg-surface px-2.5 py-0.5 text-[11px] font-mono text-text-secondary">
                      {user.email}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-mono text-primary">
                    {course}
                  </span>
                  {!isEducational ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-bg-surface px-2.5 py-0.5 text-[11px] font-mono text-text-secondary">
                      {tr("IAD", "IAD")}: {currentIad >= 0.65 ? t("advanced") : currentIad <= 0.35 ? t("basic") : tr("Середній", "Intermediate")}
                    </span>
                  ) : null}
                </>
              )}
            </div>
            {/*
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to={`/u/${encodeURIComponent(user.username)}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary hover:border-primary/40 hover:bg-bg-hover transition-fast"
                >
                  {tr("Публічний профіль", "Public profile")} · @{user.username}
                </Link>
                <Link
                  to="/iad"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary hover:border-primary/40 hover:bg-bg-hover transition-fast"
                >
                  {tr("Деталі IAD", "IAD details")}
                </Link>
                <Link
                  to="/profile/certificates"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-mono text-text-secondary hover:text-text-primary hover:border-primary/40 hover:bg-bg-hover transition-fast"
                >
                  {tr("Сертифікати", "Certificates")}
                </Link>
              </div>
            */}
          </motion.div>
        </motion.div>

        <div className="mt-6 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />
      </div>

      <div className="px-4 md:px-8 pb-12 max-w-5xl mx-auto w-full space-y-8">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5">
            <div className="text-xs font-mono text-text-secondary">{tr("Бібліотека (бейджі/заохочення)", "Library (badges/encouragement)")}</div>
            <div className="mt-2 flex items-center gap-2 text-3xl font-mono font-semibold text-primary">
              <Trophy className="w-6 h-6" /> <CountUp value={profileStats.librarySolved} />
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              {tr("Відкрито бейджів", "Badges unlocked")}: <span className="text-text-primary font-mono">{profileStats.badgesUnlocked}/{BADGES.length}</span>
            </div>
          </motion.div>

          <motion.div variants={fadeUpItem} className="rounded-xl border border-border bg-bg-surface p-5">
            <div className="text-xs font-mono text-text-secondary">{tr("Навчальний прогрес (власні задачі)", "Learning progress (own tasks)")}</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] font-mono text-text-secondary">{tr("Оцінок", "Grades")}</div>
                <div className="text-xl font-mono font-semibold text-text-primary"><CountUp value={profileStats.totalGrades} /></div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-text-secondary">{tr("Середній", "Average")}</div>
                <div className={`text-xl font-mono font-semibold ${profileStats.avgGrade != null ? gradeTone(profileStats.avgGrade) : "text-text-muted"}`}>
                  {profileStats.avgGrade != null ? <CountUp value={profileStats.avgGrade} decimals={1} /> : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-text-secondary">{tr("Відмінно", "Excellent")}</div>
                <div className="text-xl font-mono font-semibold text-accent-success flex items-center gap-1">
                  <Flame className="w-4 h-4" /> <CountUp value={profileStats.excellent} />
                </div>
              </div>
            </div>
            {isEducational && isStudent ? (
              <div className="mt-3 text-[11px] text-text-secondary">
                {tr("Оцінки в EDU дивись у розділі «Мій журнал».", "In EDU, check your grades in “My Journal”.")}
              </div>
            ) : profileStats.totalGrades === 0 ? (
              <div className="mt-3 text-[11px] text-text-secondary">
                {tr("Середній бал показується після появи навчальних оцінок.", "Average is shown once learning grades are available.")}
              </div>
            ) : null}
          </motion.div>
        </motion.div>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-mono uppercase tracking-[0.08em] text-text-muted">
            <Award className="w-4 h-4 text-primary" />
            {tr("Бейджі прогресу", "Progress badges")}
          </div>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
          >
            {BADGES.map((milestone) => (
              <ProgressBadge
                key={milestone}
                milestone={milestone}
                solvedCount={profileStats.librarySolved}
                unlocked={profileStats.librarySolved >= milestone}
                tr={tr}
              />
            ))}
          </motion.div>
          <div className="text-[11px] text-text-secondary">
            {tr(
              "Бейдж відкривається, коли кількість зарахованих задач Бібліотеки досягає порогу.",
              "A badge unlocks when your completed Library tasks reach the milestone."
            )}
          </div>
        </section>

        {isEducational ? <SkillEvidenceDetails evidence={skillEvidence} label={tr} /> : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-6 md:p-7 border border-border/70 bg-bg-surface/80 space-y-7">
              {/*
                <div className="space-y-3">
                  <h3 className="text-sm font-mono text-text-primary">{t("programmingLanguage")}</h3>
                  <div className="flex gap-2">
                    <button type="button"
                      className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${
                        course === "JAVA" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"
                      }`}
                      onClick={() => switchCourse("JAVA")}
                    >
                      Java
                    </button>
                    <button type="button"
                      className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${
                        course === "PYTHON" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"
                      }`}
                      onClick={() => switchCourse("PYTHON")}
                    >
                      Python
                    </button>
                    <button type="button"
                      className={`flex-1 py-2 px-4 border font-mono text-xs transition-fast ${
                        course === "CPP" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"
                      }`}
                      onClick={() => switchCourse("CPP")}
                    >
                      C++
                    </button>
                  </div>
                </div>
              */}

              <div className="space-y-3">
                <h3 className="text-sm font-mono text-text-primary">{t("profileAvatar")}</h3>
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border border-dashed border-border bg-bg-code p-6 text-center cursor-pointer hover:border-primary transition-fast"
                >
                  <p className="text-xs font-mono text-text-primary mb-1">{t("dragOrChooseFile")}</p>
                  <input type="file" accept="image/*" className="mt-2 text-xs font-mono" onChange={onSelectFile} />
                </div>
              </div>

              {/*
                <div className="space-y-3">
                  <h3 className="text-sm font-mono text-text-primary">{tr("Приватність публічного профілю", "Public profile privacy")}</h3>
                  <div className="border border-border bg-bg-code p-4 rounded-md space-y-3">
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
              */}

              {emailPrefEmail ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-mono text-text-primary">{tr("Email-розсилка", "Email updates")}</h3>
                  <div className="border border-border bg-bg-code p-4 rounded-md flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-text-primary">{tr("Отримувати інформаційні листи", "Receive informational emails")}</div>
                      <div className="text-[11px] font-mono text-text-secondary mt-1">{emailPrefEmail}</div>
                    </div>
                    <button type="button"
                      disabled={emailPrefLoading}
                      onClick={async () => {
                        const next = !emailPrefEnabled;
                        setEmailPrefEnabled(next);
                        try {
                          setEmailPrefLoading(true);
                          await updateEmailSubscription(next);
                          onUserChange({ ...user, marketingEmailsEnabled: next });
                        } catch (e: unknown) {
                          setEmailPrefEnabled(!next);
                          showToast({ type: "error", message: getErrorMessageFromUnknown(e, tr("Не вдалося оновити налаштування", "Failed to update setting")) });
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

              <div className="space-y-3">
                <h3 className="text-sm font-mono text-text-primary">{tr("Інтерфейс", "Interface")}</h3>
                <div className="border border-border bg-bg-code p-4 rounded-md space-y-3">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-xs font-mono text-text-primary">{tr("Єдиний інтерфейс StudyCod", "One StudyCod interface")}</div>
                      <div className="mt-1 text-[11px] font-mono leading-relaxed text-text-secondary">
                        {tr(
                          "Один узгоджений досвід на ПК, планшеті й телефоні. Навігація, прогрес та робочі інструменти синхронні на всіх екранах.",
                          "One consistent experience across desktop, tablet, and phone. Navigation, progress, and workspace tools stay in sync across screens."
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {msg ? (
                <div className={`text-xs font-mono ${msg.toLowerCase().includes("error") ? "text-accent-error" : "text-accent-success"}`}>
                  {msg}
                </div>
              ) : null}

              {!user.googleId ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-mono text-text-primary">{t("googleConnection")}</h3>
                  <button type="button"
                    onClick={async () => {
                      setLinkingGoogle(true);
                      try {
                        await prepareGoogleLinkSession();
                        window.location.href = buildApiUrl("/auth/google?link=true");
                      } catch (e: unknown) {
                        setLinkingGoogle(false);
                        showToast({
                          type: "error",
                          message: getErrorMessageFromUnknown(
                            e,
                            tr("Не вдалося підготувати підключення Google.", "Failed to prepare Google linking.")
                          )
                        });
                      }
                    }}
                    disabled={linkingGoogle}
                    className="w-full flex items-center justify-center gap-2 border border-border bg-bg-code hover:bg-bg-hover px-4 py-2 text-sm font-mono text-text-primary transition-fast disabled:opacity-50"
                  >
                    {linkingGoogle ? t("linking") : t("linkGoogleAccount")}
                  </button>
                </div>
              ) : (
                <div className="text-xs font-mono text-text-secondary border border-border bg-bg-code px-4 py-3 rounded-md">
                  {tr("Google акаунт підвʼязано.", "Google account is linked.")}
                </div>
              )}

              {!isEducational ? (
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? t("saving") : t("saveChanges")}
                </Button>
              ) : null}
            </Card>

            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                {tr("Історія виконаних задач", "Solved tasks history")}
              </div>

              {libraryLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : recentHistory.length === 0 ? (
                <div className="rounded-xl border border-border bg-bg-base/70 p-4 text-sm text-text-secondary">
                  {tr("Ще немає зарахованих задач з Бібліотеки. Розвʼяжи перші задачі — тут зʼявиться історія.", "No completed Library tasks yet. Solve your first ones and history will appear here.")}
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
                  {recentHistory.map((t) => {
                    return (
                      <div key={t.id} className="rounded-xl border border-border bg-bg-base/80 p-3 transition-fast hover:-translate-y-0.5 hover:border-primary/40">
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
