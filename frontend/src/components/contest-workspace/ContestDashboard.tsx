import React from "react";
import { useTranslation } from "react-i18next";
import type { ScoreboardRow } from "../../lib/api/contests";
import { Activity, AlarmClockCheck, Snowflake } from "lucide-react";

type ContestDashboardProps = {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  rows: ScoreboardRow[];
  loading: boolean;
  onRefresh: () => void;
  currentUserLabel?: string | null;
};

function ms(v: string | null | undefined) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function formatLeft(totalMs: number) {
  const sec = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const ContestDashboard: React.FC<ContestDashboardProps> = ({ title, startsAt, endsAt, rows, loading, onRefresh, currentUserLabel }) => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startsMs = ms(startsAt);
  const endsMs = ms(endsAt);
  const started = startsMs != null ? now >= startsMs : true;
  const finished = endsMs != null ? now > endsMs : false;

  const duration = startsMs != null && endsMs != null ? Math.max(1, endsMs - startsMs) : 1;
  const elapsed = startsMs != null ? Math.max(0, Math.min(duration, now - startsMs)) : 0;
  const remain = endsMs != null ? Math.max(0, endsMs - now) : 0;
  const progress = duration > 0 ? elapsed / duration : 0;
  const freeze = endsMs != null ? now > endsMs - 15 * 60 * 1000 && now < endsMs : false;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (1 - progress);

  const activity = React.useMemo(() => {
    return [...rows]
      .filter((r) => !!r.lastImprovementAt)
      .sort((a, b) => new Date(String(b.lastImprovementAt)).getTime() - new Date(String(a.lastImprovementAt)).getTime())
      .slice(0, 12);
  }, [rows]);

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-3">
      <div className="xl:col-span-4 min-h-0 flex flex-col gap-3">
        <div className="rounded-2xl border border-border/70 bg-bg-surface/85 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
          <div className="text-xs text-text-secondary uppercase tracking-widest">{tr("Таймлайн контесту", "Contest timeline")}</div>
          <div className="text-lg text-text-primary font-semibold mt-1">{title}</div>

          <div className="mt-4 flex items-center justify-center">
            <svg width="130" height="130" viewBox="0 0 130 130" className="drop-shadow-[0_0_20px_rgba(98,149,255,0.26)]" role="img" aria-label={finished ? tr("Контест завершено", "Contest finished") : tr("Час до завершення контесту", "Time remaining in contest")}>
              <circle cx="65" cy="65" r={radius} fill="none" stroke="var(--border)" strokeWidth="10" />
              <circle
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                stroke="var(--secondary)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dash}
                transform="rotate(-90 65 65)"
              />
              <text x="65" y="62" textAnchor="middle" className="fill-text-secondary" style={{ fontSize: 10 }}>{tr("залишилось", "remaining")}</text>
              <text x="65" y="78" textAnchor="middle" className="fill-text-primary" style={{ fontSize: 14, fontWeight: 700 }}>
                {finished ? "00:00:00" : formatLeft(remain)}
              </text>
            </svg>
          </div>

          <div className="mt-2 text-xs text-text-secondary flex items-center justify-between">
            <span>{started ? (finished ? tr("Завершено", "Finished") : tr("Триває", "Running")) : tr("Скоро", "Upcoming")}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs">
            <Snowflake className={`w-4 h-4 ${freeze ? "text-accent-warn" : "text-text-secondary"}`} />
            <span className={freeze ? "text-accent-warn" : "text-text-secondary"}>
              {freeze ? tr("Freeze-період активний", "Freeze period active") : tr("Зараз freeze-періоду немає", "No freeze right now")}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
            <Activity className="w-4 h-4 text-primary animate-pulse" />
            {tr("Пульс живого розв'язання", "Live solving pulse")}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-bg-surface/85 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.28)] flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-text-primary">{tr("Стрічка останніх розв'язань", "Recent solves feed")}</div>
            <button type="button" onClick={onRefresh} className="h-11 px-3 rounded-md border border-border text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast" aria-label={tr("Оновити стрічку активності", "Refresh activity feed")}>{tr("Оновити", "Refresh")}</button>
          </div>
          <div className="mt-2 flex-1 min-h-0 overflow-auto space-y-2">
            {activity.length === 0 ? <div className="text-xs text-text-secondary">{tr("Поки немає активності.", "No activity yet.")}</div> : null}
            {activity.map((r) => (
              <div key={r.participantId} className="rounded-lg border border-border bg-bg-base/70 p-2 text-xs">
                <div className="text-text-primary font-medium">{r.displayName}</div>
                <div className="text-text-secondary">{tr("оновив загальний бал до", "improved total to")} {r.totalScore}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="xl:col-span-8 min-h-0 rounded-2xl border border-border/70 bg-bg-surface/85 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.28)] flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <AlarmClockCheck className="w-4 h-4 text-secondary" />
            {tr("Живий лідерборд", "Live leaderboard")}
          </div>
          <button type="button" onClick={onRefresh} className="h-11 px-3 rounded-md border border-border text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast" aria-label={tr("Оновити лідерборд", "Refresh leaderboard")}>{tr("Оновити", "Update")}</button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? <div className="text-xs text-text-secondary">{tr("Завантаження лідерборду...", "Loading leaderboard...")}</div> : null}
          <table className="w-full min-w-[480px] text-xs border border-border rounded-lg overflow-hidden">
            <caption className="sr-only">{tr("Лідерборд контесту: місце, учасник та загальний бал", "Contest leaderboard: rank, participant, and total score")}</caption>
            <thead className="bg-bg-hover">
              <tr>
                <th scope="col" className="p-2 border-b border-border text-left">#</th>
                <th scope="col" className="p-2 border-b border-border text-left">{tr("Учасник", "Participant")}</th>
                <th scope="col" className="p-2 border-b border-border text-right">{tr("Сума", "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-text-secondary">
                    {tr("Поки що немає учасників.", "No participants yet.")}
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => {
                const me = currentUserLabel && r.displayName.toLowerCase() === String(currentUserLabel).toLowerCase();
                return (
                  <tr key={r.participantId} className={`${me ? "bg-secondary/10" : "odd:bg-bg-base even:bg-bg-surface"}`}>
                    <td className="p-2 border-b border-border">{r.rank}</td>
                    <td className="p-2 border-b border-border text-text-primary">
                      {r.displayName}
                      {me ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary/20 text-secondary">{tr("ви", "you")}</span> : null}
                    </td>
                    <td className="p-2 border-b border-border text-right text-primary font-semibold">{r.totalScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
