import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Check, GraduationCap, Sparkles, UserRound } from "lucide-react";
import { PublicProductNav } from "../../components/layout/PublicProductNav";
import { PlatformFooter } from "../../components/layout/PlatformFooter";

type Plan = {
  icon: React.ComponentType<{ className?: string }>;
  audience: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  to?: string;
  accent: "green" | "orange" | "yellow" | "pink";
  featured?: boolean;
};

const accentStyles = {
  green: "bg-[#00ff88]/12 text-[#00884a] dark:text-[#63efad]",
  orange: "bg-[#ff8c00]/12 text-[#b96300] dark:text-[#ffad4a]",
  yellow: "bg-[#ffd93d]/20 text-[#8b6b00] dark:text-[#ffe36c]",
  pink: "bg-[#ff6b9d]/12 text-[#c64270] dark:text-[#ff8fb6]",
};

export const PricingPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 22 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: .6, ease: [0.16, 1, .3, 1] as const } };

  const plans: Plan[] = [
    {
      icon: UserRound,
      audience: tr("Самостійне навчання", "Independent learning"),
      name: tr("Старт", "Start"),
      price: "$0",
      period: tr("назавжди", "forever"),
      description: tr("Усе необхідне, щоб почати практикувати програмування або спробувати клас без оплати.", "Everything needed to start practicing programming or try a class at no cost."),
      features: [tr("Бібліотека базових задач", "Core task library"), tr("Автоматична перевірка коду", "Automatic code checks"), tr("Відкриті навчальні курси", "Open learning courses"), tr("1 безкоштовний клас для старту", "1 free class to get started"), tr("Особистий прогрес", "Personal progress")],
      cta: tr("Почати безкоштовно", "Start for free"),
      to: "/?auth=register",
      accent: "green",
    },
    {
      icon: Sparkles,
      audience: tr("Поглиблена практика", "Advanced practice"),
      name: "StudyCod Pro",
      price: "$2",
      period: tr("на місяць", "per month"),
      description: tr("Більше практики, детальний фідбек і повний маршрут розвитку навичок.", "More practice, detailed feedback, and a complete skill-building path."),
      features: [tr("Усе зі Старт", "Everything in Start"), tr("Розширені курси й задачі", "Advanced courses and tasks"), tr("Розбір помилок і розумні підказки", "Error analysis and smart hints"), tr("Візуалізація виконання коду", "Code execution visualization"), tr("Сертифікати проходження", "Completion certificates")],
      cta: tr("Незабаром", "Coming soon"),
      accent: "orange",
      featured: true,
    },
    {
      icon: GraduationCap,
      audience: tr("Для викладача", "For teachers"),
      name: "StudyCod Class",
      price: "$10",
      period: tr("на місяць", "per month"),
      description: tr("Цілісний робочий простір для викладання, практики й оцінювання з необмеженими класами.", "A complete workspace for teaching, practice, and assessment with unlimited classes."),
      features: [tr("Необмежена кількість класів", "Unlimited classes"), tr("До 30 учнів у кожному класі", "Up to 30 students per class"), tr("Курси та автоматичні завдання", "Courses and automatic assignments"), tr("Журнал і гнучкі шкали оцінок", "Gradebook and flexible grading"), tr("Аналітика навчального прогресу", "Learning progress analytics"), tr("Live Classroom", "Live Classroom")],
      cta: tr("Незабаром", "Coming soon"),
      accent: "yellow",
    },
    {
      icon: Building2,
      audience: tr("Для закладу освіти", "For institutions"),
      name: tr("Школа", "School"),
      price: tr("Індивідуально", "Custom"),
      period: tr("ліцензія", "license"),
      description: tr("Єдиний стандарт навчання програмуванню для всієї школи або ліцею.", "One programming education standard for an entire school or lyceum."),
      features: [tr("Гнучке ліцензування учнів", "Flexible student licensing"), tr("Ролі й адміністрування організації", "Organization roles and administration"), tr("Пакетне підключення класів", "Bulk class onboarding"), tr("Захист даних неповнолітніх", "Protection of minors' data"), tr("Пілот і пріоритетна підтримка", "Pilot and priority support")],
      cta: tr("Обговорити пілот", "Discuss a pilot"),
      to: "/support",
      accent: "pink",
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] [&_h1]:font-sans [&_h2]:font-sans [&_h3]:font-sans dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <PublicProductNav active="pricing" />

      <main id="main-content">
        <section className="relative mx-auto w-[min(1200px,calc(100%_-_40px))] pb-16 pt-24 text-center max-md:pt-16">
          <div className="pointer-events-none absolute left-1/2 top-5 size-[540px] -translate-x-1/2 rounded-full bg-[#00ff88]/[.055] blur-[90px]" />
          <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 20 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .7, ease: [0.16, 1, .3, 1] }} className="relative mx-auto max-w-[820px]">
            <button type="button" onClick={() => navigate("/")} className="mx-auto mb-6 flex w-fit items-center gap-2 text-[12px] font-bold text-[#667169] dark:text-[#99a59d]"><ArrowLeft className="size-4" />{tr("На головну", "Back home")}</button>
            <h1 className="mt-6 text-balance text-[clamp(44px,6vw,76px)] font-bold leading-[1] tracking-[-.055em]">{tr("План для кожного способу навчатися.", "A plan for every way of learning.")}</h1>
            <p className="mx-auto mt-6 max-w-[680px] text-[17px] leading-8 text-[#667169] dark:text-[#a3aea6]">{tr("Починайте безкоштовно, розвивайте власну практику або організуйте навчання для цілого класу.", "Start free, deepen your own practice, or organize learning for an entire class.")}</p>
          </motion.div>
        </section>

        <section className="mx-auto grid w-[min(1200px,calc(100%_-_40px))] grid-cols-4 gap-3 pb-14 max-[1050px]:grid-cols-2 max-md:grid-cols-1">
          {plans.map((plan, index) => {
            const isAvailable = Boolean(plan.to);
            return <motion.article {...reveal} transition={{ duration: .55, delay: index * .06, ease: [0.16, 1, .3, 1] }} key={plan.name} className={`relative flex min-h-[610px] flex-col overflow-hidden rounded-[25px] border p-6 ${plan.featured ? "border-[#00b963]/30 bg-[linear-gradient(165deg,rgba(0,255,136,.09),#fff_35%)] shadow-[0_30px_75px_rgba(18,32,23,.1)] dark:border-[#00e97c]/25 dark:bg-[linear-gradient(165deg,rgba(0,255,136,.08),#171f19_35%)] dark:shadow-[0_30px_75px_rgba(0,0,0,.28)]" : "border-[#122017]/10 bg-white shadow-[0_18px_50px_rgba(18,32,23,.045)] dark:border-white/10 dark:bg-[#151c17] dark:shadow-[0_18px_50px_rgba(0,0,0,.2)]"}`}>
              {plan.featured && <span className="absolute right-4 top-4 rounded-full bg-[#00ff88] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.1em] text-[#07140d]">{tr("Популярний", "Popular")}</span>}
              <span className={`grid size-11 place-items-center rounded-[14px] ${accentStyles[plan.accent]}`}><plan.icon className="size-5" /></span>
              <span className="mt-6 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a867e] dark:text-[#849188]">{plan.audience}</span>
              <h2 className="mt-2 text-[27px] font-bold tracking-[-.04em]">{plan.name}</h2>
              <div className="mt-5 min-h-[68px]"><strong className={`font-sans font-bold tracking-[-.045em] ${plan.price.length > 9 ? "text-[30px]" : "text-[39px]"}`}>{plan.price}</strong><span className="ml-2 text-[11px] text-[#7b877f] dark:text-[#88958c]">{plan.period}</span></div>
              <p className="mt-4 min-h-[78px] text-[13px] leading-6 text-[#667169] dark:text-[#a1aca4]">{plan.description}</p>
              <div className="my-5 h-px bg-[#122017]/10 dark:bg-white/10" />
              <ul className="flex-1 space-y-3.5 p-0">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2.5 text-[12px] leading-5 text-[#536057] dark:text-[#b0bab3]"><Check className="mt-0.5 size-4 shrink-0 rounded-full bg-[#00ff88] p-0.5 text-[#062315]" />{feature}</li>)}</ul>
              <button type="button" disabled={!isAvailable} onClick={() => isAvailable && plan.to && navigate(plan.to)} className={`mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-[14px] text-[13px] font-bold transition ${isAvailable ? "hover:-translate-y-0.5" : "cursor-not-allowed opacity-60"} ${plan.featured ? "bg-[#00ff88] text-[#07140d] shadow-[0_12px_28px_rgba(0,185,99,.18)]" : "border border-[#122017]/10 bg-[#f7f8f5] dark:border-white/10 dark:bg-[#202821]"}`}>{plan.cta}{isAvailable && <ArrowRight className="size-4" />}</button>
            </motion.article>;
          })}
        </section>

        <section className="mx-auto w-[min(1200px,calc(100%_-_40px))] pb-28">
          <motion.div {...reveal} className="grid gap-3 rounded-[28px] border border-[#122017]/10 bg-white p-5 shadow-[0_18px_50px_rgba(18,32,23,.045)] dark:border-white/10 dark:bg-[#151c17] md:grid-cols-3">
            <div className="rounded-2xl bg-[#f7f8f5] p-4 dark:bg-white/[.045]"><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a867e]">{tr("Безкоштовно", "Free")}</p><h3 className="mt-2 text-lg font-bold">StudyCod Start - $0</h3><p className="mt-2 text-sm leading-6 text-[#667169] dark:text-[#a3aea6]">{tr("Особиста практика, базова бібліотека, перевірка коду та 1 клас для старту.", "Personal practice, core library, code checks, and 1 class to get started.")}</p></div>
            <div className="rounded-2xl bg-[#f7f8f5] p-4 dark:bg-white/[.045]"><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a867e]">{tr("Підписка", "Subscription")}</p><h3 className="mt-2 text-lg font-bold">StudyCod Pro - $2/{tr("місяць", "month")}</h3><p className="mt-2 text-sm leading-6 text-[#667169] dark:text-[#a3aea6]">{tr("Розширені курси, задачі, підказки, візуалізація виконання коду та сертифікати.", "Advanced courses, tasks, hints, code execution visualization, and certificates.")}</p></div>
            <div className="rounded-2xl bg-[#f7f8f5] p-4 dark:bg-white/[.045]"><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a867e]">{tr("Для викладача", "For teachers")}</p><h3 className="mt-2 text-lg font-bold">StudyCod Class - $10/{tr("місяць", "month")}</h3><p className="mt-2 text-sm leading-6 text-[#667169] dark:text-[#a3aea6]">{tr("Необмежена кількість класів, до 30 учнів у класі, журнал, аналітика та Live Classroom.", "Unlimited classes, up to 30 students per class, gradebook, analytics, and Live Classroom.")}</p></div>
          </motion.div>
        </section>

        <section className="bg-[#101713] text-white">
          <motion.div {...reveal} className="mx-auto grid w-[min(1080px,calc(100%_-_40px))] grid-cols-[.8fr_1.2fr] gap-20 py-24 max-md:grid-cols-1 max-md:gap-10 max-md:py-16">
            <div><span className="text-[11px] font-bold uppercase tracking-[.13em] text-[#6befb0]">{tr("Для команд", "For teams")}</span><h2 className="mt-4 text-[clamp(34px,4vw,50px)] font-bold leading-[1.06] tracking-[-.045em]">{tr("Потрібна інша конфігурація?", "Need a different setup?")}</h2></div>
            <div className="flex flex-col justify-end"><p className="text-[15px] leading-7 text-[#aab5ad]">{tr("Підберемо пілот для вашої школи, ліцею або освітнього проєкту: потрібна кількість учнів, ролі, підтримка й план впровадження.", "We'll shape a pilot for your school, lyceum, or education project: student seats, roles, support, and a rollout plan.")}</p><button type="button" onClick={() => navigate("/support")} className="mt-7 inline-flex h-12 w-fit items-center gap-2 rounded-[14px] bg-white px-5 text-[13px] font-bold text-[#111814]">{tr("Зв'язатися з нами", "Contact us")}<ArrowRight className="size-4" /></button></div>
          </motion.div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
};

export default PricingPage;
