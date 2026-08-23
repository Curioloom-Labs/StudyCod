import React from "react";
import clsx from "classnames";
import { motion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

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
  default: "text-[#17231b] dark:text-[#edf4ef]",
  warn: "text-[#c56b00] dark:text-[#ffb65c]",
  error: "text-[#cf4e72] dark:text-[#ff9abb]",
  success: "text-[#147b47] dark:text-[#71edaf]",
};

export const PageHero: React.FC<PageHeroProps> = ({ eyebrow, title, subtitle, actions, stats, maxWidth = "6xl", className }) => {
  const width = { "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl", "7xl": "max-w-7xl" }[maxWidth];
  return <section className={clsx("mx-auto w-full px-4 pb-6 pt-8 md:px-8 md:pt-12", width, className)}>
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="relative overflow-hidden rounded-[28px] border border-[#152219]/10 bg-[#edf4ee] p-6 shadow-[0_22px_50px_-42px_rgba(11,35,18,.55)] dark:border-white/10 dark:bg-[#121c15] sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-[#00ff88]/10 blur-3xl" />
      <div className="relative"><motion.span variants={fadeUpItem} className="block text-xs font-semibold uppercase tracking-[.14em] text-[#147b47] dark:text-[#71edaf]">{eyebrow}</motion.span><motion.div variants={fadeUpItem} className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="min-w-0"><h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em] text-[#17231b] dark:text-[#edf4ef] sm:text-4xl">{title}</h1>{subtitle && <p className="mt-3 max-w-2xl text-base leading-7 text-[#65746a] dark:text-[#a5b4a9]">{subtitle}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}</motion.div>{stats?.length ? <motion.div variants={fadeUpItem} className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stats.map((item, index) => <div key={`${item.label}-${index}`} className="rounded-2xl bg-white/75 p-4 dark:bg-white/[.055]"><div className={clsx("text-2xl font-semibold tracking-[-.05em]", tone[item.tone ?? "default"])}>{item.value}</div><div className="mt-1 text-sm text-[#718075] dark:text-[#9eada2]">{item.label}</div></div>)}</motion.div> : null}</div>
    </motion.div>
  </section>;
};
