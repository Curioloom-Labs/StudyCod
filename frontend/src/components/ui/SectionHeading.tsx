import React from "react";
import clsx from "classnames";
import type { LucideIcon } from "lucide-react";

interface Props {
  /** Leading accent icon (optional). Rendered at a fixed 14px, never shrinks. */
  icon?: LucideIcon;
  /** Optional trailing count rendered as `· N`. */
  count?: number | null;
  className?: string;
  children: React.ReactNode;
}

/**
 * Standard uppercase mono section label (e.g. "ANNOUNCEMENTS · 3").
 *
 * Encodes the icon↔text alignment once: `leading-none` collapses the label's
 * line-box to the cap height so `items-center` lines the icon's optical centre
 * up with the caps — fixing the drift where the icon sat a couple px below the
 * uppercase text across every inlined `<h2 flex items-center>` header.
 */
export const SectionHeading: React.FC<Props> = ({ icon: Icon, count, className, children }) => (
  <h2
    className={clsx(
      "flex items-center gap-2 font-mono uppercase tracking-[0.08em] leading-none text-sm text-text-muted",
      className
    )}
  >
    {Icon ? <Icon className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden /> : null}
    <span className="leading-none">{children}</span>
    {count != null ? <span className="leading-none text-text-muted/70">· {count}</span> : null}
  </h2>
);
