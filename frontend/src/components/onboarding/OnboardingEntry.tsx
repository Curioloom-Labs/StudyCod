import React, { useEffect, useState } from "react";
import { OnboardingOverlay, shouldShowOnboarding } from "./OnboardingOverlay";
import { Button } from "../ui/Button";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
interface Props {
  variant?: "floating" | "inline";
}
export const OnboardingEntry: React.FC<Props> = ({
  variant = "floating"
}) => {
  const {
    t
  } = useTranslation();
  const [open, setOpen] = useState(false);
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    setEligible(shouldShowOnboarding());
  }, []);
  useEffect(() => {
    if (eligible) {
      const timer = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(timer);
    }
  }, [eligible]);
  if (variant === "inline") {
    return <>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <Sparkles className="w-4 h-4 mr-2" />
          {t("onboardingQuickTour")}
        </Button>
        <OnboardingOverlay open={open} onClose={() => setOpen(false)} />
      </>;
  }
  return <>
      {eligible && <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("onboardingNewHere")}
      className="fixed bottom-3 left-3 right-3 sm:bottom-6 sm:left-auto sm:right-6 z-40 px-4 py-2 rounded-full bg-primary text-bg-base text-sm font-mono shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-fast flex items-center justify-center gap-2 max-w-[calc(100vw-1.5rem)] sm:max-w-none">
          <Sparkles className="w-4 h-4" />
          {t("onboardingNewHere")}
        </button>}
      <OnboardingOverlay open={open} onClose={() => setOpen(false)} />
    </>;
};