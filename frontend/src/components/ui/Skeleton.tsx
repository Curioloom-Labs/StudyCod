import React from "react";
import clsx from "classnames";
export const Skeleton: React.FC<{
  className?: string;
}> = ({
  className
}) => {
  return <div className={clsx("relative overflow-hidden bg-bg-surface border border-border", className)}>
      <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)]" />
    </div>;
};