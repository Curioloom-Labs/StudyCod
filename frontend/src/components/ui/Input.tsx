import React from 'react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}
export const Input: React.FC<InputProps> = ({
  label,
  hint,
  error,
  ...props
}) => {
  const inputId = props.id ?? React.useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = props["aria-describedby"] ?? (error ? errorId : hint ? hintId : undefined);
  return <div className="flex flex-col gap-1.5 w-full">
    {label && <label htmlFor={inputId} className="text-sm font-semibold text-text-secondary leading-[1.3]">
        {label}
      </label>}
    <input id={inputId} {...props} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={describedBy} className={`w-full rounded-xl border bg-bg-code/75 px-4 py-3 text-[0.9375rem] leading-[1.45] text-text-primary outline-none transition-colors placeholder:font-normal placeholder:text-text-muted focus:border-primary/70 focus:ring-4 focus:ring-primary/10 ${error ? "border-accent-error/70" : "border-border"}`} />
    {error ? <div id={errorId} role="alert" className="text-xs text-accent-error">{error}</div> : hint ? <div id={hintId} className="text-xs text-text-muted">{hint}</div> : null}
  </div>;
};
