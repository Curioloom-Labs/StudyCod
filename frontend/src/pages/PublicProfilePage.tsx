import React from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Award, Trophy, Code2, CheckCircle2, CalendarClock } from "lucide-react";
import { Card } from "../components/ui/Card";
import { getPublicProfile } from "../lib/api/profile";
import type { PublicProfile } from "../types";
import { buildContestProfileUrl, contestPlatformLabel } from "../utils/contestAccounts";

const BADGES = [25, 50, 100, 250, 500, 1000] as const;

function fmtDateTime(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(locale);
}

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
      .catch((e: any) => {
        if (!mounted) return;
        const code = String(e?.response?.data?.message ?? "");
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
                    <span>{tr("Difus", "Difus")}: <span className="text-text-primary">{profile.difus}</span></span>
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
                    <div
                      key={milestone}
                      className={
                        "rounded-2xl border p-3 transition-fast " +
                        (unlocked
                          ? "border-primary/60 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),rgba(30,41,59,0.12)_55%,rgba(2,6,23,0.2))]"
                          : "border-border bg-bg-base/70 opacity-70")
                      }
                    >
                      <div className="text-center text-[11px] font-mono text-text-secondary">#{milestone}</div>
                      <div
                        className={
                          "mx-auto mt-2 w-12 h-12 rounded-full border flex items-center justify-center text-sm font-mono " +
                          (unlocked ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-muted bg-bg-surface")
                        }
                      >
                        {milestone}
                      </div>
                    </div>
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
