import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { getIadDetails } from "../../lib/api/profile";
import type { IadDetails, IadEvent } from "../../types";

function fmtSigned(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(3)}`;
}

function getEventAppliedDelta(event: IadEvent): number {
  const parsed = Number(event.appliedDelta);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = Number(event.delta ?? 0);
  return event.applied ? fallback : 0;
}

function getEventRuleDelta(event: IadEvent): number {
  const parsed = Number(event.potentialDelta);
  if (Number.isFinite(parsed)) return parsed;
  return Number(event.delta ?? 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export const IadPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const locale = i18n.language === "uk" ? "uk-UA" : "en-US";

  type ScenarioKey = "conservative" | "balanced" | "aggressive";

  const scenarioTemplates: Record<ScenarioKey, [number, number, number]> = {
    conservative: [30, 45, 60],
    balanced: [40, 60, 80],
    aggressive: [55, 75, 90],
  };

  const scenarioColor: Record<ScenarioKey, string> = {
    conservative: "#f59e0b",
    balanced: "#3b82f6",
    aggressive: "#ef4444",
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<IadDetails | null>(null);
  const [nextGrade, setNextGrade] = useState<number>(70);
  const [scenario, setScenario] = useState<ScenarioKey>("balanced");
  const [compareScenarios, setCompareScenarios] = useState(false);
  const [hoveredTrajectoryIndex, setHoveredTrajectoryIndex] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getIadDetails()
      .then((data) => {
        if (!mounted) return;
        setDetails(data);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setError(String(e?.response?.data?.message || e?.message || tr("Не вдалося завантажити дані IAD", "Failed to load IAD data")));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [i18n.language]);

  const progressPercent = useMemo(() => {
    if (!details) return 0;
    const min = details.limits.min ?? 0;
    const max = details.limits.max ?? 1;
    const currentIad = details.currentIad ?? details.currentDifus ?? 0;
    if (max <= min) return 0;
    return Math.max(0, Math.min(100, ((currentIad - min) / (max - min)) * 100));
  }, [details]);

  const levelLabel = useMemo(() => {
    if (!details) return "—";
    const currentIad = details.currentIad ?? details.currentDifus ?? 0;
    if (currentIad <= 0.35) return tr("Базовий", "Basic");
    if (currentIad >= 0.65) return tr("Просунутий", "Advanced");
    return tr("Середній", "Intermediate");
  }, [details, i18n.language]);

  const simulation = useMemo(() => {
    if (!details) return null;
    const min = Number(details.limits.min ?? 0);
    const max = Number(details.limits.max ?? 1);
    const currentIad = Number(details.currentIad ?? details.currentDifus ?? 0);
    const gRaw = Number(nextGrade ?? 0);
    const grade = Number.isFinite(gRaw) ? clamp(Math.round(gRaw), 0, 100) : 0;
    const rule = details.rules.find((r) => grade >= r.minGrade && grade <= r.maxGrade) ?? null;
    const delta = Number(rule?.delta ?? 0);
    const predicted = clamp(currentIad + delta, min, max);
    const trend = predicted > currentIad ? "up" : predicted < currentIad ? "down" : "flat";
    return {
      grade,
      delta,
      predicted,
      trend,
      rule,
      wouldHitLimit: predicted === min || predicted === max,
    };
  }, [details, nextGrade]);

  const whatIfTrajectories = useMemo(() => {
    if (!details || !simulation) return null;
    const min = Number(details.limits.min ?? 0);
    const max = Number(details.limits.max ?? 1);
    const start = Number(details.currentIad ?? details.currentDifus ?? 0);

    const width = 520;
    const height = 120;
    const padX = 16;
    const padY = 14;
    const trajectoryPointCount = scenarioTemplates.balanced.length + 2;
    const xStep = (width - padX * 2) / Math.max(1, trajectoryPointCount - 1);
    const yOf = (v: number) => {
      const t = max > min ? (v - min) / (max - min) : 0;
      return height - padY - t * (height - padY * 2);
    };

    const buildTrajectory = (key: ScenarioKey) => {
      const scenarioGrades = [...scenarioTemplates[key], simulation.grade];
      const nodes: Array<{ label: string; grade?: number; value: number; delta?: number }> = [
        { label: tr("Старт", "Start"), value: start },
      ];

      let current = start;
      for (let i = 0; i < scenarioGrades.length; i++) {
        const grade = scenarioGrades[i];
        const rule = details.rules.find((r) => grade >= r.minGrade && grade <= r.maxGrade) ?? null;
        const delta = Number(rule?.delta ?? 0);
        current = clamp(current + delta, min, max);
        nodes.push({
          label: i === scenarioGrades.length - 1 ? tr("X", "X") : String(grade),
          grade,
          value: current,
          delta,
        });
      }

      const points = nodes.map((n, i) => ({
        x: padX + i * xStep,
        y: yOf(n.value),
        ...n,
      }));

      const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
      return {
        points,
        polyline,
        scenarioGrades,
      };
    };

    const conservative = buildTrajectory("conservative");
    const balanced = buildTrajectory("balanced");
    const aggressive = buildTrajectory("aggressive");

    return {
      trajectories: {
        conservative,
        balanced,
        aggressive,
      } as Record<ScenarioKey, ReturnType<typeof buildTrajectory>>,
      width,
      height,
    };
  }, [details, simulation, i18n.language]);

  const whatIfTrajectory = useMemo(() => {
    if (!whatIfTrajectories) return null;
    return whatIfTrajectories.trajectories[scenario];
  }, [whatIfTrajectories, scenario]);

  useEffect(() => {
    if (!whatIfTrajectory?.points?.length) {
      setHoveredTrajectoryIndex(null);
      return;
    }
    setHoveredTrajectoryIndex(whatIfTrajectory.points.length - 1);
  }, [whatIfTrajectory]);

  const activeTrajectoryPoint = useMemo(() => {
    if (!whatIfTrajectory || !whatIfTrajectory.points.length) return null;
    const idx = hoveredTrajectoryIndex == null
      ? whatIfTrajectory.points.length - 1
      : clamp(hoveredTrajectoryIndex, 0, whatIfTrajectory.points.length - 1);
    return {
      index: idx,
      point: whatIfTrajectory.points[idx],
    };
  }, [whatIfTrajectory, hoveredTrajectoryIndex]);

  const velocity = useMemo(() => {
    if (!details) return null;
    const now = Date.now();
    const calc = (days: 7 | 14) => {
      const from = now - days * 24 * 60 * 60 * 1000;
      const events = (details.recentEvents || []).filter((e) => new Date(e.createdAt).getTime() >= from);
      const deltas = events.map((e) => getEventAppliedDelta(e));
      const net = deltas.reduce((s, d) => s + d, 0);
      const absAvg = deltas.length ? deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length : 0;
      const volatility = stdDev(deltas);
      const positive = deltas.filter((d) => d > 0).length;
      const negative = deltas.filter((d) => d < 0).length;
      const direction = net > 0.01 ? "up" : net < -0.01 ? "down" : "flat";
      const stability = volatility <= 0.015 && absAvg <= 0.03 ? "stable" : volatility >= 0.03 ? "spiky" : "mixed";
      return {
        days,
        count: events.length,
        net,
        absAvg,
        volatility,
        positive,
        negative,
        direction,
        stability,
      };
    };

    return {
      d7: calc(7),
      d14: calc(14),
    };
  }, [details]);

  const reasonLabel = (event: IadEvent): string => {
    const matchedRule = details?.rules.find((r) => r.reasonKey === event.reasonKey) ?? null;
    const rangeSuffix = matchedRule
      ? ` (${matchedRule.minGrade}–${matchedRule.maxGrade})`
      : "";

    switch (event.reasonKey) {
      case "very_low_score":
        return tr("Низький результат", "Low result") + rangeSuffix;
      case "low_score":
        return tr("Нижче середнього", "Below average") + rangeSuffix;
      case "good_score":
        return tr("Добрий результат", "Good result") + rangeSuffix;
      case "excellent_score":
      default:
        return tr("Відмінний результат", "Excellent result") + rangeSuffix;
    }
  };

  return (
    <div className="min-h-full bg-bg-base text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-3 py-2 border border-border text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            <ArrowLeft className="w-4 h-4" />
            {tr("Назад", "Back")}
          </Link>
          <Link
            to="/"
            onClick={() => {
              try {
                sessionStorage.setItem("studycod.openPage", "profile");
              } catch {
                // ignore
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            {tr("До профілю", "To profile")}
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5 border border-border/70 bg-bg-surface/80 space-y-3">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-9 w-1/4" />
                <Skeleton className="h-3 w-full" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="p-4 sm:p-6 text-sm text-accent-error">{error}</Card>
        ) : !details ? (
          <Card className="p-4 sm:p-6 text-sm text-text-secondary">{tr("Дані недоступні", "Data unavailable")}</Card>
        ) : (
          <>
            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                  <div className="text-xs text-text-secondary">{tr("Поточний IAD", "Current IAD")}</div>
                  <div className="text-3xl font-mono text-primary mt-1">{(details.currentIad ?? details.currentDifus ?? 0).toFixed(3)}</div>
                  <div className="text-xs text-text-secondary mt-1">{tr("Мова", "Language")}: <span className="text-text-primary">{details.lang}</span> · {levelLabel}</div>
                  {details.limitState === "max" ? <div className="text-[11px] text-accent-warn mt-1">
                    {tr("Значення на верхній межі 1.0: частина позитивних подій може не підвищувати IAD далі.", "Value is at the upper limit 1.0: some positive events may no longer increase IAD.")}
                  </div> : details.limitState === "min" ? <div className="text-[11px] text-accent-warn mt-1">
                    {tr("Значення на нижній межі 0.0: частина негативних подій може не знижувати IAD далі.", "Value is at the lower limit 0.0: some negative events may no longer decrease IAD.")}
                  </div> : null}
                </div>
                <div className="text-xs text-text-secondary">
                  {tr("Оновлено", "Updated")}: {details.updatedAt ? new Date(details.updatedAt).toLocaleString(locale) : "—"}
                </div>
              </div>

              <div className="mt-4">
                <div className="h-3 w-full rounded-full bg-bg-code border border-border overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="mt-1 text-[11px] font-mono text-text-secondary flex justify-between">
                  <span>{details.limits.min.toFixed(1)}</span>
                  <span>{details.limits.max.toFixed(1)}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("Симуляція наступної оцінки", "Next-grade simulation")}</div>
              <div className="text-xs text-text-secondary mb-3">
                {tr(
                  "Подивись, як умовно зміниться IAD, якщо наступна оцінка буде X. Це превʼю: реальне значення оновиться лише після фактичного сабміту.",
                  "See how IAD would change if your next grade is X. This is a preview: real value updates only after an actual submission."
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-mono text-text-secondary mb-1">{tr("Оцінка X (0–100)", "Grade X (0–100)")}</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={simulation?.grade ?? 0}
                    onChange={(e) => setNextGrade(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={simulation?.grade ?? 0}
                    onChange={(e) => setNextGrade(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-bg-code border border-border text-text-primary font-mono text-sm"
                  />
                </div>
              </div>

              {simulation ? <div className="mt-3 rounded-lg border border-border bg-bg-code/70 p-3 text-xs font-mono">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <div className="text-text-secondary">{tr("Поточний", "Current")}</div>
                    <div className="text-text-primary text-sm">{(details.currentIad ?? details.currentDifus ?? 0).toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">Δ IAD</div>
                    <div className={simulation.delta >= 0 ? "text-accent-success text-sm" : "text-accent-error text-sm"}>{fmtSigned(simulation.delta)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">{tr("Прогноз", "Predicted")}</div>
                    <div className="text-primary text-sm">{simulation.predicted.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">{tr("Діапазон", "Rule band")}</div>
                    <div className="text-text-primary text-sm">{simulation.rule ? `${simulation.rule.minGrade}–${simulation.rule.maxGrade}` : "—"}</div>
                  </div>
                </div>
                {simulation.wouldHitLimit ? <div className="mt-2 text-[11px] text-accent-warn">
                  {tr("Зверни увагу: значення впирається в межу шкали (0..1).", "Note: value is capped by scale limits (0..1).")}
                </div> : null}
              </div> : null}
            </Card>

            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("What-if trajectory", "What-if trajectory")}</div>
              <div className="text-xs text-text-secondary mb-3">
                {tr(
                  "Міні-графік показує можливу траєкторію IAD на 4 кроки + X. Увімкни compare mode для порівняння сценаріїв.",
                  "Mini graph shows a possible 4-step IAD trajectory + X. Turn on compare mode to compare scenarios."
                )}
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {([
                  { key: "conservative", label: tr("Консервативний", "Conservative") },
                  { key: "balanced", label: tr("Збалансований", "Balanced") },
                  { key: "aggressive", label: tr("Агресивний", "Aggressive") },
                ] as Array<{ key: ScenarioKey; label: string }>).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setScenario(s.key)}
                    className={`px-2.5 py-1 text-[11px] font-mono border rounded transition-fast ${
                      scenario === s.key
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <label className="mb-3 inline-flex items-center gap-2 text-[11px] font-mono text-text-secondary">
                <input
                  type="checkbox"
                  checked={compareScenarios}
                  onChange={(e) => setCompareScenarios(e.target.checked)}
                  className="accent-primary"
                />
                {tr("Порівняти всі сценарії", "Compare all scenarios")}
              </label>

              {whatIfTrajectory && whatIfTrajectories ? <div className="rounded-lg border border-border bg-bg-code/70 p-3">
                <svg viewBox={`0 0 ${whatIfTrajectories.width} ${whatIfTrajectories.height}`} className="w-full h-32">
                  {compareScenarios ? (Object.keys(whatIfTrajectories.trajectories) as ScenarioKey[]).map((k) => (
                    <polyline
                      key={`curve-${k}`}
                      points={whatIfTrajectories.trajectories[k].polyline}
                      fill="none"
                      stroke={scenarioColor[k]}
                      strokeWidth={k === scenario ? "2.5" : "1.8"}
                      strokeOpacity={k === scenario ? 1 : 0.7}
                    />
                  )) : (
                    <polyline
                      points={whatIfTrajectory.polyline}
                      fill="none"
                      stroke="currentColor"
                      className="text-primary"
                      strokeWidth="2"
                    />
                  )}

                  {whatIfTrajectory.points.map((p, idx) => (
                    <g key={`wif-${idx}`}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={activeTrajectoryPoint?.index === idx ? "5" : "3.5"}
                        fill={idx === 0 ? "var(--color-text-secondary)" : (compareScenarios ? scenarioColor[scenario] : "var(--color-primary)")}
                        onMouseEnter={() => setHoveredTrajectoryIndex(idx)}
                      >
                        <title>{`${p.label}: ${p.value.toFixed(3)}${typeof p.delta === "number" ? ` (${fmtSigned(p.delta)})` : ""}`}</title>
                      </circle>
                      <text x={p.x} y={whatIfTrajectories.height - 3} textAnchor="middle" className="fill-text-secondary" style={{ fontSize: "10px" }}>
                        {p.label}
                      </text>
                    </g>
                  ))}
                </svg>

                {compareScenarios ? <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-mono">
                  {([
                    { key: "conservative", label: tr("Консервативний", "Conservative") },
                    { key: "balanced", label: tr("Збалансований", "Balanced") },
                    { key: "aggressive", label: tr("Агресивний", "Aggressive") },
                  ] as Array<{ key: ScenarioKey; label: string }>).map((item) => (
                    <button
                      key={`legend-${item.key}`}
                      type="button"
                      onClick={() => setScenario(item.key)}
                      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${scenario === item.key ? "border-primary text-text-primary" : "border-border text-text-secondary"}`}
                    >
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: scenarioColor[item.key] }} />
                      {item.label}
                    </button>
                  ))}
                </div> : null}

                {activeTrajectoryPoint ? <div className="mt-2 rounded border border-border px-2 py-2 text-[11px] font-mono grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <div className="text-text-secondary">{tr("Сценарій", "Scenario")}</div>
                    <div className="text-text-primary">
                      {scenario === "conservative"
                        ? tr("Консервативний", "Conservative")
                        : scenario === "aggressive"
                          ? tr("Агресивний", "Aggressive")
                          : tr("Збалансований", "Balanced")}
                    </div>
                  </div>
                  <div>
                    <div className="text-text-secondary">{tr("Крок", "Step")}</div>
                    <div className="text-text-primary">{activeTrajectoryPoint.point.label}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">IAD</div>
                    <div className="text-text-primary">{activeTrajectoryPoint.point.value.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">Δ</div>
                    <div className={Number(activeTrajectoryPoint.point.delta ?? 0) >= 0 ? "text-accent-success" : "text-accent-error"}>
                      {typeof activeTrajectoryPoint.point.delta === "number" ? fmtSigned(activeTrajectoryPoint.point.delta) : "—"}
                    </div>
                  </div>
                </div> : null}

                <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px] font-mono">
                  {whatIfTrajectory.points.map((p, idx) => (
                    <div
                      key={`wif-row-${idx}`}
                      className={`rounded border px-2 py-1 ${activeTrajectoryPoint?.index === idx ? "border-primary bg-primary/10" : "border-border"}`}
                      onMouseEnter={() => setHoveredTrajectoryIndex(idx)}
                    >
                      <div className="text-text-secondary">{p.label === tr("Старт", "Start") ? p.label : `${tr("Крок", "Step")} ${idx}`}</div>
                      <div className="text-text-primary">{p.value.toFixed(3)}</div>
                      {typeof p.delta === "number" ? <div className={p.delta >= 0 ? "text-accent-success" : "text-accent-error"}>{fmtSigned(p.delta)}</div> : null}
                    </div>
                  ))}
                </div>
              </div> : null}
            </Card>

            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("IAD velocity", "IAD velocity")}</div>
              <div className="text-xs text-text-secondary mb-3">
                {tr(
                  "Тренд за 7/14 днів показує, як швидко та стабільно змінюється IAD: рівно, хвилями чи ривками.",
                  "7/14-day trend shows how quickly and steadily your IAD changes: smooth, mixed, or spiky."
                )}
              </div>

              {velocity ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[velocity.d7, velocity.d14].map((v) => (
                  <div key={v.days} className="rounded-lg border border-border bg-bg-code/70 p-3 text-xs font-mono">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-text-primary">{tr(`Останні ${v.days} днів`, `Last ${v.days} days`)}</span>
                      <span className={v.direction === "up" ? "text-accent-success" : v.direction === "down" ? "text-accent-error" : "text-text-secondary"}>
                        {v.direction === "up" ? tr("Ріст", "Growth") : v.direction === "down" ? tr("Спад", "Decline") : tr("Плато", "Plateau")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-text-secondary">{tr("Подій", "Events")}</div>
                        <div className="text-text-primary">{v.count}</div>
                      </div>
                      <div>
                        <div className="text-text-secondary">Net Δ</div>
                        <div className={v.net >= 0 ? "text-accent-success" : "text-accent-error"}>{fmtSigned(v.net)}</div>
                      </div>
                      <div>
                        <div className="text-text-secondary">{tr("Волатильність", "Volatility")}</div>
                        <div className="text-text-primary">{v.volatility.toFixed(3)}</div>
                      </div>
                      <div>
                        <div className="text-text-secondary">{tr("Стабільність", "Stability")}</div>
                        <div className={v.stability === "stable" ? "text-accent-success" : v.stability === "spiky" ? "text-accent-error" : "text-accent-warn"}>
                          {v.stability === "stable" ? tr("Стабільно", "Stable") : v.stability === "spiky" ? tr("Ривки", "Spiky") : tr("Змішано", "Mixed")}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div> : null}
            </Card>

            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("Як працює IAD", "How IAD works")}</div>
              <div className="text-xs text-text-secondary space-y-2 leading-relaxed">
                <p>
                  {tr(
                    "IAD (індекс адаптивної складності) — це число від 0 до 1, яке показує, наскільки складні завдання система може пропонувати саме тобі зараз.",
                    "IAD (adaptive difficulty index) is a value from 0 to 1 that shows how challenging tasks should be for you right now."
                  )}
                </p>
                <p>
                  {tr(
                    "Після кожної нової оцінки система додає або віднімає крок (delta) за правилами нижче. Позитивні оцінки піднімають IAD, слабкі — знижують.",
                    "After each new grade, the system adds or subtracts a delta based on the rules below. Strong scores increase IAD, weaker scores decrease it."
                  )}
                </p>
                <p>
                  {tr(
                    "Вплив практичний: вищий IAD зсуває генерацію в бік складніших умов, нижчий IAD — у бік більш базових вправ. Значення зберігається окремо для кожної мови (Java/Python/C++).",
                    "Practical effect: higher IAD nudges generation toward more advanced conditions, lower IAD toward more foundational practice. The value is tracked separately per language (Java/Python/C++)."
                  )}
                </p>
                <p>
                  {tr(
                    "Щоб ріст був стабільним, коефіцієнти несиметричні: глибокі провали штрафуються сильніше, ніж середні успіхи винагороджуються.",
                    "To keep progress stable, coefficients are intentionally asymmetric: deep failures are penalized stronger than average successes are rewarded."
                  )}
                </p>
              </div>
            </Card>

            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-3">{tr("Правила зміни", "Change rules")}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                {details.rules.map((r) => (
                  <div key={`${r.minGrade}-${r.maxGrade}`} className="border border-border rounded-lg px-3 py-2 bg-bg-code text-text-secondary">
                    {r.minGrade}–{r.maxGrade} → <span className={r.delta >= 0 ? "text-accent-success" : "text-accent-error"}>{fmtSigned(r.delta)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("Чому IAD змінюється", "Why IAD changes")}</div>
              <div className="text-xs text-text-secondary mb-3">
                {tr(
                  "Події нижче показують останні оцінки для активної мови. Δ в рядку — це фактичний застосований внесок; для незастосованих подій показується окрема підказка з дельтою за правилом.",
                  "Events below show recent grades for the active language. Row Δ is the actually applied contribution; for pending events, a separate hint shows the rule delta."
                )}
              </div>

              <div className="space-y-2">
                {details.recentEvents.length === 0 ? (
                  <div className="text-xs text-text-secondary">{tr("Поки немає подій.", "No events yet.")}</div>
                ) : (
                  details.recentEvents.map((event) => {
                    const appliedDelta = getEventAppliedDelta(event);
                    const ruleDelta = getEventRuleDelta(event);
                    const eventDirection = appliedDelta > 0 ? "up" : appliedDelta < 0 ? "down" : "flat";
                    const deltaClass = appliedDelta > 0 ? "text-accent-success" : appliedDelta < 0 ? "text-accent-error" : "text-text-secondary";
                    return (
                      <div key={event.gradeId} className="border border-border rounded-lg p-3 bg-bg-code/70 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-text-primary truncate">{event.taskTitle || `#${event.taskId}`}</div>
                            <div className="text-text-secondary mt-0.5">{reasonLabel(event)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-text-primary">{tr("Оцінка", "Grade")}: {event.grade}</div>
                            <div className={deltaClass}>{fmtSigned(appliedDelta)}</div>
                            {!event.applied ? <div className="text-[11px] text-text-secondary">
                              {tr("Після застосування за правилом", "After apply (rule)")}: {fmtSigned(ruleDelta)}
                            </div> : null}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-text-secondary">
                          <span className="inline-flex items-center gap-1">
                            {eventDirection === "up" ? <TrendingUp className="w-3.5 h-3.5 text-accent-success" /> : eventDirection === "down" ? <TrendingDown className="w-3.5 h-3.5 text-accent-error" /> : <Minus className="w-3.5 h-3.5" />}
                            {event.applied ? tr("Вплинуло на поточний IAD", "Applied to current IAD") : tr("Ще не застосовано", "Not applied yet")}
                          </span>
                          <span>{new Date(event.createdAt).toLocaleString(locale)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default IadPage;
