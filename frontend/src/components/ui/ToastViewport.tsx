import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getToastEventName, type ToastPayload, type ToastType } from "../../lib/toast";

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  durationMs: number;
};

const DEFAULT_DURATION_MS = 3600;
const TOAST_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function tone(type: ToastType): string {
  if (type === "success") return "border-accent-success/55 bg-accent-success/12 text-accent-success";
  if (type === "error") return "border-accent-error/60 bg-accent-error/10 text-accent-error";
  return "border-primary/60 bg-primary/10 text-text-primary";
}

export const ToastViewport: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const shouldReduceMotion = useReducedMotion();

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
      <AnimatePresence initial={false}>
        {visible.map(item => (
          <motion.div
            key={item.id}
            role="status"
            aria-live={item.type === "error" ? "assertive" : "polite"}
            layout
            initial={shouldReduceMotion ? false : { opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: shouldReduceMotion ? { duration: 0.16, ease: "linear" } : { duration: 0.22, ease: TOAST_EASE } }}
            exit={shouldReduceMotion ? { opacity: 0, transition: { duration: 0.14, ease: "linear" } } : { opacity: 0, y: -8, scale: 0.985, transition: { duration: 0.16, ease: TOAST_EASE } }}
            className={`pointer-events-auto relative overflow-hidden rounded-md border px-3 py-2 text-xs font-mono shadow-lg backdrop-blur-sm ${tone(item.type)}`}
          >
            {item.message}
            {!shouldReduceMotion ? (
              <motion.span
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-px w-full bg-current/55 origin-left"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: Math.max(0.4, item.durationMs / 1000), ease: "linear" }}
              />
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastViewport;
