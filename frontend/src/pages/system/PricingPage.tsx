import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, User, GraduationCap, Building2, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { fadeUpItem, staggerContainer, easeOutQuint } from "../../lib/motion";

type Plan = {
  Icon: React.ComponentType<{ className?: string }>;
  audience: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  ctaTo: string;
  highlight?: boolean;
};

export const PricingPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);

  const plans: Plan[] = [
    {
      Icon: User,
      audience: tr("Учням", "Students"),
      name: tr("Free", "Free"),
      price: tr("0 ₴", "$0"),
      period: tr("назавжди", "forever"),
      tagline: tr("Старт практики без бар'єрів", "Start practicing with no barriers"),
      features: [
        tr("Бібліотека задач і автоперевірка коду", "Task library and automatic code checking"),
        tr("Базові мови програмування", "Core programming languages"),
        tr("Обмежені AI-підказки", "Limited AI hints"),
        tr("Участь у відкритих контестах", "Participation in open contests"),
      ],
      cta: tr("Почати безкоштовно", "Start for free"),
      ctaTo: "/?auth=register",
    },
    {
      Icon: Sparkles,
      audience: tr("Учням", "Students"),
      name: tr("Pro", "Pro"),
      price: tr("149 ₴", "$3.99"),
      period: tr("/міс", "/mo"),
      tagline: tr("Повний інструмент для швидкого прогресу", "The full toolkit for fast progress"),
      features: [
        tr("Усе з Free", "Everything in Free"),
        tr("Необмежені AI-підказки та аналіз помилок", "Unlimited AI hints and error analysis"),
        tr("Покроковий візуалізатор виконання + граф пам'яті", "Step-through execution visualizer + memory graph"),
        tr("Усі мови та версії компіляторів", "All languages and compiler versions"),
        tr("Сертифікати про проходження", "Completion certificates"),
      ],
      cta: tr("Спробувати Pro", "Try Pro"),
      ctaTo: "/?auth=register",
      highlight: true,
    },
    {
      Icon: GraduationCap,
      audience: tr("Вчителям", "Teachers"),
      name: tr("Клас", "Class"),
      price: tr("799 ₴", "$19"),
      period: tr("/міс за клас", "/mo per class"),
      tagline: tr("EDU-режим для репетитора чи вчителя", "EDU mode for a tutor or teacher"),
      features: [
        tr("До 30 учнів у класі", "Up to 30 students per class"),
        tr("Журнал оцінок (12-бальна та інші шкали)", "Gradebook (12-point and other scales)"),
        tr("Перевірка академічної доброчесності", "Academic integrity checks"),
        tr("Курси-шаблони й автоматичні завдання", "Course templates and automatic assignments"),
        tr("Code-aware Live Classroom", "Code-aware Live Classroom"),
      ],
      cta: tr("Створити клас", "Create a class"),
      ctaTo: "/?auth=register",
    },
    {
      Icon: Building2,
      audience: tr("Закладам освіти", "Schools"),
      name: tr("Школа", "School"),
      price: tr("Індивідуально", "Custom"),
      period: tr("ліцензія на заклад", "per-institution license"),
      tagline: tr("Розгортання на всю школу чи ліцей", "Roll out across a whole school"),
      features: [
        tr("Ліцензії за кількістю учнів (об'ємні знижки)", "Per-seat licensing with volume discounts"),
        tr("Організація з ролями та адмінкою", "Organization with roles and admin panel"),
        tr("Пакетне підключення класів і вчителів", "Bulk onboarding of classes and teachers"),
        tr("Захист даних неповнолітніх", "Protection of minors' data"),
        tr("Пріоритетна підтримка та пілот", "Priority support and a pilot"),
      ],
      cta: tr("Запросити пілот", "Request a pilot"),
      ctaTo: "/support",
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
      <motion.header
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutQuint }}
        className="min-h-14 border-b border-border bg-bg-surface flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 md:px-6 py-2 shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-mono text-text-primary">{tr("Тарифи", "Pricing")}</span>
          </div>
        </div>
      </motion.header>

      <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-8">
        <motion.div
          variants={prefersReducedMotion ? undefined : staggerContainer}
          initial={prefersReducedMotion ? undefined : "initial"}
          animate={prefersReducedMotion ? undefined : "animate"}
          className="max-w-5xl mx-auto"
        >
          <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="mb-8">
            <PageEyebrow label="pricing" />
            <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
              {tr("Тарифи StudyCod", "StudyCod pricing")}
            </h1>
            <p className="mt-2 text-sm text-text-secondary max-w-2xl">
              {tr(
                "Безкоштовно для самостійних учнів, доступно для вчителів і репетиторів, масштабовано для закладів освіти. Прозора модель: учень практикує безкоштовно, школа платить за інструмент для вчителя.",
                "Free for independent students, affordable for teachers and tutors, scalable for schools. A transparent model: students practice for free, schools pay for the teacher's toolkit."
              )}
            </p>
          </motion.div>

          <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
            <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent mb-8" />
          </motion.div>

          <motion.div
            variants={prefersReducedMotion ? undefined : fadeUpItem}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {plans.map((plan) => (
              <div
                key={plan.name + plan.audience}
                className={`flex flex-col rounded-xl border p-5 transition-fast ${
                  plan.highlight
                    ? "border-primary/60 bg-bg-surface shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]"
                    : "border-border bg-bg-surface hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <plan.Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-muted">{plan.audience}</span>
                </div>

                <div className="mt-4 text-sm font-semibold text-text-primary">{plan.name}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-mono font-semibold text-text-primary">{plan.price}</span>
                  <span className="text-xs font-mono text-text-muted">{plan.period}</span>
                </div>
                <p className="mt-2 text-xs text-text-secondary leading-relaxed">{plan.tagline}</p>

                <ul className="mt-4 space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed">
                      <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-5 w-full"
                  variant={plan.highlight ? "primary" : "secondary"}
                  onClick={() => navigate(plan.ctaTo)}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </motion.div>

          <motion.p
            variants={prefersReducedMotion ? undefined : fadeUpItem}
            className="mt-6 text-[11px] font-mono text-text-muted"
          >
            {tr(
              "Ціни орієнтовні й можуть змінюватися. Для закладів освіти доступні пілотні впровадження та об'ємні знижки.",
              "Prices are indicative and may change. Pilot rollouts and volume discounts are available for educational institutions."
            )}
          </motion.p>

          <motion.div
            variants={prefersReducedMotion ? undefined : fadeUpItem}
            className="mt-10 pt-6 border-t border-border flex flex-wrap gap-2"
          >
            <Button variant="ghost" onClick={() => navigate("/")}>
              {tr("На головну", "Home")}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/support")}>
              {tr("Зв'язатися з нами", "Contact us")}
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};
