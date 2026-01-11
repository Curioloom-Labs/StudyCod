import React from "react";
import { motion } from "framer-motion";
type Props = {
  label?: string;
  sublabel?: string;
};
const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const TerminalLoader: React.FC<Props> = ({
  label = "Loading",
  sublabel
}) => {
  return <div className="flex flex-col items-center gap-4">
      <motion.div className="relative w-[92px] h-[92px] border border-border bg-bg-surface overflow-hidden" initial={{
      opacity: 0,
      y: 8,
      filter: "blur(8px)"
    }} animate={{
      opacity: 1,
      y: 0,
      filter: "blur(0px)"
    }} transition={{
      duration: 0.28,
      ease
    }}>
        {}
        <div className="absolute -inset-8 terminal-glow" />

        {}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-2 top-2 w-3 h-3 border-l border-t border-primary/80" />
          <div className="absolute right-2 top-2 w-3 h-3 border-r border-t border-primary/80" />
          <div className="absolute left-2 bottom-2 w-3 h-3 border-l border-b border-primary/80" />
          <div className="absolute right-2 bottom-2 w-3 h-3 border-r border-b border-primary/80" />
        </div>

        {}
        <motion.div className="absolute inset-[14px] border border-primary/25" animate={{
        rotate: 360
      }} transition={{
        duration: 2.2,
        ease: "linear",
        repeat: Infinity
      }} style={{
        transformOrigin: "50% 50%"
      }} />

        {}
        <div className="absolute inset-0 terminal-scanline opacity-70" />

        {}
        <motion.div className="absolute left-2 right-2 h-[6px] bg-[linear-gradient(90deg,transparent,rgba(0,255,136,0.35),transparent)]" animate={{
        y: [18, 56, 30, 64, 22]
      }} transition={{
        duration: 1.25,
        ease: "linear",
        repeat: Infinity
      }} />

        {}
        <motion.div className="absolute inset-0 flex items-center justify-center" animate={{
        opacity: [0.7, 1, 0.85, 1]
      }} transition={{
        duration: 0.9,
        ease: "linear",
        repeat: Infinity
      }}>
          <div className="text-primary font-mono text-xs tracking-widest terminal-flicker select-none">
            {"</>"}
          </div>
        </motion.div>
      </motion.div>

      <div className="flex flex-col items-center gap-1">
        <motion.div className="text-sm text-text-secondary font-mono" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        delay: 0.08,
        duration: 0.22,
        ease
      }}>
          <span className="terminal-dots">{label}</span>
        </motion.div>
        {sublabel && <motion.div className="text-xs text-text-muted font-mono" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        delay: 0.14,
        duration: 0.22,
        ease
      }}>
            {sublabel}
          </motion.div>}
      </div>
    </div>;
};