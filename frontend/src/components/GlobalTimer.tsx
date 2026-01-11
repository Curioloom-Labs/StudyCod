import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
interface GlobalTimerProps {
  remainingSeconds: number;
  onExpired?: () => void;
  className?: string;
}
export const GlobalTimer: React.FC<GlobalTimerProps> = ({
  remainingSeconds,
  onExpired,
  className = ""
}) => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const [displaySeconds, setDisplaySeconds] = useState(remainingSeconds);
  useEffect(() => {
    setDisplaySeconds(remainingSeconds);
    if (remainingSeconds <= 0) {
      onExpired?.();
      return;
    }
    const interval = setInterval(() => {
      setDisplaySeconds(prev => {
        if (prev <= 1) {
          onExpired?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSeconds, onExpired]);
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const isWarning = displaySeconds <= 300;
  const isCritical = displaySeconds <= 60;
  const formatTime = (m: number, s: number) => {
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };
  if (displaySeconds <= 0) {
    return <div className={`flex items-center gap-2 px-4 py-2 bg-accent-error/20 border border-accent-error rounded ${className}`}>
        <Clock className="w-4 h-4 text-accent-error" />
        <span className="font-mono text-accent-error font-bold">{tr("Час вийшов!", "Time is up!")}</span>
      </div>;
  }
  return <div className={`flex items-center gap-2 px-4 py-2 border rounded ${isCritical ? "bg-accent-error/20 border-accent-error" : isWarning ? "bg-accent-warning/20 border-accent-warning" : "bg-bg-surface border-border"} ${className}`}>
      <Clock className={`w-4 h-4 ${isCritical ? "text-accent-error" : isWarning ? "text-accent-warning" : "text-text-secondary"}`} />
      <span className={`font-mono font-bold ${isCritical ? "text-accent-error" : isWarning ? "text-accent-warning" : "text-text-primary"}`}>
        {formatTime(minutes, seconds)}
      </span>
      <span className="text-xs text-text-secondary ml-2">{tr("залишилось", "left")}</span>
    </div>;
};