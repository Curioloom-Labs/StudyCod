import React from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Award, Trophy, Code2, CheckCircle2, CalendarClock, Star, Shield, Medal, Crown, Rocket, Gem, Sparkles } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { getPublicProfile } from "../../lib/api/profile";
import type { PublicProfile } from "../../types";
import { buildContestProfileUrl, contestPlatformLabel } from "../../utils/contestAccounts";

const BADGES = [25, 50, 100, 250, 500, 1000] as const;
type BadgeMilestone = (typeof BADGES)[number];

type BadgeMeta = {
  nameUk: string;
  nameEn: string;
  flavorUk: string;
  flavorEn: string;
  Icon: React.ComponentType<{ className?: string }>;
  unlockedTone: string;
};

type BadgeRarityMeta = {
  uk: string;
  en: string;
  chipTone: string;
};

const BADGE_META: Record<BadgeMilestone, BadgeMeta> = {
  25: {
    nameUk: "Перший крок",
    nameEn: "First Steps",
    flavorUk: "Початок серії перемог",
    flavorEn: "The beginning of your streak",
    Icon: Star,
    unlockedTone: "from-emerald-500/25 via-teal-500/10 to-transparent",
  },
  50: {
    nameUk: "Стабільний ритм",
    nameEn: "Steady Rhythm",
    flavorUk: "Рухаємось без зупинок",
    flavorEn: "Consistent and unstoppable",
    Icon: Shield,
    unlockedTone: "from-cyan-500/25 via-sky-500/10 to-transparent",
  },
  100: {
    nameUk: "Сотка",
    nameEn: "Century",
    flavorUk: "Потужний рубіж досягнуто",
    flavorEn: "A major milestone unlocked",
    Icon: Medal,
    unlockedTone: "from-violet-500/25 via-indigo-500/10 to-transparent",
  },
  250: {
    nameUk: "Майстер",
    nameEn: "Master",
    flavorUk: "Твоя форма вже еталон",
    flavorEn: "Your form is now elite",
    Icon: Crown,
    unlockedTone: "from-fuchsia-500/25 via-purple-500/10 to-transparent",
  },
  500: {
    nameUk: "Легенда",
    nameEn: "Legend",
    flavorUk: "Півтисячі — це серйозно",
    flavorEn: "500 solved — serious level",
    Icon: Rocket,
    unlockedTone: "from-amber-500/25 via-orange-500/10 to-transparent",
  },
  1000: {
    nameUk: "Космічний рівень",
    nameEn: "Cosmic Tier",
    flavorUk: "1000+ — режим боса",
    flavorEn: "1000+ solved — boss mode",
    Icon: Gem,
    unlockedTone: "from-pink-500/25 via-rose-500/10 to-transparent",
  },
};

const BADGE_RARITY: Record<BadgeMilestone, BadgeRarityMeta> = {
  25: { uk: "Звичайний", en: "Common", chipTone: "border-slate-500/40 bg-slate-500/10 text-slate-300" },
  50: { uk: "Рідкісний", en: "Rare", chipTone: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" },
  100: { uk: "Епічний", en: "Epic", chipTone: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  250: { uk: "Міфічний", en: "Mythic", chipTone: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300" },
  500: { uk: "Легендарний", en: "Legendary", chipTone: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  1000: { uk: "Артефакт", en: "Artifact", chipTone: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
};

function fmtDateTime(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(locale);
}

const PublicProgressBadge: React.FC<{
  milestone: BadgeMilestone;
  solvedCount: number;
  unlocked: boolean;
  tr: (uk: string, en: string) => string;
}> = ({ milestone, solvedCount, unlocked, tr }) => {
  const meta = BADGE_META[milestone];
  const rarity = BADGE_RARITY[milestone];
  const progress = Math.max(0, Math.min(100, Math.round((solvedCount / milestone) * 100)));
  const remaining = Math.max(0, milestone - solvedCount);
  const Icon = meta.Icon;
  const badgeHint = unlocked
    ? tr("Бейдж відкрито. Продовжуй серію 🔥", "Badge unlocked. Keep the streak alive 🔥")
    : tr(`Ще ${remaining} задач до розблокування`, `${remaining} tasks left to unlock`);

  return (
    <div
      title={badgeHint}
      tabIndex={0}
      aria-label={badgeHint}
      className={
        "group rounded-2xl border p-3 transition-fast relative overflow-hidden focus:outline-none focus:ring-1 focus:ring-primary/60 " +
        (unlocked
          ? `border-primary/60 bg-gradient-to-br ${meta.unlockedTone} shadow-[0_0_28px_rgba(16,185,129,0.16)]`
          : "border-border bg-bg-base/70 opacity-70")
      }
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_45%)]" />

      {unlocked ? (
        <>
          <Sparkles className="pointer-events-none absolute left-2 top-2 w-3 h-3 text-primary/80 opacity-75 group-hover:opacity-100 transition-fast" />
          <Sparkles className="pointer-events-none absolute right-3 bottom-3 w-2.5 h-2.5 text-primary/70 opacity-60 animate-pulse" />
        </>
      ) : null}

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="inline-flex items-center gap-1 text-xs font-mono text-text-secondary">
          <Icon className={`w-3.5 h-3.5 ${unlocked ? "text-primary" : "text-text-muted"}`} />
          {unlocked ? tr("Активний", "Active") : tr("Locked", "Locked")}
        </div>
        <div className="text-[11px] font-mono text-text-secondary">#{milestone}</div>
      </div>

      <div className="mb-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-mono tracking-wide ${rarity.chipTone}`}>
          {tr(rarity.uk, rarity.en)}
        </span>
      </div>

      <div
        className={
          "mx-auto relative w-14 h-14 rounded-full border flex items-center justify-center text-lg font-mono " +
          (unlocked
            ? "border-primary/60 text-primary bg-primary/10 shadow-[0_0_24px_rgba(16,185,129,0.2)]"
            : "border-border text-text-muted bg-bg-surface")
        }
      >
        {unlocked ? <span className="absolute -inset-1 rounded-full border border-primary/35 animate-pulse" /> : null}
        <Icon className="w-6 h-6 relative z-[1]" />
      </div>

      <div className="text-center mt-2 text-xs font-mono text-text-primary">{tr(meta.nameUk, meta.nameEn)}</div>
      <div className="text-center mt-1 text-[11px] font-mono text-text-secondary truncate">{tr(meta.flavorUk, meta.flavorEn)}</div>

      <div className="mt-2.5 space-y-1">
        <div className="h-1.5 w-full rounded-full bg-bg-surface border border-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${unlocked ? "bg-primary" : "bg-text-muted/40"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-center text-[11px] font-mono text-text-secondary">
          {solvedCount}/{milestone} {tr("задач", "tasks")}
        </div>
      </div>

      <div className="mt-1.5 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-10 group-hover:opacity-100 group-focus:max-h-10 group-focus:opacity-100">
        <div className="text-center text-[10px] font-mono text-text-secondary bg-bg-surface/80 border border-border rounded px-2 py-1">
          {badgeHint}
        </div>
      </div>
    </div>
  );
};

export const PublicProfilePage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = React.useCallback(
    (uk: string, en: string) => ((i18n.language ?? "").toLowerCase().startsWith("en") ? en : uk),
    [i18n.language]
  );

  const locale = (i18n.language ?? "").toLowerCase().startsWith("en") ? "en-US" : "uk-UA";
  const { username } = useParams();
  const safeUsername = String(username ?? "").trim();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<PublicProfile | null>(null);
  const getErrorCode = (errorValue: unknown): string => {
    const responseMessage = (errorValue as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
    return typeof responseMessage === "string" ? responseMessage : "";
  };

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setProfile(null);

    getPublicProfile(safeUsername)
      .then((p) => {
        if (!mounted) return;
        setProfile(p);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        const code = getErrorCode(e);
        setError(
          code === "PUBLIC_PROFILE_NOT_FOUND"
            ? tr("Профіль не знайдено", "Profile not found")
            : tr("Не вдалося завантажити публічний профіль", "Failed to load public profile")
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [safeUsername, tr]);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-3 py-2 border border-border text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            <ArrowLeft className="w-4 h-4" />
            {tr("На головну", "Back to home")}
          </Link>
          {profile ? <div className="text-xs font-mono text-text-secondary">@{profile.username}</div> : null}
        </div>

        {loading ? (
          <Card className="p-6 text-sm text-text-secondary">{tr("Завантаження профілю...", "Loading profile...")}</Card>
        ) : error ? (
          <Card className="p-6 text-sm text-accent-error">{error}</Card>
        ) : !profile ? (
          <Card className="p-6 text-sm text-text-secondary">{tr("Профіль недоступний", "Profile is unavailable")}</Card>
        ) : (
          <>
            {(() => {
              const privacy = profile.privacy ?? {
                showContestStats: true,
                showSolvedHistory: true,
                showLanguageBreakdown: true,
              };
              return (
                <>
            <Card className="p-5 border border-border/70 bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(30,64,175,0.08)_45%,rgba(15,23,42,0.45))]">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-border overflow-hidden flex items-center justify-center text-2xl font-mono text-text-primary bg-bg-base/80">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    profile.username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-mono text-text-primary truncate">{profile.username}</h1>
                  <div className="text-xs text-text-secondary mt-1 flex flex-wrap items-center gap-2">
                    <span>{tr("Мова", "Language")}: <span className="text-text-primary">{profile.lang}</span></span>
                    <span>·</span>
                    <span>{tr("IAD", "IAD")}: <span className="text-text-primary">{profile.iad ?? profile.difus}</span></span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> {tr("З нами з", "Joined")}: <span className="text-text-primary">{fmtDateTime(profile.joinedAt, locale)}</span></span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 border border-border/70 bg-bg-surface/80">
              <div className="text-xs text-text-secondary mb-2">{tr("Контест-акаунти", "Contest accounts")}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {(["codeforces", "atcoder", "leetcode", "codechef"] as const).map((platform) => {
                  const handle = profile.contestHandles?.[platform] ?? null;
                  const url = buildContestProfileUrl(platform, handle ?? "");
                  if (!handle || !url) {
                    return (
                      <div key={platform} className="text-text-muted font-mono text-xs">
                        {contestPlatformLabel(platform)}: {tr("не вказано", "not set")}
                      </div>
                    );
                  }
                  return (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary hover:underline font-mono text-xs"
                    >
                      {contestPlatformLabel(platform)}: @{handle}
                    </a>
                  );
                })}
              </div>
            </Card>

            <div className={`grid grid-cols-1 ${privacy.showContestStats ? "md:grid-cols-4" : "md:grid-cols-1"} gap-3`}>
              <Card className="p-4 border border-border/70 bg-bg-surface/80">
                <div className="text-xs text-text-secondary">{tr("Розвʼязано задач", "Solved tasks")}</div>
                <div className="mt-1 text-2xl font-mono text-primary flex items-center gap-2">
                  <Trophy className="w-5 h-5" /> {profile.stats.solvedTotal}
                </div>
              </Card>
              {privacy.showContestStats ? (
                <>
                  <Card className="p-4 border border-border/70 bg-bg-surface/80">
                    <div className="text-xs text-text-secondary">{tr("Контести", "Contests")}</div>
                    <div className="mt-1 text-2xl font-mono text-text-primary">{profile.stats.contestsJoined ?? 0}</div>
                  </Card>
                  <Card className="p-4 border border-border/70 bg-bg-surface/80">
                    <div className="text-xs text-text-secondary">{tr("Подач у контестах", "Contest submissions")}</div>
                    <div className="mt-1 text-2xl font-mono text-text-primary">{profile.stats.contestSubmissionsTotal ?? 0}</div>
                  </Card>
                  <Card className="p-4 border border-border/70 bg-bg-surface/80">
                    <div className="text-xs text-text-secondary">{tr("AC-подібні результати", "Accepted-like results")}</div>
                    <div className="mt-1 text-2xl font-mono text-accent-success flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> {profile.stats.contestAcceptedLike ?? 0}
                    </div>
                  </Card>
                </>
              ) : (
                <Card className="p-4 border border-border/70 bg-bg-surface/80">
                  <div className="text-xs text-text-secondary">{tr("Контести", "Contests")}</div>
                  <div className="mt-1 text-sm text-text-secondary">{tr("Власник профілю приховав статистику контестів.", "Profile owner has hidden contest statistics.")}</div>
                </Card>
              )}
            </div>

            {privacy.showLanguageBreakdown ? (
              <Card className="p-5 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
                <div className="text-sm font-mono text-text-primary mb-3 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-primary" />
                  {tr("Розвʼязані задачі за мовами", "Solved tasks by language")}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(["JAVA", "PYTHON", "CPP"] as const).map((lang) => (
                    <div key={lang} className="rounded-xl border border-border bg-bg-base/70 p-3">
                      <div className="text-[11px] text-text-secondary font-mono">{lang}</div>
                      <div className="text-lg text-text-primary font-mono mt-1">{profile.stats.solvedByLang[lang] ?? 0}</div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card className="p-5 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
              <div className="text-sm font-mono text-text-primary mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" />
                {tr("Бейджі прогресу", "Progress badges")}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {BADGES.map((milestone) => {
                  const unlocked = profile.stats.badgesUnlocked.includes(milestone);
                  return (
                    <PublicProgressBadge
                      key={milestone}
                      milestone={milestone}
                      solvedCount={profile.stats.solvedTotal}
                      unlocked={unlocked}
                      tr={tr}
                    />
                  );
                })}
              </div>
            </Card>

            <Card className="p-5 border border-border/70 bg-gradient-to-b from-bg-surface/80 to-bg-base">
              <div className="text-sm font-mono text-text-primary mb-3">{tr("Останні зараховані задачі", "Recent solved tasks")}</div>
              {!privacy.showSolvedHistory ? (
                <div className="text-sm text-text-secondary">{tr("Власник профілю приховав історію розвʼязань.", "Profile owner has hidden solved history.")}</div>
              ) : profile.recentSolved.length === 0 ? (
                <div className="text-sm text-text-secondary">{tr("Поки що немає публічної історії розвʼязань.", "No public solved history yet.")}</div>
              ) : (
                <div className="space-y-2">
                  {profile.recentSolved.map((item) => (
                    <div key={`${item.id}:${item.lastCheckedAt ?? ""}`} className="rounded-xl border border-border bg-bg-base/80 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-mono text-text-primary truncate">{item.title}</div>
                          <div className="text-xs text-text-secondary mt-1">
                            {item.problemCode ?? item.slug ?? "#"} · {item.lang} · {fmtDateTime(item.lastCheckedAt, locale)}
                          </div>
                        </div>
                        <div className="text-right text-xs font-mono text-text-secondary">
                          <div className="text-text-primary">{item.lastScore ?? "—"}</div>
                          <div>{item.lastTestsPassed ?? 0}/{item.lastTestsTotal ?? 0}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default PublicProfilePage;
