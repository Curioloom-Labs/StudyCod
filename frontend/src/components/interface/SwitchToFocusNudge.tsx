import React from "react";
import { useTranslation } from "react-i18next";
import { getSuccessfulStudySessions } from "../../lib/uiMode";
import { useUIMode } from "./UIModeProvider";

export const SwitchToFocusNudge: React.FC<{ threshold?: number }> = ({ threshold = 3 }) => {
  const { i18n } = useTranslation();
  const ui = useUIMode();
  const [sessions, setSessions] = React.useState(() => getSuccessfulStudySessions());

  React.useEffect(() => {
    const handler = (e: any) => {
      const count = Number(e?.detail?.count ?? 0);
      if (Number.isFinite(count)) setSessions(count);
    };
    window.addEventListener("studycod:studySessionSuccess", handler);
    return () => window.removeEventListener("studycod:studySessionSuccess", handler);
  }, []);

  if (ui.mode !== "classic") return null;
  if (ui.switchSuggestionDismissed) return null;
  if (sessions < threshold) return null;

  return (
    <div className="border-b border-border bg-bg-surface">
      <div className="px-4 md:px-6 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-mono text-text-primary">
            {i18n.language?.toLowerCase().startsWith("en")
              ? "Switch permanently to Focus?"
              : "Перемкнутися назавжди на Фокус?"}
          </div>
          <div className="text-[12px] font-mono text-text-secondary mt-0.5">
            {i18n.language?.toLowerCase().startsWith("en")
              ? `You’ve completed ${sessions} study sessions. Focus keeps ‘Continue studying’ front and center.`
              : `Ви завершили ${sessions} навчальних сесій. Фокус тримає ‘Продовжити навчання’ на першому плані.`}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => ui.dismissSwitchSuggestion()}
            className="px-3 py-2 text-xs font-mono border border-border text-text-secondary hover:bg-bg-hover transition-fast"
          >
            {i18n.language?.toLowerCase().startsWith("en") ? "Not now" : "Не зараз"}
          </button>
          <button
            onClick={() => {
              ui.setMode("focus");
              ui.dismissSwitchSuggestion();
            }}
            className="px-3 py-2 text-xs font-mono border border-primary bg-primary/10 text-primary hover:bg-primary/15 transition-fast"
          >
            {i18n.language?.toLowerCase().startsWith("en") ? "Switch to Focus" : "Увімкнути Фокус"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SwitchToFocusNudge;
