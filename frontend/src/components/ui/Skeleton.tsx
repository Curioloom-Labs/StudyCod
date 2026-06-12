import React from "react";

export const Skeleton: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  return <div aria-hidden="true" className={"animate-pulse rounded-md bg-bg-hover " + className} />;
};

const DEFAULT_ROW_WIDTHS = ["w-3/4", "w-1/2", "w-2/3"];

const TABLE_ROW_WIDTHS = ["w-full", "w-[97%]", "w-full", "w-[94%]", "w-full", "w-[96%]", "w-full", "w-[92%]"];

export const PageSkeleton: React.FC<{
  variant?: "default" | "table" | "cards";
}> = ({ variant = "default" }) => {
  return (
    <div role="status" className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center justify-between gap-4 mb-6">
        <Skeleton className="w-48 h-7" />
        <Skeleton className="w-24 h-7" />
      </div>

      {variant === "default" && (
        <div className="space-y-3">
          {DEFAULT_ROW_WIDTHS.map((w, i) => (
            <Skeleton key={i} className={`h-5 ${w}`} />
          ))}
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {variant === "table" && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full mb-2" />
          {TABLE_ROW_WIDTHS.map((w, i) => (
            <Skeleton key={i} className={`h-9 ${w}`} />
          ))}
        </div>
      )}

      {variant === "cards" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} aria-hidden="true" className="h-32 rounded-lg border border-border bg-bg-surface p-4 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
