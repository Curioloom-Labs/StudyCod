import React from "react";
import { Logo } from "./Logo";

type BrandLockupProps = {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
};

/** The shared StudyCod wordmark used across public and product surfaces. */
export const BrandLockup: React.FC<BrandLockupProps> = ({
  compact = false,
  showTagline = true,
  className = "",
}) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <span className={`grid place-items-center rounded-xl border border-[#122017]/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#182019] ${compact ? "size-8" : "size-9"}`}>
      <Logo size={compact ? 22 : 25} />
    </span>
    <span className="flex min-w-0 flex-col items-start leading-none">
      <span className={`font-[family-name:var(--font-display)] font-bold tracking-[-.045em] ${compact ? "text-base" : "text-[19px]"}`}>
        StudyCod
      </span>
      {showTagline && (
        <span className="mt-1 text-[8px] font-semibold uppercase tracking-[.12em] text-[#6c7b70] dark:text-[#9eada2]">
          learn by building
        </span>
      )}
    </span>
  </span>
);

export default BrandLockup;
