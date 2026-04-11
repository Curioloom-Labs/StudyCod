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
    {label && <label htmlFor={inputId} className="text-[0.75rem] font-semibold text-text-muted uppercase tracking-[0.08em] leading-[1.3]">
        {label}
      </label>}
    <input id={inputId} {...props} className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 text-[0.9375rem] leading-[1.45] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/70 transition-colors placeholder:text-text-muted placeholder:font-normal" />
  </div>;
};
