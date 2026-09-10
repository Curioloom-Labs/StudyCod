import React from "react";
import { Wifi, WifiOff } from "lucide-react";

export const NetworkStatus: React.FC = () => {
  const [online, setOnline] = React.useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [restored, setRestored] = React.useState(false);

  React.useEffect(() => {
    let restoreTimer: number | undefined;
    const onOnline = () => {
      setOnline(true);
      setRestored(true);
      restoreTimer = window.setTimeout(() => setRestored(false), 2500);
    };
    const onOffline = () => {
      setOnline(false);
      setRestored(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (restoreTimer) window.clearTimeout(restoreTimer);
    };
  }, []);

  if (online && !restored) return null;
  return (
    <div className={"fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-xl items-center gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg " + (online ? "border-accent-success/40 bg-accent-success/10 text-accent-success" : "border-accent-warn/40 bg-accent-warn/10 text-accent-warn")} role="status" aria-live="polite">
      {online ? <Wifi className="size-4 shrink-0" aria-hidden="true" /> : <WifiOff className="size-4 shrink-0" aria-hidden="true" />}
      <span>{online ? "Connection restored." : "You are offline. Changes will stay local until the connection returns."}</span>
    </div>
  );
};
