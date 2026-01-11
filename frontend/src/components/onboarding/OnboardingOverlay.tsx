import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Sparkles, ArrowRight, X, BookOpen, GraduationCap, Cpu, Users } from "lucide-react";
type StepId = "welcome" | "edu" | "personal" | "journal" | "support";
type Step = {
  id: StepId;
  title: string;
  body: string;
  cta?: string;
  href?: string;
  icon: React.ReactNode;
};
interface Props {
  open: boolean;
  onClose: () => void;
  mode?: "auto" | "sticky";
  persist?: boolean;
}
const STORAGE_KEY = "studycod_onboarding_done";
export const OnboardingOverlay: React.FC<Props> = ({
  open,
  onClose,
  mode = "sticky",
  persist = true
}) => {
  const {
    t
  } = useTranslation();
  const [index, setIndex] = useState(0);
  const steps: Step[] = useMemo(() => [{
    id: "welcome",
    title: t("onboardingWelcomeTitle"),
    body: t("onboardingWelcomeBody"),
    icon: <Sparkles className="w-5 h-5 text-primary" />
  }, {
    id: "edu",
    title: t("onboardingEduTitle"),
    body: t("onboardingEduBody"),
    icon: <GraduationCap className="w-5 h-5 text-primary" />
  }, {
    id: "personal",
    title: t("onboardingPersonalTitle"),
    body: t("onboardingPersonalBody"),
    icon: <Cpu className="w-5 h-5 text-primary" />
  }, {
    id: "journal",
    title: t("onboardingJournalTitle"),
    body: t("onboardingJournalBody"),
    icon: <BookOpen className="w-5 h-5 text-primary" />
  }, {
    id: "support",
    title: t("onboardingSupportTitle"),
    body: t("onboardingSupportBody"),
    icon: <Users className="w-5 h-5 text-primary" />
  }], [t]);
  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open]);
  const current = useMemo(() => steps[index], [steps, index]);
  const isLast = index === steps.length - 1;
  const handleDone = () => {
    if (persist) {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    onClose();
  };
  const goNext = () => {
    if (isLast) {
      handleDone();
      return;
    }
    {
      setIndex(i => i + 1);
    }
  };
  return <AnimatePresence>
      {open && <motion.div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} style={{
      backdropFilter: "blur(2px)"
    }}>
          <motion.div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-[320px,1fr] gap-4" initial={{
        opacity: 0,
        scale: 0.97,
        y: 10
      }} animate={{
        opacity: 1,
        scale: 1,
        y: 0
      }} exit={{
        opacity: 0,
        scale: 0.97,
        y: 10
      }} transition={{
        duration: 0.15
      }}>
            <Card className="p-5 bg-bg-surface border border-border/80">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-mono text-text-secondary">{t("onboardingQuickTour")}</div>
                <button onClick={handleDone} className="p-2 hover:bg-bg-hover rounded border border-border/60">
                  <X className="w-4 h-4 text-text-secondary" />
                </button>
              </div>
              <div className="space-y-2">
                {steps.map((s, idx) => <button key={s.id} onClick={() => setIndex(idx)} className={`w-full text-left px-3 py-2 border text-sm font-mono transition-fast ${idx === index ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover/60"}`}>
                    <div className="flex items-center gap-2 text-text-primary">
                      {s.icon}
                      <span>{s.title}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-1">{s.body.slice(0, 64)}...</div>
                  </button>)}
              </div>
            </Card>

            <Card className="p-6 bg-bg-surface border border-border/80 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                {current.icon}
                <div className="text-lg font-mono text-text-primary">{current.title}</div>
              </div>
              <div className="text-sm text-text-primary leading-relaxed flex-1">{current.body}</div>

              <div className="mt-6 flex items-center justify-between">
                <div className="text-xs text-text-secondary">
                  {t("onboardingStepOf", {
                current: index + 1,
                total: steps.length
              })}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleDone}>
                    {t("skip")}
                  </Button>
                  <Button onClick={goNext}>
                    {isLast ? t("done") : t("next")} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>}
    </AnimatePresence>;
};
export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "1";
}