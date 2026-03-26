import React, { useEffect, useMemo, useState } from "react";
import { getToastEventName, type ToastPayload, type ToastType } from "../../lib/toast";

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  durationMs: number;
};

const DEFAULT_DURATION_MS = 3600;

function tone(type: ToastType): string {
  if (type === "success") return "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";
  if (type === "error") return "border-accent-error/60 bg-accent-error/10 text-red-100";
  return "border-primary/60 bg-primary/10 text-text-primary";
}

export const ToastViewport: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const eventName = getToastEventName();
    const handler = (event: Event) => {
      const custom = event as CustomEvent<ToastPayload>;
      const detail = custom.detail;
      if (!detail?.message) return;

      const id = detail.id ?? Date.now() + Math.floor(Math.random() * 10_000);
      const item: ToastItem = {
        id,
        type: detail.type ?? "info",
        message: String(detail.message),
        durationMs: Number.isFinite(detail.durationMs) && (detail.durationMs as number) > 0
          ? Number(detail.durationMs)
          : DEFAULT_DURATION_MS,
      };

      setItems(prev => [...prev, item]);
    };

    window.addEventListener(eventName, handler as EventListener);
    return () => window.removeEventListener(eventName, handler as EventListener);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map(item => window.setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== item.id));
    }, item.durationMs));

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [items]);

  const visible = useMemo(() => items.slice(-4), [items]);

  return (
    <div className="fixed top-4 right-4 z-[120] flex w-[min(92vw,28rem)] flex-col gap-2 pointer-events-none">
      {visible.map(item => (
        <div
          key={item.id}
          role="status"
          aria-live={item.type === "error" ? "assertive" : "polite"}
          className={`pointer-events-auto rounded-md border px-3 py-2 text-xs font-mono shadow-lg backdrop-blur-sm ${tone(item.type)}`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
};

export default ToastViewport;
