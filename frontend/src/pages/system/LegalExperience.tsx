import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { PublicProductNav } from "../../components/layout/PublicProductNav";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type Props = {
  current: "privacy" | "terms" | "cookies" | "refunds";
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
  tr: (uk: string, en: string) => string;
  icon: React.ComponentType<{ className?: string }>;
  email: string;
};

const NAV_ITEMS = [
  { id: "privacy" as const, uk: "Конфіденційність", en: "Privacy", path: "/privacy" },
  { id: "terms" as const, uk: "Умови використання", en: "Terms of Use", path: "/terms" },
  { id: "refunds" as const, uk: "Повернення коштів", en: "Refunds", path: "/refunds" },
  { id: "cookies" as const, uk: "Cookies і сховище", en: "Cookies & Storage", path: "/cookies" },
];

export const LegalExperience: React.FC<Props> = ({ current, title, description, updated, sections, tr, icon: Icon, email }) => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  return <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0b100d] dark:text-[#edf3ef]">
    <PublicProductNav active="none" />
    <main>
      <section className="mx-auto w-[min(1180px,calc(100%_-_32px))] pt-8">
        <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 18 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[32px] bg-[#101713] px-[clamp(24px,6vw,76px)] py-[clamp(52px,7vw,82px)] text-white">
          <div className="absolute -right-28 -top-48 size-[460px] rounded-full bg-[#00ff88]/10 blur-[110px]" />
          <div className="relative max-w-[800px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.13em] text-[#b2bdb5]"><ShieldCheck className="size-3.5 text-[#62ecaa]" />StudyCod Legal Center</span>
            <span className="mt-8 grid size-12 place-items-center rounded-[15px] bg-[#00ff88]/10 text-[#62ecaa]"><Icon className="size-5" /></span>
            <h1 className="mt-6 text-balance text-[clamp(40px,6vw,68px)] font-extrabold leading-[.99] tracking-[-.055em]">{title}</h1>
            <p className="mt-6 max-w-[680px] text-[16px] leading-7 text-[#aab5ad]">{description}</p>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[.12em] text-[#708078]">{updated}</p>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto grid w-[min(1080px,calc(100%_-_32px))] items-start gap-8 py-16 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="sticky top-24 rounded-[22px] border border-[#122017]/10 bg-white p-3 dark:border-white/10 dark:bg-[#151c17] max-lg:static">
          <p className="px-3 pb-3 pt-2 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#7b877f]">{tr("Юридичні документи", "Legal documents")}</p>
          <nav className="space-y-1">{NAV_ITEMS.map(item => <button key={item.id} onClick={() => navigate(item.path)} className={"flex w-full items-center justify-between rounded-[14px] px-3 py-3 text-left text-[12px] font-bold transition " + (current === item.id ? "bg-[#111814] text-white dark:bg-[#edf3ef] dark:text-[#111814]" : "text-[#667169] hover:bg-[#f1f4f0] hover:text-[#111814] dark:text-[#9da9a1] dark:hover:bg-white/[.05] dark:hover:text-white")}>{tr(item.uk, item.en)}{current === item.id && <span className="size-1.5 rounded-full bg-[#00ff88]" />}</button>)}</nav>
          <a href={"mailto:" + email} className="mt-3 flex items-center gap-2 border-t border-[#122017]/10 px-3 pt-4 text-[10px] font-semibold text-[#718078] transition hover:text-[#00884a] dark:border-white/10 dark:text-[#8f9b93] dark:hover:text-[#62ecaa]"><Mail className="size-3.5" />{email}</a>
        </aside>

        <article className="space-y-4">
          <div className="rounded-[22px] border border-[#122017]/10 bg-white p-6 dark:border-white/10 dark:bg-[#151c17]">
            <p className="text-[13px] leading-6 text-[#657269] dark:text-[#a4afa7]">{tr("Цей документ описує правила й практики StudyCod зрозумілою мовою. Заголовки зліва допомагають перейти між пов’язаними політиками.", "This document explains StudyCod rules and practices in plain language. Use the navigation to move between related policies.")}</p>
          </div>
          {sections.map((section, index) => <motion.section key={section.title} initial={reduceMotion ? undefined : { opacity: 0, y: 12 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .4 }} className="rounded-[24px] border border-[#122017]/10 bg-white p-[clamp(22px,4vw,38px)] shadow-[0_16px_50px_rgba(18,32,23,.035)] dark:border-white/10 dark:bg-[#151c17] dark:shadow-[0_16px_50px_rgba(0,0,0,.14)]">
            <div className="flex items-start gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-[#eef2ed] text-[10px] font-extrabold text-[#718078] dark:bg-white/[.06] dark:text-[#aab5ad]">{String(index + 1).padStart(2, "0")}</span><h2 className="pt-1 text-[20px] font-bold leading-[1.25] tracking-[-.03em]">{section.title.replace(/^\d+\.\s*/, "")}</h2></div>
            {section.paragraphs && <div className="mt-6 space-y-4">{section.paragraphs.map(paragraph => <p key={paragraph} className="max-w-none text-[14px] leading-7 text-[#5f6c64] dark:text-[#acb7af]">{paragraph}</p>)}</div>}
            {section.bullets && <ul className="mt-6 space-y-3 p-0">{section.bullets.map(bullet => <li key={bullet} className="flex items-start gap-3 text-[14px] leading-7 text-[#5f6c64] dark:text-[#acb7af]"><span className="mt-[10px] size-1.5 shrink-0 rounded-full bg-[#00b963]" />{bullet}</li>)}</ul>}
          </motion.section>)}
          <div className="rounded-[24px] bg-[#101713] p-7 text-white">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#62ecaa]">{tr("Залишилися питання?", "Still have questions?")}</span>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-5"><p className="max-w-[560px] text-[14px] leading-6 text-[#aab5ad]">{tr("Напишіть у підтримку — допоможемо знайти потрібний розділ або пояснити, як політика застосовується до вашого акаунта.", "Contact Support and we will help find the relevant section or explain how a policy applies to your account.")}</p><button onClick={() => navigate(import.meta.env.DEV ? "/support?preview=true" : "/support")} className="inline-flex h-11 items-center gap-2 rounded-[13px] bg-white px-4 text-[11px] font-bold text-[#111814]">{tr("До підтримки", "Open Support")}<ArrowRight className="size-4" /></button></div>
          </div>
        </article>
      </section>
    </main>
  </div>;
};

export default LegalExperience;
