import React from 'react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}
export const Input: React.FC<InputProps> = ({
  label,
  ...props
}) => <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
        {label}
      </label>}
    <input {...props} className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-text-muted" />
  </div>;