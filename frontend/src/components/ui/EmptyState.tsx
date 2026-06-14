import React from "react";
import clsx from "classnames";

type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

// Shared empty-state pattern (Ф3): one illustrative icon, a clear title, an
// optional one-line description and a single primary action. Surfaces come from
// design tokens, so it adapts to every UI mode (incl. Aurora) automatically.
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className
}) => {
  return (
    <div
      className={clsx(
        "rounded-[var(--aurora-radius,16px)] border border-dashed border-border bg-bg-surface/40 px-6 py-12 text-center flex flex-col items-center",
        className
      )}
    >
      {Icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      ) : null}
      <div className="text-base font-medium text-text-primary">{title}</div>
      {description ? (
        <div className="mt-1.5 max-w-sm text-sm text-text-secondary">{description}</div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
};
