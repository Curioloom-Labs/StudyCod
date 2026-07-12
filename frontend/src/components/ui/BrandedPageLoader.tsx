import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Logo } from "../Logo";

export const BrandedPageLoader: React.FC<{ label?: string }> = ({ label }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div role="status" aria-live="polite" className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f7f8f5] px-6 text-[#111814] dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00ff88]/[0.055] blur-[90px]" />
      <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 10 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} className="relative flex w-full max-w-[320px] flex-col items-center">
        <div className="relative grid size-[74px] place-items-center rounded-[22px] border border-[#122017]/10 bg-white shadow-[0_22px_55px_rgba(18,32,23,.09)] dark:border-white/10 dark:bg-[#151d17] dark:shadow-[0_22px_55px_rgba(0,0,0,.28)]">
          {!reduceMotion && <motion.span className="absolute inset-[-7px] rounded-[28px] border border-[#00b963]/25" animate={{ opacity: [0, .7, 0], scale: [.88, 1.08, 1.16] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />}
          <Logo size={40} />
        </div>
        <div className="mt-7 flex items-center gap-1.5">
          {[0, 1, 2].map((index) => <motion.i key={index} className="size-1.5 rounded-full bg-[#00b963] not-italic" animate={reduceMotion ? undefined : { opacity: [.25, 1, .25], y: [0, -3, 0] }} transition={{ duration: 1.05, repeat: Infinity, delay: index * .14 }} />)}
        </div>
        <p className="mt-4 text-center text-[13px] font-medium tracking-[-.01em] text-[#667169] dark:text-[#93a097]">{label ?? "StudyCod"}</p>
        <span className="sr-only">Loading…</span>
      </motion.div>
    </div>
  );
};

export default BrandedPageLoader;
