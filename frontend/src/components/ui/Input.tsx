import React from 'react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}
export const Input: React.FC<InputProps> = ({
  label,
  ...props
}) => {
  const inputId = props.id ?? React.useId();
  return <div className="flex flex-col gap-1.5 w-full">
    {label && <label htmlFor={inputId} className="text-sm font-semibold text-text-secondary leading-[1.3]">
        {label}
      </label>}
    <input id={inputId} {...props} className="w-full rounded-xl border border-border bg-bg-code/75 px-4 py-3 text-[0.9375rem] leading-[1.45] text-text-primary outline-none transition-colors placeholder:font-normal placeholder:text-text-muted focus:border-primary/70 focus:ring-4 focus:ring-primary/10" />
  </div>;
};
