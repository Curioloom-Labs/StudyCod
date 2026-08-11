import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { getIadDetails } from "../../lib/api/profile";
import type { IadDetails, IadEvent } from "../../types";
import { ProfileSectionNav } from "../../components/profile/ProfileSectionNav";

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

const previewDetails: IadDetails = {
  lang: "PYTHON",
  currentIad: 0.64,
  currentDifus: 0.64,
  currentTopicIndex: 4,
  currentTopicCeiling: 0.115,
  modelVersion: 2,
  iadByLang: { PYTHON: 0.64, JAVA: 0.42, CPP: 0.51 },
  difusByLang: { PYTHON: 0.64, JAVA: 0.42, CPP: 0.51 },
  limits: { min: 0, max: 1 },
  lastAppliedGradeId: 143,
  updatedAt: "2026-07-10T09:30:00.000Z",
  rules: [
    { minGrade: 0, maxGrade: 39, delta: -0.05, reasonKey: "very_low_score" },
    { minGrade: 40, maxGrade: 69, delta: -0.015, reasonKey: "low_score" },
    { minGrade: 70, maxGrade: 89, delta: 0.02, reasonKey: "good_score" },
    { minGrade: 90, maxGrade: 100, delta: 0.04, reasonKey: "excellent_score" },
  ],
  recentEvents: [
    { id: 1, gradeId: 143, taskId: 81, taskTitle: "Частотний словник", topicIndex: 4, grade: 94, delta: 0.04, appliedDelta: 0.04, potentialDelta: 0.04, reasonKey: "excellent_score", direction: "up", applied: true, createdAt: "2026-07-10T09:30:00.000Z" },
    { id: 2, gradeId: 139, taskId: 74, taskTitle: "Два вказівники", topicIndex: 3, grade: 76, delta: 0.02, appliedDelta: 0.02, potentialDelta: 0.02, reasonKey: "good_score", direction: "up", applied: true, createdAt: "2026-07-07T14:00:00.000Z" },
    { id: 3, gradeId: 131, taskId: 66, taskTitle: "Рекурсивний пошук", topicIndex: 3, grade: 58, delta: -0.015, appliedDelta: -0.015, potentialDelta: -0.015, reasonKey: "low_score", direction: "down", applied: true, createdAt: "2026-07-03T11:00:00.000Z" },
  ],
  summary: { totalEvents: 18, positiveEvents: 13, negativeEvents: 5, pendingEvents: 0 },
};

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function appliedDelta(event: IadEvent) {
  const parsed = Number(event.appliedDelta);
  if (Number.isFinite(parsed)) return parsed;
  return event.applied ? Number(event.delta || 0) : 0;
}

function reason(event: IadEvent, tr: (uk: string, en: string) => string) {
  if (event.reasonKey === "very_low_score") return tr("низький результат", "low result");
  if (event.reasonKey === "low_score") return tr("нижче середнього", "below average");
  if (event.reasonKey === "good_score") return tr("добрий результат", "good result");
  return tr("відмінний результат", "excellent result");
}

export const IadPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const locale = i18n.language?.toLowerCase().startsWith("en") ? "en-US" : "uk-UA";
  const [details, setDetails] = useState<IadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextGrade, setNextGrade] = useState(85);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    if (isPreview()) {
      setDetails(previewDetails);
      setLoading(false);
      return () => { alive = false; };
    }
    getIadDetails()
      .then((data) => { if (alive) setDetails(data); })
      .catch((caught: unknown) => {
        if (!alive) return;
        const message = caught instanceof Error ? caught.message : tr("Не вдалося завантажити IAD.", "Could not load IAD.");
        setError(message);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [i18n.language]);

  const metrics = useMemo(() => {
    const events = details?.recentEvents ?? [];
    const current = Number(details?.currentIad ?? details?.currentDifus ?? 0);
    const min = Number(details?.limits.min ?? 0);
    const max = Number(details?.limits.max ?? 1);
    const progress = max > min ? Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100)) : 0;
    const positive = events.filter((event) => appliedDelta(event) > 0).length;
    const negative = events.filter((event) => appliedDelta(event) < 0).length;
    const net = events.reduce((sum, event) => sum + appliedDelta(event), 0);
    return { current, progress, positive, negative, net, events };
  }, [details]);

  const simulation = useMemo(() => {
    if (!details) return null;
    const grade = Math.max(0, Math.min(100, Math.round(nextGrade)));
    const rule = details.rules.find((item) => grade >= item.minGrade && grade <= item.maxGrade);
    const delta = Number(rule?.delta ?? 0);
    const min = Number(details.limits.min ?? 0);
    const max = Number(details.limits.max ?? 1);
    const predicted = Math.max(min, Math.min(max, metrics.current + delta));
    return { grade, delta, predicted };
  }, [details, metrics.current, nextGrade]);

  return (
    <div className="min-h-[100dvh] bg-[#f6f8f5] px-4 py-7 text-[#17231b] dark:bg-[#09100c] dark:text-[#edf4ef] sm:px-6 lg:px-10">
      <main className="mx-auto max-w-6xl pb-10">
        <ProfileSectionNav active="iad" className="mb-6" />

        <section className="overflow-hidden rounded-[32px] bg-[#183421] p-6 text-white shadow-[0_28px_70px_-44px_rgba(0,0,0,.9)] sm:p-9">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#8df0bc]"><Gauge className="size-4" />IAD</span>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] sm:text-6xl">
                {tr("Індекс адаптивної складності", "Adaptive difficulty index")}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#c0d0c5]">
                {tr("Тут видно, чому система піднімає або знижує складність задач. Без чорного дна: з цієї сторінки можна одразу повернутися в профіль або сертифікати.", "See why the system raises or lowers task difficulty. You can return to profile or certificates from here.")}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[.08] p-5">
              <div className="text-sm text-[#b7caba]">{tr("Поточне значення", "Current value")}</div>
              <div className="mt-2 text-6xl font-semibold tracking-[-.07em] text-[#7bedb4]">{loading ? "..." : metrics.current.toFixed(3)}</div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#00d978]" style={{ width: `${metrics.progress}%` }} /></div>
              <div className="mt-3 text-sm text-[#b7caba]">{details?.lang ?? tr("мова не визначена", "language unknown")}</div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-[24px] bg-[#e5ebe6] dark:bg-white/[.045]" />)}</div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-[#ff6b9d]/30 bg-[#fff1f5] p-5 text-sm text-[#b83259] dark:bg-[#ff6b9d]/10 dark:text-[#ffabc4]">{error}</div>
        ) : details ? (
          <>
            <section className="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label={tr("позитивні зміни", "positive changes")} value={metrics.positive} tone="green" />
              <Metric label={tr("просідання", "drops")} value={metrics.negative} tone="red" />
              <Metric label={tr("загальний рух", "net movement")} value={signed(metrics.net)} tone={metrics.net >= 0 ? "green" : "red"} />
              <Metric label={tr("подій у журналі", "logged events")} value={details.summary.totalEvents} tone="neutral" />
            </section>

            <section className="mt-6 grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
              <article className="rounded-[28px] border border-[#152219]/10 bg-white p-6 dark:border-white/10 dark:bg-[#121b15]">
                <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#d97706]">{tr("Прогноз", "What-if")}</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Наступна оцінка", "Next grade")}</h2>
                <input type="range" min={0} max={100} value={nextGrade} onChange={(event) => setNextGrade(Number(event.target.value))} className="mt-6 w-full accent-[#00c96d]" />
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <Small label={tr("оцінка", "grade")} value={simulation?.grade ?? nextGrade} />
                  <Small label="delta" value={simulation ? signed(simulation.delta) : "—"} />
                  <Small label={tr("буде IAD", "new IAD")} value={simulation ? simulation.predicted.toFixed(3) : "—"} />
                </div>
              </article>

              <article className="rounded-[28px] border border-[#152219]/10 bg-white p-6 dark:border-white/10 dark:bg-[#121b15]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#147b47] dark:text-[#71edaf]">{tr("Останні зміни", "Recent changes")}</div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Звідки складається індекс", "What shapes the index")}</h2>
                  </div>
                  {metrics.net >= 0 ? <TrendingUp className="size-5 text-[#147b47] dark:text-[#71edaf]" /> : <TrendingDown className="size-5 text-[#d34e72]" />}
                </div>
                <div className="mt-5 space-y-2">
                  {metrics.events.length === 0 ? <div className="rounded-2xl bg-[#f5f8f5] p-4 text-sm text-[#718075] dark:bg-white/[.04] dark:text-[#a3b1a6]">{tr("Подій ще немає.", "No events yet.")}</div> : metrics.events.slice(0, 8).map((event) => {
                    const delta = appliedDelta(event);
                    return <div key={`${event.id}-${event.gradeId}`} className="flex items-center justify-between gap-4 rounded-2xl bg-[#f5f8f5] px-4 py-3 dark:bg-white/[.04]">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{event.taskTitle || `#${event.taskId}`}</div>
                        <div className="mt-1 text-xs text-[#77857b] dark:text-[#9dac9f]">{reason(event, tr)} · {new Date(event.createdAt).toLocaleDateString(locale)}</div>
                      </div>
                      <strong className={delta >= 0 ? "text-[#147b47] dark:text-[#71edaf]" : "text-[#d34e72]"}>{signed(delta)}</strong>
                    </div>;
                  })}
                </div>
              </article>
            </section>

            <section className="mt-6 rounded-[28px] border border-[#152219]/10 bg-white p-6 dark:border-white/10 dark:bg-[#121b15]">
              <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#147b47] dark:text-[#71edaf]">{tr("Правила", "Rules")}</div>
              {details.reform ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#718075] dark:text-[#a3b1a6]">{tr("Реформа v2: ранні теми дають лише малий сигнал. Високий IAD відкривається поступово й обмежений найскладнішою темою, яку ти реально пройшов.", "Reform v2: early topics provide only a small signal. High IAD unlocks gradually and is capped by the most advanced topic you have actually completed.")}</p> : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {details.rules.map((rule) => <div key={`${rule.minGrade}-${rule.maxGrade}`} className="rounded-2xl bg-[#f5f8f5] p-4 text-sm dark:bg-white/[.04]">
                  <div className="font-semibold">{rule.minGrade}-{rule.maxGrade}</div>
                  <div className={rule.delta >= 0 ? "mt-2 text-[#147b47] dark:text-[#71edaf]" : "mt-2 text-[#d34e72]"}>{signed(rule.delta)}</div>
                </div>)}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: React.ReactNode; tone: "green" | "red" | "neutral" }> = ({ label, value, tone }) => (
  <div className="flex h-full min-h-[126px] flex-col justify-between rounded-2xl border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15]">
    <div className="text-sm text-[#6d7c71] dark:text-[#a2b1a6]">{label}</div>
    <div className={`mt-3 text-3xl font-semibold tracking-[-.05em] ${tone === "green" ? "text-[#147b47] dark:text-[#71edaf]" : tone === "red" ? "text-[#d34e72]" : ""}`}>{value}</div>
  </div>
);

const Small: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl bg-[#f5f8f5] p-4 dark:bg-white/[.04]">
    <div className="text-xs text-[#718075] dark:text-[#a3b1a6]">{label}</div>
    <div className="mt-1 text-xl font-semibold">{value}</div>
  </div>
);

export default IadPage;
