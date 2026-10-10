import React from "react";
import clsx from "classnames";

export type PageHeroStat = {
  value: React.ReactNode;
  label: string;
  tone?: "default" | "warn" | "error" | "success";
};

type PageHeroProps = {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: PageHeroStat[];
  maxWidth?: "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
  className?: string;
};

const tone: Record<NonNullable<PageHeroStat["tone"]>, string> = {
  default: "text-text-primary",
  warn: "text-accent-warn",
  error: "text-accent-error",
  success: "text-primary-strong dark:text-primary-soft",
};

export const PageHero: React.FC<PageHeroProps> = ({ eyebrow, title, subtitle, actions, stats, maxWidth = "6xl", className }) => {
  const width = { "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl", "7xl": "max-w-7xl" }[maxWidth];
  return <section className={clsx("mx-auto w-full px-4 pb-5 pt-6 sm:px-6 lg:px-8", width, className)}>
    <div className="border-b border-border pb-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="m-0 text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{eyebrow}</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-[clamp(1.65rem,3vw,2.125rem)] font-bold leading-tight tracking-[-.04em] text-text-primary">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {stats?.length ? <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        {stats.map((item, index) => <div key={`${item.label}-${index}`} className="flex min-w-0 items-baseline gap-2 border-l border-border pl-3 first:border-0 first:pl-0">
          <dt className="text-xs text-text-muted">{item.label}</dt>
          <dd className={clsx("m-0 text-base font-semibold tabular-nums", tone[item.tone ?? "default"])}>{item.value}</dd>
        </div>)}
      </dl> : null}
    </div>
  </section>;
};
